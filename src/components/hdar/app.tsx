import { resyncProfileFromServer } from "@/lib/hdar/recover";
import { SurprisePopup } from "./growth";
import { IntroVideo } from "./intro-video";
import { useActivity, useActivityPolling } from "@/lib/hdar/activity";
import { GiftNotices } from "./gift-notices";
import { useEffect, type ReactNode } from "react";
import { MessageCircle, Radar, UserRound, MapPin } from "lucide-react";
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
import { useConversationsSync, useHeartbeat, useProfileSync } from "@/lib/hdar/sync";
import { CallLayer } from "./call-layer";
import { ConfirmSheet } from "./confirm-sheet";
import { ReportSheet } from "./report-sheet";
import { PushPrompt } from "./push-prompt";
import { InstallPrompt } from "./install-prompt";
import { ProfileView } from "./profile-view";
import { SpotRoom, Spots, useLiveSpotsSync } from "./spots";
import { bindTap, installTouchTap } from "./tap";

export function App() {
  const cover = useHdar((s) => s.cover);
  const tab = useHdar((s) => s.tab);
  useActivityPolling();
  const act = useActivity();
  const view = useHdar((s) => s.view);
  const setTab = useHdar((s) => s.setTab);
  const openTonight = useHdar((s) => s.openTonight);
  const me = useHdar((s) => s.me);
  const now = useHdar((s) => s.now);
  const liveConvos = useHdar((s) => s.liveConvos);
  const seenAt = useHdar((s) => s.seenAt);
  const unread = liveConvos.filter((c) => !c.lastMine && c.lastAt > (seenAt[c.otherId] ?? 0)).length;
  const tonight = me.tonight && !isExpired(me.tonight.expiresAt, now) ? me.tonight : null;
  useLiveSpotsSync();
  useProfileSync();
  useConversationsSync();
  const banned = useHeartbeat();

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

  useEffect(() => { void resyncProfileFromServer().then((reload) => { if (reload) window.location.reload(); }); }, []);

  if (banned) {
    return (
      <main className="flex h-dvh flex-col items-center justify-center gap-3 bg-night px-8 text-center text-ink">
        <Mark className="size-12" />
        <h1 className="font-display text-2xl font-extrabold">Compte suspendu</h1>
        <p className="text-sm text-muted">
          Ton profil a été suspendu suite à des signalements. Tu ne peux plus utiliser hdar sur cet appareil.
        </p>
      </main>
    );
  }

  return (
    <>
      <Toaster theme="dark" position="top-center" />
      <CallLayer />
      <GiftNotices />
      <SurprisePopup />
      <ConfirmSheet />
      <ReportSheet />
      <PushPrompt />
      <InstallPrompt />
      <IntroVideo />
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
              <li>Le chat du quartier réunit les gens autour.</li>
            </ul>
          </div>
          <p className="text-xs text-muted">Distances arrondies · position exacte jamais publiée</p>
        </aside>
        <section className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-night">
          {view.name === "chat" ? (
            <Chat />
          ) : view.name === "live" ? (
            <LiveChat userId={view.userId} pseudo={view.pseudo} />
          ) : view.name === "profile" ? (
            <ProfileView userId={view.userId} pseudo={view.pseudo} />
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
                <DockButton id="spots" label="Lieux" current={tab} badge={act.unread.size + act.fresh.size + act.places.size > 0} icon={<MapPin className="size-5" />} onClick={setTab} />
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
                <DockButton id="me" label="Profil" current={tab} icon={<UserRound className="size-5" />} onClick={setTab} />
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
