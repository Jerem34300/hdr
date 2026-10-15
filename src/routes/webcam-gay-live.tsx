import { createFileRoute } from "@tanstack/react-router";
import { CamPage, camHead } from "@/components/hdar/seo-cam";

export const Route = createFileRoute("/webcam-gay-live")({ head: () => camHead("webcam-gay-live"), component: () => <CamPage k="webcam-gay-live" /> });
