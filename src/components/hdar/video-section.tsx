import { useEffect, useState } from "react";
import { Film, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { explicitVideoReason, MAX_SHORT_VIDEO_SEC, MAX_SOURCE_MB, uploadChatMedia } from "@/lib/hdar/chat-media";
import {
  placeVideoAdd, placeVideoRemove, placeVideos, profileVideoAdd, profileVideoRemove, profileVideos, type StoredVideo,
} from "@/lib/hdar/live";
import { MediaView } from "./media-composer";

const MAX = 3;

/**
 * Vidéos d'un profil ou d'une page de lieu (3 × 60 s). Le propriétaire ajoute / retire,
 * les autres regardent et peuvent signaler. Compression automatique avant envoi.
 */
export function VideoSection({
  target,
  id,
  canEdit,
  demo,
  title = "Vidéos",
}: {
  target: "profile" | "place";
  id: string;
  canEdit: boolean;
  demo?: StoredVideo[];
  title?: string;
}) {
  const [list, setList] = useState<StoredVideo[] | null>(demo ?? null);
  const [pct, setPct] = useState<number | null>(null);
  const load = () => {
    if (demo) return;
    void (target === "profile" ? profileVideos(id) : placeVideos(id)).then(setList).catch(() => setList([]));
  };
  useEffect(load, [target, id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(f: File) {
    if (f.size > MAX_SOURCE_MB * 1024 * 1024) return toast(`Vidéo trop lourde (max ${MAX_SOURCE_MB} Mo)`);
    setPct(0);
    try {
      const up = await uploadChatMedia(f, "video", undefined, { short: true, onProgress: setPct });
      const flag = await explicitVideoReason(up.frames);
      if (target === "profile") {
        // Même règle que la photo principale : visible par toi seul en attendant l'admin.
        await profileVideoAdd(up.path, up.duration ?? 1, flag);
        if (flag) toast("Ta vidéo sera vérifiée avant d'être visible par les autres.");
      } else {
        // Page de lieu (promotion publique) : une vidéo explicite n'est pas publiée.
        if (flag) throw new Error("Cette vidéo ne peut pas être publiée sur la page du lieu (contenu explicite)");
        await placeVideoAdd(id, up.path, up.duration ?? 1);
      }
      toast("Vidéo ajoutée 🎬");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Vidéo non envoyée");
    } finally {
      setPct(null);
    }
  }
  async function remove(path: string) {
    try {
      await (target === "profile" ? profileVideoRemove(path) : placeVideoRemove(id, path));
      setList((l) => (l ?? []).filter((v) => v.path !== path));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Impossible");
    }
  }

  if (!list) return null;
  if (!list.length && !canEdit) return null;
  return (
    <section className="mt-5" data-testid="video-section">
      <h2 className="flex items-center gap-2 text-sm font-bold"><Film className="size-4 text-signal" /> {title}</h2>
      {canEdit && <p className="mt-0.5 text-xs text-muted">{MAX} vidéos max, {MAX_SHORT_VIDEO_SEC} s chacune · compressées automatiquement, avec le son</p>}
      <div className="mt-2 grid gap-2">
        {list.map((v) => (
          <div key={v.path} className="relative">
            <MediaView kind="video" path={v.path} duration={v.duration} reportable={!canEdit} />
            {v.pending && <span className="absolute bottom-2 left-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] text-signal">En vérification · visible par toi seul</span>}
            {canEdit && (
              <button type="button" aria-label="Retirer la vidéo" onClick={() => void remove(v.path)} className="absolute right-2 bottom-2 flex size-8 items-center justify-center rounded-full bg-black/70 text-white">
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      {pct !== null && <CompressionBar pct={pct} />}
      {canEdit && list.length < MAX && pct === null && (
        <label className="mt-2 flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-dashed border-line text-sm text-muted">
          <Plus className="size-4" /> Ajouter une vidéo
          <input type="file" accept="video/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void add(f); }} />
        </label>
      )}
    </section>
  );
}

/** Barre de progression de la compression / de l'envoi. */
export function CompressionBar({ pct }: { pct: number }) {
  return (
    <div className="mt-2 rounded-2xl bg-surface px-3 py-2.5" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <p className="text-xs">{pct < 100 ? `Compression de la vidéo… ${pct} %` : "Envoi de la vidéo…"}</p>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-signal transition-[width]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
