import { useState } from "react";
import { useScene } from "@/lib/hdar/scene";
import { useHdar } from "@/lib/hdar/store";
import { bindTap } from "./tap";
import { Wordmark } from "./logo";
import { MapView } from "./map-view";

export function Around() {
  const enterLine = useHdar((s) => s.enterLine);
  const openPocket = useHdar((s) => s.openPocket);
  const openCity = useHdar((s) => s.openCity);
  const joinSpot = useHdar((s) => s.joinSpot);
  const { place, people, spots, zones } = useScene();
  const [area, setArea] = useState(place.name);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-4 pb-2">
        <div className="min-w-0">
          <Wordmark />
          <button type="button" data-act="city" className="mt-1 block truncate text-left text-sm text-muted" {...bindTap(openCity)}>
            {area}
          </button>
        </div>
        <button
          type="button"
          data-act="pocket"
          {...bindTap(openPocket)}
          className="h-11 shrink-0 rounded-full bg-signal px-4 text-sm text-night"
        >
          Annonces
        </button>
      </header>
      <div className="relative min-h-0 flex-1">
        <MapView place={place} people={people} spots={spots} zones={zones} onPerson={enterLine} onSpot={joinSpot} onArea={setArea} />
      </div>
    </div>
  );
}
