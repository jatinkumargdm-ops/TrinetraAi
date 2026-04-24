import { useRef, useState } from "react";

export type SourceConfig =
  | { kind: "webcam" }
  | { kind: "video"; file: File }
  | { kind: "image"; file: File };

export default function Landing({
  onStart,
}: {
  onStart: (cfg: SourceConfig) => void;
}) {
  const videoRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const [leaving, setLeaving] = useState(false);

  const start = (cfg: SourceConfig) => {
    setLeaving(true);
    setTimeout(() => onStart(cfg), 320);
  };

  return (
    <div
      className={`min-h-screen flex flex-col transition-all duration-300 ease-out ${
        leaving ? "opacity-0 -translate-y-2" : "opacity-100 translate-y-0"
      }`}
      style={{ animation: !leaving ? "landingIn 0.5s ease-out" : undefined }}
    >
      <style>{`
        @keyframes landingIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(12px) scale(0.98); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <Header />

      <main className="flex-1 max-w-[1200px] w-full mx-auto px-6 py-10 lg:py-14 grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-12 items-center">
        <section style={{ animation: "landingIn 0.6s ease-out both" }}>
          <span className="tag bg-[#e1ecff] text-[#1d6cf3] mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1d6cf3]" />
            CROWD SAFETY · IN YOUR BROWSER
          </span>
          <h1 className="font-display font-extrabold text-[44px] lg:text-[58px] leading-[1.05] tracking-tight text-[#0f1f3d]">
            See the crowd.
            <br />
            <span className="brand-gradient">Stop the stampede.</span>
          </h1>
          <p className="mt-5 text-[17px] leading-[1.6] text-[#314869] max-w-[560px]">
            TRINETRA AI watches a live camera, recorded video or photo and tells
            you in real time how crowded the scene is, who's there, and whether
            anything looks unsafe — privately, on your device.
          </p>

          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-[640px]">
            <Pill label="Live people count" />
            <Pill label="Safety zones" />
            <Pill label="Age & gender" />
            <Pill label="Mask check" />
            <Pill label="Fall / run alerts" />
            <Pill label="Crowd flow" />
            <Pill label="Audio alarm" />
            <Pill label="100% private" />
          </div>
        </section>

        <section
          className="card p-7"
          style={{ animation: "cardIn 0.55s 0.1s ease-out both" }}
        >
          <h2 className="font-display font-bold text-[20px] text-[#0f1f3d]">
            Choose a source
          </h2>
          <p className="text-[14px] text-[#6b7d99] mt-1">
            Pick how TRINETRA AI should see the scene.
          </p>

          <div className="mt-6 space-y-3">
            <SourceCard
              title="Use webcam"
              subtitle="Scan the live feed from your device camera"
              icon={<WebcamIcon />}
              cta="Start"
              variant="primary"
              onClick={() => start({ kind: "webcam" })}
            />

            <SourceCard
              title="Upload a video"
              subtitle="Analyse an MP4 / WebM / MOV recording"
              icon={<VideoIcon />}
              cta="Choose file"
              onClick={() => videoRef.current?.click()}
            />

            <SourceCard
              title="Upload a photo"
              subtitle="Run a one-shot analysis on a JPG or PNG"
              icon={<ImageIcon />}
              cta="Choose file"
              onClick={() => imageRef.current?.click()}
            />

            <input
              ref={videoRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) start({ kind: "video", file: f });
              }}
            />
            <input
              ref={imageRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) start({ kind: "image", file: f });
              }}
            />
          </div>

          <p className="mt-6 text-[12px] text-[#6b7d99] leading-relaxed">
            By starting, you agree that the camera or file you choose will be
            analysed locally. Nothing is uploaded.
          </p>
        </section>
      </main>

      <Footer />
    </div>
  );
}

function SourceCard({
  title,
  subtitle,
  icon,
  onClick,
  cta,
  variant,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  onClick: () => void;
  cta: string;
  variant?: "primary" | "default";
}) {
  const primary = variant === "primary";
  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-center gap-4 p-4 rounded-xl border border-[#e6edf5] bg-[#f8fafc] hover:border-[#1d6cf3] hover:bg-white hover:shadow-md transition group"
    >
      <div
        className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition group-hover:scale-105 ${
          primary
            ? "bg-gradient-to-br from-[#1d6cf3] to-[#06b6d4] text-white shadow-md"
            : "bg-white border border-[#d8e2ee] text-[#1d6cf3]"
        }`}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[#0f1f3d]">{title}</div>
        <div className="text-[13px] text-[#6b7d99] mt-0.5">{subtitle}</div>
      </div>
      <span className="text-[13px] font-semibold text-[#1d6cf3] group-hover:translate-x-1 transition">
        {cta} →
      </span>
    </button>
  );
}

function Pill({ label }: { label: string }) {
  return (
    <div className="px-3 py-2 rounded-lg bg-white border border-[#e6edf5] text-[13px] font-medium text-[#314869] text-center">
      {label}
    </div>
  );
}

function Header() {
  return (
    <header className="border-b border-[#e6edf5] bg-white/70 backdrop-blur">
      <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
        <Brand />
        <div className="hidden md:flex items-center gap-3 text-[13px] font-medium text-[#314869]">
          <span className="tag bg-[#e1ecff] text-[#1d6cf3]">Hackathon Edition</span>
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[#e6edf5] py-5">
      <div className="max-w-[1200px] mx-auto px-6 flex items-center justify-between text-[12px] text-[#6b7d99]">
        <span>TRINETRA AI · Crowd safety vision</span>
        <span>Runs entirely in your browser</span>
      </div>
    </footer>
  );
}

export function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-[#1d6cf3] to-[#06b6d4] flex items-center justify-center shadow-md">
        <EyeIcon />
        <span
          className="absolute inset-0 rounded-xl pointer-events-none"
          style={{ animation: "pulse-ring 2.4s infinite" }}
        />
      </div>
      <div className="leading-tight">
        <div className="font-display font-extrabold text-[18px] tracking-tight text-[#0f1f3d]">
          TRINETRA <span className="brand-gradient">AI</span>
        </div>
        <div className="text-[10.5px] tracking-[0.18em] text-[#6b7d99] uppercase">
          Crowd Safety Vision
        </div>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function WebcamIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="11" r="6" />
      <circle cx="12" cy="11" r="2" />
      <path d="M5 21h14" />
      <path d="M9 21l1-3M15 21l-1-3" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="6" width="14" height="12" rx="2" />
      <path d="M22 8l-6 4 6 4V8z" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}
