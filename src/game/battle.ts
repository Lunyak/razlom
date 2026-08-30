import { UNIT_DEFS } from "./catalog";
import { livingUnits, type Army, type Hero, type UnitInstance } from "./data";
import { heroPower } from "./heroPower";
import {
  cleanseOnHeal,
  modifyHealing,
  modifyIncomingDamage,
  modifyOutgoingDamage,
  rollAttackMiss,
} from "./status";

export function leadershipLimit(hero: Hero): number {
  return 2 + hero.level + heroPower(hero).leadership;
}

export function armyUnitCount(army: Army): number {
  return livingUnits(army).length;
}

/** Melee must strike front row while any front unit lives. */
export function validTargets(attacker: UnitInstance, enemyArmy: Army): UnitInstance[] {
  const living = livingUnits(enemyArmy);
  if (living.length === 0) return [];
  const def = UNIT_DEFS[attacker.defId];
  if (def.ranged) return living;

  const front = living.filter((u) => u.slot !== undefined && u.slot < 3);
  return front.length > 0 ? front : living;
}

export function isValidTarget(attacker: UnitInstance, target: UnitInstance, enemyArmy: Army): boolean {
  return validTargets(attacker, enemyArmy).some((u) => u.instanceId === target.instanceId);
}

export function canRetaliate(target: UnitInstance, attacker: UnitInstance): boolean {
  if (target.hp <= 0) return false;
  const tDef = UNIT_DEFS[target.defId];
  const aDef = UNIT_DEFS[attacker.defId];
  if (aDef.ranged && !tDef.ranged) return false;
  if (tDef.ranged) return true;
  return target.slot !== undefined && target.slot < 3;
}

export interface CombatMods {
  damage?: number;
  armor?: number;
}

export function calcDamage(
  attacker: UnitInstance,
  target: UnitInstance,
  multiplier = 1,
  attackingHero?: Hero,
  defendingHero?: Hero,
  atkMods?: CombatMods,
  defMods?: CombatMods,
): number {
  const aDef = UNIT_DEFS[attacker.defId];
  let dmg = Math.round(aDef.damage * multiplier);
  if (attacker.veteran) dmg += 3;
  if (attacker.isHero) {
    dmg += 2;
    if (attackingHero) dmg += heroPower(attackingHero).damage;
  }
  dmg += atkMods?.damage ?? 0;
  const targetInBack = target.slot !== undefined && target.slot >= 3;
  if (targetInBack && !aDef.ranged) {
    dmg = Math.round(dmg * 0.85);
  }
  dmg = modifyOutgoingDamage(attacker, dmg);
  dmg = modifyIncomingDamage(target, dmg);
  if (target.isHero && defendingHero) {
    dmg = Math.max(1, dmg - heroPower(defendingHero).armor);
  }
  dmg -= defMods?.armor ?? 0;
  return Math.max(1, dmg);
}

/** Halve incoming damage while a unit holds Defend. */
export function applyDefendReduction(damage: number, defending: boolean): number {
  if (!defending) return damage;
  return Math.max(1, Math.round(damage * 0.5));
}

export function applyDamage(unit: UnitInstance, amount: number): number {
  unit.hp = Math.max(0, unit.hp - amount);
  return amount;
}

/**
 * Instantly resolve one strike (and optional retaliate). Returns damage dealt to target.
 * Used by quick-battle simulation.
 */
export function resolveStrike(
  attacker: UnitInstance,
  target: UnitInstance,
  opts?: { defendingTarget?: boolean; allowRetaliate?: boolean },
): { damage: number; counter: number; missed?: boolean } {
  if (rollAttackMiss(attacker)) {
    return { damage: 0, counter: 0, missed: true };
  }

  let damage = calcDamage(attacker, target);
  damage = applyDefendReduction(damage, !!opts?.defendingTarget);
  applyDamage(target, damage);

  let counter = 0;
  const allowRetaliate = opts?.allowRetaliate !== false;
  if (allowRetaliate && target.hp > 0 && canRetaliate(target, attacker) && attacker.hp > 0) {
    if (!rollAttackMiss(target)) {
      counter = calcDamage(target, attacker, 0.5);
      counter = applyDefendReduction(counter, false);
      applyDamage(attacker, counter);
    }
  }
  return { damage, counter };
}

export interface BattleXpResult {
  gained: number;
  leveled: boolean;
}

export function grantBattleXp(
  hero: Hero,
  enemyArmy: Army,
  playerWon: boolean,
  bonusXp = 0,
): BattleXpResult {
  if (!playerWon) return { gained: 0, leveled: false };

  const gained = 40 + enemyArmy.units.length * 15 + bonusXp;
  hero.xp += gained;

  let leveled = false;
  while (hero.xp >= hero.xpToNext) {
    hero.xp -= hero.xpToNext;
    hero.level += 1;
    hero.xpToNext = hero.level * 100;
    leveled = true;
  }
  return { gained, leveled };
}

/** AI picks wounded front target or random valid. */
export function pickAiTarget(attacker: UnitInstance, playerArmy: Army): UnitInstance | undefined {
  const targets = validTargets(attacker, playerArmy);
  if (targets.length === 0) return undefined;
  const wounded = targets.filter((u) => u.hp < UNIT_DEFS[u.defId].maxHp * 0.5);
  const pool = wounded.length > 0 ? wounded : targets;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function unitHealPower(unit: UnitInstance): number {
  return UNIT_DEFS[unit.defId]?.heal ?? 0;
}

/** Most wounded living ally (HP missing), or undefined if all full. */
export function pickHealTarget(army: Army): UnitInstance | undefined {
  const living = livingUnits(army);
  let best: UnitInstance | undefined;
  let bestMissing = 0;
  for (const u of living) {
    const max = UNIT_DEFS[u.defId]?.maxHp ?? u.hp;
    const missing = max - u.hp;
    if (missing > bestMissing) {
      bestMissing = missing;
      best = u;
    }
  }
  return bestMissing > 0 ? best : undefined;
}

export function applyUnitHeal(
  healer: UnitInstance,
  target: UnitInstance,
): { ok: true; amount: number } | { ok: false; reason: string } {
  const power = unitHealPower(healer);
  if (power <= 0) return { ok: false, reason: "Не лечит" };
  if (!(target.hp > 0)) return { ok: false, reason: "Мёртв" };
  const def = UNIT_DEFS[target.defId];
  if (!def) return { ok: false, reason: "Нет цели" };
  if (target.hp >= def.maxHp) return { ok: false, reason: "Уже полон HP" };

  const before = target.hp;
  const healed = modifyHealing(target, power);
  target.hp = Math.min(def.maxHp, target.hp + healed);
  cleanseOnHeal(target);
  return { ok: true, amount: target.hp - before };
}
