import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/ambassadeur_/guide")({
  head: () => ({ meta: [{ title: "Guide ambassadeur hdar" }, { name: "robots", content: "noindex" }] }),
  component: () => {
    useEffect(() => { location.replace("/ambassadeur/guide.pdf"); }, []);
    return <main className="p-6 text-center text-ink"><a href="/ambassadeur/guide.pdf" className="underline">Ouvrir le guide ambassadeur (PDF)</a></main>;
  },
});
