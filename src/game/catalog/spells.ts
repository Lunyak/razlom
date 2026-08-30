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
  /** Phaser texture key for the spiked-ring battle icon. */
  icon: string;
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
    icon: "skill_holy_strike",
  },
  heal: {
    id: "heal",
    name: "Исцеление",
    manaCost: 10,
    minHeroLevel: 1,
    heal: 28,
    magic: false,
    key: "W",
    icon: "skill_heal",
  },
  battle_cry: {
    id: "battle_cry",
    name: "Боевой клич",
    manaCost: 6,
    minHeroLevel: 1,
    magic: false,
    key: "W",
    instant: true,
    icon: "skill_battle_cry",
  },
  lightning: {
    id: "lightning",
    name: "Молния",
    manaCost: 14,
    minHeroLevel: 2,
    damage: 24,
    magic: true,
    key: "E",
    icon: "skill_lightning",
  },
  focus: {
    id: "focus",
    name: "Засада",
    manaCost: 5,
    minHeroLevel: 1,
    magic: false,
    key: "E",
    instant: true,
    icon: "skill_focus",
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
    icon: "skill_meteor",
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

export const SPELL_ICON_ASSETS: [string, string][] = HERO_SPELLS.map((id) => [
  SPELLS[id].icon,
  `assets/ui/skills/${SPELLS[id].icon}.png`,
]);

/** Officer holy strike bonus damage. */
export const OFFICER_HOLY_BONUS = 8;
/** Battle cry: might duration on living allies. */
export const BATTLE_CRY_MIGHT_TURNS = 2;
/** Scout focus: haste duration on hero unit. */
export const FOCUS_HASTE_TURNS = 2;
/** Priest ward after heal. */
export const PRIEST_WARD_TURNS = 2;
