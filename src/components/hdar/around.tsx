import { useState } from "react";
import { useScene } from "@/lib/hdar/scene";
import { useHdar } from "@/lib/hdar/store";
import { bindTap } from "./tap";
import { Wordmark } from "./logo";
import { MapView } from "./map-view";
import { useActivity } from "@/lib/hdar/activity";

export function Around() {
  const enterLine = useHdar((s) => s.enterLine);
  const openPocket = useHdar((s) => s.openPocket);
  const openCity = useHdar((s) => s.openCity);
  const joinSpot = useHdar((s) => s.joinSpot);
  const { place, people, spots, zones } = useScene();
  const [area, setArea] = useState<string | null>(null);
  const { area: areaUnread } = useActivity();

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-4 pb-2">
        <div className="min-w-0">
          <Wordmark />
          <button type="button" data-act="city" className="mt-1 block truncate text-left text-sm text-muted" {...bindTap(openCity)}>
            {area ?? (place.slug === "ici" ? "Autour de toi" : place.name)}
          </button>
        </div>
        <button
          type="button"
          data-act="pocket"
          data-tip="pocket"
          {...bindTap(openPocket)}
          aria-label={areaUnread ? `Chat du quartier, ${areaUnread} nouveaux messages` : "Chat du quartier"}
          className="relative h-11 shrink-0 rounded-full bg-signal px-4 text-sm text-night"
        >
          Chat du quartier
          {areaUnread > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-night bg-ink px-1 text-[11px] font-bold text-night">
              {areaUnread > 9 ? "9+" : areaUnread}
            </span>
          )}
        </button>
      </header>
      <div className="relative min-h-0 flex-1">
        <MapView place={place} people={people} spots={spots} zones={zones} onPerson={enterLine} onSpot={joinSpot} onArea={setArea} />
      </div>
    </div>
  );
}
