import type { FactionId, Hero } from "../data";
import type { MapSite } from "../sites";
import type { Terrain } from "../world";
import type { BuildingId } from "../catalog";
import type { PlotSequence } from "./plot";

/**
 * @deprecated Free travel between maps removed.
 * Maps are a sequential mission chain (finish → next).
 */
export interface PortalDef {
  id: string;
  x: number;
  y: number;
  targetMapId: string;
  targetX: number;
  targetY: number;
  label?: string;
}

export interface CitySpawn {
  id: string;
  name: string;
  x: number;
  y: number;
  faction: FactionId | null;
  isCapital: boolean;
  income: { gold: number; mana: number; people: number };
  buildings?: BuildingId[];
}

export interface ArmySpawn {
  id: string;
  faction: FactionId;
  name: string;
  x: number;
  y: number;
  isPlayer: boolean;
  isNeutral?: boolean;
  movesLeft: number;
  hero: Hero;
  /** Unit def ids */
  unitDefIds: string[];
}

export type WinCondition =
  | { type: "capture_capital"; faction: FactionId }
  | { type: "capture_city"; cityId: string }
  | { type: "survive_turns"; turns: number }
  /** No living enemy or neutral armies on this map */
  | { type: "eliminate_enemies" };

export interface MapDef {
  id: string;
  name: string;
  cols: number;
  rows: number;
  /** Concrete terrain (editor / JSON). Prefer this when present. */
  terrain?: Terrain[][];
  /** Lazy builder for hand-authored TS scenarios */
  buildTerrain?: () => Terrain[][];
  cities: CitySpawn[];
  sites?: Omit<MapSite, "mapId">[];
  armies?: ArmySpawn[];
  /** @deprecated Ignored in play — mission chain replaces portals */
  portals?: PortalDef[];
  /** Objective for this mission. Falls back to scenario.win */
  win?: WinCondition;
  /** Where carried player armies appear when this map starts */
  entry?: { x: number; y: number };
  brief?: string;
}

export interface ScenarioDef {
  id: string;
  name: string;
  description: string;
  /** Lore era key, e.g. part1-1914 */
  eraId: string;
  /**
   * Ordered mission maps: finish map N → start map N+1.
   * `startMapId` should be maps[0].id.
   */
  maps: MapDef[];
  startMapId: string;
  startingResources: { gold: number; mana: number; people: number; coal?: number; steel?: number };
  playerFaction: FactionId;
  /** Default / last-map win if a map omits `win` */
  win: WinCondition;
  brief?: string;
  /** Story sequences: triggers + ordered frames/steps. */
  plot?: PlotSequence[];
}

export interface CampaignDef {
  id: string;
  name: string;
  description: string;
  /** Ordered scenario ids — Disciples-style saga */
  scenarioIds: string[];
}

export interface MapRuntime {
  def: MapDef;
  terrain: Terrain[][];
}

/** Persisted campaign progress (heroes carry between scenarios later). */
export interface CampaignProgress {
  campaignId: string;
  scenarioIndex: number;
  /** Surviving player heroes snapshot for next scenario */
  carriedHeroes?: { name: string; level: number; xp: number; xpToNext: number; unitDefIds: string[] }[];
}
