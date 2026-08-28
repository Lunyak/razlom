/**
 * Spell casting. Tables live in catalog/spells.ts.
 */
import { applyDamage } from "./battle";
import {
  BATTLE_CRY_MIGHT_TURNS,
  FOCUS_HASTE_TURNS,
  HERO_SPELLS,
  OFFICER_HOLY_BONUS,
  PRIEST_WARD_TURNS,
  SPELLS,
  UNIT_DEFS,
  type SpellId,
} from "./catalog";
import { livingUnits, type Army, type GameState, type Hero, type UnitInstance } from "./data";
import { classDef, ensureHeroClass } from "./heroClasses";
import { heroPower } from "./heroPower";
import {
  applySpellStatuses,
  applyStatus,
  cleanseOnHeal,
  modifyHealing,
  wardOnHeal,
} from "./status";

export type { SpellId, SpellDef } from "./catalog";

export function spellsForHero(hero: Hero): SpellId[] {
  ensureHeroClass(hero);
  const allowed = new Set(classDef(hero).spells);
  return HERO_SPELLS.filter((id) => allowed.has(id) && hero.level >= SPELLS[id].minHeroLevel);
}

export function spellForKey(hero: Hero, key: string): SpellId | undefined {
  return spellsForHero(hero).find((id) => SPELLS[id].key === key);
}

export function canCastSpell(
  state: GameState,
  hero: Hero,
  spellId: SpellId,
): { ok: true } | { ok: false; reason: string } {
  const spell = SPELLS[spellId];
  if (!spellsForHero(hero).includes(spellId)) return { ok: false, reason: "Нет заклинания" };
  if (hero.level < spell.minHeroLevel) return { ok: false, reason: "Мало уровня" };
  if (state.mana < spell.manaCost) return { ok: false, reason: "Мало маны" };
  return { ok: true };
}

function holyStrikeDamage(hero: Hero, base: number): number {
  let amount = base + heroPower(hero).spellPower;
  if (ensureHeroClass(hero) === "officer") amount += OFFICER_HOLY_BONUS;
  return amount;
}

export function castSpellDamage(
  state: GameState,
  hero: Hero,
  spellId: SpellId,
  target: UnitInstance,
): { ok: true; amount: number } | { ok: false; reason: string } {
  const check = canCastSpell(state, hero, spellId);
  if (!check.ok) return check;
  const spell = SPELLS[spellId];
  if (!spell.damage) return { ok: false, reason: "Не атакующее" };

  state.mana -= spell.manaCost;
  const raw =
    spellId === "holy_strike"
      ? holyStrikeDamage(hero, spell.damage)
      : spell.damage + heroPower(hero).spellPower;
  const amount = applyDamage(target, raw);
  applySpellStatuses(spellId, target);
  return { ok: true, amount };
}

export function castMeteor(
  state: GameState,
  hero: Hero,
  targets: UnitInstance[],
): { ok: true; total: number } | { ok: false; reason: string } {
  const check = canCastSpell(state, hero, "meteor");
  if (!check.ok) return check;
  state.mana -= SPELLS.meteor.manaCost;
  const power = heroPower(hero).spellPower;
  let total = 0;
  for (const t of targets) {
    if (t.hp > 0) {
      total += applyDamage(t, SPELLS.meteor.damage! + power);
      applySpellStatuses("meteor", t);
    }
  }
  return { ok: true, total };
}

/** Officer: cheap party might buff. */
export function castBattleCry(
  state: GameState,
  hero: Hero,
  allies: UnitInstance[],
): { ok: true; buffed: number } | { ok: false; reason: string } {
  const check = canCastSpell(state, hero, "battle_cry");
  if (!check.ok) return check;
  const living = allies.filter((u) => u.hp > 0);
  if (living.length === 0) return { ok: false, reason: "Нет союзников" };

  state.mana -= SPELLS.battle_cry.manaCost;
  for (const u of living) {
    applyStatus(u, "might", BATTLE_CRY_MIGHT_TURNS);
  }
  return { ok: true, buffed: living.length };
}

/** Scout: haste on the hero unit — first strike / initiative. */
export function castFocus(
  state: GameState,
  hero: Hero,
  heroUnit: UnitInstance | undefined,
): { ok: true } | { ok: false; reason: string } {
  const check = canCastSpell(state, hero, "focus");
  if (!check.ok) return check;
  if (!heroUnit || heroUnit.hp <= 0) return { ok: false, reason: "Герой пал" };

  state.mana -= SPELLS.focus.manaCost;
  applyStatus(heroUnit, "haste", FOCUS_HASTE_TURNS);
  return { ok: true };
}

export function castSpellHeal(
  state: GameState,
  hero: Hero,
  spellId: SpellId,
  target: UnitInstance,
):
  | { ok: true; amount: number; cleansed: string[]; warded: boolean }
  | { ok: false; reason: string } {
  const check = canCastSpell(state, hero, spellId);
  if (!check.ok) return check;
  const spell = SPELLS[spellId];
  if (!spell.heal) return { ok: false, reason: "Не лечение" };

  const def = UNIT_DEFS[target.defId];
  if (target.hp <= 0) return { ok: false, reason: "Мёртв" };

  state.mana -= spell.manaCost;
  const before = target.hp;
  const bonus = heroPower(hero).heal;
  const healed = modifyHealing(target, spell.heal + bonus);
  target.hp = Math.min(def.maxHp, target.hp + healed);

  const isPriest = ensureHeroClass(hero) === "priest";
  const cleansed = cleanseOnHeal(target, { strong: isPriest });
  let warded = false;
  if (isPriest) {
    wardOnHeal(target, PRIEST_WARD_TURNS);
    warded = true;
  }
  return { ok: true, amount: target.hp - before, cleansed, warded };
}

export function formatSpellLine(spellId: SpellId): string {
  const s = SPELLS[spellId];
  return `[${s.key}] ${s.name} (${s.manaCost}М, ур.${s.minHeroLevel}+)`;
}

/** Neutral battle loot */
export function neutralLoot(enemyArmy: Army): { gold: number; xp: number } {
  const count = enemyArmy.units.length;
  if (enemyArmy.id.includes("dragon")) return { gold: 120, xp: 100 };
  if (enemyArmy.id.includes("ogre")) return { gold: 80, xp: 60 };
  if (enemyArmy.id.includes("bandit")) return { gold: 45, xp: 35 };
  return { gold: 25 + count * 8, xp: 20 + count * 10 };
}

export function pickWeakestTarget(army: Army): UnitInstance | undefined {
  const living = livingUnits(army);
  if (living.length === 0) return undefined;
  return living.reduce((a, b) => (a.hp < b.hp ? a : b));
}

export function pickRandomEnemyTarget(army: Army): UnitInstance | undefined {
  const living = livingUnits(army);
  if (living.length === 0) return undefined;
  return living[Math.floor(Math.random() * living.length)]!;
}
