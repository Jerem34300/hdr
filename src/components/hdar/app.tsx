import { useAppearance } from "@/lib/hdar/appearance";
import { botSeen } from "@/lib/hdar/live";
import { LeaveConfirm } from "./rich-text";
import "@/lib/hdar/appearance";
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
import { MapTips } from "./map-tips";
import { ProfileReminder } from "./profile-reminder";
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
import { VisibilityButton } from "./visibility-button";
import { track } from "@/lib/hdar/track";
import { SalonRoom } from "./salons";
import { Annonces } from "./annonces";
import { useSalonInbox, useSalonInboxPolling } from "@/lib/hdar/salon-inbox";

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
  useSalonInboxPolling();
  const salonUnread = useSalonInbox().unread;
  const unread = liveConvos.filter((c) => !c.lastMine && c.lastAt > (seenAt[c.otherId] ?? 0)).length + salonUnread;
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

  // Parcours anonyme (admin « Visiteurs ») : onglets, écrans et fenêtres ouverts.
  useEffect(() => {
    track("app");
    if (useHdar.getState().me.onboarded) {
      track("has_profile");
      // Visite pour les relances du robot + préférence serveur « Messages du robot hdar ».
      void botSeen().then((r) => { if (r && typeof r.bot_msgs === "boolean") useAppearance.getState().set({ botMsgs: r.bot_msgs }); }).catch(() => undefined);
    }
    const note = (st: ReturnType<typeof useHdar.getState>) => {
      if (st.view.name === "tabs") track(`tab:${st.tab}`);
      else track(`view:${st.view.name}`);
      if (st.sheet) track(`sheet:${typeof st.sheet === "string" ? st.sheet : st.sheet.type}`);
    };
    note(useHdar.getState());
    return useHdar.subscribe((st, prev) => {
      if (st.tab !== prev.tab || st.view !== prev.view || st.sheet !== prev.sheet) note(st);
    });
  }, []);

  // Liens directs vers les annonces : /?annonces=1, /?annonce=<id> (citation, retour de paiement).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.has("annonces") || q.get("annonce")) useHdar.getState().openAnnonces(q.get("annonce"));
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
      <LeaveConfirm />
      <SurprisePopup />
      <ConfirmSheet />
      <ReportSheet />
      <PushPrompt />
      <ProfileReminder />
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
              Discrets,
              <br />
              tout près.
            </p>
            <ul className="mt-8 space-y-3 text-sm text-muted">
              <li>La carte montre qui est visible.</li>
              <li>Un profil ouvre une discussion privée.</li>
              <li>Le chat du quartier réunit les gens autour.</li>
            </ul>
          </div>
          <p className="text-xs text-muted">Distances arrondies · position exacte jamais publiée</p>
        </aside>
        <section data-tip-root className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-night">
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
          ) : view.name === "annonces" ? (
            <Annonces focus={view.focus} />
          ) : view.name === "salon" ? (
            <SalonRoom id={view.id} name={view.title} />
          ) : (
            <>
              {tab === "around" && <Around />}
              {tab === "spots" && <Spots />}
              {tab === "inbox" && <Inbox />}
              {tab === "me" && <Me />}
              {tab === "around" && <MapTips />}
              <nav className="dock relative z-20 grid shrink-0 grid-cols-5 items-end border-t border-line bg-night px-1 pt-1">
                <DockButton id="around" label="Carte" current={tab} icon={<Radar className="size-5" />} onClick={setTab} />
                <DockButton id="spots" label="Lieux" tip="spots" current={tab} badge={act.unread.size + act.fresh.size + act.places.size > 0} icon={<MapPin className="size-5" />} onClick={setTab} />
                <VisibilityButton visible={!!tonight} label={tonight ? remainingLabel(tonight.expiresAt, now).replace(" ", "") : undefined} bind={bindTap(openTonight)} />
                <DockButton
                  id="inbox"
                  label="Messages"
                  current={tab}
                  badge={unread}
                  icon={<MessageCircle className="size-5" />}
                  onClick={setTab}
                />
                <DockButton id="me" label="Profil" tip="me" current={tab} icon={<UserRound className="size-5" />} onClick={setTab} />
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
  tip,
  onClick,
}: {
  id: Tab;
  label: string;
  current: Tab;
  icon: ReactNode;
  badge?: boolean | number;
  tip?: string;
  onClick: (tab: Tab) => void;
}) {
  const on = current === id;
  return (
    <button
      type="button"
      aria-current={on ? "page" : undefined}
      data-act="tab"
      data-id={id}
      {...(tip ? { "data-tip": tip } : {})}
      {...bindTap(() => onClick(id))}
      className={cn("hit relative flex h-14 flex-col items-center justify-center gap-1 text-xs", on ? "text-ink" : "text-muted")}
    >
      {icon}
      {label}
      {typeof badge === "number" ? (
        badge > 0 && (
          <span className="absolute top-1 right-3 flex h-5 min-w-5 items-center justify-center rounded-full bg-signal px-1 text-[11px] font-bold text-night">
            {badge > 99 ? "99+" : badge}
          </span>
        )
      ) : (
        badge && <span className="absolute top-2 right-5 size-2 rounded-full bg-signal" />
      )}
    </button>
  );
}
