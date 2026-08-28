import Phaser from "phaser";

const STORAGE_KEY = "razlom-display";

export type ResolutionId = "1280x720" | "1600x900" | "1920x1080" | "2560x1440";

export type DisplayResolution = {
  id: ResolutionId;
  w: number;
  h: number;
  label: string;
};

/** All 16:9 — FIT letterboxes only when the window/monitor is a different aspect. */
export const DISPLAY_RESOLUTIONS: readonly DisplayResolution[] = [
  { id: "1280x720", w: 1280, h: 720, label: "1280×720" },
  { id: "1600x900", w: 1600, h: 900, label: "1600×900" },
  { id: "1920x1080", w: 1920, h: 1080, label: "1920×1080" },
  { id: "2560x1440", w: 2560, h: 1440, label: "2560×1440" },
];

export type DisplayPrefs = {
  resolutionId: ResolutionId;
  fullscreen: boolean;
};

const DEFAULT_PREFS: DisplayPrefs = { resolutionId: "1280x720", fullscreen: false };

function isResolutionId(v: unknown): v is ResolutionId {
  return DISPLAY_RESOLUTIONS.some((r) => r.id === v);
}

export function getResolution(prefs: DisplayPrefs = loadDisplayPrefs()): DisplayResolution {
  return DISPLAY_RESOLUTIONS.find((r) => r.id === prefs.resolutionId) ?? DISPLAY_RESOLUTIONS[0];
}

export function loadDisplayPrefs(): DisplayPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<DisplayPrefs>;
    return {
      resolutionId: isResolutionId(parsed.resolutionId) ? parsed.resolutionId : DEFAULT_PREFS.resolutionId,
      fullscreen: typeof parsed.fullscreen === "boolean" ? parsed.fullscreen : DEFAULT_PREFS.fullscreen,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function saveDisplayPrefs(p: DisplayPrefs): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        resolutionId: isResolutionId(p.resolutionId) ? p.resolutionId : DEFAULT_PREFS.resolutionId,
        fullscreen: Boolean(p.fullscreen),
      } satisfies DisplayPrefs),
    );
  } catch {
    /* quota / private mode */
  }
}

export function resolutionLabel(prefs: DisplayPrefs = loadDisplayPrefs()): string {
  return getResolution(prefs).label;
}

export function fullscreenLabel(game: Phaser.Game): string {
  return game.scale.isFullscreen ? "В окно" : "Полный экран";
}

export function applyDisplaySize(game: Phaser.Game, res: DisplayResolution = getResolution()): void {
  const w = Math.round(game.scale.gameSize.width);
  const h = Math.round(game.scale.gameSize.height);
  if (w === res.w && h === res.h) return;
  game.scale.setGameSize(res.w, res.h);
}

export function cycleDisplayResolution(game: Phaser.Game, dir: 1 | -1): DisplayPrefs {
  const prefs = loadDisplayPrefs();
  const i = DISPLAY_RESOLUTIONS.findIndex((r) => r.id === prefs.resolutionId);
  const idx = i < 0 ? 0 : (i + dir + DISPLAY_RESOLUTIONS.length) % DISPLAY_RESOLUTIONS.length;
  const next: DisplayPrefs = { ...prefs, resolutionId: DISPLAY_RESOLUTIONS[idx].id };
  saveDisplayPrefs(next);
  applyDisplaySize(game, DISPLAY_RESOLUTIONS[idx]);
  return next;
}

/** Fullscreen needs a user gesture; browsers ignore auto-enter on boot. */
export function toggleFullscreen(game: Phaser.Game): void {
  const next = !game.scale.isFullscreen;
  saveDisplayPrefs({ ...loadDisplayPrefs(), fullscreen: next });
  if (next) void game.scale.startFullscreen();
  else void game.scale.stopFullscreen();
}
