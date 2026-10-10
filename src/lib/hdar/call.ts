import { create } from "zustand";
import { toast } from "sonner";
import { deviceId } from "./device";
import { pollSignals, sendSignal, type SignalRow } from "./live";

/**
 * One-to-one video calls over WebRTC. Signaling (offer / answer / hangup) goes
 * through the shared database; media then flows directly between the two
 * browsers. ICE candidates are gathered up front and shipped inside the SDP, so
 * three signals are enough for a call.
 */

export type CallPhase = "idle" | "calling" | "ringing" | "connecting" | "in-call";

type CallState = {
  phase: CallPhase;
  peerId: string;
  peerPseudo: string;
  local: MediaStream | null;
  remote: MediaStream | null;
  micOn: boolean;
  camOn: boolean;
};

export const useCall = create<CallState>(() => ({
  phase: "idle",
  peerId: "",
  peerPseudo: "",
  local: null,
  remote: null,
  micOn: true,
  camOn: true,
}));

function iceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  ];
  const turn = import.meta.env.VITE_TURN_URL as string | undefined;
  if (turn) {
    servers.push({
      urls: turn.split(","),
      username: import.meta.env.VITE_TURN_USER as string | undefined,
      credential: import.meta.env.VITE_TURN_PASS as string | undefined,
    });
  }
  return servers;
}

let pc: RTCPeerConnection | null = null;
let pendingOffer = "";
let ringTimer = 0;
let dropTimer = 0;

function reset() {
  window.clearTimeout(ringTimer);
  window.clearTimeout(dropTimer);
  pc?.close();
  pc = null;
  pendingOffer = "";
  useCall.getState().local?.getTracks().forEach((t) => t.stop());
  useCall.setState({ phase: "idle", peerId: "", peerPseudo: "", local: null, remote: null, micOn: true, camOn: true });
}

async function openCamera(): Promise<MediaStream | null> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      audio: { echoCancellation: true, noiseSuppression: true },
    });
  } catch {
    toast("Caméra ou micro refusé. Autorise-les dans ton navigateur.");
    return null;
  }
}

function makePeer(local: MediaStream) {
  const conn = new RTCPeerConnection({ iceServers: iceServers() });
  local.getTracks().forEach((t) => conn.addTrack(t, local));
  conn.ontrack = (e) => {
    const stream = e.streams[0] ?? new MediaStream([e.track]);
    useCall.setState({ remote: stream });
  };
  conn.onconnectionstatechange = () => {
    if (conn !== pc) return;
    const state = conn.connectionState;
    if (state === "connected") {
      window.clearTimeout(dropTimer);
      useCall.setState({ phase: "in-call" });
    } else if (state === "failed") {
      toast("Connexion vidéo impossible sur ce réseau");
      hangUp();
    } else if (state === "disconnected") {
      window.clearTimeout(dropTimer);
      dropTimer = window.setTimeout(() => {
        if (pc === conn && conn.connectionState !== "connected") {
          toast("Appel coupé");
          hangUp();
        }
      }, 8000);
    }
  };
  return conn;
}

function gathered(conn: RTCPeerConnection) {
  if (conn.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => {
      conn.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => {
      if (conn.iceGatheringState === "complete") done();
    };
    conn.addEventListener("icegatheringstatechange", check);
    window.setTimeout(done, 3000);
  });
}

export async function startCall(peerId: string, peerPseudo: string) {
  if (useCall.getState().phase !== "idle") return;
  if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === "undefined") {
    toast("Ton navigateur ne gère pas la vidéo");
    return;
  }
  useCall.setState({ phase: "calling", peerId, peerPseudo });
  const local = await openCamera();
  if (!local || useCall.getState().phase !== "calling") {
    local?.getTracks().forEach((t) => t.stop());
    reset();
    return;
  }
  useCall.setState({ local });
  const conn = makePeer(local);
  pc = conn;
  try {
    await conn.setLocalDescription(await conn.createOffer());
    await gathered(conn);
    if (pc !== conn) return;
    await sendSignal(deviceId(), peerId, "offer", JSON.stringify(conn.localDescription));
  } catch (err) {
    toast(err instanceof Error ? err.message : "Appel impossible");
    reset();
    return;
  }
  ringTimer = window.setTimeout(() => {
    if (useCall.getState().phase === "calling") {
      toast("Pas de réponse");
      hangUp();
    }
  }, 40000);
}

export async function acceptCall() {
  const { phase, peerId } = useCall.getState();
  if (phase !== "ringing" || !pendingOffer) return;
  useCall.setState({ phase: "connecting" });
  const local = await openCamera();
  if (!local || useCall.getState().phase !== "connecting") {
    local?.getTracks().forEach((t) => t.stop());
    if (!local) hangUp();
    return;
  }
  useCall.setState({ local });
  const conn = makePeer(local);
  pc = conn;
  try {
    await conn.setRemoteDescription(JSON.parse(pendingOffer) as RTCSessionDescriptionInit);
    await conn.setLocalDescription(await conn.createAnswer());
    await gathered(conn);
    if (pc !== conn) return;
    await sendSignal(deviceId(), peerId, "answer", JSON.stringify(conn.localDescription));
  } catch {
    toast("Appel impossible");
    hangUp();
  }
}

export function hangUp() {
  const { peerId, phase } = useCall.getState();
  if (peerId && phase !== "idle") void sendSignal(deviceId(), peerId, "hangup").catch(() => undefined);
  reset();
}

export function toggleMic() {
  const { local, micOn } = useCall.getState();
  local?.getAudioTracks().forEach((t) => (t.enabled = !micOn));
  useCall.setState({ micOn: !micOn });
}

export function toggleCam() {
  const { local, camOn } = useCall.getState();
  local?.getVideoTracks().forEach((t) => (t.enabled = !camOn));
  useCall.setState({ camOn: !camOn });
}

async function onSignal(row: SignalRow) {
  const state = useCall.getState();
  if (row.kind === "offer") {
    if (state.phase === "idle") {
      pendingOffer = row.payload;
      useCall.setState({ phase: "ringing", peerId: row.from_id, peerPseudo: row.pseudo });
      navigator.vibrate?.([300, 200, 300]);
      ringTimer = window.setTimeout(() => {
        if (useCall.getState().phase === "ringing") reset();
      }, 40000);
    } else if (row.from_id !== state.peerId) {
      // Already busy: tell the other caller.
      void sendSignal(deviceId(), row.from_id, "hangup").catch(() => undefined);
    }
    return;
  }
  if (row.from_id !== state.peerId) return;
  if (row.kind === "answer" && state.phase === "calling" && pc) {
    window.clearTimeout(ringTimer);
    useCall.setState({ phase: "connecting" });
    try {
      await pc.setRemoteDescription(JSON.parse(row.payload) as RTCSessionDescriptionInit);
    } catch {
      toast("Appel impossible");
      hangUp();
    }
  } else if (row.kind === "hangup" && state.phase !== "idle") {
    toast(state.phase === "calling" ? "Appel refusé" : "Appel terminé");
    reset();
  }
}

/** Polls for call signals; returns a stop function. Faster while a call is being set up. */
export function watchSignals() {
  let stopped = false;
  let after = 0;
  let timer = 0;
  const tick = async () => {
    if (stopped) return;
    if (document.visibilityState === "visible" || useCall.getState().phase !== "idle") {
      try {
        const rows = await pollSignals(deviceId(), after);
        for (const row of rows) {
          after = Math.max(after, Number(row.id));
          await onSignal(row);
        }
      } catch {
        // offline or not yet onboarded: try again next tick
      }
    }
    const phase = useCall.getState().phase;
    timer = window.setTimeout(tick, phase === "calling" || phase === "connecting" ? 1000 : 3000);
  };
  void tick();
  return () => {
    stopped = true;
    window.clearTimeout(timer);
  };
}
