import { useCallback, useEffect, useState } from "react";
import { checkoutWithWaiver } from "@/lib/hdar/consent";
import { WaiverCheckbox } from "@/components/hdar/waiver";
import { toast } from "sonner";
import {
  myPlaces, openBillingPortal, partnerSave, partnerStats, paymentsEnabled, pricing,
  type MyPlace, type PartnerInput, type PartnerStats, type PlaceKind, type PriceRow,
} from "@/lib/hdar/live";
import { readImage } from "@/lib/hdar/media";
import { PLACE_KINDS } from "./places-layer";
import { ProLanding } from "./pro-landing";

const KINDS: PlaceKind[] = ["bar", "club", "sauna", "other"];
const field = "w-full rounded-2xl border border-line bg-night px-4 py-3 text-ink outline-none focus:border-signal";
const euros = (c: number) => (c / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
const day = (v: string | null) => (v ? new Date(v).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—");

export function ProSpace() {
  const [prices, setPrices] = useState<PriceRow[]>([]);
  const [payOk, setPayOk] = useState<boolean | null>(null);
  useEffect(() => {
    if (location.hash === "#boost") { location.replace("/boost" + location.search); return; }
    void pricing().then(setPrices).catch(() => undefined);
    void paymentsEnabled().then(setPayOk);
    const q = new URLSearchParams(location.search);
    if (q.get("paid")) toast("Paiement reçu, merci ! L'activation prend quelques secondes.");
    if (q.get("cancel")) toast("Paiement annulé.");
  }, []);
  return (
    <main className="h-dvh overflow-y-auto bg-night px-5 py-8 text-ink">
      <div className="mx-auto max-w-2xl">
        <a href="/" className="text-sm text-muted underline">← Retour à la carte</a>
        <h1 className="mt-3 font-display text-3xl font-extrabold">hdar<span className="text-signal">.</span> pro</h1>
        <p className="mt-1 text-sm text-muted">Fais briller ton établissement sur la carte.</p>
        {payOk === false && (
          <p className="mt-4 rounded-2xl border border-[#fbbf24] px-4 py-3 text-sm text-[#fbbf24]">
            💳 Paiement bientôt disponible. Tu peux déjà préparer ta fiche, elle s'activera dès le paiement.
          </p>
        )}
        <Places prices={prices.filter((p) => p.kind === "listing")} payOk={!!payOk} />
        <p className="mt-8 text-center text-xs text-muted">Envie de faire briller ton profil ? <a className="underline" href="/boost">Booster mon profil ✨</a></p>
      </div>
    </main>
  );
}

function PriceButtons({ prices, payOk, onPick }: { prices: PriceRow[]; payOk: boolean; onPick: (product: string) => Promise<void> }) {
  const [busy, setBusy] = useState("");
  return (
    <>
    <WaiverCheckbox className="mt-3" />
    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
      {prices.map((p) => (
        <button
          key={p.product}
          type="button"
          disabled={!!busy}
          onClick={() => {
            if (!payOk) return toast("Paiement bientôt disponible");
            setBusy(p.product);
            onPick(p.product).catch((e: Error) => toast(e.message)).finally(() => setBusy(""));
          }}
          className="rounded-2xl border border-line bg-surface px-4 py-3 text-left disabled:opacity-50"
        >
          <b className="block">{p.label}</b>
          <span className="text-signal">{euros(p.price_cents)}</span>
          <span className="block text-[11px] text-muted">{busy === p.product ? "Redirection…" : payOk ? "Payer avec Stripe" : "Bientôt disponible"}</span>
        </button>
      ))}
    </div>
    </>
  );
}

// ---------------------------------------------------------------- lieux
function Places({ prices, payOk }: { prices: PriceRow[]; payOk: boolean }) {
  const [rows, setRows] = useState<MyPlace[] | null>(null);
  const [edit, setEdit] = useState<PartnerInput | null>(null);
  const load = useCallback(() => void myPlaces().then(setRows).catch((e: Error) => toast(e.message)), []);
  useEffect(load, [load]);
  const blank = (): PartnerInput => ({ id: null, kind: "bar", name: "", description: "", lat: NaN, lng: NaN, website: "", contact: "", photos: [], ratings_on: true, comments_on: true, comments_public: true });
  if (edit) return <PlaceForm init={edit} onDone={() => { setEdit(null); load(); }} />;
  if (!rows || rows.length === 0) return <ProLanding prices={prices} onCreate={() => { setEdit(blank()); scrollTo(0, 0); document.querySelector("main")?.scrollTo(0, 0); }} />;
  return (
    <div className="mt-5 space-y-4">
      {rows?.map((p) => (
        <section key={p.id} className="rounded-3xl border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm text-muted">{PLACE_KINDS[p.kind]?.icon} {PLACE_KINDS[p.kind]?.label}</p>
              <h2 className="font-display text-xl font-extrabold">{p.name}</h2>
              <p className={"text-xs " + (p.active ? "text-online" : "text-muted")}>
                {p.active ? `En ligne jusqu'au ${day(p.partner_until)}` : "Pas encore visible sur la carte : choisis une durée"}
                {p.sub_status && ` · abonnement : ${p.sub_status === "active" ? "renouvellement auto" : p.sub_status === "cancelling" ? "s'arrête à la fin de la période" : p.sub_status}`}
              </p>
            </div>
            <button type="button" className="h-9 shrink-0 rounded-full border border-line px-3 text-xs" onClick={() => setEdit({ ...p })}>Modifier</button>
          </div>
          <p className="mt-3 text-sm font-bold">{p.active ? "Prolonger" : "Mettre en ligne"}</p>
          <PriceButtons prices={prices} payOk={payOk} onPick={(prod) => checkoutWithWaiver(prod, p.id)} />
          {p.sub_status && payOk && (
            <button type="button" className="mt-2 text-xs text-muted underline" onClick={() => void openBillingPortal().catch((e: Error) => toast(e.message))}>
              Gérer / résilier mon abonnement
            </button>
          )}
          <Stats id={p.id} />
        </section>
      ))}
      <button
        type="button"
        className="h-12 w-full rounded-full bg-signal font-bold text-night"
        onClick={() => setEdit(blank())}
      >
        + Créer une fiche lieu
      </button>
      <details className="rounded-3xl border border-line p-4">
        <summary className="cursor-pointer text-sm font-bold">Voir la présentation hdar pro</summary>
        <ProLanding prices={prices} onCreate={() => setEdit(blank())} />
      </details>
    </div>
  );
}

function PlaceForm({ init, onDone }: { init: PartnerInput; onDone: () => void }) {
  const [p, setP] = useState(init);
  const [pos, setPos] = useState(Number.isFinite(init.lat) ? `${init.lat}, ${init.lng}` : "");
  const [busy, setBusy] = useState(false);
  const set = (x: Partial<PartnerInput>) => setP((o) => ({ ...o, ...x }));
  const parsed = pos.match(/(-?\d{1,2}(?:\.\d+)?)[,\s/]+(-?\d{1,3}(?:\.\d+)?)/);
  const save = () => {
    if (!parsed) return toast("Indique la position (ex. 43.6108, 3.8767) ou utilise ta position");
    setBusy(true);
    partnerSave({ ...p, lat: Number(parsed[1]), lng: Number(parsed[2]) })
      .then(() => { toast("Fiche enregistrée"); onDone(); })
      .catch((e: Error) => toast(e.message))
      .finally(() => setBusy(false));
  };
  return (
    <div className="mt-5 space-y-3">
      <h2 className="font-display text-xl font-extrabold">{p.id ? "Modifier la fiche" : "Nouvelle fiche"}</h2>
      <div className="flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button key={k} type="button" onClick={() => set({ kind: k })} className={"h-10 rounded-full border px-3 text-sm " + (p.kind === k ? "border-signal bg-signal text-night" : "border-line")}>
            {PLACE_KINDS[k].icon} {k === "other" ? "Autre / événement" : PLACE_KINDS[k].label.replace(" partenaire", "")}
          </button>
        ))}
      </div>
      <input className={field} placeholder="Nom de l'établissement" maxLength={80} value={p.name} onChange={(e) => set({ name: e.target.value })} />
      <textarea className={field + " min-h-24"} placeholder="Description, horaires, ambiance…" maxLength={600} value={p.description} onChange={(e) => set({ description: e.target.value })} />
      <div className="flex gap-2">
        <input className={field} placeholder="Position : 43.6108, 3.8767 (clic droit sur Google Maps)" value={pos} onChange={(e) => setPos(e.target.value)} />
        <button
          type="button"
          className="shrink-0 rounded-2xl border border-line px-3 text-sm"
          onClick={() => navigator.geolocation.getCurrentPosition((g) => setPos(`${g.coords.latitude.toFixed(5)}, ${g.coords.longitude.toFixed(5)}`), () => toast("Position indisponible"))}
        >
          📍 Ici
        </button>
      </div>
      <input className={field} placeholder="Site web (https://…)" maxLength={200} value={p.website ?? ""} onChange={(e) => set({ website: e.target.value })} />
      <input className={field} placeholder="Contact affiché (téléphone, Instagram…)" maxLength={200} value={p.contact ?? ""} onChange={(e) => set({ contact: e.target.value })} />
      <div>
        <p className="text-sm font-bold">Photos ({p.photos.length}/4)</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {p.photos.map((src, i) => (
            <button key={i} type="button" title="Retirer" onClick={() => set({ photos: p.photos.filter((_, j) => j !== i) })}>
              <img src={src} alt="" className="size-20 rounded-xl object-cover" />
            </button>
          ))}
          {p.photos.length < 4 && (
            <label className="flex size-20 cursor-pointer items-center justify-center rounded-xl border border-dashed border-line text-2xl">
              +
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void readImage(f, 900).then((d) => set({ photos: [...p.photos, d].slice(0, 4) }));
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
      </div>
      <fieldset className="space-y-2 rounded-2xl border border-line p-4 text-sm">
        <legend className="px-1 font-bold">Avis des utilisateurs</legend>
        <label className="flex items-center gap-2"><input type="checkbox" checked={p.ratings_on} onChange={(e) => set({ ratings_on: e.target.checked })} /> Accepter les notes (étoiles)</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={p.comments_on} onChange={(e) => set({ comments_on: e.target.checked })} /> Accepter les commentaires</label>
        {p.comments_on && (
          <div className="ml-6 space-y-1">
            <label className="flex items-center gap-2"><input type="radio" checked={p.comments_public} onChange={() => set({ comments_public: true })} /> Publics, affichés sur la fiche</label>
            <label className="flex items-center gap-2"><input type="radio" checked={!p.comments_public} onChange={() => set({ comments_public: false })} /> Privés, visibles seulement par moi</label>
          </div>
        )}
      </fieldset>
      <div className="flex gap-2">
        <button type="button" className="h-12 flex-1 rounded-full border border-line" onClick={onDone}>Annuler</button>
        <button type="button" disabled={busy || p.name.trim().length < 2} className="h-12 flex-1 rounded-full bg-signal font-bold text-night disabled:opacity-50" onClick={save}>
          {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
      <p className="text-xs text-muted">Contenu modéré : les fiches contraires aux CGU sont retirées sans remboursement.</p>
    </div>
  );
}

function Stats({ id }: { id: string }) {
  const [days, setDays] = useState(30);
  const [s, setS] = useState<PartnerStats | null>(null);
  useEffect(() => void partnerStats(id, days).then(setS).catch(() => undefined), [id, days]);
  if (!s) return null;
  const max = Math.max(1, ...s.hours.map((h) => h.n));
  return (
    <details className="mt-4">
      <summary className="cursor-pointer text-sm font-bold">📊 Statistiques</summary>
      <div className="mt-2 flex gap-1 text-xs">
        {[7, 30, 90].map((d) => (
          <button key={d} type="button" onClick={() => setDays(d)} className={"h-8 rounded-full px-3 " + (days === d ? "bg-signal font-bold text-night" : "border border-line")}>{d} j</button>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center text-[11px] text-muted sm:grid-cols-4">
        {([
          ["Vues de la fiche", s.views], ["Visiteurs uniques", s.visitors], ["Clics vers ton site", s.clicks], ["Messages dans le chat", s.messages],
          ["Note moyenne", s.avg != null ? `${s.avg}★` : "—"], ["Notes", s.ratings], ["Commentaires", s.comments],
        ] as const).map(([l, v]) => (
          <span key={l} className="rounded-xl bg-night px-2 py-2"><b className="block text-lg text-ink">{v}</b>{l}</span>
        ))}
      </div>
      <p className="mt-3 text-xs font-bold">Heures de visite</p>
      <div className="mt-1 flex h-20 items-end gap-[2px]">
        {Array.from({ length: 24 }, (_, h) => {
          const n = s.hours.find((x) => x.hour === h)?.n ?? 0;
          return (
            <div key={h} className="flex flex-1 flex-col items-center" title={`${h} h : ${n}`}>
              <div className="w-full rounded-t bg-signal" style={{ height: `${(n / max) * 64}px` }} />
              {h % 6 === 0 && <span className="text-[9px] text-muted">{h}h</span>}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs font-bold">Zones d'origine des visiteurs (~5 km)</p>
      {s.zones.length === 0 ? (
        <p className="text-xs text-muted">Pas encore de données.</p>
      ) : (
        <ul className="mt-1 space-y-1 text-xs">
          {s.zones.slice(0, 8).map((z, i) => (
            <li key={i} className="flex justify-between rounded-lg bg-night px-3 py-1">
              <a className="underline" target="_blank" rel="noopener" href={`https://www.openstreetmap.org/?mlat=${z.lat}&mlon=${z.lng}#map=12/${z.lat}/${z.lng}`}>
                Zone {z.lat.toFixed(2)}, {z.lng.toFixed(2)}
              </a>
              <span>{z.n} visite(s)</span>
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

