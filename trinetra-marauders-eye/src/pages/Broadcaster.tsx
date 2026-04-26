import { useEffect, useRef, useState } from "react";
import { Brand } from "./Landing";
import { createBroadcaster, type BroadcasterHandle } from "../lib/phoneLink";

type Phase =
  | "idle"
  | "requesting"
  | "calling"
  | "live"
  | "ended"
  | "error";

export default function Broadcaster({ peerId }: { peerId: string }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const handleRef = useRef<BroadcasterHandle | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [facing, setFacing] = useState<"environment" | "user">("environment");

  const insecureOrigin =
    typeof window !== "undefined" &&
    !window.isSecureContext &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1";

  useEffect(() => {
    return () => {
      try {
        handleRef.current?.destroy();
      } catch {}
      const s = streamRef.current;
      if (s) s.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const start = async () => {
    setErrorMsg("");
    setPhase("requesting");
    try {
      if (
        typeof window !== "undefined" &&
        !window.isSecureContext &&
        window.location.hostname !== "localhost" &&
        window.location.hostname !== "127.0.0.1"
      ) {
        throw new Error(
          `Camera blocked: this page is loaded over insecure HTTP (${window.location.origin}). Phone browsers only allow camera access on HTTPS or localhost. Open the dashboard over its HTTPS URL (or the Replit preview URL) and rescan the QR code.`,
        );
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error(
          "This browser does not expose getUserMedia. Try Chrome or Safari on the phone, and make sure the page is on HTTPS.",
        );
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => {});
      }
      setPhase("calling");
      handleRef.current = createBroadcaster(peerId, stream, {
        onConnected: () => setPhase("live"),
        onClosed: () => setPhase("ended"),
        onError: (msg) => {
          setErrorMsg(msg);
          setPhase("error");
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
      setPhase("error");
    }
  };

  const stop = () => {
    try {
      handleRef.current?.destroy();
    } catch {}
    handleRef.current = null;
    const s = streamRef.current;
    if (s) s.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setPhase("ended");
  };

  const swapCamera = async () => {
    const next = facing === "environment" ? "user" : "environment";
    setFacing(next);
    if (phase === "live" || phase === "calling") {
      try {
        handleRef.current?.destroy();
      } catch {}
      handleRef.current = null;
      const s = streamRef.current;
      if (s) s.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      // Restart with new facing.
      setPhase("idle");
      // Small delay so React re-renders before getUserMedia.
      setTimeout(() => start(), 50);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-[#b59868] bg-[#fbf3dd]/70 backdrop-blur">
        <div className="max-w-[720px] mx-auto px-5 h-16 flex items-center">
          <Brand />
        </div>
      </header>

      <main className="flex-1 max-w-[720px] w-full mx-auto px-5 py-6 flex flex-col gap-5">
        <div>
          <span className="tag bg-[#efd6c1] text-[#740001] mb-3 border border-[#b59868] inline-flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#740001]" />
            Phone Camera · Floo Link
          </span>
          <h1 className="font-display font-extrabold text-[28px] sm:text-[34px] leading-tight text-[#2b1d0e]">
            <span className="font-quill italic">Send your wand's eye </span>
            <span className="brand-gradient font-quill italic">to the map.</span>
          </h1>
          <p className="mt-2 text-[14px] text-[#5a4226] font-quill italic">
            This phone will stream its camera live to the laptop running
            TRINETRA. Keep this tab open while watching the dashboard.
          </p>
        </div>

        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-[#d6c08a] flex items-center justify-between">
            <div>
              <div className="text-[10px] tracking-[0.18em] uppercase text-[#8a6f44]">
                Linked map
              </div>
              <div className="font-mono text-[12px] text-[#2b1d0e] break-all">
                {peerId}
              </div>
            </div>
            <StatusPill phase={phase} />
          </div>

          <div className="relative bg-[#2b1d0e] aspect-video">
            <video
              ref={videoRef}
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
              style={{
                transform: facing === "user" ? "scaleX(-1)" : undefined,
              }}
            />
            {phase === "idle" && (
              <div className="absolute inset-0 flex items-center justify-center text-[#fbf3dd] font-quill italic text-sm px-6 text-center">
                Tap "Start streaming" below to send your camera.
              </div>
            )}
          </div>

          <div className="p-4 flex flex-wrap items-center gap-2">
            {phase === "idle" || phase === "ended" || phase === "error" ? (
              <button
                onClick={start}
                className="btn btn-primary"
                disabled={insecureOrigin}
                title={
                  insecureOrigin
                    ? "Page is on HTTP. Phones only allow camera access on HTTPS or localhost."
                    : undefined
                }
              >
                Start streaming →
              </button>
            ) : (
              <button onClick={stop} className="btn btn-primary">
                Stop streaming
              </button>
            )}
            <button onClick={swapCamera} className="btn">
              Swap to {facing === "environment" ? "front" : "rear"} camera
            </button>
            <a href="?" className="btn">
              Back
            </a>
          </div>
        </div>

        {insecureOrigin && (
          <div className="card p-4 border-l-4 border-l-[#b45309]">
            <div className="text-[12px] uppercase tracking-[0.18em] text-[#b45309]">
              Insecure connection — camera blocked
            </div>
            <div className="text-[13px] text-[#2b1d0e] mt-1 break-words">
              This page is loaded over plain HTTP ({window.location.origin}).
              Phone browsers refuse camera access unless the site is HTTPS or
              localhost.
            </div>
            <ul className="text-[12px] text-[#5a4226] mt-2 list-disc pl-4 space-y-1">
              <li>
                Open the dashboard at its <strong>https://</strong> URL on the
                laptop, then rescan the QR.
              </li>
              <li>
                Running locally in VS Code? The Vite dev server is configured
                to serve HTTPS — visit{" "}
                <code>https://{window.location.host}</code> on the laptop and
                accept the self-signed certificate warning.
              </li>
              <li>
                Or use the public Replit preview URL — it's already HTTPS.
              </li>
            </ul>
          </div>
        )}

        {errorMsg && (
          <div className="card p-4 border-l-4 border-l-[#b91c1c]">
            <div className="text-[12px] uppercase tracking-[0.18em] text-[#b91c1c]">
              Something went wrong
            </div>
            <div className="text-[13px] text-[#2b1d0e] mt-1 break-words">
              {errorMsg}
            </div>
            <ul className="text-[12px] text-[#5a4226] mt-2 list-disc pl-4 space-y-1">
              <li>Allow camera access when the phone prompts.</li>
              <li>Make sure the laptop's TRINETRA tab is still open.</li>
              <li>If on cellular, try the same Wi-Fi as the laptop.</li>
            </ul>
          </div>
        )}

        <div className="text-[12px] text-[#8a6f44] font-quill italic text-center">
          Streaming peer-to-peer. No video is uploaded to any server.
        </div>
      </main>
    </div>
  );
}

function StatusPill({ phase }: { phase: Phase }) {
  const map: Record<Phase, { text: string; bg: string; fg: string; dot: string }> = {
    idle: { text: "Idle", bg: "#efd6c1", fg: "#5a4226", dot: "#8a6f44" },
    requesting: { text: "Requesting camera…", bg: "#efd6c1", fg: "#5a4226", dot: "#f59e0b" },
    calling: { text: "Connecting…", bg: "#efd6c1", fg: "#5a4226", dot: "#f59e0b" },
    live: { text: "Live", bg: "#dcfce7", fg: "#166534", dot: "#10b981" },
    ended: { text: "Ended", bg: "#efd6c1", fg: "#5a4226", dot: "#8a6f44" },
    error: { text: "Error", bg: "#fee2e2", fg: "#991b1b", dot: "#b91c1c" },
  };
  const s = map[phase];
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
      style={{ background: s.bg, color: s.fg }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full"
        style={{
          background: s.dot,
          animation:
            phase === "live" || phase === "calling" || phase === "requesting"
              ? "pulse-ring 1.6s infinite"
              : undefined,
        }}
      />
      {s.text}
    </span>
  );
}
