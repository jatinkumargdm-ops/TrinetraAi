let ctx: AudioContext | null = null;

function getCtx() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const C = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function unlockAudio() {
  getCtx();
}

function tone(freq: number, durMs: number, when: number, gain = 0.08) {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(freq, c.currentTime + when);
  g.gain.setValueAtTime(0.0001, c.currentTime + when);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + when + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + when + durMs / 1000);
  osc.connect(g).connect(c.destination);
  osc.start(c.currentTime + when);
  osc.stop(c.currentTime + when + durMs / 1000 + 0.02);
}

export function beepWarn() {
  tone(660, 140, 0);
  tone(660, 140, 0.18);
}

export function beepCritical() {
  tone(880, 110, 0);
  tone(1200, 110, 0.13);
  tone(880, 110, 0.26);
  tone(1200, 110, 0.39);
}

export function beepClick() {
  tone(520, 60, 0, 0.05);
}
