import { createFileRoute } from "@tanstack/react-router";
import { LiveSharePage } from "@/components/hdar/live-share";
import { liveShareMeta } from "@/lib/hdar/live";
import { SITE_URL } from "@/lib/hdar/seo";

const DEMO = typeof location !== "undefined" && import.meta.env.DEV && location.search.includes("demo") ? {
  pseudo: "Theo_31", active: !location.search.includes("ended"), ref: "E610477", lat: 43.611, lng: 3.877, area: "Montpellier, Hérault", live: 12,
  pins: [[43.615, 3.87, true], [43.607, 3.884, false], [43.62, 3.89, false], [43.603, 3.868, true], [43.611, 3.895, false], [43.598, 3.88, false]].map(([lat, lng, live]) => ({ lat: lat as number, lng: lng as number, live: live as boolean })),
  places: [{ kind: "park", name: "Peyrou", lat: 43.6112, lng: 3.8708 }, { kind: "viewpoint", name: "Belvédère", lat: 43.6175, lng: 3.881 }, { kind: "bar", name: "Bar", lat: 43.609, lng: 3.879 }, { kind: "promenade", name: "Promenade", lat: 43.604, lng: 3.889 }],
} : undefined;

export const Route = createFileRoute("/live_/$code")({
  loader: async ({ params }) => { try { return await liveShareMeta(params.code); } catch { return null; } },
  head: ({ params, loaderData }) => {
    const m = loaderData as { pseudo: string; active: boolean; area: string | null; around: number } | null | undefined;
    const title = m ? (m.active ? `${m.pseudo} est en Live sur hdar. 🎥` : `Le live de ${m.pseudo} — hdar.`) : "Un live sur hdar. 🎥";
    const desc = `${m?.area ? m.area + " · " : ""}${m && m.around > 0 ? `${m.around} personnes autour en ce moment. ` : ""}Sorties et rencontres autour de toi, pour tout le monde. Gratuit, discret, 18+.`;
    const og = `${SITE_URL}/og-live.jpg`;
    return {
      meta: [
        { title }, { name: "description", content: desc }, { name: "page-own-og", content: "1" },
        { property: "og:title", content: title }, { property: "og:description", content: desc }, { property: "og:site_name", content: "hdar." },
        { property: "og:url", content: `${SITE_URL}/live/${params.code}` }, { property: "og:type", content: "website" },
        { property: "og:image", content: og }, { property: "og:image:width", content: "1200" }, { property: "og:image:height", content: "630" },
        { name: "twitter:card", content: "summary_large_image" }, { name: "twitter:image", content: og },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: () => { const { code } = Route.useParams(); return <LiveSharePage code={code.toLowerCase()} demo={DEMO} />; },
});
