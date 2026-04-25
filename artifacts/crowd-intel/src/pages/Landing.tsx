import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "../components/ThemeToggle";

export type SourceConfig =
  | { kind: "webcam" }
  | { kind: "phone" }
  | { kind: "video"; file: File }
  | { kind: "image"; file: File };

type CardKey = "webcam" | "phone" | "video" | "image";

const CARDS: {
  key: CardKey;
  spell: string;
  title: string;
  subtitle: string;
  body: string;
  cta: string;
  icon: (cls?: string) => React.ReactNode;
}[] = [
  {
    key: "webcam",
    spell: "Lumos",
    title: "Reveal Your Map",
    subtitle: "Open your live camera to scan the corridor.",
    body: "The Marauder's Eye watches every footstep through the lens of your wand.",
    cta: "Cast Lumos",
    icon: WandIcon,
  },
  {
    key: "phone",
    spell: "Floo Link",
    title: "Send Your Phone's Eye",
    subtitle: "Stream live video from your phone camera.",
    body: "Scan a QR code on your phone and the Eye will see whatever your phone sees — instantly, peer-to-peer.",
    cta: "Open Floo Link",
    icon: PhoneIcon,
  },
  {
    key: "video",
    spell: "Pensieve",
    title: "Recall a Memory",
    subtitle: "Pour a recorded video into the basin.",
    body: "Drop in any MP4, WebM or MOV and watch it unfold across the map.",
    cta: "Choose memory",
    icon: PensieveIcon,
  },
  {
    key: "image",
    spell: "Photograph",
    title: "Pin a Moving Portrait",
    subtitle: "Examine a single still scene.",
    body: "Hand the Eye a photograph and it will tell you who is in the frame.",
    cta: "Choose portrait",
    icon: PortraitIcon,
  },
];

export default function Landing({
  onStart,
}: {
  onStart: (cfg: SourceConfig) => void;
}) {
  const videoFileRef = useRef<HTMLInputElement>(null);
  const imageFileRef = useRef<HTMLInputElement>(null);
  const touchStartX = useRef<number | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [active, setActive] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);

  const start = (cfg: SourceConfig) => {
    setLeaving(true);
    setTimeout(() => onStart(cfg), 320);
  };

  const goTo = (next: number) => {
    const n = (next + CARDS.length) % CARDS.length;
    setDirection(n > active || (n === 0 && active === CARDS.length - 1) ? 1 : -1);
    setActive(n);
  };

  const triggerActive = () => {
    const card = CARDS[active];
    if (card.key === "webcam") start({ kind: "webcam" });
    else if (card.key === "phone") start({ kind: "phone" });
    else if (card.key === "video") videoFileRef.current?.click();
    else imageFileRef.current?.click();
  };

  // Keyboard arrow navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (leaving) return;
      if (e.key === "ArrowRight") goTo(active + 1);
      else if (e.key === "ArrowLeft") goTo(active - 1);
      else if (e.key === "Enter") triggerActive();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, leaving]);

  return (
    <div
      className={`min-h-screen flex flex-col transition-all duration-300 ease-out ${
        leaving ? "opacity-0 -translate-y-2" : "opacity-100 translate-y-0"
      }`}
      style={{ animation: !leaving ? "landingIn 0.6s ease-out" : undefined }}
    >
      <style>{`
        @keyframes landingIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <Header />

      <main className="flex-1 max-w-[1200px] w-full mx-auto px-6 py-10 lg:py-14 grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-12 items-center">
        <section style={{ animation: "landingIn 0.6s ease-out both" }}>
          <span className="tag bg-[#efd6c1] text-[#740001] mb-5 border border-[#b59868]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#740001]" />
            The Marauder's Eye · Hogwarts Edition
          </span>
          <h1 className="font-display font-extrabold text-[40px] lg:text-[56px] leading-[1.05] tracking-tight text-[#2b1d0e]">
            <span className="font-quill italic">"I solemnly swear</span>
            <br />
            <span className="brand-gradient font-quill italic">that I am up to no good."</span>
          </h1>
          <p className="mt-6 text-[17px] leading-[1.7] text-[#5a4226] max-w-[560px] font-quill italic">
            Tap your wand to the parchment. The Marauder's Eye reveals every
            footstep in the corridor — counting souls, sensing peril, watching
            the Forbidden Corridor for trouble.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <SpellChip label="Marauder's Count" />
            <SpellChip label="Forbidden Corridor" />
            <SpellChip label="Polyjuice Scan" />
            <SpellChip label="Invisibility Check" />
          </div>
        </section>

        <section
          className="relative"
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0].clientX;
          }}
          onTouchEnd={(e) => {
            if (touchStartX.current == null) return;
            const dx = e.changedTouches[0].clientX - touchStartX.current;
            if (Math.abs(dx) > 40) goTo(active + (dx < 0 ? 1 : -1));
            touchStartX.current = null;
          }}
        >
          <div className="card p-7 min-h-[440px] relative overflow-hidden">
            <div className="flex items-center justify-between relative z-10">
              <h2 className="font-display font-bold text-[18px] text-[#2b1d0e] tracking-wide uppercase">
                Choose your spell
              </h2>
              <span className="text-[12px] font-quill italic text-[#8a6f44]">
                {active + 1} / {CARDS.length}
              </span>
            </div>

            <div className="relative mt-6 min-h-[300px]">
              {CARDS.map((card, i) => (
                <SpellCard
                  key={card.key}
                  card={card}
                  active={i === active}
                  direction={direction}
                  onActivate={triggerActive}
                />
              ))}
            </div>

            {/* Carousel controls */}
            <div className="flex items-center justify-between mt-6 relative z-10">
              <button
                onClick={() => goTo(active - 1)}
                className="w-10 h-10 rounded-full border border-[#b59868] bg-[#fbf3dd] hover:bg-[#efd6c1] hover:border-[#740001] hover:text-[#740001] flex items-center justify-center transition shadow-sm"
                aria-label="Previous spell"
              >
                <ChevronLeft />
              </button>

              <div className="flex items-center gap-2">
                {CARDS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setDirection(i > active ? 1 : -1);
                      setActive(i);
                    }}
                    className="rounded-full transition-all"
                    style={{
                      width: i === active ? 24 : 8,
                      height: 8,
                      background: i === active ? "#740001" : "#b59868",
                    }}
                    aria-label={`Go to spell ${i + 1}`}
                  />
                ))}
              </div>

              <button
                onClick={() => goTo(active + 1)}
                className="w-10 h-10 rounded-full border border-[#b59868] bg-[#fbf3dd] hover:bg-[#efd6c1] hover:border-[#740001] hover:text-[#740001] flex items-center justify-center transition shadow-sm"
                aria-label="Next spell"
              >
                <ChevronRight />
              </button>
            </div>
          </div>

          <input
            ref={videoFileRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) start({ kind: "video", file: f });
            }}
          />
          <input
            ref={imageFileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) start({ kind: "image", file: f });
            }}
          />
        </section>
      </main>

      <Footer />
    </div>
  );
}

function SpellCard({
  card,
  active,
  direction,
  onActivate,
}: {
  card: typeof CARDS[number];
  active: boolean;
  direction: 1 | -1;
  onActivate: () => void;
}) {
  return (
    <div
      className="absolute inset-0 transition-all duration-500 ease-out"
      style={{
        opacity: active ? 1 : 0,
        transform: active
          ? "translateX(0) rotate(0)"
          : `translateX(${direction * 60}px) rotate(${direction * 0.6}deg)`,
        pointerEvents: active ? "auto" : "none",
        filter: active ? "blur(0)" : "blur(2px)",
      }}
    >
      <div className="flex flex-col items-center text-center pt-2">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center mb-4 shadow-md"
          style={{
            background:
              "radial-gradient(circle, #fff5d4 0%, #f4e4bc 60%, #d6b974 100%)",
            border: "2px solid #b59868",
            boxShadow:
              "0 0 24px rgba(255, 200, 90, 0.45), inset 0 0 12px rgba(255, 220, 130, 0.5)",
          }}
        >
          {card.icon()}
        </div>
        <span className="tag bg-[#efd6c1] text-[#740001] border border-[#b59868] mb-3">
          {card.spell}
        </span>
        <h3 className="font-display font-bold text-[26px] text-[#2b1d0e] tracking-tight">
          {card.title}
        </h3>
        <p className="font-quill italic text-[#5a4226] mt-2 max-w-[340px] text-[15px] leading-relaxed">
          {card.body}
        </p>
        <p className="text-[13px] text-[#8a6f44] mt-2">{card.subtitle}</p>

        <button onClick={onActivate} className="btn btn-primary mt-6">
          {card.cta} →
        </button>
      </div>
    </div>
  );
}

function SpellChip({ label }: { label: string }) {
  return (
    <div
      className="px-3 py-1.5 rounded-full bg-[#fbf3dd] border border-[#b59868] text-[12px] font-medium text-[#5a4226]"
      style={{ fontFamily: "'Cinzel', serif", letterSpacing: "0.05em" }}
    >
      {label}
    </div>
  );
}

function Header() {
  return (
    <header className="border-b border-[#b59868] bg-[#fbf3dd]/70 backdrop-blur">
      <div className="max-w-[1200px] mx-auto px-6 h-16 flex items-center justify-between">
        <Brand />
        <ThemeToggle />
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[#b59868] py-5">
      <div className="max-w-[1200px] mx-auto px-6 flex items-center justify-center text-[12px] text-[#8a6f44]">
        <span className="font-quill italic">
          Messrs Moony, Wormtail, Padfoot &amp; Prongs are proud to present —
          The Marauder's Eye
        </span>
      </div>
    </footer>
  );
}

export function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div
        className="relative w-10 h-10 rounded-full flex items-center justify-center"
        style={{
          background:
            "radial-gradient(circle, #fff5d4 0%, #d6b974 60%, #8a6f44 100%)",
          border: "2px solid #2b1d0e",
          boxShadow: "0 0 12px rgba(255, 200, 90, 0.55)",
        }}
      >
        <EyeIcon />
        <span
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{ animation: "pulse-ring 2.4s infinite" }}
        />
      </div>
      <div className="leading-tight">
        <div className="font-display font-extrabold text-[16px] tracking-tight text-[#2b1d0e]">
          TRINETRA <span className="brand-gradient">: The Marauder's Eye</span>
        </div>
        <div className="text-[10px] tracking-[0.22em] text-[#8a6f44] uppercase font-quill italic">
          Mischief Detected
        </div>
      </div>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2b1d0e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" fill="#740001" stroke="#740001" />
    </svg>
  );
}

function WandIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2b1d0e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21l13-13" />
      <path d="M16 8l3-3" />
      <circle cx="19" cy="5" r="1.6" fill="#b8860b" stroke="#b8860b" />
      <path d="M19 5l1.5-1.5M19 5l1.5 1.5M19 5l-1.5-1.5M19 5l-1.5 1.5" stroke="#b8860b" strokeWidth="1" />
    </svg>
  );
}
function PhoneIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2b1d0e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <circle cx="12" cy="18" r="0.9" fill="#2b1d0e" />
      <path d="M9 5h6" />
      <path d="M14.5 9.2a3 3 0 1 1-3.5-2.95" />
      <path d="M14.4 7.4l1.2-.8" stroke="#b8860b" />
    </svg>
  );
}
function PensieveIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2b1d0e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10h18l-2 9a2 2 0 0 1-2 1.6H7a2 2 0 0 1-2-1.6z" />
      <path d="M5 10c2-3 4-5 7-5s5 2 7 5" />
      <path d="M9 14a3 3 0 0 0 6 0" />
    </svg>
  );
}
function PortraitIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2b1d0e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <circle cx="12" cy="10" r="3" />
      <path d="M6 19c1.5-3 4-4 6-4s4.5 1 6 4" />
    </svg>
  );
}
function ChevronLeft() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}
function ChevronRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 6l6 6-6 6" />
    </svg>
  );
}
