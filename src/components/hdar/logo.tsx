import { cn } from "@/lib/cn";

export function Mark({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex size-9", className)} aria-hidden>
      <svg viewBox="0 0 64 64" className="h-full w-full text-ink">
        <circle cx="32" cy="32" r="28" fill="none" stroke="currentColor" strokeOpacity="0.28" strokeWidth="1.5" />
        <circle cx="32" cy="32" r="18" fill="none" stroke="currentColor" strokeOpacity="0.5" strokeWidth="1.5" />
        <path d="M18 14v36M46 14v36" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
        <circle cx="32" cy="32" r="4.5" className="fill-signal" />
      </svg>
      <span className="radar-sweep pointer-events-none absolute inset-0" />
    </span>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-display text-xl font-extrabold tracking-tight text-ink", className)}>
      hdar<span className="text-signal">.</span>
    </span>
  );
}
