import { useEffect, type ReactNode } from "react";
import { MessageCircle, Radar, Settings, MapPin } from "lucide-react";
import { Toaster } from "sonner";
import { cn } from "@/lib/cn";
import { logClientError } from "@/lib/hdar/media";
import { isExpired, remainingLabel } from "@/lib/hdar/rules";
import { useHdar, type Tab } from "@/lib/hdar/store";
import { Around } from "./around";
import { Chat } from "./chat";
import { Cover } from "./cover";
import { Inbox } from "./inbox";
import { LiveChat } from "./live-chat";
import { Mark, Wordmark } from "./logo";
import { Me } from "./me";
import { Celebrate, Sheets } from "./overlays";
import { PocketChat } from "./pocket";
import { SpotRoom, Spots } from "./spots";
import { bindTap, installTouchTap } from "./tap";

export function App() {
  const cover = useHdar((s) => s.cover);
  const tab = useHdar((s) => s.tab);
  const view = useHdar((s) => s.view);
  const setTab = useHdar((s) => s.setTab);
  const openTonight = useHdar((s) => s.openTonight);
  const me = useHdar((s) => s.me);
  const now = useHdar((s) => s.now);
  const matches = useHdar((s) => s.matches);
  const unread = matches.reduce((n, m) => n + (isExpired(m.expiresAt, now) ? 0 : m.unread), 0);
  const tonight = me.tonight && !isExpired(me.tonight.expiresAt, now) ? me.tonight : null;

  useEffect(() => {
    installTouchTap();
    const id = window.setInterval(() => useHdar.setState({ now: Date.now() }), 20000);
    const onError = (e: ErrorEvent) => logClientError(e.message || "error", "window");
    window.addEventListener("error", onError);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("error", onError);
    };
  }, []);

  return (
    <>
      <Toaster theme="dark" position="top-center" />
      {cover && <Cover />}
      <div className={cn("app-frame text-ink", cover && "hidden")}>
        <aside className="hidden flex-col justify-between border-r border-line px-10 py-12 lg:flex">
          <div>
            <div className="flex items-center gap-3">
              <Mark className="size-12" />
              <Wordmark className="text-3xl" />
            </div>
            <p className="mt-8 font-display text-4xl font-extrabold tracking-tight">
              Anonymes,
              <br />
              tout près.
            </p>
            <ul className="mt-8 space-y-3 text-sm text-muted">
              <li>La carte montre qui est connecté.</li>
              <li>Un profil ouvre une discussion privée.</li>
              <li>Les annonces restent à côté, sans nom imposé.</li>
            </ul>
          </div>
          <p className="text-xs text-muted">18+ · distances arrondies · position exacte jamais publiée</p>
        </aside>
        <section className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-night">
          {view.name === "chat" ? (
            <Chat />
          ) : view.name === "live" ? (
            <LiveChat userId={view.userId} pseudo={view.pseudo} />
          ) : view.name === "pocket" ? (
            <PocketChat />
          ) : view.name === "spot" ? (
            <SpotRoom />
          ) : (
            <>
              {tab === "around" && <Around />}
              {tab === "spots" && <Spots />}
              {tab === "inbox" && <Inbox />}
              {tab === "me" && <Me />}
              <nav className="dock relative z-20 grid shrink-0 grid-cols-5 items-end border-t border-line bg-night px-1 pt-1">
                <DockButton id="around" label="Carte" current={tab} icon={<Radar className="size-5" />} onClick={setTab} />
                <DockButton id="spots" label="Lieux" current={tab} icon={<MapPin className="size-5" />} onClick={setTab} />
                <button type="button" data-act="tonight" {...bindTap(openTonight)} className="hit relative -mt-5 flex flex-col items-center pb-1">
                  <span className="relative flex size-14 items-center justify-center rounded-full bg-signal text-night">
                    {tonight ? (
                      <span className="font-display text-sm font-bold">{remainingLabel(tonight.expiresAt, now).replace(" ", "")}</span>
                    ) : (
                      <span className="size-3 rounded-full bg-night" />
                    )}
                    {tonight && <span className="ping-ring rounded-full" />}
                  </span>
                  <span className="mt-1 text-xs">{tonight ? "En ligne" : "Connexion"}</span>
                </button>
                <DockButton
                  id="inbox"
                  label="Messages"
                  current={tab}
                  badge={unread > 0}
                  icon={<MessageCircle className="size-5" />}
                  onClick={setTab}
                />
                <DockButton id="me" label="Réglages" current={tab} icon={<Settings className="size-5" />} onClick={setTab} />
              </nav>
            </>
          )}
          <Sheets />
          <Celebrate />
        </section>
      </div>
    </>
  );
}

function DockButton({
  id,
  label,
  current,
  icon,
  badge,
  onClick,
}: {
  id: Tab;
  label: string;
  current: Tab;
  icon: ReactNode;
  badge?: boolean;
  onClick: (tab: Tab) => void;
}) {
  const on = current === id;
  return (
    <button
      type="button"
      aria-current={on ? "page" : undefined}
      data-act="tab"
      data-id={id}
      {...bindTap(() => onClick(id))}
      className={cn("hit relative flex h-14 flex-col items-center justify-center gap-1 text-xs", on ? "text-ink" : "text-muted")}
    >
      {icon}
      {label}
      {badge && <span className="absolute top-2 right-5 size-2 rounded-full bg-signal" />}
    </button>
  );
}
