/**
 * Building logic: recruit roster, income, canBuild / buildStructure.
 * Tables live in catalog/buildings.ts.
 */
import {
  BUILDINGS,
  COSSACK_BUILD_ORDER,
  EMPIRE_BUILD_ORDER,
  HIGHLANDER_BUILD_ORDER,
  ORDO_BUILD_ORDER,
  RISEN_BUILD_ORDER,
  unitMatchesPhase,
  type BuildingId,
} from "./catalog";
import { cityCulture, type City, type FactionId, type GameState } from "./data";
import { dayActionsClosed, isNight } from "./dayNight";

export type { BuildingId, BuildingDef } from "./catalog";

export function buildOrderFor(culture: FactionId): BuildingId[] {
  if (culture === "cossack") return COSSACK_BUILD_ORDER;
  if (culture === "highlander") return HIGHLANDER_BUILD_ORDER;
  if (culture === "ordo") return ORDO_BUILD_ORDER;
  if (culture === "risen") return RISEN_BUILD_ORDER;
  if (culture === "ri") return EMPIRE_BUILD_ORDER;
  return [];
}

export function cityHasBuilding(city: City, id: BuildingId): boolean {
  return city.buildings.includes(id);
}

function rawRecruitRoster(city: City, night: boolean): string[] {
  const culture = cityCulture(city);
  if (culture === "cossack") {
    return night ? ["cossack_chaplain"] : ["cossack_plastun", "cossack_shooter"];
  }
  if (culture === "highlander") {
    return night ? ["highlander_shaman"] : ["highlander_dzhigit", "highlander_archer"];
  }
  if (culture === "ordo") {
    return night ? ["ghost", "initiate"] : ["zombie"];
  }
  if (culture === "risen") {
    return night ? ["risen_agitator"] : ["risen_guard", "risen_gunner"];
  }
  if (culture !== "ri") return [];

  if (night) {
    const roster = ["acolyte"];
    if (city.isCapital || cityHasBuilding(city, "temple")) roster.push("incorrupt");
    if (cityHasBuilding(city, "mage_tower")) roster.push("witch");
    return roster;
  }
  return ["squire", "archer"];
}

export function getRecruitRoster(
  city: City,
  _armyFaction: FactionId,
  state?: GameState,
): string[] {
  const night = !!state && isNight(state);
  const phase = night ? "night" : "day";
  return rawRecruitRoster(city, night).filter((id) => unitMatchesPhase(id, phase));
}

export function buildingIncomeBonus(city: City): { gold: number; mana: number; people: number } {
  let gold = 0;
  let mana = 0;
  let people = 0;
  for (const id of city.buildings) {
    const b = BUILDINGS[id];
    if (!b) continue;
    gold += b.incomeBonus?.gold ?? 0;
    mana += b.incomeBonus?.mana ?? 0;
    people += b.incomeBonus?.people ?? 0;
  }
  return { gold, mana, people };
}

function cityHasHealShrine(city: City): boolean {
  return (
    cityHasBuilding(city, "temple") ||
    cityHasBuilding(city, "cossack_church") ||
    cityHasBuilding(city, "highland_shrine") ||
    cityHasBuilding(city, "janus_crypt") ||
    cityHasBuilding(city, "risen_mausoleum")
  );
}

export function healCostPerUnit(city: City | undefined): number {
  if (!city) return 8;
  if (cityHasHealShrine(city)) return 5;
  return 8;
}

/** Revive a fallen unit (hp ≤ 0). Cheaper with a temple. */
export function resurrectCostPerUnit(city: City | undefined): number {
  if (!city) return 35;
  if (cityHasHealShrine(city)) return 20;
  return 35;
}

export function canBuild(
  state: GameState,
  city: City,
  id: BuildingId,
  playerFaction: FactionId = "ri",
): { ok: true } | { ok: false; reason: string } {
  if (dayActionsClosed(state)) return { ok: false, reason: "Строить — днём" };
  if (city.faction !== playerFaction) return { ok: false, reason: "Не ваш город" };
  if (cityHasBuilding(city, id)) return { ok: false, reason: "Уже построено" };

  const def = BUILDINGS[id];
  if (!def) return { ok: false, reason: "Нет здания" };
  const culture = cityCulture(city);
  if (def.culture !== culture && !(id === "hero_hall" && culture === "ri")) {
    return { ok: false, reason: "Не та культура" };
  }
  if (!buildOrderFor(culture).includes(id) && id !== "hero_hall") {
    return { ok: false, reason: "Недоступно" };
  }

  if (state.gold < def.cost.gold) return { ok: false, reason: "Мало золота" };
  if (def.cost.mana && state.mana < def.cost.mana) return { ok: false, reason: "Мало маны" };

  if (id === "hero_hall" && state.armies.some((a) => a.id === "player2")) {
    return { ok: false, reason: "Герой уже призван" };
  }

  return { ok: true };
}

export function buildStructure(
  state: GameState,
  city: City,
  id: BuildingId,
  playerFaction: FactionId = "ri",
): boolean {
  const check = canBuild(state, city, id, playerFaction);
  if (!check.ok) return false;

  const def = BUILDINGS[id];
  state.gold -= def.cost.gold;
  if (def.cost.mana) state.mana -= def.cost.mana;
  city.buildings.push(id);
  return true;
}

export function formatBuildingLine(id: BuildingId, index: number): string {
  const b = BUILDINGS[id];
  const mana = b.cost.mana ? `+${b.cost.mana}М` : "";
  return `[${index + 6}] ${b.name} (${b.cost.gold}з${mana})`;
}
