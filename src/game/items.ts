/**
 * Potion use on map and in battle. Tables live in catalog/potions.ts.
 */
import {
  BUFF_TURNS_BATTLE,
  BUFF_TURNS_WORLD,
  ELIXIR_MANA_BATTLE,
  ELIXIR_MANA_WORLD,
  HEAL_POTION_AMOUNT,
  MANA_POTION_AMOUNT,
  POISON_POTION_TURNS,
  POTION_IDS,
  POTIONS,
  STARTING_INVENTORY,
  UNIT_DEFS,
  type Inventory,
  type PotionId,
  type StatusId,
} from "./catalog";
import { deadUnits, livingUnits, type Army, type GameState, type UnitInstance } from "./data";
import { applyStatus, clearStatus } from "./status";

export type { PotionId, PotionDef, PotionTarget, Inventory } from "./catalog";

export const POTION_ASSETS: [string, string][] = POTION_IDS.map((id) => [
  POTIONS[id].texture,
  `assets/ui/potions/${POTIONS[id].texture}.png`,
]);

export function emptyInventory(): Inventory {
  return {
    heal: 0,
    mana: 0,
    life: 0,
    strength: 0,
    haste: 0,
    poison: 0,
    ward: 0,
    elixir: 0,
  };
}

export function startingInventory(): Inventory {
  return { ...STARTING_INVENTORY };
}

export function ensureInventory(state: GameState): Inventory {
  if (!state.inventory) state.inventory = emptyInventory();
  for (const id of POTION_IDS) {
    const n = state.inventory[id];
    state.inventory[id] = typeof n === "number" && n > 0 ? Math.floor(n) : 0;
  }
  return state.inventory;
}

export function potionCount(state: GameState, id: PotionId): number {
  return ensureInventory(state)[id] ?? 0;
}

export function addPotion(state: GameState, id: PotionId, amount = 1): void {
  const inv = ensureInventory(state);
  inv[id] = (inv[id] ?? 0) + amount;
}

function consume(state: GameState, id: PotionId): boolean {
  const inv = ensureInventory(state);
  if ((inv[id] ?? 0) <= 0) return false;
  inv[id] -= 1;
  return true;
}

export type UseResult = { ok: true; message: string } | { ok: false; reason: string };

function healUnit(unit: UnitInstance, amount: number): number {
  const def = UNIT_DEFS[unit.defId];
  if (!def || unit.hp <= 0) return 0;
  const before = unit.hp;
  unit.hp = Math.min(def.maxHp, unit.hp + amount);
  return unit.hp - before;
}

function weakestWounded(army: Army): UnitInstance | undefined {
  const wounded = livingUnits(army).filter((u) => {
    const max = UNIT_DEFS[u.defId]?.maxHp ?? u.hp;
    return u.hp < max;
  });
  if (wounded.length === 0) return undefined;
  return wounded.reduce((a, b) => {
    const ra = a.hp / (UNIT_DEFS[a.defId]?.maxHp ?? a.hp);
    const rb = b.hp / (UNIT_DEFS[b.defId]?.maxHp ?? b.hp);
    return ra <= rb ? a : b;
  });
}

function buffArmy(army: Army, status: StatusId, turns: number): number {
  let n = 0;
  for (const u of livingUnits(army)) {
    applyStatus(u, status, turns);
    n += 1;
  }
  return n;
}

export function usePotionOnArmy(state: GameState, id: PotionId, army: Army | null): UseResult {
  const def = POTIONS[id];
  if (!def.worldUse) return { ok: false, reason: `${def.name} — только в бою` };
  if (potionCount(state, id) <= 0) return { ok: false, reason: "Нет в сумке" };

  if (id === "mana") {
    consume(state, id);
    state.mana += MANA_POTION_AMOUNT;
    return { ok: true, message: `${def.name}: +${MANA_POTION_AMOUNT} маны` };
  }

  if (!army) return { ok: false, reason: "Выберите отряд" };

  if (id === "heal") {
    const target = weakestWounded(army);
    if (!target) return { ok: false, reason: "Некого лечить" };
    consume(state, id);
    const amount = healUnit(target, HEAL_POTION_AMOUNT);
    const name = UNIT_DEFS[target.defId]?.name ?? "боец";
    return { ok: true, message: `${def.name}: ${name} +${amount} HP` };
  }

  if (id === "life") {
    const fallen = deadUnits(army)[0];
    if (!fallen) return { ok: false, reason: "Нет павших" };
    consume(state, id);
    const maxHp = UNIT_DEFS[fallen.defId]?.maxHp ?? 20;
    fallen.hp = Math.max(1, Math.floor(maxHp * 0.5));
    const name = UNIT_DEFS[fallen.defId]?.name ?? "боец";
    return { ok: true, message: `${def.name}: ${name} поднят` };
  }

  if (id === "elixir") {
    const living = livingUnits(army);
    if (living.length === 0) return { ok: false, reason: "Отряд пуст" };
    consume(state, id);
    let healed = 0;
    for (const u of living) {
      if (healUnit(u, 999) > 0) healed += 1;
    }
    state.mana += ELIXIR_MANA_WORLD;
    return { ok: true, message: `${def.name}: лечение ${healed}, +${ELIXIR_MANA_WORLD} маны` };
  }

  if (id === "strength" || id === "haste" || id === "ward") {
    const living = livingUnits(army);
    if (living.length === 0) return { ok: false, reason: "Отряд пуст" };
    const status: StatusId = id === "strength" ? "might" : id === "haste" ? "haste" : "ward";
    consume(state, id);
    buffArmy(army, status, BUFF_TURNS_WORLD);
    return { ok: true, message: `${def.name}: на отряд до боя` };
  }

  return { ok: false, reason: "Нельзя здесь" };
}

export function usePotionOnUnit(
  state: GameState,
  id: PotionId,
  unit: UnitInstance,
  opts?: { enemy?: boolean },
): UseResult {
  const def = POTIONS[id];
  if (potionCount(state, id) <= 0) return { ok: false, reason: "Нет в сумке" };

  if (id === "mana") {
    consume(state, id);
    state.mana += MANA_POTION_AMOUNT;
    return { ok: true, message: `${def.name}: +${MANA_POTION_AMOUNT} маны` };
  }

  if (def.target === "enemy") {
    if (!opts?.enemy) return { ok: false, reason: "Нужен враг" };
    if (!(unit.hp > 0)) return { ok: false, reason: "Уже мёртв" };
    consume(state, id);
    applyStatus(unit, "poison", POISON_POTION_TURNS);
    const name = UNIT_DEFS[unit.defId]?.name ?? "враг";
    return { ok: true, message: `${def.name}: ${name} отравлен` };
  }

  if (opts?.enemy) return { ok: false, reason: "Нужен союзник" };

  if (id === "life") {
    if (unit.hp > 0) return { ok: false, reason: "Ещё жив" };
    consume(state, id);
    const maxHp = UNIT_DEFS[unit.defId]?.maxHp ?? 20;
    unit.hp = Math.max(1, Math.floor(maxHp * 0.5));
    clearStatus(unit, "stun");
    const name = UNIT_DEFS[unit.defId]?.name ?? "боец";
    return { ok: true, message: `${def.name}: ${name} поднят` };
  }

  if (!(unit.hp > 0)) return { ok: false, reason: "Мёртв" };

  if (id === "heal") {
    const amount = healUnit(unit, HEAL_POTION_AMOUNT);
    if (amount <= 0) return { ok: false, reason: "Уже полон" };
    consume(state, id);
    const name = UNIT_DEFS[unit.defId]?.name ?? "боец";
    return { ok: true, message: `${def.name}: ${name} +${amount} HP` };
  }

  if (id === "elixir") {
    consume(state, id);
    const amount = healUnit(unit, 999);
    state.mana += ELIXIR_MANA_BATTLE;
    const name = UNIT_DEFS[unit.defId]?.name ?? "боец";
    return { ok: true, message: `${def.name}: ${name} +${amount} HP, +${ELIXIR_MANA_BATTLE} маны` };
  }

  if (id === "strength" || id === "haste" || id === "ward") {
    const status: StatusId = id === "strength" ? "might" : id === "haste" ? "haste" : "ward";
    consume(state, id);
    applyStatus(unit, status, BUFF_TURNS_BATTLE);
    const name = UNIT_DEFS[unit.defId]?.name ?? "боец";
    return { ok: true, message: `${def.name}: ${name}` };
  }

  return { ok: false, reason: "Нельзя" };
}

export function randomLootPotion(): PotionId {
  const bag: PotionId[] = [
    "heal",
    "heal",
    "heal",
    "mana",
    "mana",
    "strength",
    "haste",
    "ward",
    "poison",
    "life",
    "elixir",
  ];
  return bag[Math.floor(Math.random() * bag.length)]!;
}
