import {
  buildOrderFor,
  buildingIncomeBonus,
  buildStructure,
  canBuild,
  formatBuildingLine,
  cityHasBuilding,
  getRecruitRoster,
  healCostPerUnit,
  resurrectCostPerUnit,
} from "./buildings";
import { BUILDINGS, FACTION_LABEL, GARRISON_LIMIT, UNIT_DEFS, unitMatchesPhase } from "./catalog";
import {
  armyUnitCount,
  cityCulture,
  createUnit,
  ensureFormationSlots,
  ensureHeroInArmy,
  livingUnits,
  type Army,
  type City,
  type FactionId,
  type GameState,
  type Hero,
  type UnitInstance,
} from "./data";
import { leadershipLimit } from "./battle";
import { defaultClassForName } from "./heroClasses";
import { playerFactionOf } from "./playerFaction";
import { harvestIncomeFactor } from "./rails";
import { collectOwnedSiteIncome } from "./sites";
import { armyCanCarryUnit, dayActionsClosed, isNight, phaseOf } from "./dayNight";

export {
  buildOrderFor,
  buildStructure,
  canBuild,
  formatBuildingLine,
  getRecruitRoster,
  healCostPerUnit,
  resurrectCostPerUnit,
};

export function cityAt(
  state: GameState,
  x: number,
  y: number,
  mapId: string = state.currentMapId,
): City | undefined {
  return state.cities.find((c) => c.mapId === mapId && c.x === x && c.y === y);
}

export function playerCities(state: GameState): City[] {
  const pf = playerFactionOf(state);
  return state.cities.filter((c) => c.faction === pf && c.mapId === state.currentMapId);
}

export function collectIncome(state: GameState): {
  gold: number;
  mana: number;
  people: number;
  coal: number;
  steel: number;
} {
  let gold = 0;
  let mana = 0;
  let people = 0;
  for (const city of playerCities(state)) {
    gold += city.income.gold;
    mana += city.income.mana;
    people += city.income.people ?? 0;
    const bonus = buildingIncomeBonus(city);
    gold += bonus.gold;
    mana += bonus.mana;
    people += bonus.people;
    // Culture flavor (owner may be RI): cossack → +people, highlander → +mana.
    const culture = cityCulture(city);
    if (culture === "cossack") people += 1;
    else if (culture === "highlander") mana += 1;
  }
  const sites = collectOwnedSiteIncome(state, playerFactionOf(state), (site) =>
    harvestIncomeFactor(state, site),
  );
  gold += sites.gold;
  state.gold += gold;
  state.mana += mana;
  state.people += people;
  state.coal += sites.coal;
  state.steel += sites.steel;
  return { gold, mana, people, coal: sites.coal, steel: sites.steel };
}

/**
 * Walk-on claim: neutral (faction null) always OK.
 * Hostile city only if no living army of city.faction remains on that map.
 */
export function canWalkCaptureCity(state: GameState, city: City): boolean {
  if (dayActionsClosed(state)) return false;
  if (city.faction === null) return true;
  const pf = playerFactionOf(state);
  if (city.faction === pf) return false;
  return !factionHasLivingArmyOnMap(state, city.faction, city.mapId);
}

export function walkCaptureBlockMessage(city: City): string {
  const label = city.faction ? FACTION_LABEL[city.faction] : "врага";
  return `Сначала разбейте войска ${label}`;
}

function factionHasLivingArmyOnMap(
  state: GameState,
  faction: FactionId,
  mapId: string,
): boolean {
  return state.armies.some(
    (a) => a.mapId === mapId && a.faction === faction && livingUnits(a).length > 0,
  );
}

export function canRecruit(
  state: GameState,
  army: Army,
  city: City,
  defId: string,
): { ok: true } | { ok: false; reason: string } {
  if (!unitMatchesPhase(defId, phaseOf(state))) {
    return {
      ok: false,
      reason: isNight(state) ? "Обычных нанимают днём" : "Мистических — ночью",
    };
  }
  const def = UNIT_DEFS[defId];
  if (!def) return { ok: false, reason: "Неизвестный юнит" };
  const culture = cityCulture(city);
  if (def.faction !== army.faction && def.faction !== culture) {
    return { ok: false, reason: "Чужая фракция" };
  }
  if (!armyCanCarryUnit(army, defId)) {
    return {
      ok: false,
      reason: army.isNightHero ? "Дневных не берут на шов" : "Мистических берут ночью",
    };
  }

  const roster = getRecruitRoster(city, army.faction, state);
  if (!roster.includes(defId)) return { ok: false, reason: "Нужно здание" };

  const cost = def.recruitCost;
  if (!cost) return { ok: false, reason: "Нельзя нанять" };
  if (state.gold < cost.gold) return { ok: false, reason: "Мало золота" };
  if (cost.mana && state.mana < cost.mana) return { ok: false, reason: "Мало маны" };
  if (cost.people && state.people < cost.people) return { ok: false, reason: "Мало людей" };
  if (armyUnitCount(army) >= leadershipLimit(army.hero)) {
    return { ok: false, reason: "Лимит отряда" };
  }
  return { ok: true };
}

export function recruitUnit(state: GameState, army: Army, city: City, defId: string): boolean {
  const check = canRecruit(state, army, city, defId);
  if (!check.ok) return false;

  const cost = UNIT_DEFS[defId].recruitCost!;
  state.gold -= cost.gold;
  if (cost.mana) state.mana -= cost.mana;
  if (cost.people) state.people -= cost.people;
  army.units.push(createUnit(defId));
  ensureFormationSlots(army);
  return true;
}

function unitHealCost(unit: UnitInstance, city?: City): number {
  if (unit.hp <= 0) return resurrectCostPerUnit(city);
  if (unit.hp < UNIT_DEFS[unit.defId].maxHp) return healCostPerUnit(city);
  return 0;
}

/** Heal wounded and resurrect fallen in an army (and optionally city garrison). */
export function healArmy(
  state: GameState,
  army: Army,
  city?: City,
): { ok: true; cost: number; healed: number; revived: number } | { ok: false; reason: string } {
  return healUnits(state, army.units, city);
}

/** Heal / resurrect army (if on city tile) + garrison. */
export function healInCity(
  state: GameState,
  city: City,
  army: Army | null,
): { ok: true; cost: number; healed: number; revived: number } | { ok: false; reason: string } {
  const units: UnitInstance[] = [...ensureGarrison(city)];
  if (army && army.x === city.x && army.y === city.y && army.mapId === city.mapId) {
    units.push(...army.units);
  }
  return healUnits(state, units, city);
}

function healUnits(
  state: GameState,
  units: UnitInstance[],
  city?: City,
): { ok: true; cost: number; healed: number; revived: number } | { ok: false; reason: string } {
  const need = units.filter((u) => u.hp < UNIT_DEFS[u.defId].maxHp);
  if (need.length === 0) return { ok: false, reason: "Все здоровы" };

  let cost = 0;
  let healed = 0;
  let revived = 0;
  for (const unit of need) {
    cost += unitHealCost(unit, city);
    if (unit.hp <= 0) revived += 1;
    else healed += 1;
  }
  if (state.gold < cost) return { ok: false, reason: "Мало золота" };

  state.gold -= cost;
  for (const unit of need) {
    unit.hp = UNIT_DEFS[unit.defId].maxHp;
  }
  return { ok: true, cost, healed, revived };
}

/** Prefer capital on active map, then any player city — for fallen after defeat. */
export function findRecoveryCity(state: GameState): City | undefined {
  const pf = playerFactionOf(state);
  return (
    state.cities.find(
      (c) => c.mapId === state.currentMapId && c.isCapital && c.faction === pf,
    ) ??
    state.cities.find((c) => c.mapId === state.currentMapId && c.faction === pf) ??
    state.cities.find((c) => c.isCapital && c.faction === pf) ??
    state.cities.find((c) => c.faction === pf)
  );
}

/**
 * Move all units from a wiped army into a city garrison (as corpses if needed).
 * @deprecated Prefer createGraveFromArmy — corpses stay with the party / grave.
 */
export function depositArmyRemains(
  state: GameState,
  army: Army,
): { city: City | null; saved: number; lost: number } {
  const city = findRecoveryCity(state);
  if (!city) return { city: null, saved: 0, lost: army.units.length };

  const gar = ensureGarrison(city);
  let saved = 0;
  let lost = 0;
  const leftover: UnitInstance[] = [];
  for (const unit of army.units) {
    if (unit.hp > 0) unit.hp = 0;
    if (gar.length >= GARRISON_LIMIT) {
      leftover.push(unit);
      lost += 1;
      continue;
    }
    gar.push(unit);
    saved += 1;
  }
  army.units = leftover;
  return { city, saved, lost };
}

export function captureCity(city: City, newFaction: FactionId): void {
  if (city.faction && city.faction !== newFaction && !city.culture) {
    city.culture = city.faction;
  }
  city.faction = newFaction;
  city.garrison = [];
  if (newFaction === "ordo" || newFaction === "risen") {
    city.buildings = [];
    city.culture = undefined;
  }
}

export function ensureGarrison(city: City): UnitInstance[] {
  if (!city.garrison) city.garrison = [];
  return city.garrison;
}

export function livingGarrison(city: City): UnitInstance[] {
  return ensureGarrison(city).filter((u) => u.hp > 0);
}

/** All garrison slots including fallen. */
export function garrisonUnits(city: City): UnitInstance[] {
  return ensureGarrison(city);
}

export function garrisonCount(city: City): number {
  return ensureGarrison(city).length;
}

export function canRecruitToGarrison(
  state: GameState,
  city: City,
  defId: string,
): { ok: true } | { ok: false; reason: string } {
  if (!unitMatchesPhase(defId, phaseOf(state))) {
    return {
      ok: false,
      reason: isNight(state) ? "Обычных нанимают днём" : "Мистических — ночью",
    };
  }
  const pf = playerFactionOf(state);
  const def = UNIT_DEFS[defId];
  if (!def) return { ok: false, reason: "Неизвестный юнит" };
  const culture = cityCulture(city);
  if (def.faction !== pf && def.faction !== culture) {
    return { ok: false, reason: "Чужая фракция" };
  }
  if (city.faction !== pf) return { ok: false, reason: "Чужой город" };

  const roster = getRecruitRoster(city, pf, state);
  if (!roster.includes(defId)) return { ok: false, reason: "Нужно здание" };

  const cost = def.recruitCost;
  if (!cost) return { ok: false, reason: "Нельзя нанять" };
  if (state.gold < cost.gold) return { ok: false, reason: "Мало золота" };
  if (cost.mana && state.mana < cost.mana) return { ok: false, reason: "Мало маны" };
  if (cost.people && state.people < cost.people) return { ok: false, reason: "Мало людей" };
  if (garrisonCount(city) >= GARRISON_LIMIT) return { ok: false, reason: "Гарнизон полон" };
  return { ok: true };
}

export function recruitToGarrison(state: GameState, city: City, defId: string): boolean {
  const check = canRecruitToGarrison(state, city, defId);
  if (!check.ok) return false;
  const cost = UNIT_DEFS[defId].recruitCost!;
  state.gold -= cost.gold;
  if (cost.mana) state.mana -= cost.mana;
  if (cost.people) state.people -= cost.people;
  ensureGarrison(city).push(createUnit(defId));
  return true;
}

/** Prefer army if hero present and has room; else garrison. */
export function recruitSmart(
  state: GameState,
  city: City,
  army: Army | null,
  defId: string,
): { ok: true; into: "army" | "garrison" } | { ok: false; reason: string } {
  if (army && army.x === city.x && army.y === city.y && army.mapId === city.mapId) {
    if (armyCanCarryUnit(army, defId)) {
      const toArmy = canRecruit(state, army, city, defId);
      if (toArmy.ok) {
        recruitUnit(state, army, city, defId);
        return { ok: true, into: "army" };
      }
      if (toArmy.reason === "Лимит отряда") {
        const toGar = canRecruitToGarrison(state, city, defId);
        if (toGar.ok) {
          recruitToGarrison(state, city, defId);
          return { ok: true, into: "garrison" };
        }
        return toGar;
      }
      return toArmy;
    }
  }
  const toGar = canRecruitToGarrison(state, city, defId);
  if (!toGar.ok) return toGar;
  recruitToGarrison(state, city, defId);
  return { ok: true, into: "garrison" };
}

export function leaveUnitInCity(
  army: Army,
  city: City,
  unitInstanceId: string,
): { ok: true } | { ok: false; reason: string } {
  if (army.x !== city.x || army.y !== city.y || army.mapId !== city.mapId) {
    return { ok: false, reason: "Герой не в городе" };
  }
  if (garrisonCount(city) >= GARRISON_LIMIT) return { ok: false, reason: "Гарнизон полон" };
  const idx = army.units.findIndex((u) => u.instanceId === unitInstanceId);
  if (idx < 0) return { ok: false, reason: "Юнит не найден" };
  if (army.units[idx].isHero) return { ok: false, reason: "Героя нельзя оставить в гарнизоне" };
  const [unit] = army.units.splice(idx, 1);
  ensureGarrison(city).push(unit);
  return { ok: true };
}

export function takeUnitFromCity(
  army: Army,
  city: City,
  unitInstanceId: string,
): { ok: true } | { ok: false; reason: string } {
  if (army.x !== city.x || army.y !== city.y || army.mapId !== city.mapId) {
    return { ok: false, reason: "Герой не в городе" };
  }
  if (armyUnitCount(army) >= leadershipLimit(army.hero)) {
    return { ok: false, reason: "Лимит отряда" };
  }
  const gar = ensureGarrison(city);
  const idx = gar.findIndex((u) => u.instanceId === unitInstanceId);
  if (idx < 0) return { ok: false, reason: "Юнит не в гарнизоне" };
  const waiting = gar[idx];
  if (!waiting) return { ok: false, reason: "Юнит не в гарнизоне" };
  if (!armyCanCarryUnit(army, waiting.defId)) {
    return {
      ok: false,
      reason: army.isNightHero ? "Дневных не берут на шов" : "Мистических берут ночью",
    };
  }
  const [unit] = gar.splice(idx, 1);
  army.units.push(unit);
  ensureFormationSlots(army);
  return { ok: true };
}

export function ordoCities(state: GameState): City[] {
  return state.cities.filter((c) => c.faction === "ordo");
}

export function risenCities(state: GameState): City[] {
  return state.cities.filter((c) => c.faction === "risen");
}

/** Spawn Ordo Lumen patrol every N turns from capital on the active map */
export function maybeSpawnOrdoPatrol(state: GameState): string | null {
  if (state.turn % 8 !== 0 || state.gameOver) return null;
  if (
    state.armies.filter(
      (a) => a.mapId === state.currentMapId && !a.isPlayer && !a.isNeutral,
    ).length >= 4
  ) {
    return null;
  }

  const capital = state.cities.find(
    (c) => c.mapId === state.currentMapId && c.isCapital && c.faction === "ordo",
  );
  if (!capital) return null;

  const id = `enemy_spawn_${state.turn}`;
  if (state.armies.some((a) => a.id === id)) return null;

  state.armies.push({
    id,
    faction: "ordo",
    name: "Колонна Рейха",
    x: capital.x,
    y: capital.y,
    mapId: capital.mapId,
    isPlayer: false,
    movesLeft: 2,
    hero: { name: "Штаб Януса", level: 1, xp: 0, xpToNext: 100 },
    units: [createUnit("zombie"), createUnit("skeleton"), createUnit("ghost")],
    veil: "day",
  });
  return "Из Цитадели Януса вышла новая колонна Ordo Lumen!";
}

/** @deprecated aliases */
export const undeadCities = ordoCities;
export const maybeSpawnUndeadPatrol = maybeSpawnOrdoPatrol;
export const maybeSpawnRisenPatrol = maybeSpawnOrdoPatrol;

/** Prefer `resolveMissionOutcome` from scenario/progress — map chain aware. */
export function checkVictory(state: GameState): "victory" | "defeat" | null {
  if (state.gameOver) return state.gameOver;

  const pf = playerFactionOf(state);
  const playerHeroAlive = state.armies.some(
    (a) => a.isPlayer && !a.isNeutral && livingUnits(a).length > 0,
  );
  if (!playerHeroAlive) {
    const hasCity = state.cities.some((c) => c.faction === pf);
    const hasGrave = (state.graves?.length ?? 0) > 0;
    if (hasCity || hasGrave) return null;
    return "defeat";
  }

  return null;
}

export function tryHireNewHero(
  state: GameState,
): { ok: true; armyId: string; heroName: string; cost: number } | { ok: false; reason: string } {
  const pf = playerFactionOf(state);
  const capital =
    state.cities.find(
      (c) => c.mapId === state.currentMapId && c.isCapital && c.faction === pf,
    ) ??
    state.cities.find((c) => c.mapId === state.currentMapId && c.faction === pf) ??
    state.cities.find((c) => c.isCapital && c.faction === pf);
  if (!capital) return { ok: false, reason: "Нет вашего города на этой карте" };
  if (dayActionsClosed(state)) return { ok: false, reason: "Найм героя — днём" };

  const cost = 120;
  if (state.gold < cost) return { ok: false, reason: "Мало золота на найм героя" };

  const armyId = `player_${state.turn}_${Math.floor(Math.random() * 1e6)}`;
  const heroName = "Командор (новый)";

  state.gold -= cost;

  const spawnMapId = state.currentMapId;
  const spawnX =
    capital.mapId === spawnMapId
      ? capital.x
      : Math.min(2, (state.cities.find((c) => c.mapId === spawnMapId)?.x ?? 2));
  const spawnY =
    capital.mapId === spawnMapId
      ? capital.y
      : Math.min(2, (state.cities.find((c) => c.mapId === spawnMapId)?.y ?? 2));

  state.armies.push({
    id: armyId,
    faction: pf,
    name: `Отряд: ${heroName}`,
    x: spawnX,
    y: spawnY,
    mapId: spawnMapId,
    isPlayer: true,
    movesLeft: 3,
    hero: createHero(heroName, "officer"),
    units: starterUnitsFor(pf),
  });
  ensureHeroInArmy(state.armies[state.armies.length - 1]);

  state.selectedArmyId = armyId;
  state.lastMessage = `Герой пал… нанят новый за −${cost} золота`;
  return { ok: true, armyId, heroName, cost };
}

export function passiveTempleHeal(army: Army, city: City): number {
  const hasShrine =
    cityHasBuilding(city, "temple") ||
    cityHasBuilding(city, "cossack_church") ||
    cityHasBuilding(city, "highland_shrine");
  if (!hasShrine) return 0;
  let total = 0;
  for (const unit of livingUnits(army)) {
    const def = UNIT_DEFS[unit.defId];
    const gain = Math.max(1, Math.floor(def.maxHp * 0.12));
    const before = unit.hp;
    unit.hp = Math.min(def.maxHp, unit.hp + gain);
    total += unit.hp - before;
  }
  return total;
}

export function formatRecruitLine(defId: string): string {
  const def = UNIT_DEFS[defId];
  const cost = def.recruitCost!;
  const mana = cost.mana ? ` +${cost.mana}М` : "";
  const people = cost.people ? ` +${cost.people}л` : "";
  return `${def.name} (${cost.gold}з${mana}${people})`;
}

function starterUnitsFor(faction: FactionId): UnitInstance[] {
  if (faction === "cossack") return [createUnit("cossack_plastun"), createUnit("cossack_shooter")];
  if (faction === "highlander") return [createUnit("highlander_dzhigit"), createUnit("highlander_archer")];
  return [createUnit("squire"), createUnit("archer")];
}

function createHero(name: string, classId?: Hero["classId"]): Hero {
  return {
    name,
    level: 1,
    xp: 0,
    xpToNext: 100,
    classId: classId ?? defaultClassForName(name),
    equipment: {},
  };
}

export function summonSecondHero(state: GameState, city: City): boolean {
  if (state.heroHallUsed) return false;
  if (!city.buildings.includes("hero_hall")) return false;
  if (state.armies.some((a) => a.id === "player2")) return false;
  const pf = playerFactionOf(state);

  state.armies.push({
    id: "player2",
    faction: pf,
    name: "Гвардия Элианы",
    x: city.x,
    y: city.y,
    mapId: city.mapId,
    isPlayer: true,
    movesLeft: 3,
    hero: createHero("Элиана", "priest"),
    units: starterUnitsFor(pf),
  });
  ensureHeroInArmy(state.armies[state.armies.length - 1]);
  state.heroHallUsed = true;
  return true;
}

export function tryBuildByIndex(state: GameState, city: City, index: number): string {
  const order = buildOrderFor(cityCulture(city));
  const id = order[index];
  if (!id) return "Нет такого здания";
  const pf = playerFactionOf(state);

  if (id === "hero_hall") {
    const check = canBuild(state, city, id, pf);
    if (!check.ok) return check.reason;
    if (!buildStructure(state, city, id, pf)) return "Не построено";
    if (summonSecondHero(state, city)) {
      return "Зал орденов открыт · Элиана приняла знамя!";
    }
    return "Зал орденов возведён";
  }

  const check = canBuild(state, city, id, pf);
  if (!check.ok) return check.reason;
  if (!buildStructure(state, city, id, pf)) return "Не построено";
  return `Возведено: ${BUILDINGS[id].name}`;
}
