import { VideoSection } from "./video-section";
import { useOpenAtTop } from "@/lib/hdar/scroll-end";
import { scrollListEnd } from "@/lib/hdar/scroll-end";
import { locale } from "@/lib/hdar/i18n";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { getPlace, placeClick, placeComment, placeCommentDelete, placeCommentReport, placeInfo, placeRate, placeSeen, type PlaceInfo, listPlaces, listToilets, listOutings, placeHide, placeMessages, placeSend, placeSendMedia, proposePlace, type PlaceDetail, type PlaceKind, type PlaceLine, type PlacePin } from "@/lib/hdar/live";
import { setOpenPlace } from "@/lib/hdar/activity";
import { haversine } from "@/lib/hdar/rules";
import { RoomAttach, RoomMedia } from "./media-composer";
import { useHdar } from "@/lib/hdar/store";
import { useAmAdmin } from "@/lib/hdar/admin-mode";

export const PLACE_KINDS: Record<PlaceKind, { label: string; icon: string; color: string }> = {
  cruising: { label: "Lieu public", icon: "🌲", color: "#34d399" },
  beach: { label: "Plage naturiste", icon: "🏖️", color: "#38bdf8" },
  park: { label: "Parc / jardin", icon: "🌳", color: "#a3e635" },
  aire: { label: "Aire / parking", icon: "🅿️", color: "#fbbf24" },
  garden: { label: "Jardin", icon: "🌷", color: "#86efac" },
  viewpoint: { label: "Belvédère / point de vue", icon: "🔭", color: "#fcd34d" },
  square: { label: "Place", icon: "⛲", color: "#93c5fd" },
  promenade: { label: "Promenade", icon: "🚶", color: "#5eead4" },
  other: { label: "Autre lieu", icon: "📌", color: "#c4b5fd" },
  toilets: { label: "Toilettes publiques", icon: "🚻", color: "#94a3b8" },
  // Réservés aux futurs partenaires (annonces payantes) — aucun affiché aujourd'hui.
  bar: { label: "Bar partenaire", icon: "🍸", color: "#f472b6" },
  club: { label: "Club partenaire", icon: "🪩", color: "#f472b6" },
  sauna: { label: "Sauna partenaire", icon: "♨️", color: "#f472b6" },
};
const PROPOSABLE: PlaceKind[] = ["park", "garden", "viewpoint", "square", "promenade", "beach", "aire", "cruising", "other"];
const LAYER_KEY = "hdar-places-layer";
const TOILETS_KEY = "hdar-toilets-layer";
export function toiletsLayerOn() {
  return typeof localStorage === "undefined" || localStorage.getItem(TOILETS_KEY) !== "off";
}
export function setToiletsLayer(on: boolean) {
  localStorage.setItem(TOILETS_KEY, on ? "on" : "off");
}

/** Public toilets, fetched for the visible box only from zoom 12 (there are tens of thousands). */
export function useToilets(on: boolean, box: { s: number; w: number; n: number; e: number }, zoom: number): PlacePin[] {
  const [rows, setRows] = useState<PlacePin[]>([]);
  const active = on && zoom >= 12;
  const key = [box.s, box.w, box.n, box.e].map((v) => v.toFixed(2)).join(",");
  useEffect(() => {
    if (!active) {
      setRows([]);
      return;
    }
    const [s, w, n, e] = key.split(",").map(Number);
    let stop = false;
    const t = window.setTimeout(() => {
      void listToilets(s - 0.02, w - 0.02, n + 0.02, e + 0.02)
        .then((r) => {
          if (!stop) setRows(r.map((x) => ({ ...x, kind: "toilets" as const, name: "Toilettes publiques", partner: false })));
        })
        .catch(() => undefined);
    }, 400);
    return () => {
      stop = true;
      window.clearTimeout(t);
    };
  }, [active, key]);
  return active ? rows : [];
}

export function placesLayerOn() {
  return typeof localStorage === "undefined" || localStorage.getItem(LAYER_KEY) !== "off";
}
export function setPlacesLayer(on: boolean) {
  localStorage.setItem(LAYER_KEY, on ? "on" : "off");
}

let cache: PlacePin[] | null = null;
let loading: Promise<PlacePin[]> | null = null;

/** All permanent places (~2 000) are loaded once and clustered on screen at every zoom level. */
export function usePlaces(on: boolean) {
  const [rows, setRows] = useState<PlacePin[]>(cache ?? []);
  useEffect(() => {
    if (!on || cache) return;
    loading ??= listPlaces(-90, -180, 90, 180).then((r) => (cache = r)).finally(() => (loading = null));
    let stop = false;
    void loading.then((r) => !stop && setRows(r)).catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [on]);
  return on ? rows : [];
}

export function PlaceSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const [p, setP] = useState<PlaceDetail | null>(null);
  useEffect(() => {
    void getPlace(id).then(setP).catch(() => undefined);
    const h = useHdar.getState().here;
    void placeSeen(id, h?.lat ?? null, h?.lng ?? null).catch(() => undefined);
    setOpenPlace(id);
    return () => setOpenPlace(null);
  }, [id]);
  const k = p ? PLACE_KINDS[p.kind] : null;
  const sheetRef = useRef<HTMLDivElement>(null);
  useOpenAtTop(sheetRef, id);
  return (
    <div ref={sheetRef} className="hdar-sheet-up absolute inset-x-0 bottom-0 z-40 max-h-[75%] overflow-y-auto rounded-t-3xl border border-b-0 border-line bg-surface p-5 pb-8 shadow-2xl">
      <button type="button" aria-label="Fermer" className="absolute top-3 end-3 flex size-10 items-center justify-center" onClick={onClose}>
        <X className="size-5" />
      </button>
      {!p ? (
        <p className="py-8 text-center text-sm text-muted">Chargement…</p>
      ) : (
        <>
          <p className="text-sm" style={{ color: k!.color }}>
            {k!.icon} {k!.label}
          </p>
          <h2 className="mt-1 pe-10 font-display text-2xl font-extrabold">{p.name}</h2>
          {p.description && <p className="mt-2 text-sm">{p.description}</p>}
          {p.kind !== "toilets" && <PlaceExtras id={p.id} />}
          <a
            className="mt-3 inline-block text-sm text-signal underline"
            href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=17/${p.lat}/${p.lng}`}
            target="_blank"
            rel="noopener"
          >
            Voir sur la carte / itinéraire
          </a>
          {p.kind === "toilets" ? (
            <p className="mt-4 rounded-2xl bg-night p-4 text-xs leading-relaxed text-muted">
              Toilettes publiques issues d'OpenStreetMap : horaires et accès peuvent varier. Respecte les lieux et les autres usagers.
            </p>
          ) : (
          <div className="mt-4 rounded-2xl bg-night p-4 text-xs leading-relaxed text-muted">
            <p className="font-bold text-ink">Avant d'y aller</p>
            <ul className="mt-1 list-disc space-y-1 ps-4">
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
          )}
          <PlaceChat place={p} />
          {p.source === "osm" && <p className="mt-3 text-[11px] text-muted">Données © OpenStreetMap contributors (ODbL).</p>}
        </>
      )}
    </div>
  );
}

export function ProposePlaceSheet({ at, onClose }: { at: { lat: number; lng: number }; onClose: () => void }) {
  const onboarded = useHdar((s) => s.me.onboarded);
  const openGate = useHdar((s) => s.openGate);
  const [kind, setKind] = useState<PlaceKind>("park");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);
  const field = "w-full rounded-2xl border border-line bg-night px-4 py-3 text-ink outline-none focus:border-signal";
  return (
    <div className="hdar-sheet-up absolute inset-x-0 bottom-0 z-40 max-h-[85%] overflow-y-auto rounded-t-3xl border border-b-0 border-line bg-surface p-5 pb-8 shadow-2xl">
      <button type="button" aria-label="Fermer" className="absolute top-3 end-3 flex size-10 items-center justify-center" onClick={onClose}>
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

export function PlaceChat({ place }: { place: PlaceDetail }) {
  const here = useHdar((s) => s.here);
  const isAdmin = useAmAdmin();
  const [lines, setLines] = useState<PlaceLine[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const distKm = here ? haversine(here, { lat: place.lat, lng: place.lng }) / 1000 : null;
  // Les admins écrivent partout (modération, annonces), sans limite de distance.
  const canPost = isAdmin || (distKm != null && distKm <= 2);
  const at = here ?? { lat: place.lat, lng: place.lng };
  useEffect(() => {
    let stop = false;
    const load = () => {
      if (document.visibilityState !== "visible") return;
      void placeMessages(place.id)
        .then((r) => {
          if (!stop) setLines(r);
          setOpenPlace(place.id);
        })
        .catch(() => undefined);
    };
    load();
    const t = window.setInterval(load, 5000);
    return () => {
      stop = true;
      window.clearInterval(t);
    };
  }, [place.id]);
  useEffect(() => {
    // scrollIntoView returns a Promise in recent Chrome: never return it from an effect.
    scrollListEnd(end.current);
  }, [lines.length]);
  const send = () => {
    const b = text.trim();
    if (!b || !canPost) return;
    setBusy(true);
    placeSend(place.id, b, at.lat, at.lng)
      .then(() => placeMessages(place.id))
      .then((r) => {
        setLines(r);
        setText("");
      })
      .catch((e: Error) => toast(e.message))
      .finally(() => setBusy(false));
  };
  return (
    <div className="mt-4">
      <h3 className="font-display font-bold">Chat du lieu</h3>
      <p className="text-xs text-muted">Lisible par tous · messages effacés après 24 h · écrire : à moins de 2 km.</p>
      <div className="mt-2 max-h-80 space-y-1.5 overflow-y-auto rounded-2xl bg-night p-3 text-sm">
        {lines.length === 0 && <p className="py-4 text-center text-xs text-muted">Aucun message pour l'instant.</p>}
        {lines.map((l) => (
          <p key={l.id} className={l.mine ? "text-end" : ""}>
            <span className="text-xs font-bold text-muted">{l.mine ? "Toi" : l.pseudo}</span>{" "}
            {l.body ? <span className="break-words">{l.body}</span> : <span className="mt-1 block"><RoomMedia scope="place" id={l.id} mine={l.mine} /></span>}
            {(l.mine || isAdmin) && (
              <button
                type="button"
                aria-label="Supprimer"
                className="ms-1 text-xs text-muted"
                onClick={() => void placeHide(l.id).then(() => setLines((x) => x.filter((y) => y.id !== l.id)))}
              >
                ×
              </button>
            )}
          </p>
        ))}
        <div ref={end} />
      </div>
      {canPost ? (
        <form
          className="mt-2 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <RoomAttach
            send={(k, path, d) =>
              placeSendMedia(place.id, k, path, d, at.lat, at.lng).then(() => placeMessages(place.id)).then(setLines)
            }
          />
          <input
            className="h-11 min-w-0 flex-1 rounded-full border border-line bg-night px-4 text-sm outline-none focus:border-signal"
            placeholder="Écrire aux gens du coin…"
            maxLength={240}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <button type="submit" disabled={busy || !text.trim()} className="h-11 rounded-full bg-signal px-4 text-sm font-bold text-night disabled:opacity-50">
            Envoyer
          </button>
        </form>
      ) : (
        <p className="mt-2 rounded-2xl border border-line px-3 py-2 text-xs text-muted">
          {distKm == null
            ? "Active ta localisation (bouton viseur) pour écrire ici."
            : `Tu es à ${distKm < 10 ? distKm.toFixed(1) : Math.round(distKm)} km : rapproche-toi à moins de 2 km pour écrire.`}
        </p>
      )}
    </div>
  );
}

export function Stars({ value, onPick, size = "text-2xl" }: { value: number; onPick?: (n: number) => void; size?: string }) {
  return (
    <span className={"inline-flex " + size}>
      {[1, 2, 3, 4, 5].map((n) =>
        onPick ? (
          <button key={n} type="button" aria-label={`${n} étoile${n > 1 ? "s" : ""}`} className="px-0.5" onClick={() => onPick(n)}>
            <span className={n <= value ? "text-[#fbbf24]" : "text-line"}>★</span>
          </button>
        ) : (
          <span key={n} className={n <= Math.round(value) ? "text-[#fbbf24]" : "text-line"}>★</span>
        ),
      )}
    </span>
  );
}

/** Photos, site, contact (lieux partenaires), puis notes et commentaires selon les réglages du propriétaire. */
function PlaceExtras({ id }: { id: string }) {
  const onboarded = useHdar((s) => s.me.onboarded);
  const openGate = useHdar((s) => s.openGate);
  const [info, setInfo] = useState<PlaceInfo | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => void placeInfo(id).then(setInfo).catch(() => undefined);
  useEffect(load, [id]);
  if (!info) return null;
  const rate = (n: number) => {
    if (!onboarded) return openGate();
    placeRate(id, info.mine === n ? null : n).then(load).catch((e: Error) => toast(e.message));
  };
  const send = () => {
    setBusy(true);
    placeComment(id, text)
      .then(() => {
        setText("");
        toast(info.comments_public ? "Commentaire publié" : "Commentaire envoyé au lieu");
        load();
      })
      .catch((e: Error) => toast(e.message))
      .finally(() => setBusy(false));
  };
  return (
    <>
      {info.photos.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto">
          {info.photos.map((src, i) => (
            <img key={i} src={src.startsWith("data:image/") ? src : ""} alt="" className="h-32 shrink-0 rounded-2xl object-cover" />
          ))}
        </div>
      )}
      <VideoSection target="place" id={id} canEdit={info.owner} title="Vidéos du lieu" />
      {(info.website || info.contact) && (
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          {info.website && (
            <a
              className="rounded-full bg-signal px-4 py-2 font-bold text-night"
              href={info.website}
              target="_blank"
              rel="noopener nofollow"
              onClick={() => void placeClick(id).catch(() => undefined)}
            >
              Site web ↗
            </a>
          )}
          {info.contact && <span className="rounded-full border border-line px-4 py-2">{info.contact}</span>}
        </div>
      )}
      {info.ratings_on && (
        <div className="mt-4">
          <div className="flex items-center gap-2">
            <Stars value={info.avg ?? 0} size="text-lg" />
            <span className="text-sm text-muted">{info.count ? `${info.avg} / 5 · ${info.count} note${info.count > 1 ? "s" : ""}` : "Pas encore de note"}</span>
          </div>
          {!info.owner && (
            <p className="mt-1 flex items-center gap-2 text-xs text-muted">
              {info.mine ? "Ta note (touche pour changer, retouche pour retirer) :" : "Note ce lieu :"} <Stars value={info.mine ?? 0} onPick={rate} />
            </p>
          )}
        </div>
      )}
      {info.comments_on && (
        <div className="mt-4">
          <h3 className="font-display font-bold">{info.comments_public || info.owner ? "Commentaires" : "Laisser un commentaire au lieu"}</h3>
          {!info.comments_public && !info.owner && <p className="text-xs text-muted">Ton commentaire sera lu uniquement par l'établissement.</p>}
          <ul className="mt-2 space-y-2">
            {info.comments.map((c) => (
              <li key={c.id} className="rounded-2xl bg-night p-3 text-sm">
                <p className="text-xs text-muted">
                  <b className="text-ink">{c.mine ? "Toi" : c.pseudo}</b> {c.stars ? `· ${"★".repeat(c.stars)}` : ""} · {new Date(c.at).toLocaleDateString(locale())}
                </p>
                <p className="mt-1 break-words">{c.body}</p>
                {c.reply && <p className="mt-1.5 rounded-xl border-s-2 border-[#fbbf24] bg-night px-3 py-1.5 text-xs"><b className="text-[#fbbf24]">Réponse du lieu :</b> {c.reply}</p>}
                <div className="mt-1 text-end text-xs text-muted">
                  {c.mine ? (
                    <button type="button" className="underline" onClick={() => void placeCommentDelete(c.id).then(load)}>Supprimer</button>
                  ) : (
                    <button
                      type="button"
                      className="underline"
                      onClick={() => {
                        const r = window.prompt("Pourquoi signaler ce commentaire ?");
                        if (r !== null) void placeCommentReport(c.id, r).then(() => toast("Merci, on regarde ça."));
                      }}
                    >
                      Signaler
                    </button>
                  )}
                </div>
              </li>
            ))}
            {info.comments.length === 0 && (info.comments_public || info.owner) && <li className="text-xs text-muted">Aucun commentaire pour l'instant.</li>}
          </ul>
          {!info.owner &&
            (onboarded ? (
              <form
                className="mt-2 flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                <input
                  className="h-11 min-w-0 flex-1 rounded-full border border-line bg-night px-4 text-sm outline-none focus:border-signal"
                  placeholder="Ton avis sur ce lieu…"
                  maxLength={500}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                />
                <button type="submit" disabled={busy || text.trim().length < 2} className="h-11 rounded-full bg-signal px-4 text-sm font-bold text-night disabled:opacity-50">
                  Publier
                </button>
              </form>
            ) : (
              <button type="button" className="mt-2 text-sm text-signal underline" onClick={openGate}>
                Crée ton profil pour commenter
              </button>
            ))}
        </div>
      )}
    </>
  );
}

/** Lieux de sortie OSM (parcs, jardins, belvédères, places, promenades), chargés pour la zone visible à partir du zoom 12. */
export function useOutings(on: boolean, box: { s: number; w: number; n: number; e: number }, zoom: number): PlacePin[] {
  const [rows, setRows] = useState<PlacePin[]>([]);
  const active = on && zoom >= 12;
  const key = [box.s, box.w, box.n, box.e].map((v) => v.toFixed(2)).join(",");
  useEffect(() => {
    if (!active) { setRows([]); return; }
    const [s, w, n, e] = key.split(",").map(Number);
    let stop = false;
    const t = window.setTimeout(() => {
      void listOutings(s - 0.02, w - 0.02, n + 0.02, e + 0.02)
        .then((r) => { if (!stop) setRows(r.map((x) => ({ ...x, partner: false }))); })
        .catch(() => undefined);
    }, 450);
    return () => { stop = true; window.clearTimeout(t); };
  }, [active, key]);
  return active ? rows : [];
}
