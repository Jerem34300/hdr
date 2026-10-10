import { create } from "zustand";
import { toast } from "sonner";
import { deviceId } from "./device";
import { reportWithReason } from "./live";

export const REPORT_REASONS = [
  "Faux profil",
  "Harcèlement ou insultes",
  "Photos choquantes",
  "Semble mineur",
  "Arnaque ou spam",
  "Autre",
] as const;

type Ask = { pseudo: string; resolve: (reason: string | null) => void };
export const useReport = create<{ ask: Ask | null }>(() => ({ ask: null }));

export function answerReport(reason: string | null) {
  const current = useReport.getState().ask;
  useReport.setState({ ask: null });
  current?.resolve(reason);
}

/**
 * Asks why, then reports and blocks. `context` (e.g. the message being reported)
 * is attached so moderation can see what happened. Resolves true when sent.
 */
export async function reportUser(userId: string, pseudo: string, context = ""): Promise<boolean> {
  useReport.getState().ask?.resolve(null);
  const reason = await new Promise<string | null>((resolve) =>
    useReport.setState({ ask: { pseudo, resolve } }),
  );
  if (!reason) return false;
  const full = context ? `${reason} — « ${context.slice(0, 120)} »` : reason;
  try {
    await reportWithReason(deviceId(), userId, full);
    toast("Signalé. La personne est bloquée et l'équipe va regarder.");
    return true;
  } catch (err) {
    toast(err instanceof Error ? err.message : "Signalement impossible");
    return false;
  }
}
