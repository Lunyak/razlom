import { ensureDiscoveredGrid, ensureHeroInArmy, session, type FactionId, type GameState } from "./data";
import { ensureNightHero } from "./dayNight";
import { ensureArtifactStash, ensureEquipment } from "./artifacts";
import { ensureHeroClass } from "./heroClasses";
import { ensureInventory, startingInventory } from "./items";
import { getScenario } from "./scenario";

const SAVE_KEY = "razlom-save-v4";

function migrateFaction(id: string | null | undefined): FactionId | null {
  if (id == null) return null;
  if (id === "empire") return "ri";
  if (id === "undead") return "ordo";
  if (id === "cossacks") return "cossack";
  if (id === "highlanders" || id === "dwarves" || id === "dwarf") return "highlander";
  if (
    id === "ri" ||
    id === "ordo" ||
    id === "risen" ||
    id === "neutral" ||
    id === "cossack" ||
    id === "highlander"
  ) {
    return id;
  }
  return "neutral";
}

export function hasSave(): boolean {
  try {
    return (
      localStorage.getItem(SAVE_KEY) !== null ||
      localStorage.getItem("razlom-save-v3") !== null ||
      localStorage.getItem("razlom-save-v2") !== null ||
      localStorage.getItem("disciples-like-save-v1") !== null
    );
  } catch {
    return false;
  }
}

export function saveGame(state: GameState = session.state): boolean {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(): GameState | null {
  try {
    const raw =
      localStorage.getItem(SAVE_KEY) ??
      localStorage.getItem("razlom-save-v3") ??
      localStorage.getItem("razlom-save-v2") ??
      localStorage.getItem("disciples-like-save-v1");
    if (!raw) return null;
    return JSON.parse(raw) as GameState;
  } catch {
    return null;
  }
}

export function applyLoadedState(state: GameState): void {
  if (typeof state.people !== "number") state.people = 20;
  if (typeof state.coal !== "number") state.coal = 0;
  if (typeof state.steel !== "number") state.steel = 0;
  if (!state.scenarioId) state.scenarioId = "1914-frontier";
  if (!state.currentMapId) state.currentMapId = "frontier";
  if (!state.campaignId) state.campaignId = "part1-1914";
  if (!Array.isArray(state.graves)) state.graves = [];
  if (!Array.isArray(state.firedPlotIds)) state.firedPlotIds = [];
  if (state.phase !== "day" && state.phase !== "night") state.phase = "day";
  if (!Array.isArray(state.bloodStains)) state.bloodStains = [];
  if (!Array.isArray(state.ruinMemory)) state.ruinMemory = [];
  if (!Array.isArray(state.prayedArmyIds)) state.prayedArmyIds = [];
  if (!Array.isArray(state.ruinScouts)) state.ruinScouts = [];
  if (!Array.isArray(state.cityRitesUsed)) state.cityRitesUsed = [];
  if (!Array.isArray(state.cityBells)) state.cityBells = [];
  if (!Array.isArray(state.rails)) state.rails = [];
  if (!state.inventory) state.inventory = startingInventory();
  else ensureInventory(state);
  ensureArtifactStash(state);

  const scenario = getScenario(state.scenarioId);
  if (!state.discoveredByMap) {
    state.discoveredByMap = {};
  }
  if (scenario) {
    for (const map of scenario.maps) {
      state.discoveredByMap[map.id] = ensureDiscoveredGrid(
        state.discoveredByMap[map.id],
        map.cols,
        map.rows,
        !!map.startExplored,
      );
    }
  }

  for (const city of state.cities) {
    city.faction = migrateFaction(city.faction as string | null);
    if (city.culture) city.culture = migrateFaction(city.culture) ?? undefined;
    if (!city.mapId) city.mapId = state.currentMapId;
    if (typeof city.income.people !== "number") {
      city.income.people = city.isCapital ? 4 : 3;
    }
    if (!Array.isArray(city.garrison)) city.garrison = [];
    if (!Array.isArray(city.buildings)) city.buildings = [];
  }
  for (const army of state.armies) {
    army.faction = migrateFaction(army.faction) ?? "neutral";
    if (!army.mapId) army.mapId = state.currentMapId;
    ensureHeroClass(army.hero);
    ensureEquipment(army.hero);
    ensureHeroInArmy(army);
  }
  ensureNightHero(state);
  for (const site of state.sites) {
    if (!site.mapId) site.mapId = state.currentMapId;
    if (site.owner) site.owner = migrateFaction(site.owner);
  }

  session.state = state;
}
