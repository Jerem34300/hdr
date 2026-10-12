import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { getPlace, listPlaces, placeHide, placeMessages, placeSend, proposePlace, type PlaceDetail, type PlaceKind, type PlaceLine, type PlacePin } from "@/lib/hdar/live";
import { setOpenPlace } from "@/lib/hdar/activity";
import { haversine } from "@/lib/hdar/rules";
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
    setOpenPlace(id);
    return () => setOpenPlace(null);
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

function PlaceChat({ place }: { place: PlaceDetail }) {
  const here = useHdar((s) => s.here);
  const [lines, setLines] = useState<PlaceLine[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const distKm = here ? haversine(here, { lat: place.lat, lng: place.lng }) / 1000 : null;
  const canPost = distKm != null && distKm <= 2;
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
    end.current?.scrollIntoView({ block: "nearest" });
  }, [lines.length]);
  const send = () => {
    const b = text.trim();
    if (!b || !here) return;
    setBusy(true);
    placeSend(place.id, b, here.lat, here.lng)
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
      <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto rounded-2xl bg-night p-3 text-sm">
        {lines.length === 0 && <p className="py-4 text-center text-xs text-muted">Aucun message pour l'instant.</p>}
        {lines.map((l) => (
          <p key={l.id} className={l.mine ? "text-right" : ""}>
            <span className="text-xs font-bold text-muted">{l.mine ? "Toi" : l.pseudo}</span>{" "}
            <span className="break-words">{l.body}</span>
            {l.mine && (
              <button
                type="button"
                aria-label="Supprimer"
                className="ml-1 text-xs text-muted"
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
          className="mt-2 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
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
