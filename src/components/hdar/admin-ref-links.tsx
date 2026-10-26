import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/hdar/avatar";
import { adminRefLinkArchive, adminRefLinks, adminRefLinkSave, adminReferrers, adminRefProfiles, type RefLink, type RefPerson, type Referrer } from "@/lib/hdar/live";

/** « Annonce Montpellier ! » → « annonce-montpellier » (format accepté par ?ref=). */
export function slugRef(v: string) {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}
const linkOf = (ref: string, withCode: boolean) => `https://hdar.chat/?ref=${ref}${withCode ? "&code=FIRST" : ""}`;
const conv = (l: RefLink) => (l.visits ? `${Math.round((1000 * l.profiles) / l.visits) / 10} %` : "—");

function copy(text: string) {
  void navigator.clipboard?.writeText(text).then(() => toast("Lien copié"), () => toast(text));
}

function QrBox({ link, name }: { link: string; name: string }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    void QRCode.toDataURL(link, { width: 512, margin: 2, color: { dark: "#0B0B10", light: "#FFFFFF" } }).then(setSrc);
  }, [link]);
  if (!src) return null;
  return (
    <div className="flex items-center gap-3">
      <img src={src} alt={`QR code ${link}`} className="size-28 rounded-xl bg-white p-1" />
      <a href={src} download={`hdar-qr-${name}.png`} className="rounded-full border border-line px-3 py-2 text-xs font-bold">⬇︎ QR en PNG</a>
    </div>
  );
}


const day = (d: string) => new Date(d).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short" });

function PersonRow({ p, onOpen }: { p: RefPerson; onOpen?: (id: string) => void }) {
  return (
    <li>
      <button type="button" disabled={!p.id} onClick={() => p.id && onOpen?.(p.id)} className="flex w-full items-center gap-2 py-1.5 text-left disabled:opacity-60">
        <Avatar src={p.photo ?? ""} name={p.pseudo} className="size-8 shrink-0 rounded-full" />
        <span className="min-w-0 flex-1 truncate text-sm font-bold">{p.pseudo}</span>
        {p.rewarded && <span className="rounded bg-signal/20 px-1 text-[10px] text-signal">récompensé</span>}
        <span className={"rounded-full px-2 py-0.5 text-[10px] " + (p.active ? "bg-emerald-500/20 text-emerald-300" : "bg-line text-muted")}>{p.active ? "actif" : "inactif"}</span>
        <span className="w-12 text-right text-xs text-muted">{day(p.created)}</span>
      </button>
    </li>
  );
}

/** Profils inscrits via un lien ?ref= (pseudos seulement). */
function RefPeople({ adminKey, refName, demo, onOpen }: { adminKey: string; refName: string; demo?: RefPerson[]; onOpen?: (id: string) => void }) {
  const [rows, setRows] = useState<RefPerson[] | null>(demo ?? null);
  useEffect(() => {
    if (demo) return;
    void adminRefProfiles(adminKey, refName).then(setRows).catch((e: Error) => toast(e.message));
  }, [adminKey, refName, demo]);
  if (!rows) return <p className="text-xs text-muted">Chargement des profils…</p>;
  if (!rows.length) return <p className="text-xs text-muted">Aucun profil inscrit via ce lien pour l'instant.</p>;
  return (
    <div>
      <p className="text-xs font-bold text-muted">Profils inscrits ({rows.length}) · actif = vu ces 7 derniers jours</p>
      <ul className="divide-y divide-line/40">{rows.map((p, i) => <PersonRow key={p.id ?? i} p={p} onOpen={onOpen} />)}</ul>
    </div>
  );
}

/** Classement des membres par profils amenés via leur lien d'invitation ?r=. */
export function Referrers({ adminKey, demo, onOpen }: { adminKey: string; demo?: Referrer[]; onOpen?: (id: string) => void }) {
  const [rows, setRows] = useState<Referrer[] | null>(demo ?? null);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    if (demo) return;
    void adminReferrers(adminKey).then(setRows).catch((e: Error) => toast(e.message));
  }, [adminKey, demo]);
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <h3 className="mb-1 font-display font-bold">Parrains</h3>
      <p className="mb-2 text-xs text-muted">Membres classés par profils amenés avec leur lien d'invitation (?r=).</p>
      {!rows ? <p className="text-xs text-muted">Chargement…</p> : !rows.length ? <p className="text-xs text-muted">Aucun parrainage pour l'instant.</p> : (
        <ol className="divide-y divide-line/60">
          {rows.map((r, i) => (
            <li key={r.id} className="py-2">
              <div className="flex items-center gap-2">
                <span className="w-5 text-center text-sm font-bold text-muted">{i + 1}</span>
                <button type="button" onClick={() => onOpen?.(r.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <Avatar src={r.photo ?? ""} name={r.pseudo} className="size-9 shrink-0 rounded-full" />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold underline-offset-2 hover:underline">{r.pseudo}</span>
                    <span className="block text-xs text-muted">dernier : {day(r.last)} · {r.rewarded} récompensé{r.rewarded > 1 ? "s" : ""}</span>
                  </span>
                </button>
                <span className="text-right text-lg font-bold">{r.count}<span className="block text-[10px] font-normal text-muted">profils</span></span>
                <button type="button" aria-label="Voir les filleuls" onClick={() => setOpen(open === r.id ? null : r.id)} className="rounded-full border border-line px-2 py-1 text-xs">{open === r.id ? "▲" : "▼"}</button>
              </div>
              {open === r.id && (
                <ul className="mt-2 divide-y divide-line/40 rounded-xl bg-night px-3 py-1">{r.referred.map((p, j) => <PersonRow key={p.id ?? j} p={p} onOpen={onOpen} />)}</ul>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Générateur de liens suivis + liste avec visites, profils et conversion (onglet admin « Provenance »). */
export function RefLinks({ adminKey, demo, demoPeople, onOpen }: { adminKey: string; demo?: RefLink[]; demoPeople?: Record<string, RefPerson[]>; onOpen?: (id: string) => void }) {
  const [rows, setRows] = useState<RefLink[]>(demo ?? []);
  const [name, setName] = useState("");
  const [label, setLabel] = useState("");
  const [withCode, setWithCode] = useState(false);
  const [made, setMade] = useState<{ ref: string; withCode: boolean } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const load = useCallback(() => {
    if (demo) return;
    void adminRefLinks(adminKey).then(setRows).catch((e: Error) => toast(e.message));
  }, [adminKey, demo]);
  useEffect(load, [load]);
  const ref = slugRef(name);
  const create = () => {
    if (!ref) return;
    const done = () => { setMade({ ref, withCode }); setName(""); setLabel(""); load(); };
    if (demo) {
      setRows((r) => [{ ref, label, with_code: withCode, archived: false, created_at: new Date().toISOString(), visits: 0, profiles: 0 }, ...r.filter((x) => x.ref !== ref)]);
      return done();
    }
    void adminRefLinkSave(adminKey, ref, label || name, withCode).then(done).catch((e: Error) => toast(e.message));
  };
  const archive = (l: RefLink) => {
    if (demo) return setRows((r) => r.map((x) => (x.ref === l.ref ? { ...x, archived: !x.archived } : x)));
    void adminRefLinkArchive(adminKey, l.ref, !l.archived).then(load).catch((e: Error) => toast(e.message));
  };
  const list = rows
    .filter((l) => showArchived || !l.archived)
    .sort((a, b) => Number(a.archived) - Number(b.archived) || b.profiles - a.profiles || b.visits - a.visits);

  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-2xl border border-line bg-surface p-4">
        <h3 className="font-display font-bold">Créer un lien suivi</h3>
        <input className="h-11 w-full rounded-full border border-line bg-night px-4 text-sm outline-none focus-visible:border-signal" placeholder="Nom : reddit, annonce Montpellier, tiktok…" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="h-11 w-full rounded-full border border-line bg-night px-4 text-sm outline-none focus-visible:border-signal" placeholder="Note (facultatif) : où il est partagé" value={label} maxLength={120} onChange={(e) => setLabel(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={withCode} onChange={(e) => setWithCode(e.target.checked)} /> Ajouter &code=FIRST (hdar+ offert)</label>
        {ref && <p className="truncate text-xs text-muted">Lien : <span className="font-mono text-ink">{linkOf(ref, withCode)}</span></p>}
        <button type="button" disabled={!ref} onClick={create} className="h-11 w-full rounded-full bg-signal text-sm font-bold text-night disabled:opacity-40">Créer le lien</button>
        {made && (
          <div className="space-y-2 rounded-xl border border-signal/40 bg-night p-3">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{linkOf(made.ref, made.withCode)}</span>
              <button type="button" onClick={() => copy(linkOf(made.ref, made.withCode))} className="shrink-0 rounded-full bg-signal px-3 py-1.5 text-xs font-bold text-night">Copier</button>
            </div>
            <QrBox link={linkOf(made.ref, made.withCode)} name={made.ref} />
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-line bg-surface p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="font-display font-bold">Mes liens</h3>
          <label className="flex items-center gap-1 text-xs text-muted"><input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Archivés</label>
        </div>
        <ul className="divide-y divide-line/60">
          {list.map((l) => (
            <li key={l.ref} className={"py-2 " + (l.archived ? "opacity-50" : "")}>
              <button type="button" onClick={() => setOpen(open === l.ref ? null : l.ref)} className="flex w-full items-center gap-2 text-left">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 text-sm font-bold"><span className="truncate">{l.ref}</span>{l.with_code && <span className="shrink-0 rounded bg-amber-400/20 px-1 text-[10px] text-amber-300">FIRST</span>}</span>
                  <span className="block truncate text-xs text-muted">{l.label || "—"}{l.created_at ? ` · ${new Date(l.created_at).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short" })}` : ""}</span>
                </span>
                <span className="w-12 text-right text-sm">{l.visits}<span className="block text-[10px] text-muted">visites</span></span>
                <span className="w-12 text-right text-sm font-bold">{l.profiles}<span className="block text-[10px] font-normal text-muted">profils</span></span>
                <span className="w-12 text-right text-sm">{conv(l)}<span className="block text-[10px] text-muted">conv.</span></span>
              </button>
              {open === l.ref && (
                <div className="mt-2 space-y-2 rounded-xl bg-night p-3">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate font-mono text-xs">{linkOf(l.ref, l.with_code)}</span>
                    <button type="button" onClick={() => copy(linkOf(l.ref, l.with_code))} className="shrink-0 rounded-full bg-signal px-3 py-1.5 text-xs font-bold text-night">Copier</button>
                  </div>
                  <QrBox link={linkOf(l.ref, l.with_code)} name={l.ref} />
                  <RefPeople adminKey={adminKey} refName={l.ref} demo={demoPeople ? demoPeople[l.ref] ?? [] : undefined} onOpen={onOpen} />
                  <button type="button" onClick={() => archive(l)} className="text-xs text-muted underline">{l.archived ? "Désarchiver" : "Archiver"}</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Aperçu de dev (captures), données fictives. */
export function RefLinksDemo() {
  const at = "2026-10-23T14:00:00Z";
  const demo: RefLink[] = [
    { ref: "next1", label: "Partenaire Telegram (lien 1)", with_code: false, archived: false, created_at: at, visits: 7, profiles: 2 },
    { ref: "next2", label: "Partenaire Telegram (lien 2, code FIRST)", with_code: true, archived: false, created_at: at, visits: 0, profiles: 0 },
    ...["reddit", "telegram", "annonces", "tiktok", "instagram", "x", "bouche-a-oreille"].map((r) => ({ ref: r, label: r, with_code: false, archived: false, created_at: new Date().toISOString(), visits: 0, profiles: 0 })),
  ];
  const people = { next1: [
    { id: "d1", pseudo: "Lune_34", photo: null, created: "2026-10-23T18:12:00Z", active: true },
    { id: "d2", pseudo: "Marco.M", photo: null, created: "2026-10-23T15:40:00Z", active: false },
  ] };
  const refs: Referrer[] = [
    { id: "p1", pseudo: "Sofiane", photo: null, count: 4, rewarded: 3, last: "2026-10-23T20:00:00Z", referred: [
      { id: "f1", pseudo: "Nina", photo: null, created: "2026-10-23T20:00:00Z", active: true, rewarded: true },
      { id: "f2", pseudo: "Kévin_B", photo: null, created: "2026-10-21T10:00:00Z", active: true, rewarded: true },
      { id: "f3", pseudo: "Alex", photo: null, created: "2026-10-19T10:00:00Z", active: false, rewarded: true },
      { id: null, pseudo: "(profil supprimé)", photo: null, created: "2026-10-18T10:00:00Z", active: false, rewarded: false },
    ] },
    { id: "p2", pseudo: "Clara.mtp", photo: null, count: 2, rewarded: 1, last: "2026-10-22T09:00:00Z", referred: [] },
    { id: "p3", pseudo: "Yanis", photo: null, count: 1, rewarded: 0, last: "2026-10-17T09:00:00Z", referred: [] },
  ];
  const onOpen = (id: string) => toast(`Ouvre la fiche profil ${id}`);
  return (
    <main className="min-h-dvh space-y-4 bg-night px-4 pt-6 pb-10 text-ink">
      <h1 className="font-display text-2xl font-extrabold">Provenance</h1>
      <RefLinks adminKey="" demo={demo} demoPeople={people} onOpen={onOpen} />
      <Referrers adminKey="" demo={refs} onOpen={onOpen} />
    </main>
  );
}
