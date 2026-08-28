/**
 * Army helpers: spawn units, formation slots, living/dead, move budget.
 * Stats come from catalog/; types from types.ts.
 */
import { FORMATION_SLOTS, MOVES_HERO_ALIVE, MOVES_HERO_DEAD, UNIT_DEFS } from "./catalog";
import { heroPower } from "./heroPower";
import type { Army, FactionId, UnitInstance } from "./types";

let nextInstanceId = 1;

export function resetUnitInstanceIds(): void {
  nextInstanceId = 1;
}

export function createUnit(defId: string): UnitInstance {
  const def = UNIT_DEFS[defId];
  if (!def) throw new Error(`Unknown unit: ${defId}`);
  return {
    instanceId: `u${nextInstanceId++}`,
    defId,
    hp: def.maxHp,
  };
}

export function heroUnitDefId(faction: FactionId, heroName?: string): string {
  if (faction === "ordo") return "hero_ordo";
  if (faction === "cossack") return "hero_cossack";
  if (faction === "highlander") return "hero_highlander";
  if (heroName === "Элиана") return "hero_ri_eliana";
  return "hero_ri";
}

export function createHeroUnit(army: Army): UnitInstance {
  const defId = army.isMissionary
    ? "missionary"
    : heroUnitDefId(army.faction, army.hero.name);
  const unit = createUnit(defId);
  unit.isHero = true;
  const def = UNIT_DEFS[defId];
  const levelBonus = Math.max(0, army.hero.level - 1) * 8;
  const classHp = army.isMissionary ? 0 : heroPower(army.hero).hp;
  unit.hp = Math.max(1, def.maxHp + levelBonus + classHp);
  // Default back row — player may move to front
  unit.slot = 4;
  return unit;
}

export function findHeroUnit(army: Army): UnitInstance | undefined {
  return army.units.find((u) => u.isHero);
}

export function isHeroAlive(army: Army): boolean {
  const h = findHeroUnit(army);
  return !!h && h.hp > 0;
}

/** Ensure a commander unit exists (skip empty-name neutrals). */
export function ensureHeroInArmy(army: Army): void {
  if (army.isNeutral && !army.hero.name) return;
  const existing = findHeroUnit(army);
  if (existing) {
    // Saves created before Eliana had her own portrait still use hero_ri.
    const wanted = heroUnitDefId(army.faction, army.hero.name);
    if (existing.defId !== wanted && !army.isMissionary) {
      existing.defId = wanted;
    }
    ensureFormationSlots(army);
    return;
  }
  army.units.unshift(createHeroUnit(army));
  ensureFormationSlots(army);
}

export function armyMaxMoves(army: Army): number {
  if (army.isMissionary) return MOVES_HERO_ALIVE;
  if (army.isNeutral) return army.movesLeft > 0 ? army.movesLeft : 0;
  if (!isHeroAlive(army)) return MOVES_HERO_DEAD;
  return MOVES_HERO_ALIVE + heroPower(army.hero).moves;
}

export function livingUnits(army: Army): UnitInstance[] {
  return army.units.filter((u) => u.hp > 0);
}

export function deadUnits(army: Army): UnitInstance[] {
  return army.units.filter((u) => u.hp <= 0);
}

/** All party members including fallen (corpses still occupy slots). */
export function partyUnits(army: Army): UnitInstance[] {
  return army.units;
}

export function isUnitAlive(unit: UnitInstance): boolean {
  return unit.hp > 0;
}

/** Recruit/leadership slots — hero does not consume one; dead troops still do. */
export function armyUnitCount(army: Army): number {
  return army.units.filter((u) => !u.isHero).length;
}

export function createDiscovered(cols: number, rows: number): boolean[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));
}

export function isFrontSlot(slot: number): boolean {
  return slot >= 0 && slot < 3;
}

/** Fill missing slots from unit preferredRow (front first or back first). */
export function ensureFormationSlots(army: Army): void {
  const used = new Set<number>();
  for (const unit of army.units) {
    if (unit.slot !== undefined && unit.slot >= 0 && unit.slot < FORMATION_SLOTS) {
      if (used.has(unit.slot)) {
        unit.slot = undefined;
      } else {
        used.add(unit.slot);
      }
    } else {
      unit.slot = undefined;
    }
  }

  for (const unit of army.units) {
    if (unit.slot !== undefined) continue;
    const def = UNIT_DEFS[unit.defId];
    const preferFront = !unit.isHero && def.preferredRow === 0;
    // Hero defaults to back so player can move them forward
    const order = preferFront ? [0, 1, 2, 3, 4, 5] : [3, 4, 5, 0, 1, 2];
    const free = order.find((s) => !used.has(s));
    if (free === undefined) continue;
    unit.slot = free;
    used.add(free);
  }
}

/** Swap/move a unit into a formation slot (0–5). */
export function moveUnitToSlot(
  army: Army,
  unitInstanceId: string,
  targetSlot: number,
): { ok: true } | { ok: false; reason: string } {
  if (targetSlot < 0 || targetSlot >= FORMATION_SLOTS) {
    return { ok: false, reason: "Неверный слот" };
  }
  ensureFormationSlots(army);
  const unit = army.units.find((u) => u.instanceId === unitInstanceId);
  if (!unit) return { ok: false, reason: "Юнит не найден" };
  if (unit.slot === targetSlot) return { ok: true };

  const occupant = army.units.find(
    (u) => u.instanceId !== unitInstanceId && u.slot === targetSlot,
  );
  if (occupant) {
    occupant.slot = unit.slot;
  }
  unit.slot = targetSlot;
  return { ok: true };
}

export function unitInSlot(army: Army, slot: number): UnitInstance | undefined {
  return army.units.find((u) => u.slot === slot);
}

/**
 * Prepare slots for battle.
 * Player armies keep manual formation; enemies re-pack from preferredRow.
 */
export function assignBattleSlots(army: Army, _side: "player" | "enemy"): void {
  if (!army.isPlayer || army.isNeutral) {
    for (const u of army.units) u.slot = undefined;
  }
  ensureFormationSlots(army);
}

export function awardVeteran(army: Army): string | null {
  const candidates = livingUnits(army).filter((u) => !u.veteran && !u.isHero);
  if (candidates.length === 0) return null;
  const unit = candidates[Math.floor(Math.random() * candidates.length)];
  unit.veteran = true;
  const def = UNIT_DEFS[unit.defId];
  unit.hp = Math.min(def.maxHp + 8, unit.hp + 8);
  return UNIT_DEFS[unit.defId].name;
}
