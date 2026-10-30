#!/usr/bin/env python3
"""Import des gares / métro-tram / gares routières / aéroports depuis un extrait OSM Geofabrik (.osm.pbf), traité en local.

Remplace l'interrogation d'Overpass (timeouts : 5 tuiles sur 150 pour la France). Même sortie que scripts/import-transit.mjs :
SQL idempotent (upsert par source_ref 'osm:<type>/<id>'), dans supabase/data/ (jamais commité).

Usage :
  pip install osmium               # pyosmium >= 4
  python3 scripts/import-transit-pbf.py FR            # télécharge europe/france-latest.osm.pbf (~4,5 Go) puis génère le SQL
  python3 scripts/import-transit-pbf.py FR --pbf /chemin/france-latest.osm.pbf
  python3 scripts/import-transit-pbf.py FR --check-sncf   # compare avec la liste officielle des gares SNCF (contrôle de couverture)
Données © OpenStreetMap contributors (ODbL).
"""
import argparse, json, math, os, re, sys, time, urllib.request

import osmium

GEOFABRIK = {
    "FR": "europe/france", "BE": "europe/belgium", "LU": "europe/luxembourg", "CH": "europe/switzerland",
    "DE": "europe/germany", "IT": "europe/italy", "ES": "europe/spain", "PT": "europe/portugal",
    "NL": "europe/netherlands", "GB": "europe/great-britain", "IE": "europe/ireland-and-northern-ireland", "AT": "europe/austria",
}
UA = "hdar.chat transit import (contact: hdar.chat)"


def kind_of(t):
    if t.get("aeroway") == "aerodrome":
        return "airport" if t.get("iata") else None
    if t.get("railway") == "tram_stop":
        return "metro"
    if t.get("amenity") == "bus_station":
        return "bus"
    if t.get("railway") in ("station", "halt"):
        if re.search(r"subway|light_rail|monorail", t.get("station", "")) or t.get("subway") == "yes":
            return "metro"
        # gares de musée / touristiques / désaffectées : ignorées
        if t.get("usage") == "tourism" or t.get("railway:historic") or t.get("disused") == "yes":
            return None
        return "station"
    return None


class H(osmium.SimpleHandler):
    def __init__(self):
        super().__init__()
        self.out = {}

    def add(self, typ, oid, tags, lat, lng):
        t = {k: v for k, v in tags}
        k = kind_of(t)
        name = (t.get("name:fr") or t.get("name") or "").strip()[:80]
        if not k or not name or lat is None:
            return
        self.out[f"osm:{typ}/{oid}"] = (k, name, round(lat, 7), round(lng, 7), (t.get("iata") or "")[:4] or None)

    def node(self, n):
        if n.tags and ("railway" in n.tags or "aeroway" in n.tags or "amenity" in n.tags):
            self.add("node", n.id, n.tags, n.location.lat, n.location.lon)

    def way(self, w):
        if not ("railway" in w.tags or "aeroway" in w.tags or "amenity" in w.tags):
            return
        pts = [(nd.lat, nd.lon) for nd in w.nodes if nd.location.valid()]
        if pts:
            self.add("way", w.id, w.tags, sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts))


def esc(s):
    return "'" + str(s).replace("'", "''") + "'"


def km(a, b):
    return 6371 * math.hypot(math.radians(b[0] - a[0]), math.radians(b[1] - a[1]) * math.cos(math.radians(a[0])))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("zones", nargs="+")
    ap.add_argument("--pbf")
    ap.add_argument("--cache", default="supabase/data/pbf")
    ap.add_argument("--check-sncf", action="store_true")
    a = ap.parse_args()
    os.makedirs("supabase/data", exist_ok=True)
    for cc in [z.upper() for z in a.zones]:
        pbf = a.pbf
        if not pbf:
            os.makedirs(a.cache, exist_ok=True)
            pbf = os.path.join(a.cache, GEOFABRIK[cc].split("/")[-1] + "-latest.osm.pbf")
            if not os.path.exists(pbf):
                url = f"https://download.geofabrik.de/{GEOFABRIK[cc]}-latest.osm.pbf"
                print(cc, "téléchargement", url, flush=True)
                req = urllib.request.Request(url, headers={"user-agent": UA})
                with urllib.request.urlopen(req) as r, open(pbf + ".part", "wb") as f:
                    while True:
                        b = r.read(1 << 22)
                        if not b:
                            break
                        f.write(b)
                os.rename(pbf + ".part", pbf)
        t0 = time.time()
        h = H()
        # Index des positions de nœuds sur disque (France : ~500 M nœuds, trop pour la RAM en dense_mem).
        idx = "sparse_file_array," + pbf + ".nodes" if os.path.getsize(pbf) > 1.5e9 else "flex_mem"
        h.apply_file(pbf, locations=True, idx=idx)
        if os.path.exists(pbf + ".nodes"):
            os.remove(pbf + ".nodes")
        # Une gare = souvent nœud + bâtiment : un seul pin par (type, nom, ~100 m).
        seen, rows = set(), []
        for ref, (k, name, lat, lng, iata) in sorted(h.out.items(), key=lambda x: (not x[0].startswith("osm:node"), x[0])):
            dk = f"{k}|{name.lower()}|{lat:.3f}|{lng:.3f}"
            if dk in seen:
                continue
            seen.add(dk)
            rows.append((ref, k, name, lat, lng, iata))
        by = {}
        for r in rows:
            by[r[1]] = by.get(r[1], 0) + 1
        chunks = []
        vals = [f"({esc(k)},{esc(n)},{la},{ln},'osm',{esc(ref)},'approved',false,false,{esc(i) if i else 'null'})" for ref, k, n, la, ln, i in rows]
        for i in range(0, len(vals), 2000):
            chunks.append(
                "insert into hdar.places (kind,name,lat,lng,source,source_ref,status,ratings_on,comments_on,transit_code) values\n"
                + ",\n".join(vals[i:i + 2000])
                + "\non conflict (source_ref) do update set name = excluded.name, lat = excluded.lat, lng = excluded.lng, transit_code = excluded.transit_code"
                " where hdar.places.kind in ('station','metro','bus','airport');\n")
        for f in os.listdir("supabase/data"):
            if f.startswith(f"transit_{cc.lower()}_") and f.endswith(".sql"):
                os.remove(os.path.join("supabase/data", f))
        for i, c in enumerate(chunks):
            open(f"supabase/data/transit_{cc.lower()}_{i}.sql", "w").write(c)
        print(cc, "TOTAL", len(rows), "arrêts", by, len(chunks), "fichiers", f"{time.time() - t0:.0f} s", flush=True)
        if a.check_sncf and cc == "FR":
            check_sncf([r for r in rows if r[1] == "station"])


def check_sncf(stations):
    url = "https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/gares-de-voyageurs/exports/json"
    req = urllib.request.Request(url, headers={"user-agent": UA})
    sncf = json.load(urllib.request.urlopen(req))
    grid = {}
    for s in stations:
        grid.setdefault((int(s[3] * 50), int(s[4] * 50)), []).append((s[3], s[4]))
    miss = []
    for g in sncf:
        p = g.get("position_geographique") or {}
        if p.get("lat") is None:
            continue
        a = (p["lat"], p["lon"])
        cy, cx = int(a[0] * 50), int(a[1] * 50)
        near = any(km(a, b) < 0.5 for dy in (-1, 0, 1) for dx in (-1, 0, 1) for b in grid.get((cy + dy, cx + dx), []))
        if not near:
            miss.append(g["nom"])
    print(f"SNCF : {len(sncf)} gares voyageurs, {len(sncf) - len(miss)} retrouvées dans OSM (< 500 m), {len(miss)} absentes", flush=True)
    open("supabase/data/transit_fr_sncf_absentes.txt", "w").write("\n".join(sorted(miss)) + "\n")


if __name__ == "__main__":
    sys.exit(main())
