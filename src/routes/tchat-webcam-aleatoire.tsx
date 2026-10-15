import { createFileRoute } from "@tanstack/react-router";
import { CamPage, camHead } from "@/components/hdar/seo-cam";

export const Route = createFileRoute("/tchat-webcam-aleatoire")({ head: () => camHead("tchat-webcam-aleatoire"), component: () => <CamPage k="tchat-webcam-aleatoire" /> });
