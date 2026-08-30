/**
 * Rail overlay + supply. Cities are railheads; track is built toward mines.
 * A live line feeds full harvest and combat mods (damage / armor / initiative).
 */
import { RAIL_GOLD_PER_TILE, RAIL_SUPPLY_REACH, SITE_INCOME_OFF_RAIL } from "./catalog";
import { livingUnits, type Army, type FactionId, type GameState, type RailTile } from "./data";
import { armyPresentNow, dayActionsClosed } from "./dayNight";
import { isHarvestSite, SITE_LABEL, type MapSite } from "./sites";
import { isBlockedTerrain, type Terrain } from "./world";

const ORTHO: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export interface GridCell {
  x: number;
  y: number;
}

export interface SupplyStatus {
  inSupply: boolean;
  connectedMines: number;
  damage: number;
  armor: number;
  initiative: number;
}

export interface CombatMods {
  damage: number;
  armor: number;
}

export interface RailPlan {
  tiles: GridCell[];
  gold: number;
  dest: GridCell;
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

export function ensureRails(state: GameState): RailTile[] {
  if (!Array.isArray(state.rails)) state.rails = [];
  return state.rails;
}

export function railAt(
  state: GameState,
  x: number,
  y: number,
  mapId: string = state.currentMapId,
): RailTile | undefined {
  return ensureRails(state).find((r) => r.mapId === mapId && r.x === x && r.y === y);
}

export function hasRailAt(
  state: GameState,
  x: number,
  y: number,
  mapId: string = state.currentMapId,
): boolean {
  return !!railAt(state, x, y, mapId);
}

export function isRailhead(
  state: GameState,
  x: number,
  y: number,
  faction: FactionId,
  mapId: string = state.currentMapId,
): boolean {
  return state.cities.some(
    (c) => c.mapId === mapId && c.x === x && c.y === y && c.faction === faction,
  );
}

export function isNetworkCell(
  state: GameState,
  x: number,
  y: number,
  faction: FactionId,
  mapId: string = state.currentMapId,
): boolean {
  if (isRailhead(state, x, y, faction, mapId)) return true;
  const rail = railAt(state, x, y, mapId);
  return !!rail && rail.owner === faction;
}

function enemyOccupies(
  state: GameState,
  x: number,
  y: number,
  faction: FactionId,
  mapId: string,
): boolean {
  return state.armies.some(
    (a) =>
      a.mapId === mapId &&
      a.x === x &&
      a.y === y &&
      a.faction !== faction &&
      livingUnits(a).length > 0 &&
      armyPresentNow(state, a),
  );
}

function enemyCityAt(
  state: GameState,
  x: number,
  y: number,
  faction: FactionId,
  mapId: string,
): boolean {
  return state.cities.some(
    (c) => c.mapId === mapId && c.x === x && c.y === y && c.faction && c.faction !== faction,
  );
}

/** Cities plus own rails that still trace to a city (enemy on the tile cuts it). */
export function connectedNetwork(
  state: GameState,
  faction: FactionId,
  mapId: string = state.currentMapId,
): Set<string> {
  const seen = new Set<string>();
  const queue: GridCell[] = [];
  for (const city of state.cities) {
    if (city.mapId !== mapId || city.faction !== faction) continue;
    const k = cellKey(city.x, city.y);
    if (seen.has(k)) continue;
    seen.add(k);
    queue.push({ x: city.x, y: city.y });
  }
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const [dx, dy] of ORTHO) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const k = cellKey(nx, ny);
      if (seen.has(k)) continue;
      const rail = railAt(state, nx, ny, mapId);
      if (!rail || rail.owner !== faction) continue;
      if (enemyOccupies(state, nx, ny, faction, mapId)) continue;
      seen.add(k);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

function touchesNetwork(x: number, y: number, net: Set<string>): boolean {
  if (net.has(cellKey(x, y))) return true;
  for (const [dx, dy] of ORTHO) {
    if (net.has(cellKey(x + dx, y + dy))) return true;
  }
  return false;
}

export function harvestSiteOnNetwork(
  state: GameState,
  site: MapSite,
  faction: FactionId,
): boolean {
  if (site.owner !== faction) return false;
  return touchesNetwork(site.x, site.y, connectedNetwork(state, faction, site.mapId));
}

export function harvestIncomeFactor(state: GameState, site: MapSite): number {
  if (!site.owner || !isHarvestSite(site.kind)) return 1;
  return harvestSiteOnNetwork(state, site, site.owner) ? 1 : SITE_INCOME_OFF_RAIL;
}

export function countConnectedHarvest(
  state: GameState,
  faction: FactionId,
  mapId: string = state.currentMapId,
): number {
  const net = connectedNetwork(state, faction, mapId);
  let n = 0;
  for (const site of state.sites) {
    if (site.mapId !== mapId || site.owner !== faction || !isHarvestSite(site.kind)) continue;
    if (touchesNetwork(site.x, site.y, net)) n += 1;
  }
  return n;
}

function supplyMods(inSupply: boolean, mines: number): Pick<SupplyStatus, "damage" | "armor" | "initiative"> {
  if (!inSupply) return { damage: -1, armor: 0, initiative: 0 };
  if (mines <= 0) return { damage: 0, armor: 0, initiative: 0 };
  if (mines === 1) return { damage: 2, armor: 1, initiative: 2 };
  if (mines === 2) return { damage: 3, armor: 2, initiative: 4 };
  return { damage: 4, armor: 3, initiative: 6 };
}

export function armySupply(state: GameState, army: Army): SupplyStatus {
  const mapId = army.mapId;
  const net = connectedNetwork(state, army.faction, mapId);
  const mines = countConnectedHarvest(state, army.faction, mapId);
  let inSupply = false;
  if (net.size === 0) {
    inSupply = isRailhead(state, army.x, army.y, army.faction, mapId);
  } else {
    for (const key of net) {
      const comma = key.indexOf(",");
      const x = Number(key.slice(0, comma));
      const y = Number(key.slice(comma + 1));
      if (Math.abs(army.x - x) + Math.abs(army.y - y) <= RAIL_SUPPLY_REACH) {
        inSupply = true;
        break;
      }
    }
  }
  return { inSupply, connectedMines: mines, ...supplyMods(inSupply, mines) };
}

export function supplyCombatMods(supply: SupplyStatus): CombatMods {
  return { damage: supply.damage, armor: supply.armor };
}

export function formatSupplyStatus(supply: SupplyStatus): string {
  if (!supply.inSupply) {
    return supply.damage ? `Снабжение: отрезаны (${supply.damage} урон)` : "Снабжение: отрезаны";
  }
  if (supply.connectedMines <= 0) return "Снабжение: у города";
  const bits: string[] = [];
  if (supply.damage) bits.push(`+${supply.damage} урон`);
  if (supply.armor) bits.push(`+${supply.armor} броня`);
  if (supply.initiative) bits.push(`+${supply.initiative} иниц.`);
  return `Снабжение: эшелон ×${supply.connectedMines}${bits.length ? ` (${bits.join(", ")})` : ""}`;
}

function mapSize(map: Terrain[][]): { cols: number; rows: number } {
  return { rows: map.length, cols: map[0]?.length ?? 0 };
}

function inBounds(map: Terrain[][], x: number, y: number): boolean {
  const { cols, rows } = mapSize(map);
  return x >= 0 && y >= 0 && x < cols && y < rows;
}

export function canLayRailTerrain(map: Terrain[][], x: number, y: number): boolean {
  if (!inBounds(map, x, y)) return false;
  return !isBlockedTerrain(map[y][x]);
}

function canTraverseForBuild(
  state: GameState,
  map: Terrain[][],
  x: number,
  y: number,
  faction: FactionId,
  mapId: string,
): boolean {
  if (!canLayRailTerrain(map, x, y) && !isRailhead(state, x, y, faction, mapId)) return false;
  if (enemyCityAt(state, x, y, faction, mapId)) return false;
  if (enemyOccupies(state, x, y, faction, mapId)) return false;
  const rail = railAt(state, x, y, mapId);
  if (rail && rail.owner !== faction) return false;
  return true;
}

export function planRailBranch(
  state: GameState,
  map: Terrain[][],
  faction: FactionId,
  destX: number,
  destY: number,
  mapId: string = state.currentMapId,
): { ok: true; plan: RailPlan } | { ok: false; reason: string } {
  if (!inBounds(map, destX, destY)) return { ok: false, reason: "За краем карты" };
  if (isRailhead(state, destX, destY, faction, mapId)) {
    return { ok: false, reason: "Здесь уже вокзал" };
  }
  if (hasRailAt(state, destX, destY, mapId)) {
    const existing = railAt(state, destX, destY, mapId);
    if (existing?.owner === faction) return { ok: false, reason: "Рельс уже лежит" };
    return { ok: false, reason: "Чужая колея" };
  }
  if (!canLayRailTerrain(map, destX, destY)) return { ok: false, reason: "Сюда колею не кладут" };
  if (enemyCityAt(state, destX, destY, faction, mapId)) return { ok: false, reason: "Чужой город" };
  if (enemyOccupies(state, destX, destY, faction, mapId)) return { ok: false, reason: "Клетка занята" };

  const seeds: GridCell[] = [];
  const seen = new Set<string>();
  for (const city of state.cities) {
    if (city.mapId !== mapId || city.faction !== faction) continue;
    const k = cellKey(city.x, city.y);
    if (seen.has(k)) continue;
    seen.add(k);
    seeds.push({ x: city.x, y: city.y });
  }
  if (seeds.length === 0) return { ok: false, reason: "Нужен свой город — от него ведут ветку" };

  const parent = new Map<string, string>();
  const queue = [...seeds];
  let reached = false;
  const destKey = cellKey(destX, destY);

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const [dx, dy] of ORTHO) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const k = cellKey(nx, ny);
      if (seen.has(k)) continue;
      if (!canTraverseForBuild(state, map, nx, ny, faction, mapId)) continue;
      seen.add(k);
      parent.set(k, cellKey(cur.x, cur.y));
      if (k === destKey) {
        reached = true;
        queue.length = 0;
        break;
      }
      queue.push({ x: nx, y: ny });
    }
  }

  if (!reached) return { ok: false, reason: "Нет пути для колеи" };

  const path: GridCell[] = [];
  let cur = destKey;
  const seedKeys = new Set(seeds.map((s) => cellKey(s.x, s.y)));
  while (!seedKeys.has(cur)) {
    const comma = cur.indexOf(",");
    path.push({ x: Number(cur.slice(0, comma)), y: Number(cur.slice(comma + 1)) });
    const prev = parent.get(cur);
    if (!prev) return { ok: false, reason: "Нет пути для колеи" };
    cur = prev;
  }
  path.reverse();

  const tiles = path.filter((p) => !isNetworkCell(state, p.x, p.y, faction, mapId));
  if (tiles.length === 0) return { ok: false, reason: "Уже на линии" };

  return {
    ok: true,
    plan: {
      tiles,
      gold: tiles.length * RAIL_GOLD_PER_TILE,
      dest: { x: destX, y: destY },
    },
  };
}

function newlyConnectedHarvest(
  state: GameState,
  faction: FactionId,
  mapId: string,
  before: number,
): string {
  const after = countConnectedHarvest(state, faction, mapId);
  if (after <= before) return "";
  const net = connectedNetwork(state, faction, mapId);
  const names: string[] = [];
  for (const site of state.sites) {
    if (site.mapId !== mapId || site.owner !== faction || !isHarvestSite(site.kind)) continue;
    if (touchesNetwork(site.x, site.y, net)) names.push(SITE_LABEL[site.kind]);
  }
  if (!names.length) return "";
  return ` · на линии: ${names.join(", ")}`;
}

export function issueRailDecree(
  state: GameState,
  map: Terrain[][],
  faction: FactionId,
  destX: number,
  destY: number,
  mapId: string = state.currentMapId,
): { ok: true; message: string } | { ok: false; reason: string } {
  if (dayActionsClosed(state)) return { ok: false, reason: "Строить ветку — днём" };
  const planned = planRailBranch(state, map, faction, destX, destY, mapId);
  if (!planned.ok) return planned;
  if (state.gold < planned.plan.gold) {
    return { ok: false, reason: `Мало золота (нужно ${planned.plan.gold})` };
  }
  const before = countConnectedHarvest(state, faction, mapId);
  state.gold -= planned.plan.gold;
  const rails = ensureRails(state);
  for (const tile of planned.plan.tiles) {
    if (railAt(state, tile.x, tile.y, mapId)) continue;
    rails.push({ mapId, x: tile.x, y: tile.y, owner: faction });
  }
  const linked = newlyConnectedHarvest(state, faction, mapId, before);
  const n = planned.plan.tiles.length;
  return {
    ok: true,
    message: `Указ: ${n} кл. колеи (−${planned.plan.gold} зол.)${linked}`,
  };
}

export function formatRailPlan(state: GameState, plan: RailPlan): string {
  const site = state.sites.find(
    (s) => s.mapId === state.currentMapId && s.x === plan.dest.x && s.y === plan.dest.y,
  );
  const dest = site ? SITE_LABEL[site.kind] : `${plan.dest.x},${plan.dest.y}`;
  return `Ветка к ${dest}: ${plan.tiles.length} кл., ${plan.gold} зол. Ещё раз клик — указ`;
}
