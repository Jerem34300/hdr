import { useEffect, useMemo } from "react";
import { Film, X } from "lucide-react";
import { toast } from "sonner";
import { MAX_SOURCE_MB, videoDuration } from "@/lib/hdar/chat-media";

/** Choix de vidéos avant publication (annonce, profil, lieu) : durée vérifiée tout de suite. */
export function VideoPicker({ files, max, maxSec, onChange }: { files: File[]; max: number; maxSec: number; onChange: (f: File[]) => void }) {
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  return (
    <div className="mt-1 flex gap-2">
      {previews.map((u, i) => (
        <button key={u} type="button" aria-label="Retirer la vidéo" onClick={() => onChange(files.filter((_, j) => j !== i))} className="relative h-20 w-28 overflow-hidden rounded-xl bg-black">
          <video src={u} muted playsInline preload="metadata" className="size-full object-cover" />
          <Film className="absolute bottom-1 left-1 size-4 text-white" />
          <span className="absolute top-1 right-1 rounded-full bg-black/70 p-0.5"><X className="size-3" /></span>
        </button>
      ))}
      {files.length < max && (
        <label className="grid h-20 w-28 cursor-pointer place-items-center rounded-xl border border-dashed border-line text-muted">
          <span className="flex items-center gap-1 text-sm"><Film className="size-4" /> Vidéo</span>
          <input
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (f.size > MAX_SOURCE_MB * 1024 * 1024) return void toast(`Vidéo trop lourde (max ${MAX_SOURCE_MB} Mo)`);
              void videoDuration(f).then((d) => {
                if (d > maxSec + 0.5) return toast(`Vidéo trop longue : ${maxSec} s maximum`);
                onChange([...files, f].slice(0, max));
              });
            }}
          />
        </label>
      )}
    </div>
  );
}
