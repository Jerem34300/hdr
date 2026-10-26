import { Link } from "@tanstack/react-router";

/** Badge du robot d'accueil : bien identifié, jamais confondu avec un membre. */
export function BotBadge({ className = "" }: { className?: string }) {
  return (
    <span className={"ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-gradient-to-r from-[#FA6F6C] to-[#A1E3C3] px-1.5 py-px align-middle font-sans text-[10px] font-extrabold tracking-wide text-night uppercase " + className} title="Compte officiel hdar (robot d'accueil)">
      ✓ Officiel · Robot
    </span>
  );
}

/** Avatar au logo hdar. */
export function BotAvatar({ className = "" }: { className?: string }) {
  return (
    <span className={"relative flex items-center justify-center overflow-hidden bg-night ring-2 ring-[#FA6F6C]/70 " + className}>
      <img src="/icon-192.png" alt="hdar" className="size-full object-cover" draggable={false} />
    </span>
  );
}

/** Remplace la zone de saisie dans la conversation avec le robot. */
export function BotComposer() {
  return (
    <div className="dock border-t border-line px-4 pt-3 text-center">
      <p className="text-sm text-muted">🤖 C'est le robot d'accueil de hdar : il ne lit pas les messages.</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Link to="/faq" className="flex h-11 items-center justify-center rounded-full bg-signal font-bold text-night">Voir la FAQ</Link>
        <Link to="/contact" className="flex h-11 items-center justify-center rounded-full border border-line font-bold">Écrire à l'équipe</Link>
      </div>
    </div>
  );
}
