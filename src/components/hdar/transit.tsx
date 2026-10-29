// Transports : pins gares / métro-tram / aéroports, fiche de l'arrêt (chat + « Je suis dans… »), salons à bord.
import { useEffect, useState } from "react";
import { Plane, TrainFront, TramFront, Users, X } from "lucide-react";
import { toast } from "sonner";
import type { PlaceDetail } from "@/lib/hdar/live";
import { useHdar } from "@/lib/hdar/store";
import {
  TRANSIT_KINDS, TRIP_FOR, TRIP_LABEL, ensureStop, isTransitDemo, normalizeTrip, stopLines, todayISO, tripJoin, tripLeave,
  tripsAt, tripsMine, validTrip,
  type TransitKind, type TransitLine, type TransitStop, type Trip, type TripKind,
} from "@/lib/hdar/transit";
import { PlaceChat } from "./places-layer";
import { bindTap } from "./tap";

export function TransitIcon({ kind, className = "size-4" }: { kind: TransitKind | TripKind; className?: string }) {
  if (kind === "airport" || kind === "flight") return <Plane className={className} />;
  if (kind === "metro") return <TramFront className={className} />;
  return <TrainFront className={className} />;
}

export function TransitPin({ s, x, y, onOpen }: { s: TransitStop; x: number; y: number; onOpen: () => void }) {
  const k = TRANSIT_KINDS[s.kind];
  return (
    <button
      type="button"
      aria-label={`${k.label} : ${s.name}`}
      className={"absolute z-10 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 bg-night/90 shadow " + (s.kind === "airport" ? "size-9" : "size-8")}
      style={{ left: x, top: y, borderColor: k.color, color: k.color }}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onOpen}
    >
      <TransitIcon kind={s.kind} />
    </button>
  );
}

function aboardText(n: number) {
  return `${n} à bord`;
}

export function TripChip({ t, onOpen }: { t: Trip; onOpen: () => void }) {
  return (
    <button type="button" {...bindTap(onOpen)} className="flex h-10 w-full items-center gap-2 rounded-2xl border border-line bg-night px-3 text-left text-sm">
      <TransitIcon kind={t.trip_kind} className="size-4 shrink-0 text-signal" />
      <span className="min-w-0 flex-1 truncate font-semibold">{t.name}</span>
      <span className="shrink-0 text-xs text-muted">{aboardText(t.aboard)}</span>
    </button>
  );
}

/** Fiche d'un arrêt : bouton « Je suis dans… », trajets avec du monde à bord, puis chat du lieu (règle des 2 km). */
export function TransitSheet({ stop, onClose }: { stop: TransitStop; onClose: () => void }) {
  const openSalon = useHdar((s) => s.openSalon);
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [joining, setJoining] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const k = TRANSIT_KINDS[stop.kind];
  const tk = TRIP_FOR[stop.kind];
  useEffect(() => {
    let stopped = false;
    void ensureStop(stop)
      .then((id) => {
        if (stopped) return;
        setPlaceId(id);
        return tripsAt(id).then((r) => !stopped && setTrips(r));
      })
      .catch((e: Error) => !stopped && setErr(e.message));
    return () => {
      stopped = true;
    };
  }, [stop.ref]);
  const place: PlaceDetail | null = placeId
    ? { id: placeId, kind: "other", name: stop.name, lat: stop.lat, lng: stop.lng, partner: false, description: "", source: "osm", source_ref: stop.ref }
    : null;
  return (
    <div className="hdar-sheet-up absolute inset-x-0 bottom-0 z-40 max-h-[80%] overflow-y-auto rounded-t-3xl border border-b-0 border-line bg-surface p-5 pb-8 shadow-2xl">
      <button type="button" aria-label="Fermer" className="absolute top-3 right-3 flex size-10 items-center justify-center" onClick={onClose}>
        <X className="size-5" />
      </button>
      <p className="flex items-center gap-1.5 text-sm" style={{ color: k.color }}>
        <TransitIcon kind={stop.kind} /> {k.label}
        {stop.iata ? ` · ${stop.iata}` : ""}
      </p>
      <h2 className="mt-1 pr-10 font-display text-2xl font-extrabold">{stop.name}</h2>
      <button
        type="button"
        data-act="trip-join"
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-signal font-bold text-night"
        onClick={() => setJoining(true)}
      >
        <TransitIcon kind={tk} className="size-5" /> {TRIP_LABEL[tk]}
      </button>
      <p className="mt-1.5 text-center text-[11px] text-muted">Salon à bord temporaire · personne ne voit ta position</p>
      <div className="mt-4">
        <p className="flex items-center gap-1.5 text-xs font-bold tracking-wide text-muted uppercase">
          <Users className="size-3.5" /> {tk === "flight" ? "Vols" : tk === "metro" ? "Lignes" : "Trains"} avec du monde à bord
        </p>
        <div className="mt-2 space-y-2">
          {trips === null && !err && <p className="text-xs text-muted">Chargement…</p>}
          {trips?.length === 0 && <p className="text-xs text-muted">Personne pour l'instant. Lance le salon de ton trajet.</p>}
          {trips?.map((t) => <TripChip key={t.id} t={t} onOpen={() => openSalon(t.id, t.name)} />)}
        </div>
      </div>
      {err && <p className="mt-3 text-xs text-red-300">{err}</p>}
      {place && <PlaceChat place={place} />}
      <p className="mt-3 text-[11px] text-muted">Données © OpenStreetMap contributors (ODbL).</p>
      {joining && (
        <TripJoinSheet
          kind={tk}
          stop={stop}
          placeId={placeId}
          onClose={() => setJoining(false)}
          onJoined={(t) => {
            setJoining(false);
            openSalon(t.id, t.name);
          }}
        />
      )}
    </div>
  );
}

const PLACEHOLDER: Record<TripKind, string> = { train: "ex. TGV 6201, ICE 597, TER 87512", flight: "ex. AF1234, U24812", metro: "ex. Métro 1, Tram T3" };

/** Saisie du numéro (train / vol) ou choix de la ligne (métro, lignes OSM sinon saisie) + date. */
export function TripJoinSheet({ kind: k0, stop, placeId, onClose, onJoined }: {
  kind?: TripKind; stop?: TransitStop; placeId?: string | null; onClose: () => void; onJoined: (t: Trip) => void;
}) {
  const onboarded = useHdar((s) => s.me.onboarded);
  const setTab = useHdar((s) => s.setTab);
  const [kind, setKind] = useState<TripKind>(k0 ?? "train");
  const [code, setCode] = useState("");
  const [network, setNetwork] = useState("");
  const [day, setDay] = useState(todayISO());
  const [lines, setLines] = useState<TransitLine[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (kind !== "metro" || !stop) return;
    void stopLines(stop).then(setLines).catch(() => setLines([]));
  }, [kind, stop?.ref]);
  const ok = validTrip(kind, code);
  const days = [-1, 0, 1].map((d) => {
    const x = new Date();
    x.setDate(x.getDate() + d);
    return { v: todayISO(x), l: d === 0 ? "Aujourd'hui" : d < 0 ? "Hier" : "Demain" };
  });
  const join = (c = code, net = network) => {
    if (!onboarded && !isTransitDemo()) {
      toast("Crée ton profil pour rejoindre un salon à bord", { action: { label: "Créer", onClick: () => setTab("me") } });
      return;
    }
    setBusy(true);
    tripJoin(kind, c, day, placeId ?? null, kind === "metro" ? net.trim() || null : null)
      .then(onJoined)
      .catch((e: Error) => toast(e.message))
      .finally(() => setBusy(false));
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/60" onClick={onClose}>
      <div className="hdar-sheet-up w-full rounded-t-3xl border border-b-0 border-line bg-surface p-5 pb-8" onClick={(e) => e.stopPropagation()}>
        <button type="button" aria-label="Fermer" className="float-right flex size-10 items-center justify-center" onClick={onClose}>
          <X className="size-5" />
        </button>
        <h3 className="font-display text-xl font-extrabold">{TRIP_LABEL[kind]}</h3>
        <p className="mt-1 text-xs text-muted">
          Tu rejoins le salon de ton trajet : on voit combien de personnes sont à bord, jamais où elles sont. Le salon s'efface après le trajet.
        </p>
        {!k0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(["train", "flight", "metro"] as TripKind[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setKind(t);
                  setCode("");
                }}
                className={"flex h-11 items-center justify-center gap-1.5 rounded-2xl border text-sm " + (kind === t ? "border-signal bg-signal/15 font-bold text-signal" : "border-line")}
              >
                <TransitIcon kind={t} /> {t === "train" ? "Train" : t === "flight" ? "Avion" : "Métro"}
              </button>
            ))}
          </div>
        )}
        {kind === "metro" && lines && lines.length > 0 && (
          <>
            <p className="mt-4 text-xs font-bold text-muted">Lignes à cette station</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {lines.map((l) => (
                <button
                  key={l.label + l.network}
                  type="button"
                  disabled={busy}
                  onClick={() => join(l.label, l.network)}
                  className="flex h-10 items-center gap-2 rounded-full border border-line bg-night px-3 text-sm font-semibold"
                >
                  <span className="size-3 rounded-full" style={{ background: l.colour || "#c084fc" }} />
                  {l.label}
                  {l.network && <span className="text-xs font-normal text-muted">{l.network}</span>}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">Ou saisis ta ligne :</p>
          </>
        )}
        <label className="mt-3 block text-xs font-bold text-muted">
          {kind === "flight" ? "Numéro de vol" : kind === "train" ? "Numéro du train" : "Ligne"}
          <input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.slice(0, 30))}
            placeholder={PLACEHOLDER[kind]}
            className="mt-1 h-12 w-full rounded-2xl border border-line bg-night px-4 text-base font-semibold text-ink uppercase placeholder:font-normal placeholder:normal-case"
          />
        </label>
        {kind === "metro" && (
          <label className="mt-2 block text-xs font-bold text-muted">
            Ville / réseau
            <input value={network} onChange={(e) => setNetwork(e.target.value.slice(0, 40))} placeholder="ex. Paris, Lyon, London" className="mt-1 h-11 w-full rounded-2xl border border-line bg-night px-4 text-sm text-ink" />
          </label>
        )}
        {kind !== "metro" && (
          <div className="mt-3 flex gap-2">
            {days.map((d) => (
              <button
                key={d.v}
                type="button"
                onClick={() => setDay(d.v)}
                className={"h-10 flex-1 rounded-full border text-sm " + (day === d.v ? "border-signal bg-signal/15 font-bold text-signal" : "border-line text-muted")}
              >
                {d.l}
              </button>
            ))}
          </div>
        )}
        {code && !ok && <p className="mt-2 text-xs text-amber-300">{kind === "flight" ? "Format attendu : AF1234" : "Format attendu : TGV 6201 ou 6201"}</p>}
        <button
          type="button"
          data-act="trip-go"
          disabled={!ok || busy}
          onClick={() => join()}
          className="mt-4 h-12 w-full rounded-2xl bg-signal font-bold text-night disabled:opacity-40"
        >
          {busy ? "…" : code && ok ? `Rejoindre ${kind === "flight" ? "le vol " : ""}${kind === "metro" ? code.trim() : normalizeTrip(kind, code)}` : "Rejoindre"}
        </button>
        <p className="mt-2 text-center text-[11px] text-muted">Réservé aux 18 ans et plus · Signaler reste disponible dans le salon</p>
      </div>
    </div>
  );
}

/** Onglet Salons : « Je suis dans le train / l'avion / le métro » + mes trajets en cours. */
export function TripsSection() {
  const openSalon = useHdar((s) => s.openSalon);
  const [mine, setMine] = useState<Trip[]>([]);
  const [joining, setJoining] = useState(false);
  useEffect(() => {
    void tripsMine().then(setMine).catch(() => undefined);
  }, [joining]);
  return (
    <section className="mt-4">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg font-bold">À bord</h2>
        <p className="text-xs text-muted">Train, avion, métro · effacé après le trajet</p>
      </div>
      <button
        type="button"
        data-act="trip-open"
        onClick={() => setJoining(true)}
        className="mt-2 flex h-11 w-full items-center justify-center gap-3 rounded-2xl border border-signal/60 bg-surface text-sm font-semibold"
      >
        <TrainFront className="size-4 text-signal" />
        <Plane className="size-4 text-signal" />
        <TramFront className="size-4 text-signal" />
        Je suis dans le train, l'avion ou le métro
      </button>
      {mine.length > 0 && (
        <div className="mt-2 space-y-2">
          {mine.map((t) => (
            <TripChip key={t.id} t={t} onOpen={() => openSalon(t.id, t.name)} />
          ))}
        </div>
      )}
      {joining && (
        <TripJoinSheet
          onClose={() => setJoining(false)}
          onJoined={(t) => {
            setJoining(false);
            openSalon(t.id, t.name);
          }}
        />
      )}
    </section>
  );
}

/** Bandeau du salon à bord : compteur sans positions + « Je descends ». */
export function AboardBar({ id, aboard, kind, onLeft }: { id: string; aboard: number; kind: TripKind; onLeft: () => void }) {
  return (
    <div className="flex items-center gap-2 border-b border-line bg-signal/10 px-4 py-2 text-sm">
      <TransitIcon kind={kind} className="size-4 text-signal" />
      <span className="flex-1 font-semibold">
        {aboard} personne{aboard > 1 ? "s" : ""} à bord
      </span>
      <button
        type="button"
        className="h-8 rounded-full border border-line px-3 text-xs text-muted"
        onClick={() => void tripLeave(id).then(onLeft).catch((e: Error) => toast(e.message))}
      >
        {kind === "flight" ? "J'ai atterri" : "Je descends"}
      </button>
    </div>
  );
}
