/**
 * Floutage à la source : la caméra est redessinée en très basse définition (pixels étalés) sur un canvas,
 * et c'est CE flux qui est envoyé. L'image nette ne quitte jamais le téléphone tant qu'on est flouté.
 * Marche partout (pas besoin de ctx.filter, absent de vieux Safari).
 */
export type BlurPipe = { track: MediaStreamTrack; setSource: (s: MediaStream) => void; stop: () => void };

export function createBlurPipe(src: MediaStream, fps = 15): BlurPipe {
  const video = document.createElement("video");
  video.muted = true; video.playsInline = true; video.autoplay = true;
  const tiny = document.createElement("canvas"); tiny.width = 20; tiny.height = 15;
  const out = document.createElement("canvas"); out.width = 320; out.height = 240;
  const tctx = tiny.getContext("2d")!; const octx = out.getContext("2d")!;
  octx.fillStyle = "#14141c"; octx.fillRect(0, 0, out.width, out.height);
  const setSource = (s: MediaStream) => { video.srcObject = new MediaStream(s.getVideoTracks()); void video.play().catch(() => undefined); };
  setSource(src);
  const timer = window.setInterval(() => {
    if (video.readyState < 2) return;
    const vw = video.videoWidth || 4, vh = video.videoHeight || 3;
    if (out.width / out.height !== vw / vh) { out.height = Math.round((out.width * vh) / vw); tiny.height = Math.max(8, Math.round((tiny.width * vh) / vw)); }
    tctx.drawImage(video, 0, 0, tiny.width, tiny.height);
    octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = "high";
    octx.drawImage(tiny, 0, 0, out.width, out.height);
  }, 1000 / fps);
  const track = out.captureStream(fps).getVideoTracks()[0];
  return { track, setSource, stop: () => { window.clearInterval(timer); track.stop(); video.srcObject = null; } };
}
