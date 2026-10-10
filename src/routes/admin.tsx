import { createFileRoute } from "@tanstack/react-router";
import { AdminApp } from "@/components/hdar/admin";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [{ title: "Admin — hdar." }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminApp,
});
