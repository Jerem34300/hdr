import { create } from "zustand";

type Ask = { title: string; body?: string; confirm: string; danger?: boolean };

type ConfirmState = { ask: (Ask & { resolve: (ok: boolean) => void }) | null };

export const useConfirm = create<ConfirmState>(() => ({ ask: null }));

/** In-app confirmation sheet (instead of the browser's native dialog). Resolves true on confirm. */
export function askConfirm(ask: Ask): Promise<boolean> {
  useConfirm.getState().ask?.resolve(false);
  return new Promise((resolve) => useConfirm.setState({ ask: { ...ask, resolve } }));
}

export function answerConfirm(ok: boolean) {
  const current = useConfirm.getState().ask;
  useConfirm.setState({ ask: null });
  current?.resolve(ok);
}
