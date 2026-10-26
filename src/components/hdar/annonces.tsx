import { RichText } from "./rich-text";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, ChevronLeft, Pencil, Flag, MessageCircle, Plus, Share2, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/cn";
import { useHdar } from "@/lib/hdar/store";
import { startCheckout } from "@/lib/hdar/live";
import { signedMediaUrl, uploadChatMedia } from "@/lib/hdar/chat-media";
import {
  AD_BOOSTS, AD_CATEGORIES, AD_DURATIONS, AD_REGIONS, MAX_ACTIVE_ADS, MAX_ACTIVE_ADS_PLUS, adsStatus, cleanTag, createAd, freeBoost, kmLabel, MAX_TAGS, SUGGESTED_TAGS, topTags, type AdsStatus, deleteAd, euros, getAd, listAds, myAds,
  regionFromPos, regionName, ALERT_SCOPES, alertLabel, deleteAlert, myAlerts, saveAlert, type AdAlert, type AlertScope, replyAd, reportAd, shareAd, slugify, type Ad, type AdCategory, type BoostScope,
} from "@/lib/hdar/ads";
import { pgTime } from "@/lib/hdar/live";
import { PhotoViewer } from "./photo-viewer";

const ms = (v: string) => (v.includes("T") ? Date.parse(v) : pgTime(v));
function left(v: string) {
  const d = ms(v) - Date.now();
  if (d <= 0) return "expirée";
  const h = Math.floor(d / 3_600_000);
  return h >= 24 ? `${Math.floor(h / 24)} j ${h % 24} h` : h >= 1 ? `${h} h` : `${Math.max(1, Math.round(d / 60_000))} min`;
}
function ago(v: string) {
  const m = Math.round((Date.now() - ms(v)) / 60_000);
  return m < 60 ? `il y a ${Math.max(1, m)} min` : m < 1440 ? `il y a ${Math.round(m / 60)} h` : `il y a ${Math.round(m / 1440)} j`;
}
const cat = (id: string) => AD_CATEGORIES.find((c) => c.id === id) ?? AD_CATEGORIES[4];

/** Ville et région approximatives (même source que la carte : /api/geo, jamais d'adresse). */
function useApproxPlace() {
  const center = useHdar((s) => s.customCenter);
  const [p, setP] = useState<{ city: string; region: string }>({ city: "", region: "" });
  useEffect(() => {
    let alive = true;
    void fetch("/api/geo", { cache: "no-store" })
      .then((r) => r.json() as Promise<{ city: string | null; lat: number | null; lng: number | null }>)
      .then((g) => {
        if (!alive) return;
        const lat = center?.lat ?? g.lat, lng = center?.lng ?? g.lng;
        setP({ city: (g.city ?? "").split(",")[0], region: lat != null && lng != null ? regionFromPos(lat, lng) : "" });
      })
      .catch(() => center && alive && setP({ city: "", region: regionFromPos(center.lat, center.lng) }));
    return () => { alive = false; };
  }, [center]);
  return p;
}

/** Position du téléphone (une fois), arrondie à ~100 m avant tout envoi ; le serveur l'arrondit encore à ~400 m. */
function getPosition(): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Position indisponible"));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: Math.round(p.coords.latitude * 1000) / 1000, lng: Math.round(p.coords.longitude * 1000) / 1000 }),
      () => reject(new Error("Position refusée")), { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
  });
}

export function Annonces({ focus, demo, demoCreate, demoAlerts }: { focus?: string | null; demo?: Ad[]; demoCreate?: boolean; demoAlerts?: "sheet" | "list" }) {
  const closeView = useHdar((s) => s.closeView);
  const onboarded = useHdar((s) => s.me.onboarded);
  const adAction = useHdar((s) => s.adAction);
  const setAdAction = useHdar((s) => s.setAdAction);
  const approx = useApproxPlace();
  const [tab, setTab] = useState<"all" | "mine" | "alerts">(demoAlerts === "list" ? "alerts" : "all");
  const [alerts, setAlerts] = useState<{ limit: number; alerts: AdAlert[] } | null>(null);
  const [alertSheet, setAlertSheet] = useState<null | { a: Partial<AdAlert> }>(null);
  const [region, setRegion] = useState("");
  const [city, setCity] = useState("");
  const [category, setCategory] = useState("");
  const [tag, setTag] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [popular, setPopular] = useState<{ tag: string; n: number }[]>([]);
  const [ads, setAds] = useState<Ad[] | null>(null);
  const [mine, setMine] = useState<Ad[] | null>(null);
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState<null | { t: "create" } | { t: "reply"; ad: Ad } | { t: "boost"; ad: Ad } | { t: "report"; ad: Ad }>(null);
  const [focused, setFocused] = useState<Ad | null>(null);
  useEffect(() => { if (demoCreate) setSheet({ t: "create" }); }, [demoCreate]);
  const [near, setNear] = useState<{ lat: number; lng: number } | null>(null);
  const [status, setStatus] = useState<AdsStatus | null>(null);
  const center = useHdar((s) => s.customCenter);
  const toggleNear = () => {
    if (near) return setNear(null);
    getPosition().then(setNear).catch(() => (center ? setNear({ lat: center.lat, lng: center.lng }) : toast("Active ta position pour trier par distance")));
  };

  useEffect(() => { if (approx.region && !region) setRegion(approx.region); }, [approx.region]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(() => {
    if (demo) { setAds(demo); return; }
    setError("");
    listAds(region, slugify(city), category, 0, near, tag).then(setAds).catch((e: Error) => { setAds([]); setError(e.message); });
  }, [region, city, category, near, tag, demo]);
  useEffect(() => { if (!demo) topTags(region).then(setPopular).catch(() => setPopular([])); }, [region, demo]);
  const pickTag = (t: string) => { setTab("all"); setTag((cur) => (cur === t ? "" : t)); setTagQuery(""); };
  useEffect(() => { const t = window.setTimeout(load, city ? 350 : 0); return () => window.clearTimeout(t); }, [load, city]);
  const loadMine = useCallback(() => {
    if (!onboarded) return;
    myAds().then(setMine).catch(() => setMine([]));
    adsStatus().then(setStatus).catch(() => undefined);
  }, [onboarded]);
  useEffect(loadMine, [loadMine]);
  const loadAlerts = useCallback(() => {
    if (demoAlerts) { setAlerts({ limit: 1, alerts: [{ id: "a1", scope: "ville", region: "occitanie", city: "Montpellier", category: "sortie", tags: ["ce soir"], created_at: "" }] }); return; }
    if (onboarded) myAlerts().then(setAlerts).catch(() => setAlerts({ limit: 1, alerts: [] }));
  }, [onboarded, demoAlerts]);
  useEffect(loadAlerts, [loadAlerts]);
  useEffect(() => { if (demoAlerts === "sheet") setAlertSheet({ a: { scope: "ville", region: "occitanie", city: "Montpellier", category: "sortie", tags: ["ce soir"] } }); }, [demoAlerts]);
  const onAlert = () => {
    if (!onboarded && !demoAlerts) { useHdar.setState({ sheet: "gate" }); return; }
    if (alerts && alerts.alerts.length >= alerts.limit) {
      toast(alerts.limit > 1 ? "10 alertes maximum : supprimes-en une" : "1 alerte en gratuit · jusqu'à 10 avec hdar+ 👑", { action: alerts.limit > 1 ? undefined : { label: "Voir", onClick: () => window.location.assign("/premium") } });
      setTab("alerts"); return;
    }
    setAlertSheet({ a: { scope: city ? "ville" : near ? "quartier" : region ? "region" : "ville", region: region || approx.region, city: city || approx.city, category: (category || null) as AdCategory | null, tags: tag ? [tag] : [] } });
  };

  // Lien direct (citation dans un message, retour de paiement) vers une annonce.
  useEffect(() => { if (focus) void getAd(focus).then((a) => setFocused(a)).catch(() => undefined); }, [focus]);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("paid") === "1") toast("Boost activé dès la confirmation du paiement ✨");
  }, []);

  // Reprise après création du profil.
  useEffect(() => {
    if (!adAction || !onboarded) return;
    setAdAction(null);
    if (adAction.type === "create") setSheet({ t: "create" });
    else void getAd(adAction.id).then((a) => a && setSheet({ t: "reply", ad: a }));
  }, [adAction, onboarded, setAdAction]);

  const needProfile = (intent: { type: "ad-create" } | { type: "ad-reply"; id: string }) => {
    useHdar.setState({ sheet: "gate", intent });
  };
  const onCreate = () => (onboarded ? setSheet({ t: "create" }) : needProfile({ type: "ad-create" }));
  const onReply = (ad: Ad) => (onboarded ? setSheet({ t: "reply", ad }) : needProfile({ type: "ad-reply", id: ad.id }));
  const activeMine = (mine ?? []).filter((a) => ms(a.expires_at) > Date.now()).length;

  const list = tab === "all" ? ads : mine;
  const card = (a: Ad) => (
    <AdCard key={a.id} ad={a} onReply={() => onReply(a)} onBoost={() => setSheet({ t: "boost", ad: a })} near={!!near} onTag={pickTag} activeTag={tag} onReport={() => setSheet({ t: "report", ad: a })}
      onDelete={() => { if (window.confirm("Supprimer cette annonce ?")) void deleteAd(a.id).then(() => { toast("Annonce supprimée"); load(); loadMine(); }); }} />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-line px-3 py-2">
        <button type="button" aria-label="Retour" onClick={closeView} className="hit grid size-10 place-items-center rounded-full"><ChevronLeft className="size-6" /></button>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-xl font-extrabold leading-tight">Petites annonces</h1>
          <p className="text-xs text-muted">18+ · visibles seulement dans l'appli, jamais sur Google</p>
        </div>
        <button type="button" onClick={onCreate} className="flex h-10 items-center gap-1 rounded-full bg-signal px-3 text-sm font-bold text-night"><Plus className="size-4" /> Poster</button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-8">
        <div className="flex gap-1 rounded-full border border-line p-1 text-sm">
          {(["all", "mine", "alerts"] as const).map((t) => (
            <button key={t} type="button" aria-pressed={tab === t} onClick={() => setTab(t)} className={cn("h-9 flex-1 rounded-full", tab === t ? "bg-ink text-night font-bold" : "text-muted")}>
              {t === "all" ? "Toutes" : t === "alerts" ? `🔔 Alertes${alerts?.alerts.length ? ` (${alerts.alerts.length})` : ""}` : `Mes annonces${mine ? ` (${activeMine}/${status?.limit ?? MAX_ACTIVE_ADS})` : ""}`}
            </button>
          ))}
        </div>
        {focused && (
          <section className="mt-3">
            <p className="mb-1 text-xs font-bold tracking-[0.2em] text-signal uppercase">Annonce citée</p>
            {card(focused)}
          </section>
        )}
        {tab === "all" && (
          <div className="mt-3 space-y-2">
            <div className="flex gap-2">
              <select aria-label="Région" value={region} onChange={(e) => setRegion(e.target.value)} className="h-10 min-w-0 flex-1 rounded-full border border-line bg-surface px-3 text-sm">
                <option value="">Toute la France</option>
                {AD_REGIONS.map((r) => <option key={r.s} value={r.s}>{r.n}</option>)}
              </select>
              <input aria-label="Ville" value={city} onChange={(e) => setCity(e.target.value)} placeholder={approx.city ? `Ville (ex. ${approx.city})` : "Ville"} className="h-10 w-[42%] rounded-full border border-line bg-surface px-3 text-sm outline-none focus-visible:border-signal" />
            </div>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const t = cleanTag(tagQuery); if (t.length >= 2) pickTag(t); }}>
              <input aria-label="Chercher un tag" value={tagQuery} onChange={(e) => setTagQuery(e.target.value)} placeholder="# Chercher un tag (ex. ce soir)" className="h-10 min-w-0 flex-1 rounded-full border border-line bg-surface px-3 text-sm outline-none focus-visible:border-signal" />
              {tagQuery && <button type="submit" className="h-10 rounded-full bg-ink px-4 text-sm font-bold text-night">OK</button>}
            </form>
            {(tag || popular.length > 0 || demo) && (
              <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4">
                {tag && <button type="button" onClick={() => setTag("")} className="flex h-8 shrink-0 items-center gap-1 rounded-full bg-[#8b7cff] px-3 text-xs font-bold text-night">#{tag} <X className="size-3" /></button>}
                {(popular.length ? popular.map((p) => p.tag) : SUGGESTED_TAGS.slice(0, 10)).filter((t) => t !== tag).slice(0, 12).map((t) => (
                  <button key={t} type="button" onClick={() => pickTag(t)} className="h-8 shrink-0 rounded-full border border-[#8b7cff]/40 px-3 text-xs text-[#c4b5fd]">#{t}</button>
                ))}
              </div>
            )}
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4">
              <Chip on={!!near} onClick={toggleNear}>📍 Près de moi</Chip>
              <Chip on={!category} onClick={() => setCategory("")}>Toutes</Chip>
              {AD_CATEGORIES.map((c) => <Chip key={c.id} on={category === c.id} onClick={() => setCategory(category === c.id ? "" : c.id)}>{c.icon} {c.label}</Chip>)}
            </div>
          </div>
        )}
        {tab === "all" && (
          <button type="button" onClick={onAlert} className="mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-full border border-[#fbbf24]/40 bg-[#fbbf24]/10 text-sm font-bold text-[#f5d27a]">
            <Bell className="size-4" /> Créer une alerte{tag || category || city ? " avec ces filtres" : ""}
          </button>
        )}
        {error && <p className="mt-4 text-sm text-signal">{error}</p>}
        {tab === "alerts" ? <AlertsList data={alerts} onboarded={onboarded || !!demoAlerts} onNew={onAlert} onEdit={(a) => setAlertSheet({ a })}
          onDelete={(a) => { if (demoAlerts || window.confirm("Supprimer cette alerte ?")) void deleteAlert(a.id).then(() => { toast("Alerte supprimée"); loadAlerts(); }).catch((e: Error) => toast(e.message)); }} />
        : list === null ? <p className="mt-10 text-center text-sm text-muted">Chargement…</p>
          : list.length === 0 ? (
            <div className="mt-10 text-center text-sm text-muted">
              <p>{tab === "all" ? "Aucune annonce par ici pour l'instant." : onboarded ? "Tu n'as pas encore d'annonce." : "Crée ton profil pour poster une annonce."}</p>
              <button type="button" onClick={onCreate} className="mt-3 h-11 rounded-full border border-signal px-5 font-bold text-signal">Poste la première</button>
            </div>
          ) : <ul className="mt-3 space-y-3">{list.map((a) => <li key={a.id}>{card(a)}</li>)}</ul>}
      </div>
      {sheet?.t === "create" && <CreateSheet approx={approx} active={activeMine} status={status} onClose={() => setSheet(null)} onDone={() => { setSheet(null); setTab("mine"); load(); loadMine(); }} />}
      {alertSheet && <AlertSheet init={alertSheet.a} approx={approx} onClose={() => setAlertSheet(null)} onDone={() => { setAlertSheet(null); setTab("alerts"); loadAlerts(); }} />}
      {sheet?.t === "reply" && <ReplySheet ad={sheet.ad} onClose={() => setSheet(null)} />}
      {sheet?.t === "boost" && <BoostSheet ad={sheet.ad} free={!!status?.free_boost} onClose={() => setSheet(null)} onFree={() => { setSheet(null); load(); loadMine(); }} />}
      {sheet?.t === "report" && <ReportAdSheet ad={sheet.ad} onClose={() => setSheet(null)} onDone={() => { setSheet(null); load(); }} />}
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" aria-pressed={on} onClick={onClick} className={cn("h-9 shrink-0 rounded-full border px-3 text-sm", on ? "border-signal bg-signal font-bold text-night" : "border-line")}>{children}</button>;
}

const DEMO_PHOTO = (n: number) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${["#ff5a4e", "#8b7cff", "#3ddc97"][n % 3]}"/><stop offset="1" stop-color="#0b0b10"/></linearGradient></defs><rect width="800" height="1000" fill="url(#g)"/><text x="400" y="520" font-size="90" text-anchor="middle" fill="white" font-family="sans-serif">Photo ${n + 1}</text></svg>`)}`;
const photoUrl = (p: string, k: number) => (import.meta.env.DEV && p.startsWith("demo/") ? Promise.resolve(DEMO_PHOTO(k)) : signedMediaUrl(p));

/** Photos d'une annonce : 1er toucher = déflouter, toucher sur une photo nette = plein écran (swipe entre les photos). */
function AdPhotos({ photos }: { photos: string[] }) {
  const [urls, setUrls] = useState<string[]>([]);
  const [shown, setShown] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    void Promise.all(photos.map((p, k) => photoUrl(p, k).catch(() => ""))).then((u) => alive && setUrls(u));
    return () => { alive = false; };
  }, [photos]);
  useEffect(() => { if (import.meta.env.DEV && location.search.includes("photoviewer") && photos[0]?.startsWith("demo/")) { setShown(new Set([0])); setOpen(0); } }, [photos]);
  return (
    <div className="mt-3 flex gap-2 overflow-x-auto">
      {photos.map((p, k) => {
        const on = shown.has(k);
        return (
          <button key={p} type="button" onClick={() => (on ? setOpen(k) : setShown((s) => new Set(s).add(k)))}
            aria-label={on ? "Agrandir la photo" : "Voir la photo"} className="relative aspect-square w-24 shrink-0 overflow-hidden rounded-xl bg-night">
            {urls[k] && <img src={urls[k]} alt="" className={cn("size-full object-cover transition", !on && "scale-110 blur-xl")} />}
            {!on ? <span className="absolute inset-0 grid place-items-center text-center text-[11px] font-bold text-white drop-shadow">🔞<br />Toucher<br />pour voir</span>
              : <span className="absolute right-1 bottom-1 rounded-full bg-black/60 px-1.5 text-[10px] text-white">⤢</span>}
          </button>
        );
      })}
      {open !== null && <PhotoViewer urls={urls} start={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function AdCard({ ad, onReply, onBoost, onReport, onDelete, near, onTag, activeTag }: { ad: Ad; onReply: () => void; onBoost: () => void; onReport: () => void; onDelete: () => void; near?: boolean; onTag?: (t: string) => void; activeTag?: string }) {
  const openProfile = useHdar((s) => s.openProfile);
  const openLive = useHdar((s) => s.openLive);
  const onboarded = useHdar((s) => s.me.onboarded);
  const c = cat(ad.category);
  const expired = ms(ad.expires_at) <= Date.now();
  const share = () => void shareAd(ad).then((r) => r === "copied" && toast("Lien copié"));
  return (
    <article className={cn("rounded-2xl border bg-surface p-4", ad.boost_scope ? "partner-glow border-[#fbbf24]" : "border-line", expired && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="rounded-full bg-white/10 px-2 py-0.5">{c.icon} {c.label}</span>
        {ad.boost_scope && <span className="rounded-full bg-[#fbbf24] px-2 py-0.5 font-bold text-night">✨ Boostée</span>}
        {ad.premium && <span className="rounded-full bg-gradient-to-r from-[#8b7cff] to-[#f472b6] px-2 py-0.5 font-bold text-night">👑 hdar+</span>}
        {ad.hidden && <span className="rounded-full bg-signal/20 px-2 py-0.5 text-signal">masquée par la modération</span>}
        <span className="ml-auto text-muted">{ad.km != null && (near || ad.km < 30) ? `📍 ${kmLabel(ad.km)} · ` : ""}{ad.city}</span>
      </div>
      <h2 className="mt-2 font-display text-lg font-bold leading-snug break-words">{ad.title}</h2>
      <p className="mt-1 text-sm break-words whitespace-pre-wrap text-ink/90"><RichText text={ad.body} mentions={false} /></p>
      {!!ad.tags?.length && (
        <div className="mt-2 flex flex-wrap gap-1.5">{ad.tags.map((t) => (
          <button key={t} type="button" onClick={() => onTag?.(t)} aria-pressed={activeTag === t} className={cn("h-7 rounded-full px-2.5 text-xs", activeTag === t ? "bg-[#8b7cff] font-bold text-night" : "bg-[#8b7cff]/15 text-[#c4b5fd]")}>#{t}</button>
        ))}</div>
      )}
      {ad.photos.length > 0 && <AdPhotos photos={ad.photos} />}
      <p className="mt-3 text-xs text-muted">
        {ad.mine ? "Ton annonce" : <button type="button" className="font-bold text-ink underline" onClick={() => openProfile(ad.user_id, ad.pseudo)}>{ad.pseudo}</button>}
        {" · "}{ago(ad.created_at)} · {expired ? "expirée" : `expire dans ${left(ad.expires_at)}`}
        {ad.boost_scope && ad.boost_until && ` · boost ${AD_BOOSTS.find((b) => b.scope === ad.boost_scope)?.label} encore ${left(ad.boost_until)}`}
      </p>
      {ad.mine && typeof ad.replies === "number" && <p className="mt-1 text-xs font-bold text-online">💬 {ad.replies === 0 ? "Pas encore de réponse" : `${ad.replies} personne${ad.replies > 1 ? "s ont" : " a"} répondu`}</p>}
      <div className="mt-3 flex gap-2">
        {ad.mine ? (
          <>
            {!expired && !ad.hidden && <button type="button" onClick={onBoost} className="boost-cta flex h-10 flex-1 items-center justify-center gap-1 rounded-full text-sm font-bold text-night"><Sparkles className="size-4" /> Booster</button>}
            <button type="button" aria-label="Partager l'annonce" onClick={share} className="grid size-10 shrink-0 place-items-center rounded-full border border-line"><Share2 className="size-4" /></button>
            <button type="button" onClick={onDelete} className="flex h-10 items-center gap-1 rounded-full border border-line px-4 text-sm"><Trash2 className="size-4" /> Supprimer</button>
          </>
        ) : (
          <>
            <button type="button" onClick={onReply} className="h-10 flex-1 rounded-full bg-signal text-sm font-bold text-night">Répondre</button>
            <button type="button" onClick={() => (onboarded ? openLive(ad.user_id, ad.pseudo) : useHdar.getState().openGate())} className="flex h-10 items-center gap-1 rounded-full border border-line px-4 text-sm"><MessageCircle className="size-4" /> Message</button>
            <button type="button" aria-label="Partager l'annonce" onClick={share} className="grid size-10 place-items-center rounded-full border border-line text-muted"><Share2 className="size-4" /></button>
            <button type="button" aria-label="Signaler l'annonce" onClick={onReport} className="grid size-10 place-items-center rounded-full border border-line text-muted"><Flag className="size-4" /></button>
          </>
        )}
      </div>
    </article>
  );
}

function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[70] flex flex-col justify-end" role="dialog" aria-modal="true">
      <button type="button" aria-label="Fermer" className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="dock relative mx-auto max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border-t border-line bg-surface px-5 pt-5 pb-6">
        <div className="flex items-center justify-between">
          <p className="font-display text-lg font-bold">{title}</p>
          <button type="button" aria-label="Fermer" onClick={onClose} className="grid size-9 place-items-center rounded-full"><X className="size-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const field = "mt-1 w-full rounded-2xl border border-line bg-night px-4 text-base text-ink outline-none focus-visible:border-signal";

function CreateSheet({ approx, active, status, onClose, onDone }: { approx: { city: string; region: string }; active: number; status: AdsStatus | null; onClose: () => void; onDone: () => void }) {
  const plus = !!status?.premium;
  const limit = status?.limit ?? (plus ? MAX_ACTIVE_ADS_PLUS : MAX_ACTIVE_ADS);
  const center = useHdar((s) => s.customCenter);
  const [where, setWhere] = useState<"none" | "me" | "map">("none");
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const pickWhere = (w: "none" | "me" | "map") => {
    setWhere(w);
    if (w === "none") return setPos(null);
    if (w === "map") return center ? setPos({ lat: Math.round(center.lat * 1000) / 1000, lng: Math.round(center.lng * 1000) / 1000 }) : (setWhere("none"), toast("Déplace d'abord la carte sur le point voulu"));
    getPosition().then(setPos).catch((e: Error) => { setWhere("none"); toast(e.message); });
  };
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<AdCategory>("rencontre");
  const [region, setRegion] = useState(approx.region || "ile-de-france");
  const [city, setCity] = useState(approx.city);
  const [hours, setHours] = useState(72);
  const [tags, setTags] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const toggleTag = (t: string) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : cur.length >= MAX_TAGS ? (toast(`${MAX_TAGS} tags maximum`), cur) : [...cur, t]));
  const addCustom = () => { const t = cleanTag(custom); if (t.length < 2) return toast("Tag trop court"); if (!tags.includes(t)) toggleTag(t); setCustom(""); };
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (approx.city && !city) setCity(approx.city); if (approx.region) setRegion((r) => r || approx.region); }, [approx]); // eslint-disable-line react-hooks/exhaustive-deps
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  const full = active >= limit;
  const submit = async () => {
    if (title.trim().length < 3) return toast("Un titre de 3 lettres minimum");
    if (!body.trim()) return toast("Écris quelques mots");
    if (!city.trim()) return toast("Indique ta ville");
    setBusy(true);
    try {
      const photos: string[] = [];
      for (const f of files) photos.push((await uploadChatMedia(f, "image")).path);
      await createAd({ title, body, category, region, city, hours, photos, pos, tags });
      toast("Annonce en ligne 🎉");
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Publication impossible");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title="Poster une annonce" onClose={onClose}>
      {full && <p className="mt-2 rounded-2xl bg-signal/15 px-3 py-2 text-sm text-signal">Tu as déjà {limit} annonces en ligne. Supprimes-en une pour en poster une nouvelle.{!plus && <> Avec <a href="/premium" className="font-bold underline">hdar+</a>, jusqu'à 10.</>}</p>}
      {!full && <p className="mt-1 text-xs text-muted">{active}/{limit} annonces en ligne{plus ? " · 👑 hdar+" : ""}</p>}
      <label className="mt-3 block text-xs text-muted">Titre
        <input className={cn(field, "h-12")} maxLength={60} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. : Verre ce soir vers l'Écusson" />
      </label>
      <label className="mt-3 block text-xs text-muted">Ton annonce · {body.length}/1000
        <textarea className={cn(field, "h-32 py-3")} maxLength={1000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Ce que tu cherches, quand, comment… Pas de numéro ni d'adresse." />
      </label>
      <p className="mt-3 text-xs text-muted">Catégorie</p>
      <div className="mt-1 flex flex-wrap gap-1.5">{AD_CATEGORIES.map((c) => <Chip key={c.id} on={category === c.id} onClick={() => setCategory(c.id)}>{c.icon} {c.label}</Chip>)}</div>
      <p className="mt-3 text-xs text-muted">Tags · {tags.length}/{MAX_TAGS} · pour qu'on te trouve plus vite</p>
      {tags.length > 0 && <div className="mt-1 flex flex-wrap gap-1.5">{tags.map((t) => <button key={t} type="button" onClick={() => toggleTag(t)} className="flex h-8 items-center gap-1 rounded-full bg-[#8b7cff] px-3 text-xs font-bold text-night">#{t} <X className="size-3" /></button>)}</div>}
      <div className="-mx-5 mt-1.5 flex gap-1.5 overflow-x-auto px-5 pb-1">
        {SUGGESTED_TAGS.filter((t) => !tags.includes(t)).map((t) => <button key={t} type="button" onClick={() => toggleTag(t)} className="h-8 shrink-0 rounded-full border border-[#8b7cff]/40 px-3 text-xs text-[#c4b5fd]">+ {t}</button>)}
      </div>
      <form className="mt-1.5 flex gap-2" onSubmit={(e) => { e.preventDefault(); addCustom(); }}>
        <input value={custom} onChange={(e) => setCustom(e.target.value.slice(0, 20))} placeholder="Ton tag (20 caractères)" className={cn(field, "mt-0 h-10 text-sm")} />
        <button type="submit" disabled={!custom.trim() || tags.length >= MAX_TAGS} className="h-10 shrink-0 rounded-full border border-line px-4 text-sm disabled:opacity-40">Ajouter</button>
      </form>
      <div className="mt-3 flex gap-2">
        <label className="block min-w-0 flex-1 text-xs text-muted">Région
          <select className={cn(field, "h-12 px-3")} value={region} onChange={(e) => setRegion(e.target.value)}>{AD_REGIONS.map((r) => <option key={r.s} value={r.s}>{r.n}</option>)}</select>
        </label>
        <label className="block w-[42%] text-xs text-muted">Ville
          <input className={cn(field, "h-12")} maxLength={60} value={city} onChange={(e) => setCity(e.target.value)} />
        </label>
      </div>
      <p className="mt-1 text-[11px] text-muted">Ville approximative, jamais ta position exacte.</p>
      <p className="mt-3 text-xs text-muted">Durée de diffusion</p>
      <div className="mt-1 flex flex-wrap gap-1.5">{AD_DURATIONS.map((d) => (
        <Chip key={d.hours} on={hours === d.hours} onClick={() => (d.premium && !plus ? toast("14 et 30 jours : réservé à hdar+ 👑", { action: { label: "Voir", onClick: () => window.location.assign("/premium") } }) : setHours(d.hours))}>
          {d.label}{d.premium && !plus ? " 👑" : ""}
        </Chip>
      ))}</div>
      <p className="mt-3 text-xs text-muted">Position sur la carte (facultatif) · arrondie à ~400 m, jamais exacte</p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        <Chip on={where === "none"} onClick={() => pickWhere("none")}>Ville seulement</Chip>
        <Chip on={where === "me"} onClick={() => pickWhere("me")}>📍 Autour de moi</Chip>
        <Chip on={where === "map"} onClick={() => pickWhere("map")}>🗺️ Point de la carte</Chip>
      </div>
      {where === "map" && <p className="mt-1 text-[11px] text-muted">Le centre actuel de ta carte (choisi dans Carte → quartier).</p>}
      <p className="mt-3 text-xs text-muted">Photos (3 max) · floutées par défaut, on touche pour les voir</p>
      <div className="mt-1 flex gap-2">
        {previews.map((u, i) => (
          <button key={u} type="button" aria-label="Retirer la photo" onClick={() => setFiles(files.filter((_, j) => j !== i))} className="relative size-20 overflow-hidden rounded-xl">
            <img src={u} alt="" className="size-full object-cover blur-md" /><span className="absolute top-1 right-1 rounded-full bg-black/70 p-0.5"><X className="size-3" /></span>
          </button>
        ))}
        {files.length < 3 && (
          <label className="grid size-20 cursor-pointer place-items-center rounded-xl border border-dashed border-line text-2xl text-muted">+
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) setFiles([...files, f].slice(0, 3)); e.target.value = ""; }} />
          </label>
        )}
      </div>
      <p className="mt-3 text-[11px] leading-snug text-muted">18+ uniquement, entre adultes consentants. Interdit : mineurs, contenu illégal, échanges d'argent, coordonnées. Les annonces signalées sont masquées.</p>
      {!plus && <a href="/premium" className="mt-3 block rounded-2xl border border-[#8b7cff]/50 bg-[#8b7cff]/10 px-3 py-2 text-xs"><b>👑 hdar+</b> : 10 annonces, jusqu'à 30 jours, badge hdar+ et 1 boost Région offert chaque mois ›</a>}
      <button type="button" disabled={busy || full} onClick={() => void submit()} className="mt-4 h-12 w-full rounded-full bg-signal font-bold text-night disabled:opacity-40">{busy ? "Publication…" : "Publier l'annonce"}</button>
    </Sheet>
  );
}

function ReplySheet({ ad, onClose }: { ad: Ad; onClose: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const openLive = useHdar((s) => s.openLive);
  return (
    <Sheet title={`Répondre à ${ad.pseudo}`} onClose={onClose}>
      <div className="mt-3 rounded-2xl border-l-4 border-signal bg-night px-3 py-2 text-sm"><p className="text-xs text-muted">📌 Annonce</p><p className="font-bold">{ad.title}</p></div>
      <textarea autoFocus className={cn(field, "mt-3 h-28 py-3")} maxLength={380} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ton message…" />
      <p className="mt-1 text-[11px] text-muted">Ta réponse arrive dans ses Messages, avec le titre de l'annonce.</p>
      <button type="button" disabled={busy || !text.trim()} onClick={() => {
        setBusy(true);
        replyAd(ad.id, text).then((uid) => { toast("Réponse envoyée"); onClose(); openLive(uid, ad.pseudo); })
          .catch((e: Error) => toast(e.message)).finally(() => setBusy(false));
      }} className="mt-3 h-12 w-full rounded-full bg-signal font-bold text-night disabled:opacity-40">{busy ? "Envoi…" : "Envoyer"}</button>
    </Sheet>
  );
}

function BoostSheet({ ad, free, onClose, onFree }: { ad: Ad; free: boolean; onClose: () => void; onFree: () => void }) {
  const [scope, setScope] = useState<BoostScope>("ville");
  const [busy, setBusy] = useState("");
  const b = AD_BOOSTS.find((x) => x.scope === scope)!;
  const go = (d: "24h" | "7d") => {
    setBusy(d);
    startCheckout(`ad_boost_${scope}_${d}`, ad.id).catch((e: Error) => toast(e.message)).finally(() => setBusy(""));
  };
  return (
    <Sheet title="Booster mon annonce" onClose={onClose}>
      <p className="mt-1 text-sm text-muted">Ton annonce passe en tête avec le badge ✨ Boostée. Choisis jusqu'où.</p>
      {free ? (
        <button type="button" disabled={!!busy} onClick={() => { setBusy("free"); freeBoost(ad.id).then(() => { toast("Boost Région offert activé pour 24 h 🚀"); onFree(); }).catch((e: Error) => toast(e.message)).finally(() => setBusy("")); }}
          className="mt-3 h-12 w-full rounded-full bg-gradient-to-r from-[#8b7cff] to-[#f472b6] font-bold text-night disabled:opacity-50">🎁 Utiliser mon boost Région offert (hdar+)</button>
      ) : (
        <a href="/premium" className="mt-3 block text-xs text-[#c4b5fd] underline">👑 Avec hdar+, 1 boost Région de 24 h offert chaque mois</a>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {AD_BOOSTS.map((x) => (
          <button key={x.scope} type="button" aria-pressed={scope === x.scope} onClick={() => setScope(x.scope)} className={cn("rounded-2xl border p-3 text-left", scope === x.scope ? "border-[#fbbf24] bg-[#fbbf24]/10" : "border-line")}>
            <b className="block">{x.label}</b><span className="text-xs text-muted">dès {euros(x.d24)}</span>
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">{b.hint}{scope === "ville" ? ` (${ad.city})` : scope === "region" ? ` (${regionName(ad.region)})` : ""}.</p>
      <div className="mt-4 space-y-2">
        <button type="button" disabled={!!busy} onClick={() => go("24h")} className="boost-cta h-12 w-full rounded-full font-bold text-night disabled:opacity-50">{busy === "24h" ? "…" : `24 heures · ${euros(b.d24)}`}</button>
        <button type="button" disabled={!!busy} onClick={() => go("7d")} className="h-12 w-full rounded-full border border-[#fbbf24] font-bold text-[#fbbf24] disabled:opacity-50">{busy === "7d" ? "…" : `7 jours · ${euros(b.d7)}`}</button>
      </div>
      <p className="mt-3 text-[11px] text-muted">Paiement unique par carte (Stripe), sans abonnement. L'annonce reste en ligne pendant tout le boost.</p>
    </Sheet>
  );
}

const AD_REPORT_REASONS = ["Semble mineur", "Contenu illégal", "Arnaque ou argent", "Photos d'une autre personne", "Spam", "Autre"];
function ReportAdSheet({ ad, onClose, onDone }: { ad: Ad; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  return (
    <Sheet title="Signaler l'annonce" onClose={onClose}>
      <p className="mt-1 text-sm text-muted">« {ad.title} » · l'équipe va regarder.</p>
      <div className="mt-3 flex flex-wrap gap-2">{AD_REPORT_REASONS.map((r) => <Chip key={r} on={reason === r} onClick={() => setReason(r)}>{r}</Chip>)}</div>
      <button type="button" disabled={!reason} onClick={() => void reportAd(ad.id, reason).then(() => { toast("Signalement envoyé, merci"); onDone(); }).catch((e: Error) => toast(e.message))} className="mt-4 h-12 w-full rounded-full bg-signal font-bold text-night disabled:opacity-40">Envoyer</button>
    </Sheet>
  );
}

/** Données d'exemple pour les captures de dev (?adsdemo=…), jamais en production. */
export function demoAds(): Ad[] {
  const h = (n: number) => new Date(Date.now() + n * 3600_000).toISOString();
  const base = { user_id: "demo", region: "occitanie", photos: [] as string[], mine: false, boost_scope: null, boost_until: null };
  return [
    { ...base, id: "00000000-0000-0000-0000-000000000001", pseudo: "Sunny34", title: "Verre en terrasse ce soir vers la Comédie", tags: ["ce soir", "apéro", "sans prise de tête"], body: "Envie de discuter autour d'un verre après le boulot, plutôt 20 h. Ambiance tranquille, on voit si le courant passe 😊", category: "sortie", city: "Montpellier", city_slug: "montpellier", created_at: h(-2), expires_at: h(70), boost_scope: "region", boost_until: h(20), km: 1.4, premium: true },
    { ...base, id: "00000000-0000-0000-0000-000000000002", pseudo: "Theo_mtp", photos: ["demo/1.jpg", "demo/2.jpg"], title: "Rencontre sérieuse, 30-40 ans", tags: ["sérieux", "balade", "resto"], body: "Je cherche quelqu'un pour des balades, des restos et plus si affinités. Discret et bienveillant.", category: "rencontre", city: "Montpellier", city_slug: "montpellier", created_at: h(-5), expires_at: h(160), km: 3.2 },
    { ...base, id: "00000000-0000-0000-0000-000000000003", pseudo: "Leo", title: "Plan kink entre adultes", tags: ["kink", "discret", "cuir"], body: "Curieux et respectueux, on en parle d'abord en privé. Consentement avant tout.", category: "kink", city: "Lattes", city_slug: "lattes", created_at: h(-20), expires_at: h(4), km: 6.8 },
  ];
}

function AlertsList({ data, onboarded, onNew, onEdit, onDelete }: { data: { limit: number; alerts: AdAlert[] } | null; onboarded: boolean; onNew: () => void; onEdit: (a: AdAlert) => void; onDelete: (a: AdAlert) => void }) {
  if (!onboarded) return <p className="mt-10 text-center text-sm text-muted">Crée ton profil pour recevoir des alertes.</p>;
  if (!data) return <p className="mt-10 text-center text-sm text-muted">Chargement…</p>;
  const plus = data.limit > 1;
  return (
    <section className="mt-3">
      <p className="text-xs text-muted">Tu es prévenu·e dès qu'une nouvelle annonce correspond (10 alertes par jour maximum). {data.alerts.length}/{data.limit} alerte{data.limit > 1 ? "s" : ""}.</p>
      {data.alerts.length === 0 ? <p className="mt-8 text-center text-sm text-muted">Aucune alerte pour l'instant.</p> : (
        <ul className="mt-3 space-y-2">{data.alerts.map((a) => (
          <li key={a.id} className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2.5">
            <Bell className="size-4 shrink-0 text-[#f5d27a]" />
            <p className="min-w-0 flex-1 text-sm">{alertLabel(a)}</p>
            <button type="button" aria-label="Modifier l'alerte" onClick={() => onEdit(a)} className="grid size-9 place-items-center rounded-full text-muted"><Pencil className="size-4" /></button>
            <button type="button" aria-label="Supprimer l'alerte" onClick={() => onDelete(a)} className="grid size-9 place-items-center rounded-full text-signal"><Trash2 className="size-4" /></button>
          </li>
        ))}</ul>
      )}
      {data.alerts.length < data.limit && <button type="button" onClick={onNew} className="mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-full border border-[#fbbf24]/40 font-bold text-[#f5d27a]"><Bell className="size-4" /> Nouvelle alerte</button>}
      {!plus && <a href="/premium" className="mt-3 block rounded-2xl border border-[#8b7cff]/50 bg-[#8b7cff]/10 px-3 py-2 text-xs"><b>👑 hdar+</b> : jusqu'à 10 alertes (plusieurs villes, tags ou catégories) ›</a>}
    </section>
  );
}

function AlertSheet({ init, approx, onClose, onDone }: { init: Partial<AdAlert>; approx: { city: string; region: string }; onClose: () => void; onDone: () => void }) {
  const [scope, setScope] = useState<AlertScope>(init.scope ?? "ville");
  const [region, setRegion] = useState(init.region || approx.region || "ile-de-france");
  const [city, setCity] = useState(init.city || approx.city);
  const [category, setCategory] = useState<string>(init.category ?? "");
  const [tags, setTags] = useState<string[]>(init.tags ?? []);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const addTag = (t: string) => { const c = cleanTag(t); if (c.length < 2) return; setTags((cur) => cur.includes(c) ? cur.filter((x) => x !== c) : cur.length >= 3 ? (toast("3 tags maximum"), cur) : [...cur, c]); };
  const save = async () => {
    setBusy(true);
    try {
      const pos = scope === "quartier" ? await getPosition().catch(() => null) : null;
      await saveAlert({ id: init.id, scope, region, city, pos, category, tags });
      toast(init.id ? "Alerte modifiée 🔔" : "Alerte créée 🔔 Tu seras prévenu·e des nouvelles annonces");
      onDone();
    } catch (e) {
      const m = (e as Error).message;
      if (m.startsWith("premium_required")) toast(m.replace(/^premium_required:\s*/, ""), { action: { label: "hdar+", onClick: () => window.location.assign("/premium") } });
      else toast(m);
    } finally { setBusy(false); }
  };
  return (
    <Sheet title={init.id ? "Modifier l'alerte" : "🔔 Créer une alerte"} onClose={onClose}>
      <p className="mt-1 text-xs text-muted">Notification dans l'appli (et sur ton téléphone si activé) quand une nouvelle annonce correspond.</p>
      <p className="mt-4 text-sm font-bold">Où</p>
      <div className="mt-1 flex flex-wrap gap-1.5">{ALERT_SCOPES.map((s) => <Chip key={s.id} on={scope === s.id} onClick={() => setScope(s.id)}>{s.label}</Chip>)}</div>
      {scope === "quartier" && <p className="mt-1 text-xs text-muted">Ta position approximative (~1 km) est enregistrée avec l'alerte.</p>}
      {(scope === "ville" || scope === "region") && (
        <select aria-label="Région" value={region} onChange={(e) => setRegion(e.target.value)} className={cn(field, "h-11 text-sm")}>
          {AD_REGIONS.map((r) => <option key={r.s} value={r.s}>{r.n}</option>)}
        </select>
      )}
      {scope === "ville" && <input aria-label="Ville" value={city} onChange={(e) => setCity(e.target.value.slice(0, 60))} placeholder="Ville" className={cn(field, "h-11 text-sm")} />}
      <p className="mt-4 text-sm font-bold">Catégorie <span className="font-normal text-muted">(facultatif)</span></p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        <Chip on={!category} onClick={() => setCategory("")}>Toutes</Chip>
        {AD_CATEGORIES.map((c) => <Chip key={c.id} on={category === c.id} onClick={() => setCategory(category === c.id ? "" : c.id)}>{c.icon} {c.label}</Chip>)}
      </div>
      <p className="mt-4 text-sm font-bold">Tags <span className="font-normal text-muted">(facultatif, 3 max, l'un ou l'autre)</span></p>
      <div className="mt-1 flex flex-wrap gap-1.5">
        {[...new Set([...tags, ...SUGGESTED_TAGS.slice(0, 8)])].map((t) => <Chip key={t} on={tags.includes(t)} onClick={() => addTag(t)}>#{t}</Chip>)}
      </div>
      <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); addTag(custom); setCustom(""); }}>
        <input value={custom} onChange={(e) => setCustom(e.target.value.slice(0, 20))} placeholder="Autre tag" className={cn(field, "mt-0 h-10 text-sm")} />
        {custom && <button type="submit" className="h-10 rounded-full bg-ink px-4 text-sm font-bold text-night">OK</button>}
      </form>
      <button type="button" disabled={busy || (scope === "ville" && !city.trim())} onClick={() => void save()} className="mt-5 h-12 w-full rounded-full bg-signal font-bold text-night disabled:opacity-50">
        {busy ? "…" : init.id ? "Enregistrer" : "Créer l'alerte"}
      </button>
    </Sheet>
  );
}
