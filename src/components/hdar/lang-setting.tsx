import { Check, Languages } from "lucide-react";
import { useState } from "react";
import { deviceLang, LANGS, useLang } from "@/lib/hdar/i18n";

/** Choix discret de la langue de l'interface (par défaut : langue du téléphone). Les messages des membres ne sont pas traduits. */
export function LangSetting() {
  const lang = useLang((s) => s.lang);
  const forced = useLang((s) => s.forced);
  const setLang = useLang((s) => s.setLang);
  const [open, setOpen] = useState(false);
  const cur = LANGS.find((l) => l.code === lang)!;
  const row = "flex h-11 w-full items-center gap-3 px-4 text-start text-sm";
  return (
    <section className="mt-3 overflow-hidden rounded-2xl border border-line" data-act="lang-setting">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={row + " h-14"}>
        <Languages className="size-5 text-muted" />
        <span className="flex-1"><span className="block font-bold">Langue</span><span className="block text-xs text-muted">{forced ? "Choisie par toi" : "Celle de ton téléphone"}</span></span>
        <span translate="no" className="text-muted">{cur.name}</span>
      </button>
      {open && (
        <div className="border-t border-line">
          <button type="button" onClick={() => setLang(null)} className={row}>
            <span className="flex-1">Automatique <span translate="no" className="text-muted">({LANGS.find((l) => l.code === deviceLang())!.name})</span></span>
            {!forced && <Check className="size-4 text-signal" />}
          </button>
          {LANGS.map((l) => (
            <button key={l.code} type="button" lang={l.code} onClick={() => setLang(l.code)} className={row}>
              <span translate="no" className="flex-1">{l.name}</span>
              {forced && l.code === lang && <Check className="size-4 text-signal" />}
            </button>
          ))}
          <p className="px-4 pb-3 text-xs text-muted">Les messages entre membres ne sont pas traduits.</p>
        </div>
      )}
    </section>
  );
}
