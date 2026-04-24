import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  detectFrame,
  loadModels,
  type FaceInfo,
} from "../lib/detection";
import { CentroidTracker, flowDirection, type Track } from "../lib/tracker";
import { beepCritical, beepWarn, unlockAudio } from "../lib/audio";
import { Brand, type SourceConfig } from "./Landing";

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
    "loading" | "starting" | "ready" | "error" | "no_camera"
  >("loading");
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

      // Behavior detection
      checkBehaviour(tracks);

      // Render
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
      ctx.strokeStyle = f.masked ? "#1d6cf3" : "#06b6d4";
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
        paused={paused}
        muted={muted}
        canPause={!isImage && phase === "ready"}
        statusLabel={
          phase === "loading"
            ? "Preparing"
            : phase === "starting"
              ? "Connecting"
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
              : "#1d6cf3"
        }
      />

      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
        <section className="space-y-5">
          {/* Video / Image stage */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-[#e6edf5] flex items-center justify-between">
              <div>
                <div className="text-[11px] tracking-[0.18em] uppercase text-[#6b7d99]">
                  Scene
                </div>
                <div className="font-semibold text-[#0f1f3d]">
                  {source.kind === "webcam"
                    ? "Live camera"
                    : source.kind === "video"
                      ? `Video · ${source.file.name}`
                      : `Photo · ${source.file.name}`}
                </div>
              </div>
              <SafetyBadge tier={tier} color={tierColor} />
            </div>

            <div className="relative bg-[#0f1f3d] aspect-video">
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
                ref={canvasRef}
                className="absolute inset-0 w-full h-full object-contain pointer-events-none"
              />

              {(phase === "loading" || phase === "starting") && (
                <BootOverlay msg={loadingMsg} />
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
            <div className="px-5 py-4 border-t border-[#e6edf5] flex flex-wrap items-center gap-5">
              <div className="flex-1 min-w-[260px]">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[12px] font-semibold text-[#314869] tracking-wide">
                    Crowd capacity for this scene
                  </label>
                  <span className="text-[12px] text-[#6b7d99]">
                    {capacity} people
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={80}
                  value={capacity}
                  onChange={(e) => setCapacity(Number(e.target.value))}
                  className="w-full accent-[#1d6cf3]"
                />
              </div>
              <div className="flex items-center gap-2 text-[12px] text-[#6b7d99]">
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
          <SafetyMeter tier={tier} count={count} capacity={capacity} />
          <FlowCard flow={flow} />
          <DemographicsCard demo={demo} />
          <MaskCard demo={demo} />
        </aside>
      </main>

      <footer className="border-t border-[#e6edf5] py-4">
        <div className="max-w-[1400px] mx-auto px-6 flex items-center justify-between text-[12px] text-[#6b7d99]">
          <span>TRINETRA AI · Crowd safety vision</span>
          <span>Runs entirely in your browser</span>
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
  paused,
  muted,
  canPause,
  statusLabel,
  statusColor,
}: {
  onChangeSource: () => void;
  onTogglePause: () => void;
  onToggleMute: () => void;
  paused: boolean;
  muted: boolean;
  canPause: boolean;
  statusLabel: string;
  statusColor: string;
}) {
  return (
    <header className="border-b border-[#e6edf5] bg-white/80 backdrop-blur sticky top-0 z-20">
      <div className="max-w-[1400px] mx-auto px-6 h-16 flex items-center justify-between gap-3">
        <Brand />
        <div className="flex items-center gap-2">
          <span className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f4f7fb] border border-[#e6edf5]">
            <span
              className="w-2 h-2 rounded-full"
              style={{
                background: statusColor,
                animation:
                  statusLabel === "Live" ? "pulse-dot 1.6s infinite" : undefined,
              }}
            />
            <span className="text-[12px] font-semibold text-[#314869]">
              {statusLabel}
            </span>
          </span>

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
      <div className="text-[11px] tracking-[0.18em] uppercase text-[#6b7d99]">
        People right now
      </div>
      <div
        className="font-display font-extrabold text-[64px] leading-none mt-1.5"
        style={{ color: tierColor }}
      >
        {count}
      </div>
      <div className="mt-3 flex items-center justify-between text-[13px]">
        <span className="text-[#6b7d99]">Capacity</span>
        <span className="font-semibold text-[#0f1f3d]">{capacity}</span>
      </div>
      <div className="flex items-center justify-between text-[13px] mt-1">
        <span className="text-[#6b7d99]">Peak this session</span>
        <span className="font-semibold text-[#0f1f3d]">{peak}</span>
      </div>
    </div>
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
      <div className="text-[11px] tracking-[0.18em] uppercase text-[#6b7d99]">
        Safety zone
      </div>
      <div className="mt-2 mb-3 font-semibold text-[#0f1f3d]">
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
          className="absolute top-[-4px] w-[3px] h-[18px] rounded-sm bg-[#0f1f3d] transition-all duration-300"
          style={{ left: `calc(${pct}% - 1.5px)` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[11px] text-[#6b7d99]">
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
      <div className="text-[11px] tracking-[0.18em] uppercase text-[#6b7d99]">
        Crowd flow
      </div>
      <div className="mt-3 flex items-center gap-4">
        <div className="relative w-[68px] h-[68px] rounded-full bg-[#f4f7fb] border border-[#e6edf5] flex items-center justify-center shrink-0">
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
                fill="#1d6cf3"
              />
            </svg>
          ) : (
            <span className="w-3 h-3 rounded-full bg-[#94a3b8]" />
          )}
        </div>
        <div>
          <div className="font-display font-bold text-[20px] capitalize text-[#0f1f3d]">
            {showArrow ? friendly : "No motion"}
          </div>
          <div className="text-[12px] text-[#6b7d99] mt-0.5">
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
        <div className="text-[11px] tracking-[0.18em] uppercase text-[#6b7d99]">
          Demographics
        </div>
        <span className="text-[11px] text-[#6b7d99]">
          {demo.faces} face{demo.faces === 1 ? "" : "s"}
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="font-display font-bold text-[32px] text-[#0f1f3d]">
          {demo.faces ? Math.round(demo.avgAge) : "—"}
        </span>
        <span className="text-[12px] text-[#6b7d99]">avg age</span>
      </div>
      <div className="mt-3 h-2 rounded-full overflow-hidden bg-[#eef3fa] flex">
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${demo.male}%`, background: "#1d6cf3" }}
        />
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${demo.female}%`, background: "#06b6d4" }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[12px]">
        <span className="text-[#314869]">
          <Dot color="#1d6cf3" />{" "}
          <span className="ml-1.5">Men {Math.round(demo.male)}%</span>
        </span>
        <span className="text-[#314869]">
          <Dot color="#06b6d4" />{" "}
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
      <div className="text-[11px] tracking-[0.18em] uppercase text-[#6b7d99]">
        Mask compliance
      </div>
      <div className="mt-3 flex items-end gap-2">
        <span
          className="font-display font-bold text-[32px]"
          style={{ color: ok ? "#10b981" : bad ? "#ef4444" : "#0f1f3d" }}
        >
          {demo.faces ? Math.round(demo.masked) : "—"}
          {demo.faces ? "%" : ""}
        </span>
        <span className="text-[12px] text-[#6b7d99] mb-1.5">wearing masks</span>
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
          <div className="text-[11px] tracking-[0.18em] uppercase text-[#6b7d99]">
            Crowd over time
          </div>
          <div className="font-semibold text-[#0f1f3d]">Last 60 readings</div>
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
              stroke="#e6edf5"
              strokeWidth="1"
            />
          );
        })}
        <line
          x1={pad}
          x2={W - pad}
          y1={capY}
          y2={capY}
          stroke="#1d6cf3"
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
          fill="#1d6cf3"
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
          <div className="text-[11px] tracking-[0.18em] uppercase text-[#6b7d99]">
            Alerts
          </div>
          <div className="font-semibold text-[#0f1f3d]">Latest events</div>
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
                : "#1d6cf3";
          return (
            <div
              key={a.id}
              className="flex items-start gap-2 p-2 rounded-lg bg-[#f8fafc] border border-[#e6edf5]"
            >
              <span
                className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: c }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-[13px] text-[#0f1f3d]">{a.text}</div>
                <div className="text-[11px] text-[#6b7d99] mt-0.5">{a.ts}</div>
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
    <div className="absolute inset-0 bg-[#0f1f3d]/90 flex flex-col items-center justify-center text-white">
      <div
        className="w-12 h-12 rounded-full border-2 border-white/30 border-t-white"
        style={{ animation: "spin 0.9s linear infinite" }}
      />
      <div className="mt-4 text-[14px] font-semibold tracking-wide">{msg}…</div>
      <div className="mt-1 text-[12px] text-white/60">One moment please</div>
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
    <div className="absolute inset-0 bg-[#0f1f3d]/90 flex flex-col items-center justify-center text-white p-6 text-center">
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
