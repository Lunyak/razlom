import type { FactionId } from "./data";
import {
  RACE_PORTRAIT_STYLE,
  raceFromFaction,
  type RaceFrameId,
} from "../ui/raceFrameConstructor";

/**
 * Per-faction look — frames via {@link buildRaceFrame}, avatars via art notes.
 * Agents: `.cursor/rules/faction-visual-style.mdc`
 */
export type FactionVisualId = RaceFrameId;

/** Fallback map/UI fill — 1914 protective khaki, never British scarlet. */
export const RI_FIELD_KHAKI = 0x5a4e32;

export interface FactionVisual {
  id: FactionVisualId;
  frameStyle: RaceFrameId;
  /** Art direction for portrait generation (not a runtime overlay). */
  avatarArt: string;
  note: string;
}

export const FACTION_VISUAL: Record<FactionId, FactionVisual> = {
  ri: {
    id: "ri",
    frameStyle: "ri",
    avatarArt: RACE_PORTRAIT_STYLE.ri.avatarArt,
    note: "RI: дагерротип + золотая рамка; одежда — оливковый полевой мундир 1914, не британский scarlet.",
  },
  ordo: {
    id: "ordo",
    frameStyle: "ordo",
    avatarArt: RACE_PORTRAIT_STYLE.ordo.avatarArt,
    note: "Ordo: occult ash-print + железная оккультная рамка (конструктор ordo). Не лёд.",
  },
  risen: {
    id: "risen",
    frameStyle: "risen",
    avatarArt: RACE_PORTRAIT_STYLE.risen.avatarArt,
    note: "Восставшие: траурная гнилая рамка (конструктор risen).",
  },
  neutral: {
    id: "neutral",
    frameStyle: "neutral",
    avatarArt: RACE_PORTRAIT_STYLE.neutral.avatarArt,
    note: "Нейтралы: простой tintype / латунные углы (конструктор neutral).",
  },
  cossack: {
    id: "folk",
    frameStyle: "folk",
    avatarArt: RACE_PORTRAIT_STYLE.folk.avatarArt,
    note: "Казачество: лубок / folk frame.",
  },
  highlander: {
    id: "thorn",
    frameStyle: "thorn",
    avatarArt: RACE_PORTRAIT_STYLE.thorn.avatarArt,
    note: "Горцы: gothic thorn frame.",
  },
};

export function factionVisual(faction: FactionId): FactionVisual {
  return FACTION_VISUAL[faction] ?? FACTION_VISUAL.ri;
}

export function glassStyleForFaction(faction: FactionId): RaceFrameId {
  return raceFromFaction(faction);
}
