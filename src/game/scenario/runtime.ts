import { createUnit, ensureHeroInArmy, type Army, type City, type GameState } from "../data";
import { createDiscovered } from "../data";
import { ensureEquipment } from "../artifacts";
import { ensureHeroClass } from "../heroClasses";
import { startingInventory } from "../items";
import type { MapSite } from "../sites";
import { campaignPart1, scenario1914Frontier } from "../../scenarios/part1_1914";
import { scenario1917Fracture } from "../../scenarios/part1_1917";
import { deserializeScenario, serializeScenario, type SerializedScenarioDef } from "./serialize";
import type { CampaignDef, MapDef, PortalDef, ScenarioDef } from "./types";

const CUSTOM_STORAGE_KEY = "razlom-custom-scenarios-v1";

const SCENARIOS: Record<string, ScenarioDef> = {
  [scenario1914Frontier.id]: scenario1914Frontier,
  [scenario1917Fracture.id]: scenario1917Fracture,
};

const CAMPAIGNS: Record<string, CampaignDef> = {
  [campaignPart1.id]: campaignPart1,
};

const BUILTIN_SCENARIO_IDS = new Set(Object.keys(SCENARIOS));

/** Custom / editor scenarios (also persisted). */
const CUSTOM_IDS = new Set<string>();

export function isBuiltinScenario(id: string): boolean {
  return BUILTIN_SCENARIO_IDS.has(id);
}

export function getScenario(id: string): ScenarioDef | undefined {
  return SCENARIOS[id];
}

export function getCampaign(id: string): CampaignDef | undefined {
  return CAMPAIGNS[id];
}

export function listScenarios(): ScenarioDef[] {
  return Object.values(SCENARIOS);
}

export function listCustomScenarios(): ScenarioDef[] {
  return [...CUSTOM_IDS].map((id) => SCENARIOS[id]).filter(Boolean);
}

export function listCampaigns(): CampaignDef[] {
  return Object.values(CAMPAIGNS);
}

export function registerScenario(scenario: ScenarioDef, persist = true): void {
  SCENARIOS[scenario.id] = scenario;
  // Built-in ids: session override only — never write over canon in localStorage
  if (BUILTIN_SCENARIO_IDS.has(scenario.id)) return;
  if (persist) {
    CUSTOM_IDS.add(scenario.id);
    persistCustomScenarios();
  }
}

export function unregisterScenario(id: string): void {
  if (!CUSTOM_IDS.has(id)) return;
  delete SCENARIOS[id];
  CUSTOM_IDS.delete(id);
  persistCustomScenarios();
}

function persistCustomScenarios(): void {
  try {
    const payload: SerializedScenarioDef[] = [...CUSTOM_IDS]
      .map((id) => SCENARIOS[id])
      .filter(Boolean)
      .map((s) => serializeScenario(s));
    localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota */
  }
}

/** Load editor-saved scenarios from localStorage (call once at boot). */
export function loadCustomScenariosFromStorage(): void {
  try {
    const raw = localStorage.getItem(CUSTOM_STORAGE_KEY);
    if (!raw) return;
    const list = JSON.parse(raw) as SerializedScenarioDef[];
    if (!Array.isArray(list)) return;
    for (const item of list) {
      const scenario = deserializeScenario(item);
      SCENARIOS[scenario.id] = scenario;
      CUSTOM_IDS.add(scenario.id);
    }
  } catch {
    /* ignore corrupt */
  }
}

export function registerCampaign(campaign: CampaignDef): void {
  CAMPAIGNS[campaign.id] = campaign;
}

export function getMapDef(scenario: ScenarioDef, mapId: string): MapDef | undefined {
  return scenario.maps.find((m) => m.id === mapId);
}

export function portalsOnMap(scenario: ScenarioDef, mapId: string): PortalDef[] {
  return getMapDef(scenario, mapId)?.portals ?? [];
}

export function portalAt(
  scenario: ScenarioDef,
  mapId: string,
  x: number,
  y: number,
): PortalDef | undefined {
  return portalsOnMap(scenario, mapId).find((p) => p.x === x && p.y === y);
}

function spawnArmies(scenario: ScenarioDef): Army[] {
  const armies: Army[] = [];
  for (const map of scenario.maps) {
    for (const spawn of map.armies ?? []) {
      armies.push({
        id: spawn.id,
        faction: spawn.faction,
        name: spawn.name,
        x: spawn.x,
        y: spawn.y,
        mapId: map.id,
        isPlayer: spawn.isPlayer,
        isNeutral: spawn.isNeutral,
        isMissionary: spawn.isMissionary,
        isNightHero: spawn.isNightHero,
        veil: spawn.veil,
        movesLeft: spawn.movesLeft,
        hero: { ...spawn.hero },
        units: spawn.unitDefIds.map((id) => createUnit(id)),
      });
      const army = armies[armies.length - 1]!;
      ensureHeroClass(army.hero);
      ensureEquipment(army.hero);
      ensureHeroInArmy(army);
    }
  }
  return armies;
}

function spawnCities(scenario: ScenarioDef): City[] {
  const cities: City[] = [];
  for (const map of scenario.maps) {
    for (const c of map.cities) {
      cities.push({
        id: c.id,
        name: c.name,
        x: c.x,
        y: c.y,
        mapId: map.id,
        faction: c.faction,
        isCapital: c.isCapital,
        income: { ...c.income },
        buildings: [...(c.buildings ?? [])],
        garrison: [],
      });
    }
  }
  return cities;
}

function spawnSites(scenario: ScenarioDef): MapSite[] {
  const sites: MapSite[] = [];
  for (const map of scenario.maps) {
    for (const s of map.sites ?? []) {
      sites.push({ ...s, mapId: map.id });
    }
  }
  return sites;
}

function buildDiscovered(scenario: ScenarioDef): Record<string, boolean[][]> {
  const out: Record<string, boolean[][]> = {};
  for (const map of scenario.maps) {
    out[map.id] = createDiscovered(map.cols, map.rows, !!map.startExplored);
  }
  return out;
}

/** Build a fresh GameState from a scenario definition. */
export function createStateFromScenario(
  scenarioId: string,
  campaignId: string | null = null,
): GameState {
  const scenario = getScenario(scenarioId);
  if (!scenario) throw new Error(`Unknown scenario: ${scenarioId}`);

  const startMap = getMapDef(scenario, scenario.startMapId);
  if (!startMap) throw new Error(`Missing start map: ${scenario.startMapId}`);

  const armies = spawnArmies(scenario);
  return {
    turn: 1,
    gold: scenario.startingResources.gold,
    mana: scenario.startingResources.mana,
    people: scenario.startingResources.people,
    coal: scenario.startingResources.coal ?? 0,
    steel: scenario.startingResources.steel ?? 0,
    selectedArmyId: armies.find((a) => a.isPlayer)?.id ?? null,
    armies,
    cities: spawnCities(scenario),
    sites: spawnSites(scenario),
    graves: [],
    inventory: startingInventory(),
    artifacts: [],
    discoveredByMap: buildDiscovered(scenario),
    gameOver: null,
    lastMessage: scenario.brief ?? scenario.description,
    heroHallUsed: false,
    campaignId,
    scenarioId: scenario.id,
    currentMapId: scenario.startMapId,
    firedPlotIds: [],
    phase: "day",
    bloodStains: [],
    ruinMemory: [],
    prayedArmyIds: [],
    ruinScouts: [],
    cityRitesUsed: [],
    cityBells: [],
    rails: [],
  };
}

export function startCampaign(campaignId: string): GameState {
  const campaign = getCampaign(campaignId);
  if (!campaign) throw new Error(`Unknown campaign: ${campaignId}`);
  const first = campaign.scenarioIds[0];
  if (!first) throw new Error(`Campaign ${campaignId} has no scenarios`);
  return createStateFromScenario(first, campaignId);
}

export function transferArmyToMap(
  state: GameState,
  armyId: string,
  targetMapId: string,
  x: number,
  y: number,
): boolean {
  const army = state.armies.find((a) => a.id === armyId);
  if (!army) return false;
  const scenario = getScenario(state.scenarioId);
  if (!scenario) return false;
  const map = getMapDef(scenario, targetMapId);
  if (!map) return false;
  if (x < 0 || y < 0 || x >= map.cols || y >= map.rows) return false;

  army.mapId = targetMapId;
  army.x = x;
  army.y = y;
  state.currentMapId = targetMapId;
  state.selectedArmyId = army.id;
  state.lastMessage = `Переход: ${map.name}`;
  return true;
}
