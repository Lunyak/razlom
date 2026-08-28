import { GRAVE_RESURRECT_COST, MISSIONARY_HIRE_COST, UNIT_DEFS } from "./catalog";
import {
  ensureHeroInArmy,
  livingUnits,
  type Army,
  type GameState,
  type Grave,
  type UnitInstance,
} from "./data";

let nextGraveId = 1;

export function resetGraveIds(): void {
  nextGraveId = 1;
}

export function ensureGraves(state: GameState): Grave[] {
  if (!state.graves) state.graves = [];
  return state.graves;
}

export function graveAt(
  state: GameState,
  x: number,
  y: number,
  mapId: string = state.currentMapId,
): Grave | undefined {
  return ensureGraves(state).find((g) => g.mapId === mapId && g.x === x && g.y === y);
}

/** Snapshot a wiped army as a map grave (corpses stay with the party). */
export function createGraveFromArmy(state: GameState, army: Army): Grave {
  ensureHeroInArmy(army);
  for (const u of army.units) {
    if (u.hp > 0) u.hp = 0;
  }
  const grave: Grave = {
    id: `grave_${state.turn}_${nextGraveId++}`,
    mapId: army.mapId,
    x: army.x,
    y: army.y,
    name: army.name,
    faction: army.faction,
    hero: { ...army.hero },
    units: army.units.map((u) => ({ ...u })),
    isPlayer: army.isPlayer,
  };
  ensureGraves(state).push(grave);
  return grave;
}

export function canHireMissionary(
  state: GameState,
): { ok: true } | { ok: false; reason: string } {
  const city =
    state.cities.find(
      (c) => c.mapId === state.currentMapId && c.isCapital && c.faction === "ri",
    ) ??
    state.cities.find((c) => c.mapId === state.currentMapId && c.faction === "ri") ??
    state.cities.find((c) => c.faction === "ri");
  if (!city) return { ok: false, reason: "Нет города РИ" };
  if (state.armies.some((a) => a.isPlayer && a.isMissionary && livingUnits(a).length > 0)) {
    return { ok: false, reason: "Миссионер уже в поле" };
  }
  if (state.gold < MISSIONARY_HIRE_COST.gold) return { ok: false, reason: "Мало золота" };
  if (state.mana < MISSIONARY_HIRE_COST.mana) return { ok: false, reason: "Мало маны" };
  if (state.people < MISSIONARY_HIRE_COST.people) return { ok: false, reason: "Мало людей" };
  return { ok: true };
}

export function hireMissionary(
  state: GameState,
): { ok: true; armyId: string } | { ok: false; reason: string } {
  const check = canHireMissionary(state);
  if (!check.ok) return check;

  const city =
    state.cities.find(
      (c) => c.mapId === state.currentMapId && c.isCapital && c.faction === "ri",
    ) ??
    state.cities.find((c) => c.mapId === state.currentMapId && c.faction === "ri") ??
    state.cities.find((c) => c.faction === "ri")!;

  state.gold -= MISSIONARY_HIRE_COST.gold;
  state.mana -= MISSIONARY_HIRE_COST.mana;
  state.people -= MISSIONARY_HIRE_COST.people;

  const armyId = `missionary_${state.turn}_${Math.floor(Math.random() * 1e6)}`;
  const army: Army = {
    id: armyId,
    faction: "ri",
    name: "Миссионер",
    x: city.x,
    y: city.y,
    mapId: city.mapId === state.currentMapId ? city.mapId : state.currentMapId,
    isPlayer: true,
    isMissionary: true,
    movesLeft: 3,
    hero: { name: "Миссионер", level: 1, xp: 0, xpToNext: 100 },
    units: [],
  };
  // Spawn on active map city if possible
  if (city.mapId !== state.currentMapId) {
    const local = state.cities.find((c) => c.mapId === state.currentMapId && c.faction === "ri");
    if (local) {
      army.x = local.x;
      army.y = local.y;
      army.mapId = local.mapId;
    } else {
      army.mapId = state.currentMapId;
    }
  }
  ensureHeroInArmy(army);
  state.armies.push(army);
  state.selectedArmyId = armyId;
  state.lastMessage = `Нанят миссионер (−${MISSIONARY_HIRE_COST.gold}з, −${MISSIONARY_HIRE_COST.mana}м)`;
  return { ok: true, armyId };
}

export function canResurrectGrave(
  state: GameState,
  army: Army,
  grave: Grave,
): { ok: true; cost: typeof GRAVE_RESURRECT_COST } | { ok: false; reason: string } {
  if (!army.isMissionary) return { ok: false, reason: "Нужен миссионер" };
  if (livingUnits(army).length === 0) return { ok: false, reason: "Миссионер мёртв" };
  if (army.mapId !== grave.mapId || army.x !== grave.x || army.y !== grave.y) {
    return { ok: false, reason: "Встаньте на могилу" };
  }
  if (state.gold < GRAVE_RESURRECT_COST.gold) return { ok: false, reason: "Мало золота" };
  if (state.mana < GRAVE_RESURRECT_COST.mana) return { ok: false, reason: "Мало маны" };
  return { ok: true, cost: GRAVE_RESURRECT_COST };
}

/**
 * Raise a grave: restore the party at full HP; missionary is spent in the rite.
 */
export function resurrectGrave(
  state: GameState,
  army: Army,
  grave: Grave,
): { ok: true; armyId: string } | { ok: false; reason: string } {
  const check = canResurrectGrave(state, army, grave);
  if (!check.ok) return check;

  state.gold -= GRAVE_RESURRECT_COST.gold;
  state.mana -= GRAVE_RESURRECT_COST.mana;

  const restoredUnits: UnitInstance[] = grave.units.map((u) => {
    const copy = { ...u };
    const def = UNIT_DEFS[copy.defId] ?? UNIT_DEFS.squire;
    const bonus = copy.isHero ? Math.max(0, grave.hero.level - 1) * 8 : 0;
    copy.hp = def.maxHp + bonus;
    return copy;
  });

  const restored: Army = {
    id: `restored_${grave.id}`,
    faction: grave.faction,
    name: grave.name,
    x: grave.x,
    y: grave.y,
    mapId: grave.mapId,
    isPlayer: grave.isPlayer,
    movesLeft: 3,
    hero: { ...grave.hero },
    units: restoredUnits,
  };
  ensureHeroInArmy(restored);
  // Full heal everyone after ensure
  for (const u of restored.units) {
    const def = UNIT_DEFS[u.defId];
    if (!def) continue;
    const bonus = u.isHero ? Math.max(0, restored.hero.level - 1) * 8 : 0;
    u.hp = def.maxHp + bonus;
  }

  state.armies = state.armies.filter((a) => a.id !== army.id);
  state.armies.push(restored);
  state.graves = ensureGraves(state).filter((g) => g.id !== grave.id);
  state.selectedArmyId = restored.id;
  state.lastMessage = `Могила поднята: ${restored.name} (−${GRAVE_RESURRECT_COST.gold}з, −${GRAVE_RESURRECT_COST.mana}м)`;
  return { ok: true, armyId: restored.id };
}

export function formatMissionaryHire(): string {
  const c = MISSIONARY_HIRE_COST;
  return `Миссионер (${c.gold}з + ${c.mana}м + ${c.people}л)`;
}
