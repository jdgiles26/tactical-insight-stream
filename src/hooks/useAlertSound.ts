export type AlertTone = "severe" | "high" | "elevated";

const TONES: Record<AlertTone, { freqs: number[]; duration: number; repeats: number; gap: number; volume: number }> = {
  severe:   { freqs: [880, 1100], duration: 0.15, repeats: 6, gap: 0.1, volume: 0.35 },
  high:     { freqs: [660],       duration: 0.25, repeats: 3, gap: 0.2, volume: 0.3 },
  elevated: { freqs: [440],       duration: 0.3,  repeats: 2, gap: 0.3, volume: 0.2 },
};

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
}

function playTone(ctx: AudioContext, freq: number, startTime: number, duration: number, volume: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(volume, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.05);
  // Cleanup after playback
  osc.onended = () => {
    osc.disconnect();
    gain.disconnect();
  };
}

export function playAlertSound(tone: AlertTone) {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") ctx.resume();

  const cfg = TONES[tone];
  let t = ctx.currentTime + 0.05; // small offset to avoid glitches
  for (let i = 0; i < cfg.repeats; i++) {
    cfg.freqs.forEach((f) => {
      playTone(ctx, f, t, cfg.duration, cfg.volume);
const audioCtx = typeof window !== "undefined" ? new (window.AudioContext || (window as any).webkitAudioContext)() : null;

type AlertTone = "severe" | "high";

const TONES: Record<AlertTone, { freqs: number[]; duration: number; repeats: number; gap: number }> = {
  severe: { freqs: [880, 1100], duration: 0.15, repeats: 6, gap: 0.1 },
  high:   { freqs: [660],       duration: 0.25, repeats: 3, gap: 0.2 },
};

function playTone(freq: number, startTime: number, duration: number) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "square";
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.3, startTime);
  gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

export function playAlertSound(tone: AlertTone) {
  if (!audioCtx) return;
  // Resume context (browsers require user gesture)
  if (audioCtx.state === "suspended") audioCtx.resume();

  const cfg = TONES[tone];
  let t = audioCtx.currentTime;
  for (let i = 0; i < cfg.repeats; i++) {
    cfg.freqs.forEach((f) => {
      playTone(f, t, cfg.duration);
    });
    t += cfg.duration + cfg.gap;
  }
}
