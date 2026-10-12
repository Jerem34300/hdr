import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AdultGate } from "@/components/hdar/adult-gate";
import { LegalPage } from "@/components/hdar/legal";
import { sendContact, type ContactSubject } from "@/lib/hdar/live";

export const Route = createFileRoute("/contact")({
  head: () => ({ meta: [{ title: "Contact — hdar." }] }),
  component: () => (
    <AdultGate>
      <ContactForm />
    </AdultGate>
  ),
});

const OPTIONS: [ContactSubject, string][] = [
  ["rgpd", "RGPD / suppression de données"],
  ["signalement", "Signalement"],
  ["autre", "Autre"],
];

function ContactForm() {
  const [subject, setSubject] = useState<ContactSubject>("rgpd");
  const [body, setBody] = useState("");
  const [reply, setReply] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState("");
  const field =
    "w-full rounded-2xl border border-line bg-surface px-4 py-3 text-ink outline-none focus:border-signal";
  if (state === "done")
    return (
      <LegalPage title="Message envoyé">
        <p>
          Merci, ton message a bien été reçu. Nous y répondons dès que possible
          {reply ? " au contact indiqué" : ""}.
        </p>
      </LegalPage>
    );
  return (
    <LegalPage title="Contact">
      <p className="text-muted">
        Pas besoin de profil. Pour une demande RGPD, précise ce que tu souhaites (accès,
        suppression, rectification…).
      </p>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (body.trim().length < 5) return setError("Écris un message un peu plus long.");
          setState("busy");
          setError("");
          sendContact(subject, body, reply)
            .then(() => setState("done"))
            .catch((err: Error) => {
              setError(
                /rate|trop/i.test(err.message)
                  ? "Trop de messages, réessaie plus tard."
                  : err.message,
              );
              setState("idle");
            });
        }}
      >
        <label className="block space-y-1">
          <span className="font-bold">Sujet</span>
          <select
            className={field}
            value={subject}
            onChange={(e) => setSubject(e.target.value as ContactSubject)}
          >
            {OPTIONS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="font-bold">Message</span>
          <textarea
            className={field + " min-h-40"}
            maxLength={4000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <label className="block space-y-1">
          <span className="font-bold">
            Contact pour te répondre <span className="font-normal text-muted">(facultatif)</span>
          </span>
          <input
            className={field}
            maxLength={200}
            placeholder="e-mail, pseudo…"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
        </label>
        {error && <p className="text-signal">{error}</p>}
        <button
          type="submit"
          disabled={state === "busy"}
          className="h-12 w-full rounded-full bg-signal font-bold text-night disabled:opacity-50"
        >
          {state === "busy" ? "Envoi…" : "Envoyer"}
        </button>
      </form>
    </LegalPage>
  );
}
