import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { adminRefLinkArchive, adminRefLinks, adminRefLinkSave, type RefLink } from "@/lib/hdar/live";

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

/** Générateur de liens suivis + liste avec visites, profils et conversion (onglet admin « Provenance »). */
export function RefLinks({ adminKey, demo }: { adminKey: string; demo?: RefLink[] }) {
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
                  <span className="block truncate text-xs text-muted">{l.label || "—"}{l.created_at ? ` · ${new Date(l.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}` : ""}</span>
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

/** Aperçu de dev (captures). */
export function RefLinksDemo() {
  const at = "2026-10-23T14:00:00Z";
  const demo: RefLink[] = [
    { ref: "next1", label: "Partenaire Telegram (lien 1)", with_code: false, archived: false, created_at: at, visits: 7, profiles: 2 },
    { ref: "next2", label: "Partenaire Telegram (lien 2, code FIRST)", with_code: true, archived: false, created_at: at, visits: 0, profiles: 0 },
    ...["reddit", "telegram", "annonces", "tiktok", "instagram", "x", "bouche-a-oreille"].map((r) => ({ ref: r, label: r, with_code: false, archived: false, created_at: new Date().toISOString(), visits: 0, profiles: 0 })),
  ];
  return <main className="min-h-dvh bg-night px-4 pt-6 pb-10 text-ink"><h1 className="mb-4 font-display text-2xl font-extrabold">Provenance</h1><RefLinks adminKey="" demo={demo} /></main>;
}
