import type { Terrain } from "../world";
import type { MapDecorCell, TerrainGroundKey } from "../terrainArt";
import { createBlankMap } from "./mapgen";
import { clonePlot, sanitizePlot, type PlotSequence } from "./plot";
import type {
  ArmySpawn,
  CitySpawn,
  MapDef,
  PortalDef,
  ScenarioDef,
  WinCondition,
} from "./types";
import type { MapSite } from "../sites";
import type { FactionId } from "../data";

export const SCENARIO_FORMAT_VERSION = 1;

/** JSON-safe map (terrain grid, no functions). */
export interface SerializedMapDef {
  id: string;
  name: string;
  cols: number;
  rows: number;
  terrain: Terrain[][];
  groundArt?: (TerrainGroundKey | null)[][];
  decorArt?: MapDecorCell[][];
  cities: CitySpawn[];
  sites?: Omit<MapSite, "mapId">[];
  armies?: ArmySpawn[];
  portals?: PortalDef[];
  win?: WinCondition;
  entry?: { x: number; y: number };
  brief?: string;
}

export interface SerializedScenarioDef {
  formatVersion: number;
  id: string;
  name: string;
  description: string;
  eraId: string;
  maps: SerializedMapDef[];
  startMapId: string;
  startingResources: { gold: number; mana: number; people: number; coal?: number; steel?: number };
  playerFaction: FactionId;
  win: WinCondition;
  brief?: string;
  plot?: PlotSequence[];
}

export function cloneTerrain(terrain: Terrain[][]): Terrain[][] {
  return terrain.map((row) => [...row]);
}

function cloneGrid<T>(grid: T[][] | undefined): T[][] | undefined {
  if (!grid) return undefined;
  return grid.map((row) => [...row]);
}

function resizeGrid<T>(grid: T[][] | undefined, cols: number, rows: number, fill: T): T[][] | undefined {
  if (!grid) return undefined;
  const next = Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill));
  for (let y = 0; y < Math.min(rows, grid.length); y++) {
    for (let x = 0; x < Math.min(cols, grid[y]?.length ?? 0); x++) {
      next[y][x] = grid[y][x];
    }
  }
  return next;
}

function serializeArtGrid<T>(grid: T[][] | undefined): T[][] | undefined {
  if (!grid?.some((row) => row.some((cell) => cell != null))) return undefined;
  return cloneGrid(grid);
}

function createArtGrid<T>(cols: number, rows: number, fill: T): T[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill));
}

/** Allocate paint layers so the editor can stamp a cell without replacing the default look. */
export function ensureMapPaintLayers(map: MapDef): void {
  if (!map.groundArt || map.groundArt.length !== map.rows) {
    map.groundArt = createArtGrid(map.cols, map.rows, null);
  }
  if (!map.decorArt || map.decorArt.length !== map.rows) {
    map.decorArt = createArtGrid(map.cols, map.rows, null);
  }
}

export function resolveMapTerrain(map: MapDef): Terrain[][] {
  if (map.terrain && map.terrain.length === map.rows) {
    return cloneTerrain(map.terrain);
  }
  if (map.buildTerrain) {
    return map.buildTerrain();
  }
  return createBlankMap(map.cols, map.rows, "grass");
}

/** Ensure map has a concrete terrain grid (for editor / JSON). */
export function materializeMap(map: MapDef): MapDef {
  const terrain = resolveMapTerrain(map);
  return {
    ...map,
    cols: map.cols,
    rows: map.rows,
    terrain,
    groundArt: cloneGrid(map.groundArt),
    decorArt: cloneGrid(map.decorArt),
    cities: map.cities.map((c) => ({ ...c, income: { ...c.income }, buildings: c.buildings ? [...c.buildings] : undefined })),
    sites: map.sites?.map((s) => ({ ...s })),
    armies: map.armies?.map((a) => ({
      ...a,
      hero: { ...a.hero },
      unitDefIds: [...a.unitDefIds],
    })),
    portals: map.portals?.map((p) => ({ ...p })),
    win: map.win ? { ...map.win } : undefined,
    entry: map.entry ? { ...map.entry } : undefined,
    brief: map.brief,
    buildTerrain: () => cloneTerrain(terrain),
  };
}

export function materializeScenario(scenario: ScenarioDef): ScenarioDef {
  return {
    ...scenario,
    startingResources: { ...scenario.startingResources },
    win: { ...scenario.win },
    maps: scenario.maps.map(materializeMap),
    plot: clonePlot(scenario.plot),
  };
}

export function serializeMap(map: MapDef): SerializedMapDef {
  const terrain = resolveMapTerrain(map);
  return {
    id: map.id,
    name: map.name,
    cols: map.cols,
    rows: map.rows,
    terrain,
    groundArt: serializeArtGrid(map.groundArt),
    decorArt: serializeArtGrid(map.decorArt),
    cities: map.cities,
    sites: map.sites,
    armies: map.armies,
    portals: map.portals,
    win: map.win,
    entry: map.entry,
    brief: map.brief,
  };
}

export function serializeScenario(scenario: ScenarioDef): SerializedScenarioDef {
  return {
    formatVersion: SCENARIO_FORMAT_VERSION,
    id: scenario.id,
    name: scenario.name,
    description: scenario.description,
    eraId: scenario.eraId,
    maps: scenario.maps.map(serializeMap),
    startMapId: scenario.startMapId,
    startingResources: { ...scenario.startingResources },
    playerFaction: scenario.playerFaction,
    win: { ...scenario.win },
    brief: scenario.brief,
    plot: clonePlot(scenario.plot),
  };
}

export function deserializeMap(raw: SerializedMapDef): MapDef {
  const terrain = cloneTerrain(raw.terrain);
  return {
    id: raw.id,
    name: raw.name,
    cols: raw.cols,
    rows: raw.rows,
    terrain,
    groundArt: cloneGrid(raw.groundArt),
    decorArt: cloneGrid(raw.decorArt),
    cities: raw.cities ?? [],
    sites: raw.sites,
    armies: raw.armies,
    portals: raw.portals,
    win: raw.win,
    entry: raw.entry,
    brief: raw.brief,
    buildTerrain: () => cloneTerrain(terrain),
  };
}

export function deserializeScenario(raw: SerializedScenarioDef): ScenarioDef {
  if (!raw?.id || !Array.isArray(raw.maps) || raw.maps.length === 0) {
    throw new Error("Некорректный сценарий: нет id или карт");
  }
  return {
    id: raw.id,
    name: raw.name || raw.id,
    description: raw.description || "",
    eraId: raw.eraId || "custom",
    maps: raw.maps.map(deserializeMap),
    startMapId: raw.startMapId || raw.maps[0].id,
    startingResources: {
      gold: raw.startingResources?.gold ?? 100,
      mana: raw.startingResources?.mana ?? 20,
      people: raw.startingResources?.people ?? 20,
      coal: raw.startingResources?.coal ?? 0,
      steel: raw.startingResources?.steel ?? 0,
    },
    playerFaction: raw.playerFaction ?? "ri",
    win: raw.win ?? { type: "capture_capital", faction: "ordo" },
    brief: raw.brief,
    plot: sanitizePlot(raw.plot),
  };
}

export function scenarioToJson(scenario: ScenarioDef, pretty = true): string {
  return JSON.stringify(serializeScenario(scenario), null, pretty ? 2 : undefined);
}

export function scenarioFromJson(json: string): ScenarioDef {
  const raw = JSON.parse(json) as SerializedScenarioDef;
  return deserializeScenario(raw);
}

export function createEmptyMap(id: string, name: string, cols = 16, rows = 12): MapDef {
  const terrain = createBlankMap(cols, rows, "grass");
  return {
    id,
    name,
    cols,
    rows,
    terrain,
    cities: [],
    sites: [],
    armies: [],
    portals: [],
    buildTerrain: () => cloneTerrain(terrain),
  };
}

export function createEmptyScenario(id = `custom-${Date.now()}`): ScenarioDef {
  const map = createEmptyMap("map1", "Карта 1", 20, 14);
  return {
    id,
    name: "Новый сценарий",
    description: "Сценарий из редактора",
    eraId: "custom",
    maps: [map],
    startMapId: map.id,
    startingResources: { gold: 100, mana: 20, people: 20, coal: 0, steel: 0 },
    playerFaction: "ri",
    win: { type: "capture_capital", faction: "ordo" },
    brief: "Новый сценарий.",
    plot: [],
  };
}

export function resizeMapTerrain(
  map: MapDef,
  cols: number,
  rows: number,
  fill: Terrain = "grass",
): MapDef {
  const old = resolveMapTerrain(map);
  const next = createBlankMap(cols, rows, fill);
  for (let y = 0; y < Math.min(rows, old.length); y++) {
    for (let x = 0; x < Math.min(cols, old[y]?.length ?? 0); x++) {
      next[y][x] = old[y][x];
    }
  }
  const clip = <T extends { x: number; y: number }>(items: T[] | undefined) =>
    (items ?? []).filter((i) => i.x >= 0 && i.y >= 0 && i.x < cols && i.y < rows);

  const terrain = next;
  return {
    ...map,
    cols,
    rows,
    terrain,
    groundArt: resizeGrid(map.groundArt, cols, rows, null),
    decorArt: resizeGrid(map.decorArt, cols, rows, null),
    cities: clip(map.cities),
    sites: clip(map.sites),
    armies: clip(map.armies),
    portals: clip(map.portals),
    buildTerrain: () => cloneTerrain(terrain),
  };
}

export function downloadScenarioJson(scenario: ScenarioDef, filename?: string): void {
  const blob = new Blob([scenarioToJson(scenario)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename ?? `${scenario.id}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function pickScenarioJsonFile(): Promise<ScenarioDef> {
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        reject(new Error("Файл не выбран"));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        try {
          resolve(scenarioFromJson(String(reader.result)));
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(reader.error ?? new Error("Ошибка чтения"));
      reader.readAsText(file);
    };
    input.click();
  });
}
