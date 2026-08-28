export type VoiceKind = "box" | "bell" | "answer" | "choir";

export interface ScoreNote {
  beat: number;
  midi: number;
  beats: number;
  vel: number;
  kind: VoiceKind;
}

export interface MenuTrack {
  id: string;
  title: string;
  subtitle: string;
  bpm: number;
  loopBeats: number;
  notes: ScoreNote[];
}

/** [start eighth, midi, duration eighths, vel, kind] — bar = 6 eighths in 3/4. */
type Eighth = [number, number, number, number, VoiceKind];

function fromEighths(rows: Eighth[]): { notes: ScoreNote[]; loopBeats: number } {
  let max = 0;
  const notes: ScoreNote[] = rows.map(([at, midi, dur, vel, kind]) => {
    max = Math.max(max, at + dur);
    return { beat: at / 2, midi, beats: dur / 2, vel, kind };
  });
  const loopBeats = Math.max(1, Math.ceil(max / 2));
  return { notes, loopBeats };
}

const OVAL: ScoreNote[] = [
  { beat: 0, midi: 74, beats: 1.8, vel: 0.11, kind: "box" },
  { beat: 2, midi: 69, beats: 1.15, vel: 0.07, kind: "box" },
  { beat: 3, midi: 77, beats: 2.1, vel: 0.1, kind: "box" },
  { beat: 5, midi: 76, beats: 1.35, vel: 0.065, kind: "box" },
  { beat: 6, midi: 74, beats: 2.7, vel: 0.095, kind: "box" },
  { beat: 12, midi: 69, beats: 1.05, vel: 0.075, kind: "box" },
  { beat: 13, midi: 70, beats: 1.05, vel: 0.065, kind: "box" },
  { beat: 14, midi: 69, beats: 1.05, vel: 0.07, kind: "box" },
  { beat: 15, midi: 65, beats: 2.0, vel: 0.085, kind: "box" },
  { beat: 17, midi: 63, beats: 1.25, vel: 0.06, kind: "box" },
  { beat: 18, midi: 62, beats: 3.4, vel: 0.1, kind: "box" },
  { beat: 22, midi: 50, beats: 8.0, vel: 0.15, kind: "bell" },
  { beat: 27, midi: 86, beats: 1.5, vel: 0.045, kind: "box" },
  { beat: 28.6, midi: 89, beats: 1.35, vel: 0.035, kind: "box" },
  { beat: 30, midi: 87, beats: 1.7, vel: 0.04, kind: "box" },
  { beat: 32, midi: 86, beats: 2.5, vel: 0.045, kind: "box" },
];

/**
 * Shatrov 1906, public-domain waltz, D minor.
 * Contour from the traditional strain (The Session / common lead).
 * Restyle: cracked box + ghost quartet, not the Konevets recording.
 */
const MANCHURIA_EIGHTHS: Eighth[] = [
  [0, 69, 8, 0.07, "choir"],
  [8, 65, 2, 0.09, "box"],
  [10, 67, 2, 0.085, "box"],
  [12, 69, 12, 0.07, "choir"],
  [24, 67, 2, 0.08, "box"],
  [26, 69, 2, 0.085, "box"],
  [28, 73, 2, 0.08, "box"],
  [30, 77, 4, 0.09, "box"],
  [34, 76, 2, 0.075, "box"],
  [36, 74, 12, 0.08, "choir"],
  [48, 69, 2, 0.08, "box"],
  [50, 74, 2, 0.085, "box"],
  [52, 77, 2, 0.08, "box"],
  [54, 73, 4, 0.075, "box"],
  [58, 74, 2, 0.08, "box"],
  [60, 76, 2, 0.075, "box"],
  [62, 74, 2, 0.07, "box"],
  [64, 70, 2, 0.075, "box"],
  [66, 76, 4, 0.08, "box"],
  [70, 74, 2, 0.075, "box"],
  [72, 69, 2, 0.08, "box"],
  [74, 74, 2, 0.08, "box"],
  [76, 76, 2, 0.075, "box"],
  [78, 77, 4, 0.085, "box"],
  [82, 76, 2, 0.07, "box"],
  [84, 74, 10, 0.085, "choir"],
  [96, 69, 3, 0.08, "box"],
  [99, 64, 1, 0.06, "box"],
  [100, 64, 4, 0.07, "choir"],
  [104, 65, 2, 0.075, "box"],
  [106, 67, 2, 0.075, "box"],
  [108, 69, 8, 0.07, "choir"],
  [116, 69, 2, 0.07, "box"],
  [118, 72, 1, 0.065, "box"],
  [119, 71, 1, 0.065, "box"],
  [120, 72, 1, 0.065, "box"],
  [121, 74, 1, 0.07, "box"],
  [122, 72, 3, 0.075, "box"],
  [125, 67, 1, 0.06, "box"],
  [126, 67, 4, 0.07, "choir"],
  [130, 67, 2, 0.07, "box"],
  [132, 69, 2, 0.075, "box"],
  [134, 70, 2, 0.07, "box"],
  [136, 72, 6, 0.075, "choir"],
  [142, 72, 4, 0.07, "box"],
  [146, 73, 2, 0.07, "box"],
  [148, 74, 3, 0.08, "box"],
  [151, 69, 1, 0.06, "box"],
  [152, 69, 2, 0.07, "choir"],
  [154, 69, 1, 0.06, "box"],
  [155, 70, 1, 0.06, "box"],
  [156, 69, 2, 0.07, "box"],
  [158, 68, 2, 0.065, "box"],
  [160, 69, 2, 0.07, "box"],
  [162, 72, 4, 0.075, "box"],
  [166, 70, 4, 0.07, "choir"],
  [170, 65, 2, 0.065, "box"],
  [172, 67, 2, 0.07, "box"],
  [174, 69, 2, 0.07, "box"],
  [176, 69, 2, 0.075, "box"],
  [178, 67, 2, 0.07, "box"],
  [180, 65, 2, 0.07, "box"],
  [182, 64, 4, 0.07, "box"],
  [186, 65, 2, 0.065, "box"],
  [188, 62, 8, 0.09, "choir"],
  [188, 50, 8, 0.12, "bell"],
];

const manchuria = fromEighths(MANCHURIA_EIGHTHS);

const GAOLIANG_EIGHTHS: Eighth[] = [
  [0, 69, 12, 0.065, "choir"],
  [18, 65, 3, 0.05, "box"],
  [24, 69, 12, 0.06, "choir"],
  [42, 74, 18, 0.07, "choir"],
  [42, 50, 10, 0.11, "bell"],
  [66, 70, 4, 0.045, "box"],
  [72, 69, 8, 0.055, "choir"],
  [84, 65, 4, 0.05, "box"],
  [90, 62, 18, 0.07, "choir"],
];

const gaoliang = fromEighths(GAOLIANG_EIGHTHS);

const PAX: ScoreNote[] = [
  { beat: 0, midi: 62, beats: 2.2, vel: 0.08, kind: "choir" },
  { beat: 3, midi: 69, beats: 2.0, vel: 0.07, kind: "box" },
  { beat: 6, midi: 74, beats: 2.6, vel: 0.085, kind: "choir" },
  { beat: 9, midi: 77, beats: 1.4, vel: 0.06, kind: "box" },
  { beat: 12, midi: 76, beats: 1.5, vel: 0.055, kind: "box" },
  { beat: 15, midi: 74, beats: 2.8, vel: 0.08, kind: "choir" },
  { beat: 18, midi: 72, beats: 1.6, vel: 0.055, kind: "box" },
  { beat: 21, midi: 69, beats: 2.4, vel: 0.07, kind: "choir" },
  { beat: 24, midi: 62, beats: 3.5, vel: 0.09, kind: "choir" },
  { beat: 24, midi: 50, beats: 6, vel: 0.12, kind: "bell" },
];

export const MENU_TRACKS: MenuTrack[] = [
  {
    id: "manchuria",
    title: "На сопках Маньчжурии",
    subtitle: "Шатров · переложение",
    bpm: 54,
    loopBeats: manchuria.loopBeats,
    notes: manchuria.notes,
  },
  {
    id: "oval",
    title: "Овал",
    subtitle: "тема разлома",
    bpm: 46,
    loopBeats: 36,
    notes: OVAL,
  },
  {
    id: "gaoliang",
    title: "Сон гаоляна",
    subtitle: "колыбельная с сопок",
    bpm: 40,
    loopBeats: gaoliang.loopBeats,
    notes: gaoliang.notes,
  },
  {
    id: "pax",
    title: "Pax Lumen",
    subtitle: "Ordo · 1914",
    bpm: 48,
    loopBeats: 36,
    notes: PAX,
  },
];

export const DEFAULT_TRACK_ID = "manchuria";

export function trackById(id: string): MenuTrack {
  return MENU_TRACKS.find((t) => t.id === id) ?? MENU_TRACKS[0];
}
