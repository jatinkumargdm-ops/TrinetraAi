import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import {
  detectFrame,
  loadModels,
  type FaceInfo,
} from "../lib/detection";
import { CentroidTracker, flowDirection, type Track } from "../lib/tracker";
import { beepCritical, beepWarn, unlockAudio } from "../lib/audio";
import { createReceiver, type ReceiverHandle } from "../lib/phoneLink";
import { Brand, type SourceConfig } from "./Landing";
import { ThemeToggle } from "../components/ThemeToggle";

type Tier = "SAFE" | "MODERATE" | "HIGH" | "STAMPEDE";

const TIER_COLOR: Record<Tier, string> = {
  SAFE: "#10b981",
  MODERATE: "#f59e0b",
  HIGH: "#ef4444",
  STAMPEDE: "#b91c1c",
};

const TIER_LABEL: Record<Tier, string> = {
  SAFE: "Safe",
  MODERATE: "Watch",
  HIGH: "High risk",
  STAMPEDE: "Stampede risk",
};

function heatColor(v: number): [number, number, number, number] {
  // 0..1 → blue → cyan → yellow → red, with alpha that grows
  const t = Math.max(0, Math.min(1, v));
  let r: number, g: number, b: number;
  if (t < 0.25) {
    const u = t / 0.25;
    r = 30; g = Math.round(120 + 80 * u); b = 240;
  } else if (t < 0.5) {
    const u = (t - 0.25) / 0.25;
    r = Math.round(30 + (255 - 30) * u);
    g = Math.round(200 + 30 * u);
    b = Math.round(240 - 240 * u);
  } else if (t < 0.75) {
    const u = (t - 0.5) / 0.25;
    r = 255;
    g = Math.round(230 - 130 * u);
    b = 0;
  } else {
    const u = (t - 0.75) / 0.25;
    r = 255;
    g = Math.round(100 - 100 * u);
    b = 0;
  }
  const a = Math.round(60 + 170 * t);
  return [r, g, b, a];
}

function tierFor(count: number, capacity: number): Tier {
  const r = count / Math.max(1, capacity);
  if (r >= 1.25) return "STAMPEDE";
  if (r >= 1.0) return "HIGH";
  if (r >= 0.6) return "MODERATE";
  return "SAFE";
}

type AlertItem = {
  id: number;
  ts: string;
  text: string;
  tone: "info" | "warn" | "danger";
};

type HistPoint = { t: number; count: number };

const MAX_HIST = 60;
const MAX_ALERTS = 30;
const FALL_ASPECT = 1.05;
const RUN_SPEED = 14;

export default function Dashboard({
  source,
  onChangeSource,
}: {
  source: SourceConfig;
  onChangeSource: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const heatCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const heatGridRef = useRef<Float32Array | null>(null);
  const heatGridSizeRef = useRef<{ w: number; h: number }>({ w: 80, h: 45 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const trackerRef = useRef(new CentroidTracker());
  const rafRef = useRef<number | null>(null);
  const detectingRef = useRef(false);
  const pausedRef = useRef(false);
  const alertIdRef = useRef(0);
  const lastTierRef = useRef<Tier>("SAFE");
  const lastRunAlertRef = useRef<Record<number, number>>({});
  const lastFallAlertRef = useRef<Record<number, number>>({});
  const facesRef = useRef<FaceInfo[]>([]);
  const frameCountRef = useRef(0);

  const [phase, setPhase] = useState<
    | "loading"
    | "starting"
    | "awaiting_phone"
    | "ready"
    | "error"
    | "no_camera"
  >("loading");
  const [phoneLink, setPhoneLink] = useState<{
    peerId: string;
    url: string;
    qrDataUrl: string;
  } | null>(null);
  const [loadingMsg, setLoadingMsg] = useState("Warming up");
  const [errorMsg, setErrorMsg] = useState("");
  const [count, setCount] = useState(0);
  const [history, setHistory] = useState<HistPoint[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [capacity, setCapacity] = useState(10);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(false);
  const [flow, setFlow] = useState({
    label: "STATIC",
    angleDeg: 0,
    magnitude: 0,
  });
  const [demo, setDemo] = useState({
    avgAge: 0,
    male: 0,
    female: 0,
    masked: 0,
    faces: 0,
  });
  const [enter, setEnter] = useState(false);
  const [showHeat, setShowHeat] = useState(true);
  const [traffic, setTraffic] = useState({ entered: 0, left: 0 });
  const [recording, setRecording] = useState(false);
  const [recordCountdown, setRecordCountdown] = useState(0);
  const [dataHidden, setDataHidden] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordRafRef = useRef<number | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const recordCountdownTimerRef = useRef<number | null>(null);

  const tier = tierFor(count, capacity);
  const tierColor = TIER_COLOR[tier];

  const peak = history.reduce((m, p) => (p.count > m ? p.count : m), 0);

  // Trigger entry animation
  useEffect(() => {
    const id = requestAnimationFrame(() => setEnter(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const pushAlert = useCallback(
    (text: string, tone: AlertItem["tone"]) => {
      setAlerts((prev) =>
        [
          {
            id: ++alertIdRef.current,
            ts: new Date().toLocaleTimeString("en-US", { hour12: false }),
            text,
            tone,
          },
          ...prev,
        ].slice(0, MAX_ALERTS),
      );
    },
    [],
  );

  // Boot
  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let imageObjUrl: string | null = null;
    let videoObjUrl: string | null = null;
    let receiver: ReceiverHandle | null = null;

    const startWithStream = async (incoming: MediaStream) => {
      if (cancelled) {
        incoming.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = incoming;
      const v = videoRef.current!;
      v.srcObject = incoming;
      try {
        await v.play();
      } catch {
        // Autoplay rejection is fine, user interaction will resume.
      }
      await waitForVideoReady(v);
      if (cancelled) return;
      syncCanvas(v.videoWidth, v.videoHeight);
      setPhase("ready");
      detectingRef.current = true;
      loop();
    };

    (async () => {
      try {
        await loadModels((m) => !cancelled && setLoadingMsg(m));
        if (cancelled) return;

        setPhase("starting");
        setLoadingMsg("Connecting source");

        if (source.kind === "webcam") {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          });
          if (cancelled) {
            stream.getTracks().forEach((t) => t.stop());
            return;
          }
          const v = videoRef.current!;
          v.srcObject = stream;
          await v.play();
          await waitForVideoReady(v);
          syncCanvas(v.videoWidth, v.videoHeight);
          setPhase("ready");
          pushAlert("Webcam connected", "info");
          detectingRef.current = true;
          loop();
        } else if (source.kind === "phone") {
          setPhase("awaiting_phone");
          setLoadingMsg("Waiting for phone");
          receiver = createReceiver({
            onReady: async (peerId) => {
              if (cancelled) return;
              const url = `${window.location.origin}${window.location.pathname}?broadcast=${encodeURIComponent(peerId)}`;
              try {
                const qrDataUrl = await QRCode.toDataURL(url, {
                  width: 360,
                  margin: 1,
                  color: { dark: "#2b1d0e", light: "#fbf3dd" },
                });
                if (cancelled) return;
                setPhoneLink({ peerId, url, qrDataUrl });
              } catch {
                if (cancelled) return;
                setPhoneLink({ peerId, url, qrDataUrl: "" });
              }
            },
            onPeerConnect: () => {
              if (cancelled) return;
              pushAlert("Phone camera connected", "info");
            },
            onStream: (s) => {
              void startWithStream(s);
            },
            onPeerDisconnect: () => {
              if (cancelled) return;
              pushAlert("Phone camera disconnected", "warn");
            },
            onError: (msg) => {
              if (cancelled) return;
              setErrorMsg(msg);
              setPhase("error");
            },
          });
        } else if (source.kind === "video") {
          videoObjUrl = URL.createObjectURL(source.file);
          const v = videoRef.current!;
          v.src = videoObjUrl;
          v.loop = true;
          v.muted = true;
          await v.play();
          await waitForVideoReady(v);
          syncCanvas(v.videoWidth, v.videoHeight);
          setPhase("ready");
          pushAlert(`Playing ${source.file.name}`, "info");
          detectingRef.current = true;
          loop();
        } else {
          imageObjUrl = URL.createObjectURL(source.file);
          const img = imageRef.current!;
          img.src = imageObjUrl;
          await waitForImageReady(img);
          syncCanvas(img.naturalWidth, img.naturalHeight);
          setPhase("ready");
          pushAlert(`Analysing ${source.file.name}`, "info");
          // Single shot
          await runImageOnce();
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const lower = msg.toLowerCase();
        if (
          source.kind === "webcam" &&
          (lower.includes("permission") ||
            lower.includes("denied") ||
            lower.includes("not allowed") ||
            lower.includes("not found"))
        ) {
          setPhase("no_camera");
        } else {
          setPhase("error");
        }
        setErrorMsg(msg);
      }
    })();

    return () => {
      cancelled = true;
      detectingRef.current = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (imageObjUrl) URL.revokeObjectURL(imageObjUrl);
      if (videoObjUrl) URL.revokeObjectURL(videoObjUrl);
      if (receiver) {
        try {
          receiver.destroy();
        } catch {}
      }
      setPhoneLink(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  function syncCanvas(w: number, h: number) {
    const c = canvasRef.current;
    if (!c) return;
    c.width = w || 1280;
    c.height = h || 720;
  }

  async function runImageOnce() {
    const img = imageRef.current;
    if (!img) return;
    const det = await detectFrame(img, true);
    facesRef.current = det.faces;
    drawOverlay(img.naturalWidth, img.naturalHeight, det.personBoxes, det.faces, []);
    setCount(det.personBoxes.length);
    updateDemographics(det.faces);
  }

  const loop = useCallback(async () => {
    if (!detectingRef.current) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || v.readyState < 2) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }
    if (pausedRef.current) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    try {
      frameCountRef.current++;
      const runFaces = frameCountRef.current % 3 === 0; // throttle face model
      const det = await detectFrame(v, runFaces);
      if (runFaces) facesRef.current = det.faces;

      // Track
      const tracks = trackerRef.current.update(det.personBoxes);
      const fl = flowDirection(tracks);
      setFlow({ label: fl.label, angleDeg: fl.angleDeg, magnitude: fl.magnitude });
      setTraffic({
        entered: trackerRef.current.enteredTotal,
        left: trackerRef.current.leftTotal,
      });

      // Behavior detection
      checkBehaviour(tracks);

      // Update + draw heatmap
      updateHeatmap(v.videoWidth, v.videoHeight, det.personBoxes);
      drawHeatmap();

      // Render overlay
      drawOverlay(v.videoWidth, v.videoHeight, det.personBoxes, facesRef.current, tracks);

      setCount(det.personBoxes.length);
      setHistory((prev) =>
        [...prev, { t: Date.now(), count: det.personBoxes.length }].slice(
          -MAX_HIST,
        ),
      );
      if (runFaces) updateDemographics(facesRef.current);
    } catch {
      /* swallow per-frame errors */
    }

    rafRef.current = requestAnimationFrame(loop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function ensureHeatGrid() {
    const { w, h } = heatGridSizeRef.current;
    if (!heatGridRef.current || heatGridRef.current.length !== w * h) {
      heatGridRef.current = new Float32Array(w * h);
    }
    return heatGridRef.current;
  }

  function updateHeatmap(
    vw: number,
    vh: number,
    boxes: [number, number, number, number][],
  ) {
    const grid = ensureHeatGrid();
    const { w: gw, h: gh } = heatGridSizeRef.current;
    // Decay
    for (let i = 0; i < grid.length; i++) grid[i] *= 0.965;
    // Stamp around centroids
    for (const b of boxes) {
      const [x, y, w, h] = b;
      const cx = ((x + w / 2) / vw) * gw;
      const cy = ((y + h / 2) / vh) * gh;
      const radius = 3;
      for (let yy = -radius; yy <= radius; yy++) {
        for (let xx = -radius; xx <= radius; xx++) {
          const gx = Math.round(cx + xx);
          const gy = Math.round(cy + yy);
          if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) continue;
          const d2 = xx * xx + yy * yy;
          const v = Math.exp(-d2 / 4) * 0.6;
          const idx = gy * gw + gx;
          grid[idx] = Math.min(1, grid[idx] + v);
        }
      }
    }
  }

  function drawHeatmap() {
    const c = heatCanvasRef.current;
    if (!c) return;
    const { w: gw, h: gh } = heatGridSizeRef.current;
    const grid = heatGridRef.current;
    if (!grid) return;
    if (c.width !== gw || c.height !== gh) {
      c.width = gw;
      c.height = gh;
    }
    const ctx = c.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(gw, gh);
    for (let i = 0; i < grid.length; i++) {
      const v = grid[i];
      const o = i * 4;
      if (v < 0.05) {
        img.data[o + 3] = 0;
        continue;
      }
      const [r, g, b, a] = heatColor(v);
      img.data[o] = r;
      img.data[o + 1] = g;
      img.data[o + 2] = b;
      img.data[o + 3] = a;
    }
    ctx.putImageData(img, 0, 0);
  }

  async function handleSnapshot() {
    const v = videoRef.current;
    const img = imageRef.current;
    const overlay = canvasRef.current;
    const heat = heatCanvasRef.current;
    const isImg = source.kind === "image";
    const srcEl = isImg ? img : v;
    if (!srcEl || !overlay) return;
    const w = isImg ? img!.naturalWidth : v!.videoWidth;
    const h = isImg ? img!.naturalHeight : v!.videoHeight;
    if (!w || !h) return;
    const footer = 110;
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h + footer;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#2b1d0e";
    ctx.fillRect(0, 0, w, h + footer);
    ctx.drawImage(srcEl as CanvasImageSource, 0, 0, w, h);
    if (showHeat && heat) {
      ctx.globalAlpha = 0.55;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(heat, 0, 0, w, h);
      ctx.globalAlpha = 1;
    }
    ctx.drawImage(overlay, 0, 0, w, h);

    // Footer panel
    const grad = ctx.createLinearGradient(0, h, w, h + footer);
    grad.addColorStop(0, "#2b1d0e");
    grad.addColorStop(1, "#740001");
    ctx.fillStyle = grad;
    ctx.fillRect(0, h, w, footer);
    ctx.fillStyle = "#fff";
    ctx.font = "700 28px Inter, sans-serif";
    ctx.fillText("TRINETRA AI · Crowd snapshot", 24, h + 38);
    ctx.font = "500 18px Inter, sans-serif";
    const stampTime = new Date().toLocaleString();
    const stats =
      `People: ${count}   ·   Safety: ${TIER_LABEL[tier]}   ·   Capacity: ${capacity}   ·   ` +
      `Entered: ${traffic.entered}   ·   Left: ${traffic.left}`;
    const demoLine =
      demo.faces > 0
        ? `Avg age ${Math.round(demo.avgAge)}  ·  Men ${Math.round(demo.male)}%  ·  Women ${Math.round(demo.female)}%  ·  Masks ${Math.round(demo.masked)}%`
        : `Faces not yet detected`;
    ctx.fillText(stats, 24, h + 66);
    ctx.font = "500 14px Inter, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.fillText(demoLine, 24, h + 90);
    ctx.fillText(stampTime, w - 24 - ctx.measureText(stampTime).width, h + 90);

    out.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trinetra-snapshot-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      pushAlert("Snapshot saved", "info");
    }, "image/png");
  }

  function startRecording() {
    if (recording) return;
    const v = videoRef.current;
    const img = imageRef.current;
    const overlay = canvasRef.current;
    const heat = heatCanvasRef.current;
    const isImg = source.kind === "image";
    const srcEl = isImg ? img : v;
    if (!srcEl || !overlay) {
      pushAlert("Nothing to record yet", "warn");
      return;
    }
    const w = isImg ? img!.naturalWidth : v!.videoWidth;
    const h = isImg ? img!.naturalHeight : v!.videoHeight;
    if (!w || !h) {
      pushAlert("Source not ready", "warn");
      return;
    }

    const footer = 110;
    const out = document.createElement("canvas");
    out.width = w;
    out.height = h + footer;
    const ctx = out.getContext("2d");
    if (!ctx) return;

    const startedAt = Date.now();

    const drawFrame = () => {
      ctx.fillStyle = "#2b1d0e";
      ctx.fillRect(0, 0, w, h + footer);
      try {
        ctx.drawImage(srcEl as CanvasImageSource, 0, 0, w, h);
      } catch {
        // video not yet decoded
      }
      if (showHeat && heat) {
        ctx.globalAlpha = 0.55;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(heat, 0, 0, w, h);
        ctx.globalAlpha = 1;
      }
      ctx.drawImage(overlay, 0, 0, w, h);

      // Footer banner
      const grad = ctx.createLinearGradient(0, h, w, h + footer);
      grad.addColorStop(0, "#2b1d0e");
      grad.addColorStop(1, "#740001");
      ctx.fillStyle = grad;
      ctx.fillRect(0, h, w, footer);

      // REC dot
      ctx.beginPath();
      ctx.fillStyle = "#ef4444";
      ctx.arc(w - 30, h + 26, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "700 14px Inter, sans-serif";
      ctx.fillText("REC", w - 70, h + 31);

      ctx.fillStyle = "#fff";
      ctx.font = "700 26px Inter, sans-serif";
      ctx.fillText("TRINETRA AI · Incident clip", 24, h + 36);
      ctx.font = "500 17px Inter, sans-serif";
      const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
      ctx.fillText(
        `People ${count}   ·   Safety ${TIER_LABEL[tier]}   ·   Capacity ${capacity}   ·   Entered ${traffic.entered}   ·   Left ${traffic.left}   ·   t=${elapsed}s`,
        24,
        h + 66,
      );
      ctx.font = "500 14px Inter, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      const demoLine =
        demo.faces > 0
          ? `Avg age ${Math.round(demo.avgAge)}  ·  Men ${Math.round(demo.male)}%  ·  Women ${Math.round(demo.female)}%  ·  Masks ${Math.round(demo.masked)}%`
          : "Faces analysing…";
      ctx.fillText(demoLine, 24, h + 90);
      const stamp = new Date().toLocaleString();
      ctx.fillText(stamp, w - 24 - ctx.measureText(stamp).width, h + 90);

      recordRafRef.current = requestAnimationFrame(drawFrame);
    };
    drawFrame();

    let stream: MediaStream;
    try {
      stream = (out as HTMLCanvasElement).captureStream(30);
    } catch {
      pushAlert("Recording not supported on this browser", "warn");
      return;
    }
    let mime = "video/webm;codecs=vp9";
    if (
      typeof MediaRecorder === "undefined" ||
      !MediaRecorder.isTypeSupported(mime)
    ) {
      mime = "video/webm;codecs=vp8";
    }
    if (
      typeof MediaRecorder === "undefined" ||
      !MediaRecorder.isTypeSupported(mime)
    ) {
      mime = "video/webm";
    }
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType: mime });
    } catch {
      pushAlert("Recording not supported on this browser", "warn");
      return;
    }
    recorderRef.current = recorder;
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `trinetra-incident-${Date.now()}.webm`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      pushAlert("Incident clip saved (10s)", "info");
      if (recordRafRef.current) {
        cancelAnimationFrame(recordRafRef.current);
        recordRafRef.current = null;
      }
      stream.getTracks().forEach((t) => t.stop());
    };
    recorder.start(200);
    setRecording(true);
    setRecordCountdown(10);

    if (recordCountdownTimerRef.current)
      window.clearInterval(recordCountdownTimerRef.current);
    recordCountdownTimerRef.current = window.setInterval(() => {
      setRecordCountdown((c) => Math.max(0, c - 1));
    }, 1000);

    recordTimerRef.current = window.setTimeout(() => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
      setRecording(false);
      setRecordCountdown(0);
      if (recordCountdownTimerRef.current) {
        window.clearInterval(recordCountdownTimerRef.current);
        recordCountdownTimerRef.current = null;
      }
      recorderRef.current = null;
      recordTimerRef.current = null;
    }, 10_000);

    pushAlert("Recording 10-second incident clip", "info");
  }

  // Cleanup recording on unmount
  useEffect(() => {
    return () => {
      if (recordTimerRef.current) window.clearTimeout(recordTimerRef.current);
      if (recordCountdownTimerRef.current)
        window.clearInterval(recordCountdownTimerRef.current);
      if (recordRafRef.current) cancelAnimationFrame(recordRafRef.current);
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        try {
          recorderRef.current.stop();
        } catch {
          /* noop */
        }
      }
    };
  }, []);

  function handleMischiefManaged() {
    setDataHidden(true);
    // Fade out, then wipe the parchment
    window.setTimeout(() => {
      setAlerts([]);
      setHistory([]);
      setTraffic({ entered: 0, left: 0 });
      setDemo({ avgAge: 0, male: 0, female: 0, masked: 0, faces: 0 });
      setCount(0);
      if (heatGridRef.current) heatGridRef.current.fill(0);
      drawHeatmap();
      // Clear the bounding-box overlay
      const overlay = canvasRef.current;
      if (overlay) {
        const ctx = overlay.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, overlay.width, overlay.height);
      }
      pushAlert("Mischief Managed. The map is wiped.", "info");
    }, 600);
    window.setTimeout(() => setDataHidden(false), 1500);
  }

  function checkBehaviour(tracks: Track[]) {
    const now = Date.now();
    for (const t of tracks) {
      // Fall: aspect ratio (wider than tall) + sustained
      if (t.aspect > FALL_ASPECT && t.ageFrames > 4) {
        const last = lastFallAlertRef.current[t.id] || 0;
        if (now - last > 4000) {
          lastFallAlertRef.current[t.id] = now;
          pushAlert(`Possible fall detected (person #${t.id})`, "danger");
        }
      }
      // Running: high pixel speed
      if (t.speed > RUN_SPEED && t.ageFrames > 3) {
        const last = lastRunAlertRef.current[t.id] || 0;
        if (now - last > 3000) {
          lastRunAlertRef.current[t.id] = now;
          pushAlert(`Rapid movement detected (person #${t.id})`, "warn");
        }
      }
    }
  }

  function updateDemographics(faces: FaceInfo[]) {
    if (faces.length === 0) {
      setDemo((d) => ({ ...d, faces: 0 }));
      return;
    }
    let male = 0,
      female = 0,
      sumAge = 0,
      masked = 0;
    for (const f of faces) {
      if (f.gender === "male") male++;
      else female++;
      sumAge += f.age;
      if (f.masked) masked++;
    }
    setDemo({
      avgAge: sumAge / faces.length,
      male: (male / faces.length) * 100,
      female: (female / faces.length) * 100,
      masked: (masked / faces.length) * 100,
      faces: faces.length,
    });
  }

  function drawOverlay(
    vw: number,
    vh: number,
    boxes: [number, number, number, number][],
    faces: FaceInfo[],
    tracks: Track[],
  ) {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    if (c.width !== vw || c.height !== vh) {
      c.width = vw;
      c.height = vh;
    }
    ctx.clearRect(0, 0, c.width, c.height);

    const t = tierFor(boxes.length, capacity);
    const col = TIER_COLOR[t];

    // Person boxes
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = col;
    ctx.font = "600 14px Inter, sans-serif";
    for (const b of boxes) {
      const [x, y, w, h] = b;
      // soft rect
      ctx.strokeRect(x, y, w, h);
      // top-left chip
      const label = "Person";
      const tw = ctx.measureText(label).width + 12;
      ctx.fillStyle = col;
      ctx.fillRect(x, y - 20, tw, 20);
      ctx.fillStyle = "#fff";
      ctx.fillText(label, x + 6, y - 6);
    }

    // Faces (age/gender chips + mask indicator)
    ctx.font = "600 12px Inter, sans-serif";
    for (const f of faces) {
      const [x, y, w, h] = f.bbox;
      ctx.strokeStyle = f.masked ? "#740001" : "#b8860b";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, w, h);
      const label = `${Math.round(f.age)} ${f.gender === "male" ? "M" : "F"}${
        f.masked ? " · mask" : ""
      }`;
      const tw = ctx.measureText(label).width + 10;
      ctx.fillStyle = "rgba(15, 31, 61, 0.85)";
      ctx.fillRect(x, y + h, tw, 18);
      ctx.fillStyle = "#fff";
      ctx.fillText(label, x + 5, y + h + 13);
    }

    // Flow arrows (per-track velocity)
    ctx.strokeStyle = "rgba(29, 108, 243, 0.85)";
    ctx.fillStyle = "rgba(29, 108, 243, 0.85)";
    ctx.lineWidth = 2;
    for (const tr of tracks) {
      if (tr.speed < 1.5 || tr.ageFrames < 2) continue;
      const len = Math.min(40, tr.speed * 3);
      const ang = Math.atan2(tr.vy, tr.vx);
      const x1 = tr.cx, y1 = tr.cy;
      const x2 = x1 + Math.cos(ang) * len;
      const y2 = y1 + Math.sin(ang) * len;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      const ah = 6;
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - Math.cos(ang - 0.4) * ah, y2 - Math.sin(ang - 0.4) * ah);
      ctx.lineTo(x2 - Math.cos(ang + 0.4) * ah, y2 - Math.sin(ang + 0.4) * ah);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Tier transition alerts + beep
  useEffect(() => {
    if (phase !== "ready") return;
    if (lastTierRef.current === tier) return;
    const prev = lastTierRef.current;
    lastTierRef.current = tier;
    if (tier === "MODERATE" && prev === "SAFE") {
      pushAlert("Crowd density rising", "warn");
      if (!muted) beepWarn();
    } else if (tier === "HIGH") {
      pushAlert("High-risk density reached", "danger");
      if (!muted) beepCritical();
    } else if (tier === "STAMPEDE") {
      pushAlert("STAMPEDE-LEVEL density", "danger");
      if (!muted) beepCritical();
    } else if (tier === "SAFE" && prev !== "SAFE") {
      pushAlert("Density returned to safe range", "info");
    }
  }, [tier, phase, muted, pushAlert]);

  const togglePause = useCallback(() => {
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
    const v = videoRef.current;
    if (v) {
      if (pausedRef.current) v.pause();
      else void v.play();
    }
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      if (!next) unlockAudio();
      return next;
    });
  }, []);

  const handleChangeSource = useCallback(() => {
    detectingRef.current = false;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    onChangeSource();
  }, [onChangeSource]);

  const isImage = source.kind === "image";

  return (
    <div
      ref={containerRef}
      className="min-h-screen flex flex-col"
      style={{
        opacity: enter ? 1 : 0,
        transform: enter ? "translateY(0)" : "translateY(8px)",
        transition: "opacity 0.45s ease-out, transform 0.45s ease-out",
      }}
    >
      <TopBar
        onChangeSource={handleChangeSource}
        onTogglePause={togglePause}
        onToggleMute={toggleMute}
        onToggleHeat={() => setShowHeat((s) => !s)}
        onSnapshot={handleSnapshot}
        onRecord={startRecording}
        canSnapshot={phase === "ready"}
        canRecord={phase === "ready" && !recording}
        recording={recording}
        recordCountdown={recordCountdown}
        showHeat={showHeat}
        paused={paused}
        muted={muted}
        canPause={!isImage && phase === "ready"}
        statusLabel={
          phase === "loading"
            ? "Preparing"
            : phase === "starting"
              ? "Connecting"
              : phase === "awaiting_phone"
                ? "Awaiting phone"
                : phase === "ready"
                  ? paused
                    ? "Paused"
                    : "Live"
                  : phase === "no_camera"
                    ? "Camera blocked"
                    : "Issue"
        }
        statusColor={
          phase === "ready"
            ? paused
              ? "#f59e0b"
              : "#10b981"
            : phase === "no_camera" || phase === "error"
              ? "#ef4444"
              : phase === "awaiting_phone"
                ? "#b8860b"
                : "#740001"
        }
      />

      <main
        className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5 transition-all duration-500 ease-out"
        style={{
          opacity: dataHidden ? 0.05 : 1,
          filter: dataHidden ? "blur(6px)" : "blur(0)",
        }}
      >
        <section className="space-y-5">
          {/* Video / Image stage */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-[#d6c08a] flex items-center justify-between">
              <div>
                <div className="text-[11px] tracking-[0.18em] uppercase text-[#8a6f44]">
                  Scene
                </div>
                <div className="font-semibold text-[#2b1d0e]">
                  {source.kind === "webcam"
                    ? "Live camera"
                    : source.kind === "phone"
                      ? "Phone camera (Floo Link)"
                      : source.kind === "video"
                        ? `Video · ${source.file.name}`
                        : `Photo · ${source.file.name}`}
                </div>
              </div>
              <SafetyBadge tier={tier} color={tierColor} />
            </div>

            <div className="relative bg-[#2b1d0e] aspect-video lumos rounded-lg overflow-hidden">
              <video
                ref={videoRef}
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-contain"
                style={{ display: source.kind === "image" ? "none" : "block" }}
              />
              <img
                ref={imageRef}
                alt=""
                className="absolute inset-0 w-full h-full object-contain"
                style={{ display: source.kind === "image" ? "block" : "none" }}
              />
              <canvas
                ref={heatCanvasRef}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none transition-opacity duration-300"
                style={{
                  opacity: showHeat ? 0.55 : 0,
                  imageRendering: "auto",
                  mixBlendMode: "screen",
                }}
              />
              <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              />

              {recording && (
                <div
                  className="absolute top-3 left-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-white text-[12px] font-bold tracking-wide shadow-lg"
                  style={{
                    background: "rgba(239,68,68,0.92)",
                    backdropFilter: "blur(4px)",
                  }}
                >
                  <span
                    className="w-2 h-2 rounded-full bg-white"
                    style={{ animation: "pulse-dot 1.1s infinite" }}
                  />
                  REC · {recordCountdown}s
                </div>
              )}

              {(phase === "loading" || phase === "starting") && (
                <BootOverlay msg={loadingMsg} />
              )}
              {phase === "awaiting_phone" && (
                <PhoneLinkOverlay
                  link={phoneLink}
                  onCancel={handleChangeSource}
                />
              )}
              {phase === "no_camera" && (
                <ErrorOverlay
                  title="Camera permission needed"
                  body="Allow camera access in your browser, then choose the source again."
                  primaryLabel="Choose source"
                  onPrimary={handleChangeSource}
                />
              )}
              {phase === "error" && (
                <ErrorOverlay
                  title="Couldn't start"
                  body={errorMsg || "Please try again."}
                  primaryLabel="Choose source"
                  onPrimary={handleChangeSource}
                />
              )}
            </div>

            {/* Capacity slider */}
            <div className="px-5 py-4 border-t border-[#d6c08a] flex flex-wrap items-center gap-5">
              <div className="flex-1 min-w-[260px]">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[12px] font-semibold text-[#5a4226] tracking-wide">
                    Crowd capacity for this scene
                  </label>
                  <span className="text-[12px] text-[#8a6f44]">
                    {capacity} people
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={80}
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                  className="w-full accent-[#740001]"
                />
              </div>
              <div className="flex items-center gap-2 text-[12px] text-[#8a6f44]">
                <Dot color="#10b981" /> Safe
                <Dot color="#f59e0b" /> Watch
                <Dot color="#ef4444" /> High
                <Dot color="#b91c1c" /> Stampede
              </div>
            </div>
          </div>

          {/* History + alerts row */}
          <div className="grid grid-cols-1 xl:grid-cols-[1.6fr_1fr] gap-5">
            <HistoryChart
              history={history}
              capacity={capacity}
              tierColor={tierColor}
            />
            <AlertsFeed alerts={alerts} />
          </div>
        </section>

        {/* Sidebar */}
        <aside className="space-y-4">
          <PrimaryCount
            count={count}
            tier={tier}
            tierColor={tierColor}
            capacity={capacity}
            peak={peak}
          />
          <TrafficCard entered={traffic.entered} left={traffic.left} />
          <SafetyMeter tier={tier} count={count} capacity={capacity} />
          <FlowCard flow={flow} />
          <DemographicsCard demo={demo} />
          <MaskCard demo={demo} />
        </aside>
      </main>

      <footer className="border-t border-[#d6c08a] py-4">
        <div className="max-w-[1400px] mx-auto px-6 flex items-center justify-between text-[12px] text-[#8a6f44]">
          <span className="font-quill italic">
            Messrs Moony, Wormtail, Padfoot &amp; Prongs · The Marauder's Eye
          </span>
          <button
            onClick={handleMischiefManaged}
            className="btn btn-primary"
            title="Clear all alerts, history & heatmap"
          >
            Mischief Managed.
          </button>
        </div>
      </footer>
    </div>
  );
}

/* ----------------- subcomponents ----------------- */

function TopBar({
  onChangeSource,
  onTogglePause,
  onToggleMute,
  onToggleHeat,
  onSnapshot,
  onRecord,
  canSnapshot,
  canRecord,
  recording,
  recordCountdown,
  showHeat,
  paused,
  muted,
  canPause,
  statusLabel,
  statusColor,
}: {
  onChangeSource: () => void;
  onTogglePause: () => void;
  onToggleMute: () => void;
  onToggleHeat: () => void;
  onSnapshot: () => void;
  onRecord: () => void;
  canSnapshot: boolean;
  canRecord: boolean;
  recording: boolean;
  recordCountdown: number;
  showHeat: boolean;
  paused: boolean;
  muted: boolean;
  canPause: boolean;
  statusLabel: string;
  statusColor: string;
}) {
  return (
    <header className="border-b border-[#d6c08a] bg-white/80 backdrop-blur sticky top-0 z-20">
      <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between gap-3">
        <Brand />
        <div className="flex items-center gap-2">
          <ThemeToggle compact />
          <span className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f4e4bc] border border-[#d6c08a]">
            <span
              className="w-2 h-2 rounded-full"
              style={{
                background: statusColor,
                animation:
                  statusLabel === "Live" ? "pulse-dot 1.6s infinite" : undefined,
              }}
            />
            <span className="text-[12px] font-semibold text-[#5a4226]">
              {statusLabel}
            </span>
          </span>

          <button
            className="btn btn-ghost"
            onClick={onToggleHeat}
            title={showHeat ? "Hide heatmap" : "Show heatmap"}
            style={
              showHeat
                ? { borderColor: "#740001", color: "#740001" }
                : undefined
            }
          >
            <HeatIcon />
            <span className="hidden md:inline">Heatmap</span>
          </button>

          <button
            className="btn btn-ghost"
            onClick={onSnapshot}
            disabled={!canSnapshot}
            title="Save snapshot"
          >
            <DownloadIcon />
            <span className="hidden md:inline">Snapshot</span>
          </button>

          <button
            className="btn btn-ghost"
            onClick={onRecord}
            disabled={!canRecord}
            title={recording ? "Recording…" : "Record a 10-second incident clip"}
            style={
              recording
                ? { borderColor: "#ef4444", color: "#ef4444" }
                : undefined
            }
          >
            <RecordIcon recording={recording} />
            <span className="hidden md:inline">
              {recording ? `Recording ${recordCountdown}s` : "Record"}
            </span>
          </button>

          <button
            className="btn btn-ghost"
            onClick={onToggleMute}
            title={muted ? "Unmute alarms" : "Mute alarms"}
          >
            {muted ? <BellOffIcon /> : <BellIcon />}
            <span className="hidden md:inline">{muted ? "Muted" : "Alarms"}</span>
          </button>

          <button
            className="btn btn-ghost"
            onClick={onTogglePause}
            disabled={!canPause}
          >
            {paused ? <PlayIcon /> : <PauseIcon />}
            <span className="hidden md:inline">{paused ? "Resume" : "Pause"}</span>
          </button>

          <button className="btn btn-primary" onClick={onChangeSource}>
            <SwapIcon />
            <span className="hidden md:inline">Change source</span>
          </button>
        </div>
      </div>
    </header>
  );
}

function SafetyBadge({ tier, color }: { tier: Tier; color: string }) {
  return (
    <span
      className="tag"
      style={{
        background: color + "1a",
        color,
        border: `1px solid ${color}55`,
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {TIER_LABEL[tier]}
    </span>
  );
}

function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full"
      style={{ background: color }}
    />
  );
}

function PrimaryCount({
  count,
  tier,
  tierColor,
  capacity,
  peak,
}: {
  count: number;
  tier: Tier;
  tierColor: string;
  capacity: number;
  peak: number;
}) {
  const danger = tier === "HIGH" || tier === "STAMPEDE";
  return (
    <div
      className="card p-5 relative overflow-hidden"
      style={{
        animation: danger ? "pulse-danger 1.6s infinite" : undefined,
        borderColor: danger ? "#ef4444" : undefined,
      }}
    >
      <div className="text-[11px] tracking-[0.18em] uppercase text-[#8a6f44]">
        Marauder's Count
      </div>
      <div
        className="font-display font-extrabold text-[64px] leading-none mt-1.5"
        style={{ color: tierColor }}
      >
        {count}
      </div>
      <div className="mt-3 flex items-center justify-between text-[13px]">
        <span className="text-[#8a6f44]">Capacity</span>
        <span className="font-semibold text-[#2b1d0e]">{capacity}</span>
      </div>
      <div className="flex items-center justify-between text-[13px] mt-1">
        <span className="text-[#8a6f44]">Peak this session</span>
        <span className="font-semibold text-[#2b1d0e]">{peak}</span>
      </div>
    </div>
  );
}

function TrafficCard({ entered, left }: { entered: number; left: number }) {
  return (
    <div className="card p-5">
      <div className="text-[11px] tracking-[0.18em] uppercase text-[#8a6f44]">
        Footstep Tally
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-[#fbf3dd] border border-[#d6c08a] p-3">
          <div className="flex items-center gap-1.5 text-[#740001] text-[11px] font-semibold uppercase tracking-wide">
            <ArrowInIcon /> Entered
          </div>
          <div className="font-display font-bold text-[26px] text-[#2b1d0e] mt-1 leading-none">
            {entered}
          </div>
        </div>
        <div className="rounded-lg bg-[#fbf3dd] border border-[#d6c08a] p-3">
          <div className="flex items-center gap-1.5 text-[#8a6f44] text-[11px] font-semibold uppercase tracking-wide">
            <ArrowOutIcon /> Left
          </div>
          <div className="font-display font-bold text-[26px] text-[#2b1d0e] mt-1 leading-none">
            {left}
          </div>
        </div>
      </div>
    </div>
  );
}

function ArrowInIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}
function ArrowOutIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" />
      <path d="M11 6l-6 6 6 6" />
    </svg>
  );
}

function SafetyMeter({
  tier,
  count,
  capacity,
}: {
  tier: Tier;
  count: number;
  capacity: number;
}) {
  const pct = Math.min(100, (count / Math.max(1, capacity)) * 80);
  return (
    <div className="card p-5">
      <div className="text-[11px] tracking-[0.18em] uppercase text-[#8a6f44]">
        Forbidden Corridor
      </div>
      <div className="mt-2 mb-3 font-semibold text-[#2b1d0e]">
        {TIER_LABEL[tier]}
      </div>
      <div className="relative h-2.5 rounded-full overflow-hidden bg-[#eef3fa]">
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, #10b981 0%, #f59e0b 50%, #ef4444 80%, #b91c1c 100%)",
            opacity: 0.85,
          }}
        />
        <div
          className="absolute top-[-4px] w-[3px] h-[18px] rounded-sm bg-[#2b1d0e] transition-all duration-300"
          style={{ left: `calc(${pct}% - 1.5px)` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-[#8a6f44]">
        <span>Safe</span>
        <span>Watch</span>
        <span>High</span>
        <span>Stampede</span>
      </div>
    </div>
  );
}

function FlowCard({
  flow,
}: {
  flow: { label: string; angleDeg: number; magnitude: number };
}) {
  const showArrow = flow.magnitude >= 1.0;
  const friendly = flow.label.replace("-", " ").toLowerCase();
  return (
    <div className="card p-5">
      <div className="text-[11px] tracking-[0.18em] uppercase text-[#8a6f44]">
        Wandering Direction
      </div>
      <div className="mt-3 flex items-center gap-4">
        <div className="relative w-[68px] h-[68px] rounded-full bg-[#f4e4bc] border border-[#d6c08a] flex items-center justify-center shrink-0">
          {showArrow ? (
            <svg
              width="44"
              height="44"
              viewBox="0 0 24 24"
              style={{
                transform: `rotate(${flow.angleDeg + 90}deg)`,
                transition: "transform 0.4s ease-out",
              }}
            >
              <path
                d="M12 3 L17 12 L13 12 L13 21 L11 21 L11 12 L7 12 Z"
                fill="#740001"
              />
            </svg>
          ) : (
            <span className="w-3 h-3 rounded-full bg-[#94a3b8]" />
          )}
        </div>
        <div>
          <div className="font-display font-bold text-[20px] capitalize text-[#2b1d0e]">
            {showArrow ? friendly : "No motion"}
          </div>
          <div className="text-[12px] text-[#8a6f44] mt-0.5">
            {showArrow
              ? "Average direction of movement"
              : "Crowd is mostly still"}
          </div>
        </div>
      </div>
    </div>
  );
}

function DemographicsCard({
  demo,
}: {
  demo: { avgAge: number; male: number; female: number; faces: number };
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] tracking-[0.18em] uppercase text-[#8a6f44]">
          Polyjuice Scan
        </div>
        <span className="text-[11px] text-[#8a6f44]">
          {demo.faces} face{demo.faces === 1 ? "" : "s"}
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-display font-bold text-[32px] text-[#2b1d0e]">
          {demo.faces ? Math.round(demo.avgAge) : "—"}
        </span>
        <span className="text-[12px] text-[#8a6f44]">avg age</span>
      </div>
      <div className="mt-3 h-2 rounded-full overflow-hidden bg-[#eef3fa] flex">
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${demo.male}%`, background: "#740001" }}
        />
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${demo.female}%`, background: "#b8860b" }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[12px]">
        <span className="text-[#5a4226]">
          <Dot color="#740001" />{" "}
          <span className="ml-1.5">Men {Math.round(demo.male)}%</span>
        </span>
        <span className="text-[#5a4226]">
          <Dot color="#b8860b" />{" "}
          <span className="ml-1.5">Women {Math.round(demo.female)}%</span>
        </span>
      </div>
    </div>
  );
}

function MaskCard({ demo }: { demo: { masked: number; faces: number } }) {
  const ok = demo.masked >= 60;
  const bad = demo.masked < 30 && demo.faces > 0;
  return (
    <div className="card p-5">
      <div className="text-[11px] tracking-[0.18em] uppercase text-[#5a4226]">
        Invisibility Check
      </div>
      <div className="mt-3 flex items-end gap-2">
        <span
          className="font-display font-bold text-[32px]"
          style={{ color: ok ? "#10b981" : bad ? "#ef4444" : "#2b1d0e" }}
        >
          {demo.faces ? Math.round(demo.masked) : "—"}
          {demo.faces ? "%" : ""}
        </span>
        <span className="text-[12px] text-[#8a6f44] mb-1.5">wearing masks</span>
      </div>
      <div className="mt-3 h-2 rounded-full overflow-hidden bg-[#eef3fa]">
        <div
          className="h-full transition-all duration-500"
          style={{
            width: `${demo.faces ? demo.masked : 0}%`,
            background: ok ? "#10b981" : bad ? "#ef4444" : "#f59e0b",
          }}
        />
      </div>
    </div>
  );
}

function HistoryChart({
  history,
  capacity,
  tierColor,
}: {
  history: HistPoint[];
  capacity: number;
  tierColor: string;
}) {
  const W = 700;
  const H = 200;
  const pad = 24;
  const max = Math.max(capacity * 1.4, ...history.map((p) => p.count), 1);
  const points = history.map((p, i) => {
    const x = pad + (i / Math.max(1, MAX_HIST - 1)) * (W - pad * 2);
    const y = H - pad - (p.count / max) * (H - pad * 2);
    return [x, y] as const;
  });
  const lineD = points.length
    ? "M" + points.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L")
    : "";
  const areaD = points.length
    ? lineD +
      `L${points[points.length - 1][0].toFixed(1)},${H - pad} L${points[0][0].toFixed(1)},${H - pad} Z`
    : "";
  const capY = H - pad - (capacity / max) * (H - pad * 2);
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-[11px] tracking-[0.18em] uppercase text-[#8a6f44]">
            Crowd over time
          </div>
          <div className="font-semibold text-[#2b1d0e]">Last 60 readings</div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[200px]">
        <defs>
          <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tierColor} stopOpacity="0.32" />
            <stop offset="100%" stopColor={tierColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((f) => {
          const y = H - pad - f * (H - pad * 2);
          return (
            <line
              key={f}
              x1={pad}
              x2={W - pad}
              y1={y}
              y2={y}
              stroke="#d6c08a"
              strokeWidth="1"
            />
          );
        })}
        <line
          x1={pad}
          x2={W - pad}
          y1={capY}
          y2={capY}
          stroke="#740001"
          strokeWidth="1.4"
          strokeDasharray="5 4"
          opacity="0.6"
        />
        <text
          x={W - pad}
          y={capY - 5}
          textAnchor="end"
          fontFamily="Inter"
          fontSize="11"
          fill="#740001"
        >
          Capacity {capacity}
        </text>
        {points.length > 1 && (
          <>
            <path d={areaD} fill="url(#hg)" />
            <path d={lineD} fill="none" stroke={tierColor} strokeWidth="2.5" />
            <circle
              cx={points[points.length - 1][0]}
              cy={points[points.length - 1][1]}
              r="4"
              fill={tierColor}
              stroke="#fff"
              strokeWidth="2"
            />
          </>
        )}
        {points.length === 0 && (
          <text
            x={W / 2}
            y={H / 2}
            textAnchor="middle"
            fontFamily="Inter"
            fontSize="13"
            fill="#94a3b8"
          >
            Waiting for data…
          </text>
        )}
      </svg>
    </div>
  );
}

function AlertsFeed({ alerts }: { alerts: AlertItem[] }) {
  return (
    <div className="card p-5 flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-[11px] tracking-[0.18em] uppercase text-[#8a6f44]">
            Alerts
          </div>
          <div className="font-semibold text-[#2b1d0e]">Latest events</div>
        </div>
        <span className="w-2 h-2 rounded-full bg-[#10b981] animate-pulse" />
      </div>
      <div className="flex-1 max-h-[220px] overflow-y-auto pr-1 space-y-2">
        {alerts.length === 0 && (
          <div className="text-[13px] text-[#94a3b8] py-2">
            Nothing yet. Alerts will appear here.
          </div>
        )}
        {alerts.map((a) => {
          const c =
            a.tone === "danger"
              ? "#ef4444"
              : a.tone === "warn"
                ? "#f59e0b"
                : "#740001";
          return (
            <div
              key={a.id}
              className="flex items-start gap-2 p-2 rounded-lg bg-[#fbf3dd] border border-[#d6c08a]"
            >
              <span
                className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: c }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-[#2b1d0e]">{a.text}</div>
                <div className="text-[11px] text-[#8a6f44] mt-0.5">{a.ts}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BootOverlay({ msg }: { msg: string }) {
  return (
    <div className="absolute inset-0 bg-[#2b1d0e]/90 flex flex-col items-center justify-center text-white">
      <div
        className="w-12 h-12 rounded-full border-2 border-white/30 border-t-white"
        style={{ animation: "spin 0.9s linear infinite" }}
      />
      <div className="mt-4 text-[14px] font-semibold tracking-wide">{msg}…</div>
      <div className="mt-1 text-[12px] text-white/60">One moment please</div>
    </div>
  );
}

function PhoneLinkOverlay({
  link,
  onCancel,
}: {
  link: { peerId: string; url: string; qrDataUrl: string } | null;
  onCancel: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // ignore
    }
  };

  return (
    <div className="absolute inset-0 bg-[#2b1d0e]/95 flex flex-col items-center justify-center text-white p-5 text-center">
      <div className="font-display font-bold text-[20px] mb-1">
        Scan with your phone
      </div>
      <div className="text-[12px] text-white/70 max-w-sm mb-4">
        Open your phone's camera and point it at the code. Allow camera access
        on the phone, then keep this tab open.
      </div>

      {link?.qrDataUrl ? (
        <img
          src={link.qrDataUrl}
          alt="Scan to stream from phone"
          className="w-[220px] h-[220px] rounded-md bg-[#fbf3dd] p-2 shadow-md"
        />
      ) : (
        <div className="w-[220px] h-[220px] rounded-md bg-[#fbf3dd]/30 flex items-center justify-center">
          <div
            className="w-10 h-10 rounded-full border-2 border-white/30 border-t-white"
            style={{ animation: "spin 0.9s linear infinite" }}
          />
        </div>
      )}

      {link ? (
        <div className="mt-4 flex flex-col items-center gap-2 w-full max-w-md">
          <div className="text-[11px] text-white/60 break-all px-3">
            {link.url}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button onClick={copy} className="btn btn-primary">
              {copied ? "Link copied" : "Copy link"}
            </button>
            <button onClick={onCancel} className="btn">
              Cancel
            </button>
          </div>
          <div className="text-[11px] text-white/50 mt-1">
            Waiting for phone to connect…
          </div>
        </div>
      ) : (
        <div className="mt-3 text-[12px] text-white/60">
          Setting up secure link…
        </div>
      )}
    </div>
  );
}

function ErrorOverlay({
  title,
  body,
  primaryLabel,
  onPrimary,
}: {
  title: string;
  body: string;
  primaryLabel: string;
  onPrimary: () => void;
}) {
  return (
    <div className="absolute inset-0 bg-[#2b1d0e]/90 flex flex-col items-center justify-center text-white p-6 text-center">
      <div className="font-display font-bold text-[22px] mb-2">{title}</div>
      <div className="text-[13px] text-white/70 max-w-md mb-5">{body}</div>
      <button onClick={onPrimary} className="btn btn-primary">
        {primaryLabel}
      </button>
    </div>
  );
}

function waitForVideoReady(v: HTMLVideoElement) {
  return new Promise<void>((res) => {
    if (v.readyState >= 2 && v.videoWidth) return res();
    const handler = () => {
      if (v.readyState >= 2 && v.videoWidth) {
        v.removeEventListener("loadeddata", handler);
        res();
      }
    };
    v.addEventListener("loadeddata", handler);
  });
}

function waitForImageReady(img: HTMLImageElement) {
  return new Promise<void>((res) => {
    if (img.complete && img.naturalWidth) return res();
    img.onload = () => res();
  });
}

function PauseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}
function PlayIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}
function SwapIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 7h11l-3-3" />
      <path d="M17 17H6l3 3" />
    </svg>
  );
}
function BellIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 1 1 12 0c0 5 3 6 3 6H3s3-1 3-6" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  );
}
function HeatIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2s4 5 4 9a4 4 0 1 1-8 0c0-1.5.5-2.5 1-3" />
      <path d="M9 14a3 3 0 0 0 6 0" />
    </svg>
  );
}
function RecordIcon({ recording }: { recording: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle
        cx="12"
        cy="12"
        r="6"
        fill={recording ? "#ef4444" : "currentColor"}
        stroke="none"
        style={recording ? { animation: "pulse-dot 1.1s infinite" } : undefined}
      />
      <circle cx="12" cy="12" r="9" />
    </svg>
  );
}
function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}
function BellOffIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l18 18" />
      <path d="M8.7 4.7A6 6 0 0 1 18 9c0 5 3 6 3 6H8" />
      <path d="M6 8c0 5-3 6-3 6h4" />
      <path d="M10 21a2 2 0 0 0 4 0" />
    </svg>
  );
}

// useMemo not currently used; keep import-free
const _useMemo = useMemo;
void _useMemo;
