import { Component, type ReactNode } from "react";

/** Contains a crash inside an optional panel (sheet, layer) instead of resetting the whole app. */
export class Safe extends Component<{ children: ReactNode; onError?: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error("[hdar] panel error", error);
    this.props.onError?.();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
