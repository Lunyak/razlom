const STORAGE_KEY = "razlom-audio";

export type AudioPrefs = {
  volume: number;
  muted: boolean;
};

const DEFAULT_PREFS: AudioPrefs = { volume: 0.7, muted: false };

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_PREFS.volume;
  return Math.min(1, Math.max(0, v));
}

export function loadAudioPrefs(): AudioPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<AudioPrefs>;
    return {
      volume: typeof parsed.volume === "number" ? clamp01(parsed.volume) : DEFAULT_PREFS.volume,
      muted: typeof parsed.muted === "boolean" ? parsed.muted : DEFAULT_PREFS.muted,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveAudioPrefs(p: AudioPrefs): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ volume: clamp01(p.volume), muted: Boolean(p.muted) } satisfies AudioPrefs),
    );
  } catch {
    /* quota / private mode */
  }
}
