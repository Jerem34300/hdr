import { createFileRoute } from "@tanstack/react-router";
import { CamPage, camHead } from "@/components/hdar/seo-cam";

export const Route = createFileRoute("/cam-to-cam")({ head: () => camHead("cam-to-cam"), component: () => <CamPage k="cam-to-cam" /> });
