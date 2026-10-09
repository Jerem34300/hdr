import { useState } from "react";
import { cn } from "@/lib/cn";
import { safeSrc } from "@/lib/hdar/media";

export function Avatar({
  src,
  name,
  className,
}: {
  src?: string;
  name: string;
  className?: string;
}) {
  const [ok, setOk] = useState(true);
  const href = safeSrc(src);
  return (
    <span className={cn("relative block overflow-hidden bg-surface", className)}>
      {href && ok ? (
        <img
          src={href}
          alt=""
          draggable={false}
          className="pointer-events-none h-full w-full object-cover select-none"
          onError={() => setOk(false)}
        />
      ) : (
        <span className="flex h-full w-full items-center justify-center bg-surface font-display text-lg font-bold text-ink">
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  );
}
