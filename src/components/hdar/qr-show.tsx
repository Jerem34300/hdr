import { useEffect, useMemo, useState, type CSSProperties } from "react";
import QRCode from "qrcode";
import { QrCode, X } from "lucide-react";
import { toast } from "sonner";
import { t } from "@/lib/hdar/i18n";
import { track } from "@/lib/hdar/track";
import { deviceId } from "@/lib/hdar/device";
import { myRef } from "@/lib/hdar/live";
import { safeSrc } from "@/lib/hdar/media";
import { myPhotos, useHdar } from "@/lib/hdar/store";

export type QrVariant = "light" | "dark";

const UUID = /^[0-9a-f-]{36}$/i;
const REF = /^[A-Za-z0-9]{4,12}$/;

/** Lien du QR : ouvre la fiche, rattache le parrainage (?r=) et marque la provenance. */
export function qrProfileUrl(userId: string, code: string, pseudo?: string) {
  const u = new URL("https://hdar.chat/");
  u.searchParams.set("u", userId);
  u.searchParams.set("r", code);
  u.searchParams.set("src", "qr");
  const n = (pseudo || "").trim().slice(0, 24);
  if (n) u.searchParams.set("n", n);
  return u.toString();
}

/** À l'arrivée : ouvre la fiche visée par ?u= (après le 18+). */
export function openQrTarget() {
  if (typeof window === "undefined") return;
  const q = new URLSearchParams(window.location.search);
  if (q.get("src") === "qr") track("qr_open");
  const id = (q.get("u") || "").trim().toLowerCase();
  if (!UUID.test(id)) return;
  const name = (q.get("n") || "").trim().slice(0, 24) || "…";
  useHdar.getState().openProfile(id, name);
}

export function QrShowButton({ className, onOpen, disabled }: { className?: string; onOpen?: () => void; disabled?: boolean }) {
  return (
    <button type="button" data-act="qr-show-btn" disabled={disabled} onClick={onOpen} className={className}>
      <QrCode className="size-4" />
      {t("Montrer mon QR")}
    </button>
  );
}

type Demo = { pseudo: string; photo: string; url: string; variant?: QrVariant };

/** Plein écran : photo, pseudo, QR radar. */
export function QrShow({ onClose, demo }: { onClose: () => void; demo?: Demo }) {
  const me = useHdar((s) => s.me);
  const [url, setUrl] = useState(demo?.url ?? "");
  const [err, setErr] = useState("");
  const variant: QrVariant = demo?.variant ?? "dark";
  const pseudo = demo?.pseudo ?? me.pseudo ?? "";
  const photo = demo?.photo ?? myPhotos(me)[0] ?? me.photo ?? "";

  useEffect(() => {
    track("qr_show");
  }, []);

  useEffect(() => {
    if (demo) return;
    let alive = true;
    void myRef()
      .then(({ code }) => {
        if (!alive) return;
        if (!REF.test(code)) throw new Error("no-code");
        setUrl(qrProfileUrl(deviceId(), code, useHdar.getState().me.pseudo));
      })
      .catch(() => {
        if (!alive) return;
        setErr("Crée d'abord ton profil");
        toast(t("Crée d'abord ton profil"));
      });
    return () => {
      alive = false;
    };
  }, [demo]);

  return (
    <div
      role="dialog"
      aria-label={t("Montrer mon QR")}
      data-act="qr-show"
      data-variant={variant}
      className="fixed inset-0 z-[80] flex flex-col bg-night text-ink"
    >
      <span aria-hidden className="pointer-events-none absolute -top-24 start-[-20%] size-[28rem] rounded-full bg-[#FA6F6C]/20 blur-3xl" />
      <span aria-hidden className="pointer-events-none absolute -bottom-28 end-[-15%] size-[26rem] rounded-full bg-[#A1E3C3]/10 blur-3xl" />
      <header className="relative z-10 flex items-center justify-end px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <button type="button" aria-label={t("Fermer")} onClick={onClose} className="flex size-11 items-center justify-center rounded-full bg-white/10">
          <X className="size-5" />
        </button>
      </header>
      <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="flex flex-col items-center gap-2">
          <QrAvatar src={photo} name={pseudo} />
          <p className="font-display text-2xl font-extrabold tracking-tight">{pseudo || "hdar."}</p>
        </div>
        {err ? (
          <p className="text-sm text-muted">{t(err)}</p>
        ) : url ? (
          <RadarStage url={url} variant={variant} />
        ) : (
          <div className="size-64 animate-pulse rounded-[28px] bg-white/10" />
        )}
        <p className="max-w-xs text-center text-sm leading-snug text-ink/85">{t("Flashe pour voir mon profil sur hdar.chat")}</p>
      </div>
    </div>
  );
}

function QrAvatar({ src, name }: { src?: string; name: string }) {
  const [ok, setOk] = useState(true);
  const href = safeSrc(src);
  return (
    <span className="flex size-20 items-center justify-center overflow-hidden rounded-full bg-night ring-2 ring-[#FA6F6C] shadow-[0_0_24px_rgba(250,111,108,.45)]">
      {href && ok ? (
        <img src={href} alt="" className="size-full object-cover" onError={() => setOk(false)} />
      ) : (
        <span className="font-display text-3xl font-extrabold text-ink">{(name || "?").slice(0, 1).toUpperCase()}</span>
      )}
    </span>
  );
}

function RadarStage({ url, variant }: { url: string; variant: QrVariant }) {
  const light = variant === "light";
  return (
    <div className="relative flex size-[22rem] max-w-[86vw] max-h-[86vw] items-center justify-center" data-act="qr-stage">
      <span aria-hidden className="absolute inset-0 rounded-full border border-[#FA6F6C]/25" />
      <span aria-hidden className="absolute inset-[10%] rounded-full border border-[#FA6F6C]/18" />
      <span aria-hidden className="absolute inset-[22%] rounded-full border border-[#FA6F6C]/12" />
      <span aria-hidden className="radar-sweep absolute inset-0" />
      <Ping style={{ top: "11%", left: "22%" }} delay="0s" />
      <Ping style={{ top: "28%", right: "14%" }} delay="0.7s" />
      <Ping style={{ bottom: "18%", left: "16%" }} delay="1.3s" />
      <div
        data-act="qr-card"
        className={
          "relative z-10 rounded-[28px] p-4 shadow-[0_0_40px_rgba(250,111,108,.4)] ring-1 " +
          (light ? "bg-white ring-[#FA6F6C]/35" : "bg-[#0b0b10] ring-[#FA6F6C]/50")
        }
      >
        <RadarQr text={url} variant={variant} size={232} />
      </div>
    </div>
  );
}

function Ping({ style, delay }: { style: CSSProperties; delay: string }) {
  return (
    <span aria-hidden className="absolute z-0 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#FA6F6C]" style={style}>
      <span className="ping-ring" style={{ animationDelay: delay }} />
    </span>
  );
}

type Matrix = { size: number; data: boolean[][] };

function matrixOf(text: string): Matrix {
  const qr = QRCode.create(text, { errorCorrectionLevel: "H" });
  const size = qr.modules.size;
  const data: boolean[][] = [];
  for (let y = 0; y < size; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < size; x++) row.push(!!qr.modules.get(x, y));
    data.push(row);
  }
  return { size, data };
}

function inFinder(x: number, y: number, n: number) {
  return (x < 7 && y < 7) || (x >= n - 7 && y < 7) || (x < 7 && y >= n - 7);
}

function inLogo(x: number, y: number, n: number) {
  const c = (n - 1) / 2;
  const r = n * 0.11;
  return (x - c) ** 2 + (y - c) ** 2 <= r * r;
}

/** QR stylé : points en dégradé corail, coins arrondis, logo hdar au centre. */
export function RadarQr({ text, variant, size }: { text: string; variant: QrVariant; size: number }) {
  const m = useMemo(() => matrixOf(text), [text]);
  const light = variant === "light";
  // Corail assez sombre sur fond clair pour rester lisible par un lecteur.
  const dark = light ? "url(#qrCoral)" : "url(#qrLight)";
  const bg = light ? "#ffffff" : "#0b0b10";
  const n = m.size;
  const pad = 2;
  const vb = n + pad * 2;
  const finders: [number, number][] = [
    [0, 0],
    [n - 7, 0],
    [0, n - 7],
  ];
  return (
    <svg
      data-act="qr-svg"
      width={size}
      height={size}
      viewBox={`0 0 ${vb} ${vb}`}
      role="img"
      aria-label={t("QR code")}
      shapeRendering="geometricPrecision"
    >
      <defs>
        <linearGradient id="qrCoral" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5A1816" />
          <stop offset="45%" stopColor="#7A2420" />
          <stop offset="100%" stopColor="#4A1210" />
        </linearGradient>
        <linearGradient id="qrLight" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FFE8E6" />
          <stop offset="50%" stopColor="#F4F4F6" />
          <stop offset="100%" stopColor="#FFD0CC" />
        </linearGradient>
      </defs>
      <rect width={vb} height={vb} rx="2" fill={bg} />
      {m.data.map((row, y) =>
        row.map((on, x) => {
          if (!on || inFinder(x, y, n) || inLogo(x, y, n)) return null;
          return <circle key={`${x}-${y}`} cx={x + pad + 0.5} cy={y + pad + 0.5} r="0.42" fill={dark} />;
        }),
      )}
      {finders.map(([ox, oy]) => (
        <Finder key={`${ox}-${oy}`} x={ox + pad} y={oy + pad} fill={dark} hole={bg} />
      ))}
      <HdarMark cx={pad + (n - 1) / 2 + 0.5} cy={pad + (n - 1) / 2 + 0.5} r={n * 0.11} light={light} />
    </svg>
  );
}

function Finder({ x, y, fill, hole }: { x: number; y: number; fill: string; hole: string }) {
  return (
    <g>
      <rect x={x} y={y} width="7" height="7" rx="1.85" fill={fill} />
      <rect x={x + 1} y={y + 1} width="5" height="5" rx="1.25" fill={hole} />
      <rect x={x + 2} y={y + 2} width="3" height="3" rx="0.95" fill={fill} />
    </g>
  );
}

/** Mini marque hdar (cercles + barres), dans le trou central du QR. */
function HdarMark({ cx, cy, r, light }: { cx: number; cy: number; r: number; light: boolean }) {
  const ink = light ? "#0b0b10" : "#f4f4f6";
  const coral = "#FA6F6C";
  const plate = light ? "#ffffff" : "#0b0b10";
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 0.15} fill={plate} />
      <circle cx={cx} cy={cy} r={r * 0.92} fill="none" stroke={ink} strokeOpacity="0.28" strokeWidth={r * 0.08} />
      <circle cx={cx} cy={cy} r={r * 0.58} fill="none" stroke={ink} strokeOpacity="0.5" strokeWidth={r * 0.08} />
      <path
        d={`M ${cx - r * 0.42} ${cy - r * 0.62} V ${cy + r * 0.62} M ${cx + r * 0.42} ${cy - r * 0.62} V ${cy + r * 0.62}`}
        stroke={ink}
        strokeWidth={r * 0.22}
        strokeLinecap="round"
        fill="none"
      />
      <circle cx={cx} cy={cy} r={r * 0.16} fill={coral} />
    </g>
  );
}
