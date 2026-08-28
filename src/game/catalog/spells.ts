export type SpellId =
  | "holy_strike"
  | "heal"
  | "lightning"
  | "meteor"
  | "battle_cry"
  | "focus";

export interface SpellDef {
  id: SpellId;
  name: string;
  manaCost: number;
  minHeroLevel: number;
  damage?: number;
  heal?: number;
  /** true = ignores front row rule */
  magic: boolean;
  key: string;
  /** hits all enemies */
  aoe?: boolean;
  /** Instant cast — no target click (party/self buff). */
  instant?: boolean;
}

export const SPELLS: Record<SpellId, SpellDef> = {
  holy_strike: {
    id: "holy_strike",
    name: "Святой удар",
    manaCost: 8,
    minHeroLevel: 1,
    damage: 18,
    magic: true,
    key: "Q",
  },
  heal: {
    id: "heal",
    name: "Исцеление",
    manaCost: 10,
    minHeroLevel: 1,
    heal: 28,
    magic: false,
    key: "W",
  },
  battle_cry: {
    id: "battle_cry",
    name: "Боевой клич",
    manaCost: 6,
    minHeroLevel: 1,
    magic: false,
    key: "W",
    instant: true,
  },
  lightning: {
    id: "lightning",
    name: "Молния",
    manaCost: 14,
    minHeroLevel: 2,
    damage: 24,
    magic: true,
    key: "E",
  },
  focus: {
    id: "focus",
    name: "Засада",
    manaCost: 5,
    minHeroLevel: 1,
    magic: false,
    key: "E",
    instant: true,
  },
  meteor: {
    id: "meteor",
    name: "Метеор",
    manaCost: 20,
    minHeroLevel: 3,
    damage: 16,
    magic: true,
    aoe: true,
    key: "R",
  },
};

export const HERO_SPELLS: SpellId[] = [
  "holy_strike",
  "heal",
  "battle_cry",
  "lightning",
  "focus",
  "meteor",
];

/** Officer holy strike bonus damage. */
export const OFFICER_HOLY_BONUS = 8;
/** Battle cry: might duration on living allies. */
export const BATTLE_CRY_MIGHT_TURNS = 2;
/** Scout focus: haste duration on hero unit. */
export const FOCUS_HASTE_TURNS = 2;
/** Priest ward after heal. */
export const PRIEST_WARD_TURNS = 2;
