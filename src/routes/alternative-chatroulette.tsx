import { createFileRoute } from "@tanstack/react-router";
import { CamPage, camHead } from "@/components/hdar/seo-cam";

export const Route = createFileRoute("/alternative-chatroulette")({ head: () => camHead("alternative-chatroulette"), component: () => <CamPage k="alternative-chatroulette" /> });
