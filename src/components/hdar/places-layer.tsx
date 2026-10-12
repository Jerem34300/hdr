import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { getPlace, listPlaces, proposePlace, type PlaceDetail, type PlaceKind, type PlacePin } from "@/lib/hdar/live";
import { useHdar } from "@/lib/hdar/store";

export const PLACE_KINDS: Record<PlaceKind, { label: string; icon: string; color: string }> = {
  cruising: { label: "Lieu de drague", icon: "🌲", color: "#34d399" },
  beach: { label: "Plage naturiste", icon: "🏖️", color: "#38bdf8" },
  park: { label: "Parc / jardin", icon: "🌳", color: "#a3e635" },
  aire: { label: "Aire / parking", icon: "🅿️", color: "#fbbf24" },
  other: { label: "Autre lieu", icon: "📌", color: "#c4b5fd" },
  // Réservés aux futurs partenaires (annonces payantes) — aucun affiché aujourd'hui.
  bar: { label: "Bar partenaire", icon: "🍸", color: "#f472b6" },
  club: { label: "Club partenaire", icon: "🪩", color: "#f472b6" },
  sauna: { label: "Sauna partenaire", icon: "♨️", color: "#f472b6" },
};
const PROPOSABLE: PlaceKind[] = ["cruising", "beach", "park", "aire", "other"];
const LAYER_KEY = "hdar-places-layer";

export function placesLayerOn() {
  return typeof localStorage === "undefined" || localStorage.getItem(LAYER_KEY) !== "off";
}
export function setPlacesLayer(on: boolean) {
  localStorage.setItem(LAYER_KEY, on ? "on" : "off");
}

/** Fetches permanent places in the visible box (debounced, only from zoom 7). */
export function usePlaces(on: boolean, box: { s: number; w: number; n: number; e: number }, zoom: number) {
  const [rows, setRows] = useState<PlacePin[]>([]);
  const key = [box.s, box.w, box.n, box.e].map((v) => v.toFixed(1)).join(",");
  useEffect(() => {
    if (!on || zoom < 7) {
      setRows([]);
      return;
    }
    const [s, w, n, e] = key.split(",").map(Number);
    const t = window.setTimeout(() => {
      void listPlaces(s - 0.1, w - 0.1, n + 0.1, e + 0.1)
        .then(setRows)
        .catch(() => undefined);
    }, 350);
    return () => window.clearTimeout(t);
  }, [on, key, zoom >= 7]); // eslint-disable-line react-hooks/exhaustive-deps
  return rows;
}

export function PlaceSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const [p, setP] = useState<PlaceDetail | null>(null);
  useEffect(() => {
    void getPlace(id).then(setP).catch(() => undefined);
  }, [id]);
  const k = p ? PLACE_KINDS[p.kind] : null;
  return (
    <div className="hdar-sheet-up absolute inset-x-0 bottom-0 z-40 max-h-[75%] overflow-y-auto rounded-t-3xl border border-b-0 border-line bg-surface p-5 pb-8 shadow-2xl">
      <button type="button" aria-label="Fermer" className="absolute top-3 right-3 flex size-10 items-center justify-center" onClick={onClose}>
        <X className="size-5" />
      </button>
      {!p ? (
        <p className="py-8 text-center text-sm text-muted">Chargement…</p>
      ) : (
        <>
          <p className="text-sm" style={{ color: k!.color }}>
            {k!.icon} {k!.label}
          </p>
          <h2 className="mt-1 pr-10 font-display text-2xl font-extrabold">{p.name}</h2>
          {p.description && <p className="mt-2 text-sm">{p.description}</p>}
          <a
            className="mt-3 inline-block text-sm text-signal underline"
            href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}`}
            target="_blank"
            rel="noopener"
          >
            Voir sur la carte / itinéraire
          </a>
          <div className="mt-4 rounded-2xl bg-night p-4 text-xs leading-relaxed text-muted">
            <p className="font-bold text-ink">Avant d'y aller</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              <li>Discrétion : c'est un lieu public, respecte les autres usagers, les familles et les riverains.</li>
              <li>La loi s'applique : l'exhibition sexuelle dans un lieu accessible au public est un délit. Le naturisme n'est autorisé que sur les zones prévues.</li>
              <li>Consentement toujours, et uniquement entre adultes.</li>
              <li>Préviens un proche, garde ton téléphone chargé, méfie-toi des guet-apens.</li>
              <li>
                Préservatifs, PrEP, dépistage :{" "}
                <a className="underline" href="https://www.aides.org" target="_blank" rel="noopener">
                  AIDES
                </a>
                .
              </li>
            </ul>
          </div>
          {p.source === "osm" && <p className="mt-3 text-[11px] text-muted">Données © OpenStreetMap contributors (ODbL).</p>}
        </>
      )}
    </div>
  );
}

export function ProposePlaceSheet({ at, onClose }: { at: { lat: number; lng: number }; onClose: () => void }) {
  const onboarded = useHdar((s) => s.me.onboarded);
  const openGate = useHdar((s) => s.openGate);
  const [kind, setKind] = useState<PlaceKind>("cruising");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const field = "w-full rounded-2xl border border-line bg-night px-4 py-3 text-ink outline-none focus:border-signal";
  return (
    <div className="hdar-sheet-up absolute inset-x-0 bottom-0 z-40 max-h-[85%] overflow-y-auto rounded-t-3xl border border-b-0 border-line bg-surface p-5 pb-8 shadow-2xl">
      <button type="button" aria-label="Fermer" className="absolute top-3 right-3 flex size-10 items-center justify-center" onClick={onClose}>
        <X className="size-5" />
      </button>
      <h2 className="font-display text-xl font-extrabold">Proposer un lieu</h2>
      <p className="mt-1 text-sm text-muted">
        Lieu gratuit et public uniquement (pas de commerce). Il sera placé au centre de la carte et vérifié avant publication.
      </p>
      {!onboarded ? (
        <button type="button" className="mt-4 h-12 w-full rounded-full bg-signal font-bold text-night" onClick={openGate}>
          Crée ton profil pour proposer un lieu
        </button>
      ) : (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            proposePlace(kind, name, desc, at.lat, at.lng)
              .then(() => {
                toast("Merci ! Ton lieu sera vérifié avant d'apparaître.");
                onClose();
              })
              .catch((err: Error) => toast(err.message))
              .finally(() => setBusy(false));
          }}
        >
          <div className="flex flex-wrap gap-2">
            {PROPOSABLE.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={"h-10 rounded-full border px-3 text-sm " + (kind === k ? "border-signal bg-signal text-night" : "border-line")}
              >
                {PLACE_KINDS[k].icon} {PLACE_KINDS[k].label}
              </button>
            ))}
          </div>
          <input className={field} placeholder="Nom (ex. Bois de …)" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          <textarea className={field + " min-h-24"} placeholder="Description, accès, conseils (facultatif)" maxLength={600} value={desc} onChange={(e) => setDesc(e.target.value)} />
          <button type="submit" disabled={busy || name.trim().length < 3} className="h-12 w-full rounded-full bg-signal font-bold text-night disabled:opacity-50">
            {busy ? "Envoi…" : "Envoyer pour vérification"}
          </button>
        </form>
      )}
    </div>
  );
}
