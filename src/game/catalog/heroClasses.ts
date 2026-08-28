import type { SpellId } from "./spells";

/** Disciples-style hero roles — spells, moves, and combat lean. */
export type HeroClassId = "officer" | "priest" | "scout";

export interface HeroClassDef {
  id: HeroClassId;
  name: string;
  hint: string;
  spells: SpellId[];
  movesBonus: number;
  leadershipBonus: number;
  damageBonus: number;
  /** Extra max HP on the hero unit. */
  hpBonus: number;
  /** Extra heal from heal spells. */
  healBonus: number;
  /** Chance (0–1) of bonus loot on site visit / battle win. */
  lootChance: number;
}

export const HERO_CLASS_IDS: HeroClassId[] = ["officer", "priest", "scout"];

export const HERO_CLASSES: Record<HeroClassId, HeroClassDef> = {
  officer: {
    id: "officer",
    name: "Офицер",
    hint: "Усиленный святой удар и боевой клич (сила отряду).",
    spells: ["holy_strike", "battle_cry", "lightning"],
    movesBonus: 0,
    leadershipBonus: 1,
    damageBonus: 4,
    hpBonus: 12,
    healBonus: 0,
    lootChance: 0,
  },
  priest: {
    id: "priest",
    name: "Иеромонах",
    hint: "Чудеса, сильное исцеление, очищение и оберег при лечении.",
    spells: ["holy_strike", "heal", "lightning", "meteor"],
    movesBonus: 0,
    leadershipBonus: 0,
    damageBonus: 0,
    hpBonus: 0,
    healBonus: 12,
    lootChance: 0,
  },
  scout: {
    id: "scout",
    name: "Разведчик",
    hint: "+1 ОД, добыча; засада — расторопность / первый ход.",
    spells: ["holy_strike", "heal", "focus"],
    movesBonus: 1,
    leadershipBonus: 0,
    damageBonus: 1,
    hpBonus: -8,
    healBonus: 0,
    lootChance: 0.4,
  },
};
