/**
 * Core game types. No catalogs, no session — only shapes.
 *
 * Id unions and balance tables live in catalog/; session in data.ts;
 * army helpers in army.ts.
 */
import type { ArtifactId } from "./catalog/artifacts";
import type { BuildingId } from "./catalog/buildings";
import type { HeroClassId } from "./catalog/heroClasses";
import type { Inventory } from "./catalog/potions";
import type { FactionId } from "./catalog/factions";
import type { MapSite } from "./sites";

export type { FactionId, BuildingId, ArtifactId, HeroClassId, Inventory };

export interface UnitInstance {
  instanceId: string;
  defId: string;
  hp: number;
  /**
   * Formation / battle position: 0–2 front row, 3–5 back row.
   * Player-set; enemies auto-fill from preferredRow.
   */
  slot?: number;
  /** +3 урона после 2 побед */
  veteran?: boolean;
  /** Commander — fights in battle; does not use a recruit slot */
  isHero?: boolean;
  /** Battle statuses (DoT / curses); cleared when battle ends if desired. */
  statuses?: import("./status").StatusInstance[];
}

export interface Hero {
  name: string;
  level: number;
  xp: number;
  xpToNext: number;
  /** officer / priest / scout — defaults on load */
  classId?: HeroClassId;
  /** Equipped artifacts by slot */
  equipment?: Partial<Record<"weapon" | "armor" | "banner" | "relic", ArtifactId>>;
}

export interface Army {
  id: string;
  faction: FactionId;
  name: string;
  x: number;
  y: number;
  /** Which scenario map this army is on */
  mapId: string;
  units: UnitInstance[];
  isPlayer: boolean;
  movesLeft: number;
  hero: Hero;
  isNeutral?: boolean;
  /** Missionary — hires from city, can raise graves */
  isMissionary?: boolean;
}

/** Fallen party on the map — resurrected by a missionary */
export interface Grave {
  id: string;
  mapId: string;
  x: number;
  y: number;
  name: string;
  faction: FactionId;
  hero: Hero;
  units: UnitInstance[];
  isPlayer: boolean;
}

export interface City {
  id: string;
  name: string;
  x: number;
  y: number;
  mapId: string;
  faction: FactionId | null;
  /**
   * Native recruit/upgrade tree. Set on capture so a RI-held stanitsa
   * still hires cossacks. Defaults to current faction when unset.
   */
  culture?: FactionId;
  isCapital: boolean;
  income: { gold: number; mana: number; people: number };
  buildings: BuildingId[];
  /** Units left in the city (Disciples-style garrison) */
  garrison: UnitInstance[];
}

export interface GameState {
  turn: number;
  gold: number;
  mana: number;
  people: number;
  coal: number;
  steel: number;
  selectedArmyId: string | null;
  armies: Army[];
  cities: City[];
  sites: MapSite[];
  graves: Grave[];
  /** Shared party potion bag */
  inventory: Inventory;
  /** Unequipped artifacts */
  artifacts?: ArtifactId[];
  /** Fog per map id */
  discoveredByMap: Record<string, boolean[][]>;
  gameOver: null | "victory" | "defeat";
  lastMessage: string;
  heroHallUsed: boolean;
  campaignId: string | null;
  scenarioId: string;
  currentMapId: string;
  /** Plot sequences already played this run (once: true). */
  firedPlotIds?: string[];
}
