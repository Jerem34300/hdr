import { useEffect, useState } from "react";
import { toast } from "sonner";
import { proDashboard, proGiftUse, proReviewReply, proReviewReport, type ProDash } from "@/lib/hdar/live";

const GOLD = "#fbbf24", CORAL = "#FA6F6C", MINT = "#3EE08F";
const DOW = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const fmtDur = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min ${s % 60 ? `${s % 60} s` : ""}` : `${s} s`);

/** Tableau de bord pro : statistiques agrégées et anonymes (aucune identité). */
export function ProDashboard({ id, name, onBack, demo, readOnly }: { id: string; name: string; onBack: () => void; demo?: ProDash; readOnly?: boolean }) {
  const lock = !!demo || !!readOnly;
  const [days, setDays] = useState(30);
  const [d, setD] = useState<ProDash | null>(demo ?? null);
  const load = () => { if (!demo) void proDashboard(id, days).then(setD).catch((e: Error) => toast(e.message)); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [id, days]);
  return (
    <div className="mt-4">
      <button type="button" onClick={onBack} className="text-sm text-muted underline">← {readOnly ? "Partenaires" : "Mon espace pro"}</button>
      {readOnly && <p className="mt-3 rounded-2xl border border-line px-4 py-2 text-center text-sm text-muted">🔒 Vue admin en lecture seule</p>}
      {demo && <p className="mt-3 rounded-2xl border border-dashed border-[#fbbf24] px-4 py-2 text-center text-sm font-bold text-[#fbbf24]">🧪 Données d'exemple · aperçu admin en lecture seule</p>}
      <div className="mt-3 rounded-3xl bg-gradient-to-br from-[#FA6F6C]/30 via-[#16161e] to-[#3EE08F]/20 p-5">
        <p className="text-xs font-bold tracking-[0.25em] uppercase" style={{ color: GOLD }}>Tableau de bord</p>
        <h2 className="font-display text-2xl font-extrabold">{name}</h2>
        <div className="mt-3 flex gap-2">{[7, 30, 90].map((n) => (
          <button key={n} type="button" onClick={() => setDays(n)} className={"h-9 rounded-full px-4 text-sm " + (days === n ? "bg-[#fbbf24] font-bold text-night" : "border border-white/20")}>{n} jours</button>))}</div>
      </div>
      {!d ? <p className="mt-6 text-center text-sm text-muted">Chargement…</p> : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([
              ["👁️", "Vues de la fiche", d.views], ["🧑‍🤝‍🧑", "Visiteurs uniques", d.visitors], ["🔗", "Clics vers votre site", d.clicks], ["💬", "Messages du chat", d.messages],
              ["🎥", "Spectateurs Live Pro", d.live_views], ["⏱️", "Durée moyenne Live", fmtDur(d.live_avg_sec)], ["🎁", "Cadeaux envoyés", d.gifts_sent], ["📬", "Cadeaux ouverts", d.gifts_opened],
              ["✅", "Cadeaux utilisés", d.gifts_used], ["✉️", "Conversations pro", d.threads], ["⭐", "Favoris", d.favorites], ["🌟", "Note moyenne", d.avg != null ? `${d.avg} ★ (${d.ratings})` : "—"],
            ] as const).map(([i, l, v]) => (
              <div key={l} className="rounded-2xl border border-line bg-surface p-3"><span className="text-lg">{i}</span><b className="block font-display text-2xl">{v}</b><span className="text-[11px] text-muted">{l}</span></div>
            ))}
          </div>
          <Section title="Évolution des vues">
            <LineChart data={d.days.map((x) => x.views)} labels={d.days.map((x) => x.day)} color={CORAL} second={d.days.map((x) => x.live)} />
            <p className="mt-1 text-[11px] text-muted"><span style={{ color: CORAL }}>━</span> vues de la fiche · <span style={{ color: MINT }}>━</span> spectateurs Live Pro</p>
          </Section>
          <Section title="Impact du Boost Pro">
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-2xl bg-night p-3"><b className="block font-display text-2xl" style={{ color: GOLD }}>{d.boost_in}</b><span className="text-[11px] text-muted">vues / jour pendant un boost</span></div>
              <div className="rounded-2xl bg-night p-3"><b className="block font-display text-2xl">{d.boost_out}</b><span className="text-[11px] text-muted">vues / jour sans boost</span></div>
            </div>
            {d.boost_out > 0 && d.boost_in > 0 && <p className="mt-2 text-center text-sm font-bold" style={{ color: MINT }}>{d.boost_in >= d.boost_out ? "+" : ""}{Math.round(((d.boost_in - d.boost_out) / d.boost_out) * 100)} % de vues avec le Boost Pro</p>}
            {d.boosts.length ? <ul className="mt-2 space-y-1 text-xs">{d.boosts.map((b, i) => <li key={i} className="rounded-lg bg-night px-3 py-1.5">⭐ {b.label} · du {new Date(b.from).toLocaleDateString("fr-FR")} au {new Date(b.to).toLocaleDateString("fr-FR")}</li>)}</ul>
              : <p className="mt-2 text-xs text-muted">Aucun Boost Pro pour l'instant. Achetez-en un depuis votre espace pro pour comparer.</p>}
          </Section>
          <Section title="Heures d'affluence (anonyme, agrégé)"><Heatmap heat={d.heat} /></Section>
          <Section title="Valider un code cadeau"><UseCode place={id} onDone={load} demo={lock} /></Section>
          <Section title={`Avis (${d.reviews.length})${d.avg != null ? ` · ${d.avg} ★` : ""}`}>
            {d.reviews.length === 0 ? <p className="text-sm text-muted">Pas encore d'avis.</p> : <ul className="space-y-2">{d.reviews.map((r) => <Review key={r.id} r={r} onDone={load} demo={lock} />)}</ul>}
          </Section>
          <p className="mt-4 text-center text-[11px] text-muted">🔒 Statistiques agrégées et anonymes : vous ne voyez jamais qui est qui.</p>
        </>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mt-4 rounded-3xl border border-line bg-surface p-4"><h3 className="mb-3 font-display font-bold">{title}</h3>{children}</section>;
}

function LineChart({ data, labels, color, second }: { data: number[]; labels: string[]; color: string; second?: number[] }) {
  const W = 320, H = 110, max = Math.max(1, ...data, ...(second ?? []));
  const pts = (arr: number[]) => arr.map((v, i) => `${(i / Math.max(1, arr.length - 1)) * W},${H - (v / max) * (H - 8) - 4}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-32 w-full" preserveAspectRatio="none">
        <defs><linearGradient id="lg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".45" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        {data.length > 1 && <polygon points={`0,${H} ${pts(data)} ${W},${H}`} fill="url(#lg)" />}
        <polyline points={pts(data)} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" />
        {second && <polyline points={pts(second)} fill="none" stroke={MINT} strokeWidth="2" strokeDasharray="4 3" />}
      </svg>
      <div className="flex justify-between text-[10px] text-muted"><span>{labels[0] ? new Date(labels[0]).toLocaleDateString("fr-FR", { day: "numeric", month: "short" }) : ""}</span><span>max {max}</span><span>aujourd'hui</span></div>
    </div>
  );
}

function Heatmap({ heat }: { heat: { dow: number; hour: number; n: number }[] }) {
  const max = Math.max(1, ...heat.map((h) => h.n));
  const at = (d: number, h: number) => heat.find((x) => x.dow === d && x.hour === h)?.n ?? 0;
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[300px] gap-[2px]" style={{ gridTemplateColumns: "28px repeat(24, 1fr)" }}>
        {DOW.map((dl, i) => (
          <div key={dl} className="contents">
            <span className="text-[9px] leading-[12px] text-muted">{dl}</span>
            {Array.from({ length: 24 }, (_, h) => { const v = at(i + 1, h); return <span key={h} title={`${dl} ${h} h : ${v}`} className="h-3 rounded-[2px]" style={{ background: v ? `rgba(250,111,108,${0.15 + (v / max) * 0.85})` : "rgba(255,255,255,.05)" }} />; })}
          </div>
        ))}
        <span />{Array.from({ length: 24 }, (_, h) => <span key={h} className="text-center text-[8px] text-muted">{h % 6 === 0 ? `${h}h` : ""}</span>)}
      </div>
    </div>
  );
}

function UseCode({ place, onDone, demo }: { place: string; onDone: () => void; demo: boolean }) {
  const [code, setCode] = useState("");
  const go = async () => { if (demo) return void toast("Démo : lecture seule"); try { const r = await proGiftUse(place, code); toast(`✅ Valide : ${r.title}`); setCode(""); onDone(); } catch (e) { toast(e instanceof Error ? e.message : "Code invalide"); } };
  return (
    <div className="flex gap-2">
      <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Code présenté par le client" className="min-w-0 flex-1 rounded-full bg-night px-4 py-2 font-mono" maxLength={24} />
      <button type="button" disabled={!code.trim()} onClick={() => void go()} className="rounded-full bg-[#3EE08F] px-4 font-bold text-night disabled:opacity-50">Valider</button>
    </div>
  );
}

function Review({ r, onDone, demo }: { r: ProDash["reviews"][number]; onDone: () => void; demo: boolean }) {
  const [txt, setTxt] = useState("");
  const [open, setOpen] = useState(false);
  const reply = async () => { if (demo) return void toast("Démo : lecture seule"); try { await proReviewReply(r.id, txt); toast("Réponse publiée"); onDone(); } catch (e) { toast(e instanceof Error ? e.message : "Impossible"); } };
  const report = async () => { if (demo) return void toast("Démo : lecture seule"); if (!window.confirm("Signaler cet avis comme abusif ?")) return; try { await proReviewReport(r.id); toast("Avis signalé à la modération"); } catch (e) { toast(e instanceof Error ? e.message : "Impossible"); } };
  return (
    <li className="rounded-2xl bg-night p-3 text-sm">
      <p className="text-xs text-muted">{r.stars ? <span style={{ color: GOLD }}>{"★".repeat(r.stars)}{"☆".repeat(5 - r.stars)}</span> : "Sans note"} · {new Date(r.at).toLocaleDateString("fr-FR")}</p>
      <p className="mt-1 break-words">{r.body}</p>
      {r.reply ? <p className="mt-2 rounded-xl border-l-2 border-[#fbbf24] bg-surface px-3 py-2 text-xs"><b>Votre réponse :</b> {r.reply}</p> : open ? (
        <div className="mt-2 flex gap-2"><input value={txt} onChange={(e) => setTxt(e.target.value)} maxLength={500} placeholder="Votre réponse publique (une seule fois)" className="min-w-0 flex-1 rounded-full bg-surface px-3 py-2 text-xs" />
          <button type="button" disabled={!txt.trim()} onClick={() => void reply()} className="rounded-full bg-[#fbbf24] px-3 text-xs font-bold text-night disabled:opacity-50">Publier</button></div>
      ) : (
        <div className="mt-2 flex gap-3 text-xs"><button type="button" onClick={() => setOpen(true)} className="font-bold text-[#fbbf24]">Répondre</button><button type="button" onClick={() => void report()} className="text-muted underline">Signaler</button></div>
      )}
    </li>
  );
}

/** Données d'exemple pour l'aperçu admin (aucune donnée réelle). */
export function demoDash(): ProDash {
  const today = new Date();
  const days = Array.from({ length: 30 }, (_, i) => { const d = new Date(today.getTime() - (29 - i) * 86400000); const boost = i >= 18 && i <= 24; return { day: d.toISOString().slice(0, 10), views: Math.round((boost ? 90 : 40) + 25 * Math.sin(i / 2.5) + (i % 7 >= 4 ? 30 : 0)), clicks: 3 + (i % 5), live: boost ? 6 + (i % 3) : i % 4 }; });
  const heat: ProDash["heat"] = [];
  for (let dow = 1; dow <= 7; dow++) for (let h = 0; h < 24; h++) { const v = Math.max(0, Math.round((dow >= 5 ? 10 : 4) * Math.exp(-((h - 23 + (h < 6 ? 24 : 0)) ** 2) / 18))); if (v) heat.push({ dow, hour: h, n: v }); }
  const from = new Date(today.getTime() - 11 * 86400000);
  return { views: days.reduce((a, b) => a + b.views, 0), clicks: 112, messages: 248, visitors: 731, favorites: 64, live_views: 138, live_minutes: 412, live_avg_sec: 178,
    gifts_sent: 46, gifts_opened: 39, gifts_used: 17, threads: 52, avg: 4.6, ratings: 38, days, heat,
    boosts: [{ from: from.toISOString(), to: new Date(from.getTime() + 7 * 86400000).toISOString(), label: "7 jours" }], boost_in: 104.3, boost_out: 52.1,
    reviews: [
      { id: "d1", body: "Super ambiance le samedi, DJ au top et équipe adorable.", at: new Date(today.getTime() - 2 * 86400000).toISOString(), reply: "Merci beaucoup, à samedi prochain ! 🍸", reply_at: null, stars: 5 },
      { id: "d2", body: "Bon bar mais un peu d'attente au comptoir vers minuit.", at: new Date(today.getTime() - 5 * 86400000).toISOString(), reply: null, reply_at: null, stars: 4 },
      { id: "d3", body: "Le verre offert via hdar, top idée 👌", at: new Date(today.getTime() - 9 * 86400000).toISOString(), reply: null, reply_at: null, stars: 5 },
    ] };
}
