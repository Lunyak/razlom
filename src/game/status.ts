/**
 * Battle status effects — DoTs, curses, control.
 * Tables live in catalog/statuses.ts. Ticked at the start of the afflicted unit’s turn.
 */
import { STATUS_DEFS, UNIT_DEFS, type StatusId } from "./catalog";
import type { UnitInstance } from "./data";

export type { StatusId, StatusDef } from "./catalog";

export interface StatusInstance {
  id: StatusId;
  /** Turns remaining; decremented at start of unit’s turn after tick. */
  turns: number;
}

export function ensureStatuses(unit: UnitInstance): StatusInstance[] {
  if (!unit.statuses) unit.statuses = [];
  return unit.statuses;
}

export function getStatus(unit: UnitInstance, id: StatusId): StatusInstance | undefined {
  return unit.statuses?.find((s) => s.id === id);
}

export function hasStatus(unit: UnitInstance, id: StatusId): boolean {
  return !!getStatus(unit, id);
}

/** Apply or refresh a status (keeps the longer remaining duration). */
export function applyStatus(unit: UnitInstance, id: StatusId, turns: number): void {
  if (unit.hp <= 0 || turns <= 0) return;
  const list = ensureStatuses(unit);
  const existing = list.find((s) => s.id === id);
  if (existing) {
    existing.turns = Math.max(existing.turns, turns);
    return;
  }
  list.push({ id, turns });
}

export function clearStatus(unit: UnitInstance, id: StatusId): void {
  if (!unit.statuses) return;
  unit.statuses = unit.statuses.filter((s) => s.id !== id);
}

export function clearAllStatuses(unit: UnitInstance): void {
  unit.statuses = [];
}

/** Drop combat DoTs/curses; keep potion buffs applied on the map. */
export function clearVolatileStatuses(unit: UnitInstance): void {
  unit.statuses = (unit.statuses ?? []).filter((s) => STATUS_DEFS[s.id].persistIntoBattle);
}

export function initiativeBonus(unit: UnitInstance): number {
  let n = 0;
  for (const s of unit.statuses ?? []) {
    n += STATUS_DEFS[s.id].initiativeBonus ?? 0;
  }
  return n;
}

export function statusChips(unit: UnitInstance): { chip: string; color: string; label: string }[] {
  return (unit.statuses ?? []).map((s) => {
    const def = STATUS_DEFS[s.id];
    return { chip: def.chip, color: def.color, label: `${def.label} (${s.turns})` };
  });
}

export function formatStatusLines(unit: UnitInstance): string[] {
  return (unit.statuses ?? []).map((s) => {
    const def = STATUS_DEFS[s.id];
    return `${def.label} · ${s.turns} ход.`;
  });
}

function mulProduct(unit: UnitInstance, key: "outgoingMul" | "incomingMul" | "healMul"): number {
  let m = 1;
  for (const s of unit.statuses ?? []) {
    const v = STATUS_DEFS[s.id][key];
    if (typeof v === "number") m *= v;
  }
  return m;
}

export function modifyOutgoingDamage(attacker: UnitInstance, damage: number): number {
  return Math.max(1, Math.round(damage * mulProduct(attacker, "outgoingMul")));
}

export function modifyIncomingDamage(target: UnitInstance, damage: number): number {
  return Math.max(1, Math.round(damage * mulProduct(target, "incomingMul")));
}

export function modifyHealing(target: UnitInstance, amount: number): number {
  return Math.max(0, Math.round(amount * mulProduct(target, "healMul")));
}

export function rollAttackMiss(attacker: UnitInstance): boolean {
  let chance = 0;
  for (const s of attacker.statuses ?? []) {
    chance = Math.max(chance, STATUS_DEFS[s.id].missChance ?? 0);
  }
  return chance > 0 && Math.random() < chance;
}

export function isStunned(unit: UnitInstance): boolean {
  return hasStatus(unit, "stun");
}

export function isSilenced(unit: UnitInstance): boolean {
  return hasStatus(unit, "silence");
}

export function frostIntensity(unit: UnitInstance): number {
  const s = getStatus(unit, "frost");
  return s ? Math.min(1, 0.35 + s.turns * 0.2) : 0;
}

export function poisonIntensity(unit: UnitInstance): number {
  const s = getStatus(unit, "poison");
  return s ? Math.min(1, 0.35 + s.turns * 0.2) : 0;
}

export function burnIntensity(unit: UnitInstance): number {
  const s = getStatus(unit, "burn");
  return s ? Math.min(1, 0.35 + s.turns * 0.2) : 0;
}

export function bleedIntensity(unit: UnitInstance): number {
  const s = getStatus(unit, "bleed");
  return s ? Math.min(1, 0.35 + s.turns * 0.2) : 0;
}

export interface StatusTickResult {
  damage: number;
  skipped: boolean;
  messages: string[];
}

/**
 * Run turn-start DoTs / stun. Decrements durations afterward.
 * Call once when the unit becomes the active combatant.
 */
export function tickUnitStatuses(unit: UnitInstance): StatusTickResult {
  const messages: string[] = [];
  let damage = 0;
  let skipped = false;

  if (!unit.statuses?.length || unit.hp <= 0) {
    return { damage: 0, skipped: false, messages };
  }

  for (const s of [...unit.statuses]) {
    const def = STATUS_DEFS[s.id];
    if (def.tickDamage && unit.hp > 0) {
      const dealt = Math.min(unit.hp, def.tickDamage);
      unit.hp -= dealt;
      damage += dealt;
      messages.push(`${def.label} −${dealt}`);
    }
    if (def.skipTurn) skipped = true;
  }

  // Decrement / expire
  unit.statuses = unit.statuses
    .map((s) => ({ ...s, turns: s.turns - 1 }))
    .filter((s) => s.turns > 0);

  if (skipped) messages.push("Оглушение — пропуск");
  return { damage, skipped, messages };
}

export interface OnHitStatusChance {
  id: StatusId;
  turns: number;
  chance: number;
}

/** What an attacker may inflict on a successful hit (not miss). */
export function onHitStatusChances(attacker: UnitInstance): OnHitStatusChance[] {
  const def = UNIT_DEFS[attacker.defId];
  if (!def) return [];
  const out: OnHitStatusChance[] = [];

  // Faction identity
  if (def.faction === "ordo") {
    out.push({ id: "frost", turns: 2, chance: 0.35 });
    out.push({ id: "curse", turns: 2, chance: 0.2 });
  }
  if (def.faction === "risen") {
    out.push({ id: "poison", turns: 3, chance: 0.4 });
    out.push({ id: "bleed", turns: 2, chance: 0.25 });
  }
  if (def.faction === "neutral") {
    out.push({ id: "bleed", turns: 2, chance: 0.3 });
  }
  // Folk / steppe — sabre cuts (no frost; frost is cold status only)
  if (def.faction === "cossack") {
    out.push({ id: "bleed", turns: 2, chance: 0.32 });
    out.push({ id: "weakness", turns: 1, chance: 0.12 });
  }
  // Highland blades — shock + cut
  if (def.faction === "highlander") {
    out.push({ id: "stun", turns: 1, chance: 0.16 });
    out.push({ id: "bleed", turns: 2, chance: 0.22 });
  }

  // Unit-specific
  switch (attacker.defId) {
    case "witch":
    case "banshee":
      out.push({ id: "curse", turns: 3, chance: 0.55 });
      out.push({ id: "weakness", turns: 2, chance: 0.4 });
      break;
    case "dragon":
      out.push({ id: "burn", turns: 3, chance: 0.7 });
      break;
    case "ogre":
    case "knight":
      out.push({ id: "shatter", turns: 2, chance: 0.4 });
      out.push({ id: "stun", turns: 1, chance: 0.2 });
      break;
    case "bandit":
    case "wolf":
      out.push({ id: "bleed", turns: 2, chance: 0.45 });
      break;
    case "skeleton":
    case "zombie":
      out.push({ id: "poison", turns: 2, chance: 0.35 });
      break;
    case "initiate":
    case "hero_ordo":
      out.push({ id: "frost", turns: 2, chance: 0.45 });
      out.push({ id: "silence", turns: 1, chance: 0.2 });
      break;
    case "ghost":
      out.push({ id: "blind", turns: 2, chance: 0.4 });
      out.push({ id: "weakness", turns: 2, chance: 0.3 });
      break;
    default:
      break;
  }

  // Melee physical pressure
  if (!def.ranged && def.faction === "ri") {
    out.push({ id: "bleed", turns: 1, chance: 0.15 });
  }

  return out;
}

/** Roll and apply on-hit statuses; returns applied labels. */
export function applyOnHitStatuses(attacker: UnitInstance, target: UnitInstance): string[] {
  if (target.hp <= 0) return [];
  const applied: string[] = [];
  for (const roll of onHitStatusChances(attacker)) {
    if (Math.random() > roll.chance) continue;
    applyStatus(target, roll.id, roll.turns);
    applied.push(STATUS_DEFS[roll.id].label);
  }
  return applied;
}

/** Spell → status side effects. */
export function applySpellStatuses(spellId: string, target: UnitInstance): string[] {
  const applied: string[] = [];
  if (spellId === "meteor") {
    applyStatus(target, "burn", 2);
    applied.push(STATUS_DEFS.burn.label);
  } else if (spellId === "lightning") {
    if (Math.random() < 0.4) {
      applyStatus(target, "stun", 1);
      applied.push(STATUS_DEFS.stun.label);
    }
    if (Math.random() < 0.35) {
      applyStatus(target, "shatter", 2);
      applied.push(STATUS_DEFS.shatter.label);
    }
  } else if (spellId === "holy_strike") {
    // Cleanse light curses on allies is heal-only; on enemy: weakness
    applyStatus(target, "weakness", 1);
    applied.push(STATUS_DEFS.weakness.label);
  }
  return applied;
}

const MILD_CLEANSE: StatusId[] = ["poison", "bleed", "burn"];
const STRONG_CLEANSE: StatusId[] = [
  "poison",
  "bleed",
  "burn",
  "curse",
  "weakness",
  "blind",
  "frost",
];

/** Heal may cleanse DoTs; priest heal uses strong=true for a full purge. */
export function cleanseOnHeal(target: UnitInstance, opts?: { strong?: boolean }): string[] {
  const cleared: string[] = [];
  const ids = opts?.strong ? STRONG_CLEANSE : MILD_CLEANSE;
  const chance = opts?.strong ? 1 : 0.5;
  for (const id of ids) {
    if (hasStatus(target, id) && Math.random() < chance) {
      clearStatus(target, id);
      cleared.push(STATUS_DEFS[id].label);
    }
  }
  return cleared;
}

/** Brief ward after a priest heal. */
export function wardOnHeal(target: UnitInstance, turns = 2): void {
  applyStatus(target, "ward", turns);
}
