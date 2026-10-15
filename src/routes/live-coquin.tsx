import { createFileRoute } from "@tanstack/react-router";
import { CoquinPage, coquinHead } from "@/components/hdar/seo-coquin";

export const Route = createFileRoute("/live-coquin")({ head: () => coquinHead(), component: () => <CoquinPage /> });
