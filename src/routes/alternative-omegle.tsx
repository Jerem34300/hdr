import { createFileRoute } from "@tanstack/react-router";
import { CamPage, camHead } from "@/components/hdar/seo-cam";

export const Route = createFileRoute("/alternative-omegle")({ head: () => camHead("alternative-omegle"), component: () => <CamPage k="alternative-omegle" /> });
