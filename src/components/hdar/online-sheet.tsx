import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { GENDERS, genderShort, getProfile, onlineList, type OnlinePerson, type OnlineVisitor } from "@/lib/hdar/live";
import { deviceId } from "@/lib/hdar/device";
import { usePremium } from "@/lib/hdar/premium";
import { useHdar } from "@/lib/hdar/store";
import { approxGeo } from "@/lib/hdar/recent";

type Row = { kind: "profile"; p: OnlinePerson; km: number } | { kind: "discret"; v: OnlineVisitor; km: number };
type Sort = "near" | "recent" | "photo" | "age" | "new";
const SORTS: { id: Sort; label: string }[] = [
  { id: "near", label: "Plus proches" }, { id: "recent", label: "Actifs récemment" }, { id: "photo", label: "Avec photo" },
  { id: "age", label: "Âge" }, { id: "new", label: "Nouveaux" },
];
const NO_F = { minAge: null, maxAge: null, desires: [], places: [], iam: [], online: false, photo: false };

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = Math.PI / 180, d = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(d));
}
/** Distance volontairement grossière : positions arrondies / carreaux, jamais de précision. */
const distLabel = (k: number) => (k < 1.5 ? "≈ 1 km" : k < 10 ? `≈ ${Math.round(k)} km` : `≈ ${Math.round(k / 5) * 5} km`);
const ago = (m: number) => (m <= 5 ? "en ligne" : m < 60 ? `il y a ${m} min` : m < 1440 ? `il y a ${Math.floor(m / 60)} h` : `il y a ${Math.floor(m / 1440)} j`);

/** Même personne avec deux profils (deux appareils) : même pseudo + même âge à moins de 5 km → une seule ligne, la plus récente. */
function dedupe(list: OnlinePerson[]) {
  const out: OnlinePerson[] = [];
  for (const p of [...list].sort((a, b) => a.min - b.min)) {
    const k = p.pseudo.trim().toLowerCase();
    if (!out.some((o) => o.pseudo.trim().toLowerCase() === k && o.age === p.age && km(o, p) < 5)) out.push(p);
  }
  return out;
}

/** Feuille « ● N en ligne » : qui est visible sur la carte autour de moi. */
export function OnlineSheet({ onClose, demo }: { onClose: () => void; demo?: { me: { lat: number; lng: number }; people: OnlinePerson[]; visitors: OnlineVisitor[] } }) {
  const onboarded = useHdar((s) => s.me.onboarded);
  const [myIam, setMyIam] = useState(demo ? "h" : "");
  useEffect(() => { if (!demo && onboarded) void getProfile(deviceId(), deviceId()).then((p) => setMyIam(p?.iam ?? "")).catch(() => undefined); }, [demo, onboarded]);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(demo?.me ?? null);
  const [data, setData] = useState<{ people: OnlinePerson[]; visitors: OnlineVisitor[] } | null>(demo ? { people: demo.people, visitors: demo.visitors } : null);
  const [sort, setSort] = useState<Sort>("near");
  const [who, setWho] = useState<"all" | "profiles" | "discrets">("all");
  const [gender, setGender] = useState<string | null>(null);
  const [seekMe, setSeekMe] = useState(false);
  useEffect(() => {
    if (demo) return;
    const st = useHdar.getState();
    const at = st.here ?? st.customCenter;
    if (at) setCenter(at); else void approxGeo().then((g) => g && setCenter({ lat: g.lat, lng: g.lng }));
  }, [demo]);
  useEffect(() => {
    if (demo || !center) return;
    const f = usePremium.getState();
    // Même fenêtre maximale que les bulles de la carte (≤ 3° × 4°).
    void onlineList({ s: center.lat - 1.4, n: center.lat + 1.4, w: center.lng - 1.9, e: center.lng + 1.9 }, f.premium ? f.filters : NO_F)
      .then(setData).catch(() => setData({ people: [], visitors: [] }));
  }, [center, demo]);
  const rows = useMemo<Row[]>(() => {
    if (!data || !center) return [];
    let r: Row[] = [
      ...(who === "discrets" ? [] : dedupe(data.people).map((p) => ({ kind: "profile" as const, p, km: km(center, p) }))),
      ...(who === "profiles" || gender || seekMe ? [] : data.visitors.map((v) => ({ kind: "discret" as const, v, km: km(center, v) }))),
    ];
    if (gender) r = r.filter((x) => x.kind === "profile" && (x.p.iam ?? "").toLowerCase() === gender);
    if (seekMe && myIam) r = r.filter((x) => x.kind === "profile" && (x.p.seeking ?? "").toLowerCase().split(",").includes(myIam.toLowerCase()));
    const min = (x: Row) => (x.kind === "profile" ? x.p.min : x.v.min);
    const by: Record<Sort, (a: Row, b: Row) => number> = {
      near: (a, b) => a.km - b.km,
      recent: (a, b) => min(a) - min(b),
      photo: (a, b) => Number(b.kind === "profile" && !!b.p.photo) - Number(a.kind === "profile" && !!a.p.photo) || a.km - b.km,
      age: (a, b) => (a.kind === "profile" ? a.p.age ?? 999 : 999) - (b.kind === "profile" ? b.p.age ?? 999 : 999),
      new: (a, b) => (b.kind === "profile" ? (b.p.since ?? "") : "") .localeCompare(a.kind === "profile" ? (a.p.since ?? "") : "") || Number(b.kind === "profile" && b.p.new) - Number(a.kind === "profile" && a.p.new),
    };
    return r.sort(by[sort]);
  }, [data, center, who, sort, gender, seekMe, myIam]);
  const open = (x: Row) => {
    const st = useHdar.getState();
    if (x.kind === "profile") { onClose(); st.openProfile(x.p.id, x.p.pseudo); return; }
    if (!onboarded) { toast("Crée ton profil pour écrire en privé"); st.openGate(); return; }
    onClose(); st.openLive(x.v.id, x.v.name);
  };
  const nP = data ? dedupe(data.people).length : 0, nV = data?.visitors.length ?? 0;
  const chip = (on: boolean) => "h-8 shrink-0 rounded-full border px-3 text-xs font-bold " + (on ? "border-transparent bg-ink text-night" : "border-line text-muted");
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55" onClick={onClose}>
      <div className="flex max-h-[85dvh] w-full max-w-md flex-col rounded-t-3xl border border-line bg-night pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 pt-4">
          <span className="size-2 animate-pulse rounded-full bg-online" />
          <p className="flex-1 font-display text-lg font-extrabold">Visibles autour de toi</p>
          <button type="button" aria-label="Fermer" onClick={onClose} className="flex size-9 items-center justify-center rounded-full bg-surface"><X className="size-4" /></button>
        </div>
        <p className="px-4 text-xs text-muted">Seulement les personnes déjà visibles sur la carte · distances approximatives</p>
        <div className="mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
          <button type="button" className={chip(who === "all")} onClick={() => setWho("all")}>Tous · {nP + nV}</button>
          <button type="button" className={chip(who === "profiles")} onClick={() => setWho("profiles")}>Profils · {nP}</button>
          <button type="button" className={chip(who === "discrets")} onClick={() => setWho("discrets")}>Discrets · {nV}</button>
          {GENDERS.map((g) => <button key={g.id} type="button" className={chip(gender === g.id)} onClick={() => setGender(gender === g.id ? null : g.id)}>{g.short}</button>)}
          {myIam && <button type="button" className={chip(seekMe)} onClick={() => setSeekMe(!seekMe)}>Me cherchent</button>}
        </div>
        <div className="mt-1 flex gap-2 overflow-x-auto px-4 pb-2">
          {SORTS.map((s) => <button key={s.id} type="button" className={"h-8 shrink-0 rounded-full px-3 text-xs font-bold " + (sort === s.id ? "bg-signal text-night" : "bg-surface text-muted")} onClick={() => setSort(s.id)}>{s.label}</button>)}
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto px-2">
          {!data && <li className="p-6 text-center text-sm text-muted">Chargement…</li>}
          {data && rows.length === 0 && <li className="p-6 text-center text-sm text-muted">Personne pour l'instant avec ces critères.</li>}
          {rows.map((x) => x.kind === "profile" ? (
            <li key={x.p.id}>
              <button type="button" onClick={() => open(x)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-start active:bg-surface">
                <span className="relative size-12 shrink-0 overflow-hidden rounded-full border border-line bg-surface">
                  {x.p.photo ? <img src={x.p.photo} alt="" className="size-full object-cover" /> : <span className="flex size-full items-center justify-center font-display font-bold">{x.p.pseudo.slice(0, 1).toUpperCase()}</span>}
                  {x.p.min <= 5 && <span className="absolute end-0 bottom-0 size-3 rounded-full border-2 border-night bg-online" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{x.p.pseudo}{x.p.age ? <span className="font-normal text-muted"> · {x.p.age} ans</span> : null}{x.p.premium ? " 👑" : ""}{x.p.new ? <span className="ms-1.5 rounded-full bg-[#3EE08F]/15 px-1.5 py-0.5 text-[10px] font-bold text-[#3EE08F]">Nouveau</span> : null}</span>
                  <span className="block truncate text-xs text-muted">{[genderShort(x.p.iam ?? ""), distLabel(x.km), ago(x.p.min)].filter(Boolean).join(" · ")}</span>
                </span>
              </button>
            </li>
          ) : (
            <li key={x.v.id}>
              <button type="button" onClick={() => open(x)} className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-start active:bg-surface">
                <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-dashed border-line bg-surface text-xl">👀</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{x.v.name} <span className="ms-1 rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-muted">sans profil</span></span>
                  <span className="block truncate text-xs text-muted">{distLabel(x.km)} · {ago(x.v.min)}{onboarded ? " · touche pour écrire" : ""}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
