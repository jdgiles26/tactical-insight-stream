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
