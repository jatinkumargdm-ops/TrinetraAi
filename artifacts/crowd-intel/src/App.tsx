import { useEffect, useRef, useState, useCallback } from "react";
import * as tf from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";

type Status =
  | "INITIALIZING"
  | "LOADING_MODEL"
  | "REQUESTING_CAMERA"
  | "ACTIVE"
  | "PAUSED"
  | "ERROR"
  | "NO_CAMERA";

type RiskTier = "LOW" | "MODERATE" | "HIGH" | "CRITICAL";

type HistoryPoint = { t: number; count: number };

type LogEntry = {
  id: number;
  ts: string;
  level: "INFO" | "WARN" | "ALERT";
  msg: string;
};

const MAX_HISTORY = 60;
const MAX_LOGS = 40;

function tierFromCount(count: number, threshold: number): RiskTier {
  const ratio = count / Math.max(1, threshold);
  if (ratio >= 1.0) return "CRITICAL";
  if (ratio >= 0.75) return "HIGH";
  if (ratio >= 0.4) return "MODERATE";
  return "LOW";
}

function tierColor(tier: RiskTier) {
  switch (tier) {
    case "CRITICAL":
      return "#f85149";
    case "HIGH":
      return "#d29922";
    case "MODERATE":
      return "#58a6ff";
    case "LOW":
    default:
      return "#46c554";
  }
}

function fmtTime(date: Date) {
  return date.toLocaleTimeString("en-US", { hour12: false });
}

function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const modelRef = useRef<cocoSsd.ObjectDetection | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastFrameTsRef = useRef<number>(0);
  const fpsSmoothRef = useRef<number>(0);
  const detectingRef = useRef<boolean>(false);
  const pausedRef = useRef<boolean>(false);
  const logIdRef = useRef<number>(0);

  const [status, setStatus] = useState<Status>("INITIALIZING");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [count, setCount] = useState<number>(0);
  const [fps, setFps] = useState<number>(0);
  const [confidence, setConfidence] = useState<number>(0);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [threshold, setThreshold] = useState<number>(8);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [bootMs, setBootMs] = useState<number>(0);
  const [areaSqm, setAreaSqm] = useState<number>(20);
  const [sessionStart] = useState<Date>(new Date());

  const tier = tierFromCount(count, threshold);
  const tierC = tierColor(tier);
  const density = count / Math.max(1, areaSqm);
  const peak = history.reduce((m, p) => (p.count > m ? p.count : m), 0);
  const avg =
    history.length > 0
      ? history.reduce((s, p) => s + p.count, 0) / history.length
      : 0;
  const riskScore = Math.min(
    100,
    Math.round((count / Math.max(1, threshold)) * 70 + density * 12),
  );

  const pushLog = useCallback(
    (level: LogEntry["level"], msg: string) => {
      setLogs((prev) => {
        const next: LogEntry[] = [
          {
            id: ++logIdRef.current,
            ts: fmtTime(new Date()),
            level,
            msg,
          },
          ...prev,
        ];
        return next.slice(0, MAX_LOGS);
      });
    },
    [],
  );

  // Boot: load model then ask for camera
  useEffect(() => {
    let cancelled = false;
    const start = performance.now();
    (async () => {
      try {
        setStatus("LOADING_MODEL");
        pushLog("INFO", "Initializing TensorFlow.js runtime...");
        await tf.ready();
        pushLog("INFO", `Backend online: ${tf.getBackend().toUpperCase()}`);
        pushLog("INFO", "Loading COCO-SSD neural network...");
        const model = await cocoSsd.load({ base: "lite_mobilenet_v2" });
        if (cancelled) return;
        modelRef.current = model;
        pushLog("INFO", "Model loaded. Requesting camera access...");
        setStatus("REQUESTING_CAMERA");

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const canvas = canvasRef.current;
        if (canvas) {
          canvas.width = video.videoWidth || 1280;
          canvas.height = video.videoHeight || 720;
        }
        setBootMs(Math.round(performance.now() - start));
        setStatus("ACTIVE");
        pushLog("INFO", "Camera stream live. Scanning crowd...");
        detectingRef.current = true;
        loop();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMsg(msg);
        if (msg.toLowerCase().includes("permission") || msg.toLowerCase().includes("denied")) {
          setStatus("NO_CAMERA");
          pushLog("ALERT", `Camera access denied: ${msg}`);
        } else {
          setStatus("ERROR");
          pushLog("ALERT", `Initialization failed: ${msg}`);
        }
      }
    })();
    return () => {
      cancelled = true;
      detectingRef.current = false;
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      const video = videoRef.current;
      if (video && video.srcObject) {
        const stream = video.srcObject as MediaStream;
        stream.getTracks().forEach((t) => t.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loop = useCallback(async () => {
    if (!detectingRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const model = modelRef.current;
    if (!video || !canvas || !model || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    if (pausedRef.current) {
      rafRef.current = requestAnimationFrame(loop);
      return;
    }

    const now = performance.now();
    if (lastFrameTsRef.current > 0) {
      const dt = now - lastFrameTsRef.current;
      const instFps = 1000 / Math.max(1, dt);
      fpsSmoothRef.current =
        fpsSmoothRef.current === 0
          ? instFps
          : fpsSmoothRef.current * 0.85 + instFps * 0.15;
      setFps(Math.round(fpsSmoothRef.current * 10) / 10);
    }
    lastFrameTsRef.current = now;

    try {
      const predictions = await model.detect(video, 30);
      const persons = predictions.filter((p) => p.class === "person");

      const ctx = canvas.getContext("2d");
      if (ctx) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Draw bounding boxes
        const boxColor = tierColor(tierFromCount(persons.length, threshold));
        ctx.lineWidth = 2;
        ctx.strokeStyle = boxColor;
        ctx.font = "600 14px 'JetBrains Mono', monospace";
        for (const p of persons) {
          const [x, y, w, h] = p.bbox;
          ctx.strokeRect(x, y, w, h);
          // Corner accents
          const c = 10;
          ctx.beginPath();
          ctx.moveTo(x, y + c); ctx.lineTo(x, y); ctx.lineTo(x + c, y);
          ctx.moveTo(x + w - c, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + c);
          ctx.moveTo(x + w, y + h - c); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w - c, y + h);
          ctx.moveTo(x + c, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h - c);
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.lineWidth = 2;

          // Label background
          const label = `PERSON ${(p.score * 100).toFixed(0)}%`;
          const tw = ctx.measureText(label).width + 12;
          ctx.fillStyle = "rgba(13, 17, 23, 0.85)";
          ctx.fillRect(x, y - 22, tw, 22);
          ctx.fillStyle = boxColor;
          ctx.fillText(label, x + 6, y - 6);
        }

        // Live count HUD
        ctx.fillStyle = "rgba(0, 0, 0, 0.78)";
        ctx.fillRect(16, 16, 280, 64);
        ctx.strokeStyle = boxColor;
        ctx.lineWidth = 2;
        ctx.strokeRect(16, 16, 280, 64);
        ctx.fillStyle = "#8b949e";
        ctx.font = "600 12px 'JetBrains Mono', monospace";
        ctx.fillText("LIVE PERSON COUNT", 28, 36);
        ctx.fillStyle = boxColor;
        ctx.font = "700 32px 'Rajdhani', sans-serif";
        ctx.fillText(String(persons.length).padStart(3, "0"), 28, 70);
        ctx.fillStyle = "#c9d1d9";
        ctx.font = "500 12px 'JetBrains Mono', monospace";
        ctx.fillText(`THRESHOLD ${threshold}`, 110, 56);
        ctx.fillText(`${tierFromCount(persons.length, threshold)}`, 110, 72);
      }

      const avgConf =
        persons.length > 0
          ? persons.reduce((s, p) => s + p.score, 0) / persons.length
          : 0;
      setConfidence(Math.round(avgConf * 100));
      setCount(persons.length);
      setHistory((prev) => {
        const next = [...prev, { t: Date.now(), count: persons.length }];
        return next.slice(-MAX_HISTORY);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      pushLog("ALERT", `Detection error: ${msg}`);
    }

    rafRef.current = requestAnimationFrame(loop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threshold]);

  // Threshold breach alerts (fire on transition into HIGH/CRITICAL)
  const lastTierRef = useRef<RiskTier>("LOW");
  useEffect(() => {
    if (status !== "ACTIVE") return;
    if (lastTierRef.current === tier) return;
    const escalate =
      (tier === "HIGH" && lastTierRef.current !== "CRITICAL") ||
      tier === "CRITICAL";
    if (escalate) {
      pushLog(
        tier === "CRITICAL" ? "ALERT" : "WARN",
        `Crowd density tier changed: ${lastTierRef.current} → ${tier} (count ${count})`,
      );
    }
    lastTierRef.current = tier;
  }, [tier, count, status, pushLog]);

  const handleRestart = useCallback(() => {
    window.location.reload();
  }, []);

  const handlePause = useCallback(() => {
    pausedRef.current = !pausedRef.current;
    setStatus(pausedRef.current ? "PAUSED" : "ACTIVE");
    pushLog("INFO", pausedRef.current ? "Stream paused by operator." : "Stream resumed.");
  }, [pushLog]);

  const sessionDurationStr = useSessionTimer(sessionStart);

  const statusLabel: Record<Status, string> = {
    INITIALIZING: "BOOTING",
    LOADING_MODEL: "LOADING NEURAL NET",
    REQUESTING_CAMERA: "REQUESTING CAMERA",
    ACTIVE: "ACTIVE SCANNING",
    PAUSED: "STREAM PAUSED",
    ERROR: "FAULT DETECTED",
    NO_CAMERA: "CAMERA OFFLINE",
  };

  const statusColor =
    status === "ACTIVE"
      ? "#46c554"
      : status === "PAUSED"
      ? "#d29922"
      : status === "ERROR" || status === "NO_CAMERA"
      ? "#f85149"
      : "#58a6ff";

  return (
    <div className="min-h-screen w-full text-[color:var(--color-text)]">
      {/* Top nav */}
      <nav className="border-b-2 border-[#238636] bg-[#161b22]/90 backdrop-blur">
        <div className="max-w-[1400px] mx-auto px-6 py-3 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <LogoMark />
            <div>
              <div className="font-display font-bold tracking-[0.25em] text-[20px] text-[#f0f6fc] leading-none">
                MASSMIND
              </div>
              <div className="font-mono text-[10px] tracking-[0.3em] text-[#8b949e] mt-1">
                CROWD ANALYTICS ENGINE · v2.0
              </div>
            </div>
          </div>

          <div className="hidden md:flex items-center gap-6 font-mono text-[11px] tracking-[0.2em] text-[#8b949e]">
            <NavStat label="MODEL" value="COCO-SSD" />
            <NavStat label="BACKEND" value={tf.getBackend()?.toUpperCase() || "—"} />
            <NavStat label="SESSION" value={sessionDurationStr} />
          </div>

          <div className="flex items-center gap-2">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{
                background: statusColor,
                animation: status === "ACTIVE" ? "pulse-dot 1.6s infinite" : undefined,
              }}
            />
            <span
              className="font-mono text-[11px] tracking-[0.25em]"
              style={{ color: statusColor }}
            >
              {statusLabel[status]}
            </span>
          </div>
        </div>
      </nav>

      {/* Ticker */}
      <div className="bg-[#161b22] border-b border-[#30363d] overflow-hidden">
        <div
          className="flex whitespace-nowrap font-mono text-[11px] tracking-[0.2em] text-[#8b949e] py-1"
          style={{ animation: "ticker 60s linear infinite" }}
        >
          <TickerContent count={count} tier={tier} riskScore={riskScore} fps={fps} threshold={threshold} />
          <TickerContent count={count} tier={tier} riskScore={riskScore} fps={fps} threshold={threshold} />
        </div>
      </div>

      {/* Main grid */}
      <main className="max-w-[1400px] mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-5">
        {/* Video panel */}
        <section className="bg-[#161b22] border border-[#30363d] rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#30363d]">
            <div className="flex items-center gap-3">
              <span className="font-mono text-[10px] tracking-[0.3em] text-[#8b949e]">
                FEED
              </span>
              <span className="font-display font-semibold text-[#f0f6fc] tracking-wider">
                CAM-01 · PRIMARY OPTICAL
              </span>
            </div>
            <div className="flex items-center gap-4 font-mono text-[11px]">
              <span className="text-[#8b949e]">FPS</span>
              <span className="text-[#46c554]">{fps.toFixed(1)}</span>
              <span className="text-[#8b949e]">·</span>
              <span className="text-[#8b949e]">CONF</span>
              <span className="text-[#46c554]">{confidence}%</span>
            </div>
          </div>

          <div className="relative bg-black aspect-video">
            <video
              ref={videoRef}
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full object-cover pointer-events-none"
            />

            <div className="grid-overlay" />
            <div className="scan-overlay" />
            <div className="corner corner-tl" />
            <div className="corner corner-tr" />
            <div className="corner corner-bl" />
            <div className="corner corner-br" />

            {/* Overlay states */}
            {(status === "INITIALIZING" ||
              status === "LOADING_MODEL" ||
              status === "REQUESTING_CAMERA") && (
              <BootOverlay status={status} />
            )}
            {(status === "NO_CAMERA" || status === "ERROR") && (
              <ErrorOverlay status={status} message={errorMsg} onRetry={handleRestart} />
            )}

            {/* Bottom strip */}
            <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between font-mono text-[10px] tracking-[0.2em] pointer-events-none">
              <span className="text-[#8b949e] bg-black/60 px-2 py-1 rounded">
                REC ● {fmtTime(new Date())}
              </span>
              <span
                className="px-3 py-1 rounded font-bold"
                style={{
                  background: "rgba(0,0,0,0.7)",
                  color: tierC,
                  border: `1px solid ${tierC}`,
                }}
              >
                TIER {tier}
              </span>
            </div>
          </div>

          {/* Controls */}
          <div className="px-5 py-4 border-t border-[#30363d] flex flex-wrap items-center gap-3">
            <button
              onClick={handlePause}
              disabled={status !== "ACTIVE" && status !== "PAUSED"}
              className="font-mono text-[11px] tracking-[0.25em] px-4 py-2 rounded border border-[#30363d] bg-[#1c2128] text-[#c9d1d9] hover:border-[#238636] hover:text-[#46c554] transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {status === "PAUSED" ? "▶ RESUME" : "❚❚ PAUSE"}
            </button>
            <button
              onClick={handleRestart}
              className="font-mono text-[11px] tracking-[0.25em] px-4 py-2 rounded border border-[#238636] bg-[#238636]/20 text-[#46c554] hover:bg-[#238636]/40 transition"
            >
              ↻ RESTART STREAM
            </button>

            <div className="ml-auto flex items-center gap-4">
              <ThresholdControl value={threshold} onChange={setThreshold} />
              <AreaControl value={areaSqm} onChange={setAreaSqm} />
            </div>
          </div>
        </section>

        {/* Right rail */}
        <aside className="space-y-4">
          <PrimaryStat count={count} tier={tier} tierC={tierC} threshold={threshold} />

          <div className="grid grid-cols-2 gap-3">
            <MiniStat label="DENSITY" value={density.toFixed(2)} unit="ppl/m²" color="#58a6ff" />
            <MiniStat label="RISK SCORE" value={String(riskScore)} unit="/ 100" color={tierC} />
            <MiniStat label="PEAK · SESSION" value={String(peak)} unit="people" color="#d29922" />
            <MiniStat label="AVG · 60s" value={avg.toFixed(1)} unit="people" color="#46c554" />
          </div>

          <SystemPanel
            status={status}
            statusLabel={statusLabel[status]}
            statusColor={statusColor}
            bootMs={bootMs}
            fps={fps}
            confidence={confidence}
          />
        </aside>

        {/* Bottom row */}
        <section className="lg:col-span-2 grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-5">
          <HistoryChart history={history} threshold={threshold} tierC={tierC} />
          <LogPanel logs={logs} />
        </section>
      </main>

      <footer className="max-w-[1400px] mx-auto px-6 py-6 font-mono text-[10px] tracking-[0.3em] text-[#8b949e] flex flex-wrap items-center justify-between gap-3">
        <span>MASSMIND · CROWD SAFETY · ALL DETECTION RUNS LOCALLY IN-BROWSER</span>
        <span>{`STATUS ${statusLabel[status]} · BOOT ${bootMs}ms`}</span>
      </footer>
    </div>
  );
}

/* --------------------------- subcomponents --------------------------- */

function LogoMark() {
  return (
    <div className="relative w-9 h-9 flex items-center justify-center">
      <div
        className="absolute inset-0 rounded border-2 border-[#238636]"
        style={{ animation: "pulse-glow 2.4s infinite" }}
      />
      <div className="relative font-display font-bold text-[#46c554] text-[18px] glow-text">
        M
      </div>
    </div>
  );
}

function NavStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[#6e7681]">{label}</span>
      <span className="text-[#c9d1d9]">{value}</span>
    </div>
  );
}

function TickerContent({
  count,
  tier,
  riskScore,
  fps,
  threshold,
}: {
  count: number;
  tier: RiskTier;
  riskScore: number;
  fps: number;
  threshold: number;
}) {
  const items = [
    `[ LIVE_COUNT ${String(count).padStart(3, "0")} ]`,
    `[ TIER ${tier} ]`,
    `[ RISK ${riskScore}/100 ]`,
    `[ THRESHOLD ${threshold} ]`,
    `[ FPS ${fps.toFixed(1)} ]`,
    `[ MODEL COCO-SSD · LITE_MOBILENET_V2 ]`,
    `[ INFERENCE LOCAL · NO DATA EGRESS ]`,
    `[ MASSMIND · CROWD SAFETY GRID ]`,
  ];
  return (
    <div className="flex gap-10 px-6 shrink-0">
      {items.map((it, i) => (
        <span key={i}>{it}</span>
      ))}
    </div>
  );
}

function BootOverlay({ status }: { status: Status }) {
  const messages: Record<Status, string> = {
    INITIALIZING: "INITIALIZING SUBSYSTEMS",
    LOADING_MODEL: "LOADING NEURAL NETWORK · COCO-SSD",
    REQUESTING_CAMERA: "REQUESTING OPTICAL FEED ACCESS",
    ACTIVE: "",
    PAUSED: "",
    ERROR: "",
    NO_CAMERA: "",
  };
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
      <div
        className="w-14 h-14 rounded-full border-2 border-[#238636] border-t-transparent"
        style={{ animation: "sweep 1s linear infinite" }}
      />
      <div className="mt-5 font-mono text-[12px] tracking-[0.3em] text-[#46c554]">
        {messages[status]}
      </div>
      <div className="mt-1 font-mono text-[10px] tracking-[0.3em] text-[#8b949e]">
        PLEASE STAND BY
      </div>
    </div>
  );
}

function ErrorOverlay({
  status,
  message,
  onRetry,
}: {
  status: Status;
  message: string;
  onRetry: () => void;
}) {
  const isPermission = status === "NO_CAMERA";
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/85 z-10 p-6 text-center">
      <div className="font-mono text-[11px] tracking-[0.3em] text-[#f85149] mb-3">
        {isPermission ? "OPTICAL FEED OFFLINE" : "SYSTEM FAULT"}
      </div>
      <div className="font-display font-bold text-[24px] text-[#f0f6fc] mb-2 tracking-wider">
        {isPermission ? "Camera Permission Required" : "Initialization Failed"}
      </div>
      <div className="font-mono text-[11px] text-[#8b949e] max-w-md mb-5 leading-relaxed">
        {isPermission
          ? "MassMind needs camera access to scan the crowd. Click your browser's camera icon, allow access, then restart the stream."
          : message || "An unexpected error occurred while booting the analytics engine."}
      </div>
      <button
        onClick={onRetry}
        className="font-mono text-[11px] tracking-[0.25em] px-5 py-2 rounded border border-[#238636] bg-[#238636]/30 text-[#46c554] hover:bg-[#238636]/50 transition"
      >
        ↻ RETRY
      </button>
    </div>
  );
}

function PrimaryStat({
  count,
  tier,
  tierC,
  threshold,
}: {
  count: number;
  tier: RiskTier;
  tierC: string;
  threshold: number;
}) {
  const pct = Math.min(100, (count / Math.max(1, threshold)) * 100);
  const critical = tier === "CRITICAL";
  return (
    <div
      className="bg-[#161b22] border rounded-xl p-5 relative overflow-hidden"
      style={{
        borderColor: critical ? "#f85149" : "#30363d",
        animation: critical ? "pulse-danger 1.4s infinite" : undefined,
      }}
    >
      <div className="font-mono text-[10px] tracking-[0.3em] text-[#8b949e] mb-1">
        LIVE PERSON COUNT
      </div>
      <div
        className="font-display font-bold text-[68px] leading-none glow-text"
        style={{ color: tierC, animation: "flicker 4s infinite" }}
      >
        {String(count).padStart(2, "0")}
      </div>
      <div className="mt-3 flex items-center justify-between font-mono text-[11px] tracking-[0.2em]">
        <span className="text-[#8b949e]">TIER</span>
        <span style={{ color: tierC }} className="font-bold">{tier}</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-[#0d1117] overflow-hidden border border-[#30363d]">
        <div
          className="h-full transition-all duration-300"
          style={{ width: `${pct}%`, background: tierC, boxShadow: `0 0 8px ${tierC}` }}
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-[#6e7681] tracking-[0.2em]">
        <span>0</span>
        <span>THRESHOLD {threshold}</span>
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: string;
  unit: string;
  color: string;
}) {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-3.5">
      <div className="font-mono text-[10px] tracking-[0.25em] text-[#8b949e] mb-1">
        {label}
      </div>
      <div
        className="font-display font-bold text-[22px] leading-none"
        style={{ color }}
      >
        {value}
      </div>
      <div className="font-mono text-[10px] text-[#6e7681] mt-1 tracking-wider">
        {unit}
      </div>
    </div>
  );
}

function SystemPanel({
  statusLabel,
  statusColor,
  bootMs,
  fps,
  confidence,
}: {
  status: Status;
  statusLabel: string;
  statusColor: string;
  bootMs: number;
  fps: number;
  confidence: number;
}) {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-4">
      <div className="font-mono text-[10px] tracking-[0.3em] text-[#8b949e] mb-3">
        SYSTEM TELEMETRY
      </div>
      <div className="space-y-2 font-mono text-[11px]">
        <Row label="STATUS" value={statusLabel} color={statusColor} />
        <Row label="MODEL" value="COCO-SSD · LITE_MOBILENET_V2" />
        <Row label="BACKEND" value={(tf.getBackend() || "—").toUpperCase()} />
        <Row label="BOOT TIME" value={`${bootMs} ms`} />
        <Row label="FPS" value={fps.toFixed(1)} color="#46c554" />
        <Row label="CONFIDENCE" value={`${confidence}%`} color="#46c554" />
        <Row label="DETECTION CLASS" value="person (COCO id 0)" />
        <Row label="DATA EGRESS" value="NONE · LOCAL ONLY" color="#46c554" />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[#6e7681] tracking-[0.25em]">{label}</span>
      <span style={{ color: color || "#c9d1d9" }} className="text-right">
        {value}
      </span>
    </div>
  );
}

function ThresholdControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-3 font-mono text-[11px] tracking-[0.2em]">
      <span className="text-[#8b949e]">THRESHOLD</span>
      <input
        type="range"
        min={1}
        max={50}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-[#238636] w-32"
      />
      <span className="text-[#46c554] w-8 text-right">{value}</span>
    </label>
  );
}

function AreaControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center gap-3 font-mono text-[11px] tracking-[0.2em]">
      <span className="text-[#8b949e]">AREA m²</span>
      <input
        type="number"
        min={1}
        max={500}
        value={value}
        onChange={(e) => onChange(Math.max(1, Number(e.target.value) || 1))}
        className="bg-[#0d1117] border border-[#30363d] rounded px-2 py-1 w-16 text-[#c9d1d9] focus:outline-none focus:border-[#238636]"
      />
    </label>
  );
}

function HistoryChart({
  history,
  threshold,
  tierC,
}: {
  history: HistoryPoint[];
  threshold: number;
  tierC: string;
}) {
  const W = 800;
  const H = 200;
  const pad = 28;
  const max = Math.max(threshold * 1.5, ...history.map((p) => p.count), 1);

  const points = history.map((p, i) => {
    const x = pad + (i / Math.max(1, MAX_HISTORY - 1)) * (W - pad * 2);
    const y = H - pad - (p.count / max) * (H - pad * 2);
    return [x, y] as const;
  });

  const pathD = points.length
    ? "M" + points.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join("L")
    : "";

  const areaD = points.length
    ? pathD +
      `L${points[points.length - 1][0].toFixed(1)},${H - pad} L${points[0][0].toFixed(1)},${H - pad} Z`
    : "";

  const thresholdY = H - pad - (threshold / max) * (H - pad * 2);

  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-mono text-[10px] tracking-[0.3em] text-[#8b949e]">
            CROWD COUNT · LAST 60 SAMPLES
          </div>
          <div className="font-display font-semibold text-[#f0f6fc] tracking-wider mt-0.5">
            DENSITY TIMELINE
          </div>
        </div>
        <div className="flex items-center gap-4 font-mono text-[11px] tracking-[0.2em]">
          <Legend color={tierC} label="LIVE" />
          <Legend color="#f85149" label="THRESHOLD" dashed />
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[200px]">
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={tierC} stopOpacity="0.45" />
            <stop offset="100%" stopColor={tierC} stopOpacity="0" />
          </linearGradient>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#30363d" strokeWidth="0.5" opacity="0.5" />
          </pattern>
        </defs>
        <rect x="0" y="0" width={W} height={H} fill="url(#grid)" />

        {/* Threshold line */}
        <line
          x1={pad}
          x2={W - pad}
          y1={thresholdY}
          y2={thresholdY}
          stroke="#f85149"
          strokeWidth="1.5"
          strokeDasharray="6 4"
          opacity="0.7"
        />
        <text
          x={W - pad}
          y={thresholdY - 6}
          textAnchor="end"
          fontFamily="JetBrains Mono"
          fontSize="10"
          fill="#f85149"
        >
          THRESHOLD {threshold}
        </text>

        {/* Y axis labels */}
        {[0, 0.5, 1].map((f) => {
          const y = H - pad - f * (H - pad * 2);
          const v = Math.round(f * max);
          return (
            <g key={f}>
              <text
                x={pad - 6}
                y={y + 3}
                textAnchor="end"
                fontFamily="JetBrains Mono"
                fontSize="10"
                fill="#6e7681"
              >
                {v}
              </text>
            </g>
          );
        })}

        {/* Area + line */}
        {points.length > 1 && (
          <>
            <path d={areaD} fill="url(#areaGrad)" />
            <path d={pathD} fill="none" stroke={tierC} strokeWidth="2" />
            {points.length > 0 && (
              <circle
                cx={points[points.length - 1][0]}
                cy={points[points.length - 1][1]}
                r="4"
                fill={tierC}
                stroke="#0d1117"
                strokeWidth="2"
              />
            )}
          </>
        )}
        {points.length === 0 && (
          <text
            x={W / 2}
            y={H / 2}
            textAnchor="middle"
            fontFamily="JetBrains Mono"
            fontSize="11"
            fill="#6e7681"
            letterSpacing="2"
          >
            AWAITING DATA STREAM
          </text>
        )}
      </svg>
    </div>
  );
}

function Legend({
  color,
  label,
  dashed,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="flex items-center gap-2 text-[#8b949e]">
      <svg width="22" height="6">
        <line
          x1="0"
          y1="3"
          x2="22"
          y2="3"
          stroke={color}
          strokeWidth="2"
          strokeDasharray={dashed ? "4 3" : undefined}
        />
      </svg>
      {label}
    </span>
  );
}

function LogPanel({ logs }: { logs: LogEntry[] }) {
  return (
    <div className="bg-[#161b22] border border-[#30363d] rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="font-mono text-[10px] tracking-[0.3em] text-[#8b949e]">
            LIVE LOG · STDOUT
          </div>
          <div className="font-display font-semibold text-[#f0f6fc] tracking-wider mt-0.5">
            EVENT STREAM
          </div>
        </div>
        <span
          className="inline-block w-2 h-2 rounded-full bg-[#46c554]"
          style={{ animation: "pulse-dot 1.4s infinite" }}
        />
      </div>
      <div className="font-mono text-[11px] leading-[1.7] max-h-[240px] overflow-y-auto pr-2">
        {logs.length === 0 && (
          <div className="text-[#6e7681]">[--:--:--] [INFO] awaiting log entries…</div>
        )}
        {logs.map((l) => {
          const c =
            l.level === "ALERT"
              ? "#f85149"
              : l.level === "WARN"
              ? "#d29922"
              : "#46c554";
          return (
            <div key={l.id} className="flex gap-2">
              <span className="text-[#6e7681]">[{l.ts}]</span>
              <span style={{ color: c }} className="font-bold w-12 shrink-0">
                {l.level}
              </span>
              <span className="text-[#c9d1d9]">{l.msg}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function useSessionTimer(start: Date) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const ms = now - start.getTime();
  const s = Math.floor(ms / 1000);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export default App;
