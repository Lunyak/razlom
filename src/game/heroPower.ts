import type { Hero } from "./data";
import { equipmentBonuses } from "./artifacts";
import { classDef, ensureHeroClass } from "./heroClasses";

export interface HeroPower {
  moves: number;
  damage: number;
  armor: number;
  leadership: number;
  hp: number;
  heal: number;
  spellPower: number;
  lootChance: number;
}

export function heroPower(hero: Hero): HeroPower {
  ensureHeroClass(hero);
  const c = classDef(hero);
  const e = equipmentBonuses(hero);
  return {
    moves: c.movesBonus + (e.moves ?? 0),
    damage: c.damageBonus + (e.damage ?? 0),
    armor: e.armor ?? 0,
    leadership: c.leadershipBonus + (e.leadership ?? 0),
    hp: c.hpBonus,
    heal: c.healBonus + (e.spellPower ?? 0),
    spellPower: e.spellPower ?? 0,
    lootChance: c.lootChance,
  };
}

export function rollHeroLoot(hero: Hero): boolean {
  const chance = heroPower(hero).lootChance;
  if (chance <= 0) return false;
  return Math.random() < chance;
}
