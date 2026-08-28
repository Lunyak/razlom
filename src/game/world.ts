import { session, type GameState } from "./data";

export type Terrain = "grass" | "forest" | "road" | "water" | "mountain" | "mountain_foot";

export function terrainMoveCost(terrain: Terrain): number {
  if (terrain === "forest") return 2;
  return 1;
}

export function isBlockedTerrain(terrain: Terrain): boolean {
  return terrain === "water" || terrain === "mountain" || terrain === "mountain_foot";
}

const VISION = 4;

export function resetVisibility(cols: number, rows: number): boolean[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));
}

export function updateFog(
  state: GameState,
  cols: number,
  rows: number,
  visible: boolean[][],
  playerPositions: { x: number; y: number }[],
): void {
  for (const { x: ax, y: ay } of playerPositions) {
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const d = Math.abs(x - ax) + Math.abs(y - ay);
        if (d <= VISION) {
          const fog = state.discoveredByMap[state.currentMapId];
          if (fog?.[y]) {
            fog[y][x] = true;
            visible[y][x] = true;
          }
        }
      }
    }
  }
}

export interface ReachableCell {
  cost: number;
}

export interface GridPos {
  x: number;
  y: number;
}

const ORTHO: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function searchReachable(
  map: Terrain[][],
  startX: number,
  startY: number,
  moves: number,
  cols: number,
  rows: number,
  blocked: (x: number, y: number) => boolean,
): { best: Map<string, number>; parent: Map<string, string> } {
  const startKey = `${startX},${startY}`;
  const queue: { x: number; y: number; cost: number }[] = [{ x: startX, y: startY, cost: 0 }];
  const best = new Map<string, number>([[startKey, 0]]);
  const parent = new Map<string, string>();

  while (queue.length > 0) {
    const { x, y, cost } = queue.shift()!;
    for (const [dx, dy] of ORTHO) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (isBlockedTerrain(map[ny][nx])) continue;
      if (blocked(nx, ny)) continue;

      const step = terrainMoveCost(map[ny][nx]);
      const nc = cost + step;
      if (nc > moves) continue;

      const key = `${nx},${ny}`;
      const prev = best.get(key);
      if (prev !== undefined && prev <= nc) continue;
      best.set(key, nc);
      parent.set(key, `${x},${y}`);
      queue.push({ x: nx, y: ny, cost: nc });
    }
  }

  return { best, parent };
}

/** Reachable cells with terrain movement costs (no path). */
export function computeReachable(
  map: Terrain[][],
  startX: number,
  startY: number,
  moves: number,
  cols: number,
  rows: number,
  blocked: (x: number, y: number) => boolean,
): Map<string, ReachableCell> {
  const { best } = searchReachable(map, startX, startY, moves, cols, rows, blocked);
  const result = new Map<string, ReachableCell>();
  for (const [key, cost] of best) {
    if (cost > 0) result.set(key, { cost });
  }
  return result;
}

/** Cheapest path from start to goal within `moves`, including the start cell. */
export function findPath(
  map: Terrain[][],
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
  moves: number,
  cols: number,
  rows: number,
  blocked: (x: number, y: number) => boolean,
): GridPos[] | null {
  if (startX === goalX && startY === goalY) return [{ x: startX, y: startY }];

  const { best, parent } = searchReachable(map, startX, startY, moves, cols, rows, blocked);
  const goalKey = `${goalX},${goalY}`;
  if (!best.has(goalKey)) return null;

  const path: GridPos[] = [];
  let cur = goalKey;
  const startKey = `${startX},${startY}`;
  while (cur !== startKey) {
    const comma = cur.indexOf(",");
    path.push({ x: Number(cur.slice(0, comma)), y: Number(cur.slice(comma + 1)) });
    const prev = parent.get(cur);
    if (!prev) return null;
    cur = prev;
  }
  path.push({ x: startX, y: startY });
  path.reverse();
  return path;
}

export function getPlayerArmyPositions(state: GameState = session.state): { x: number; y: number }[] {
  return state.armies
    .filter((a) => a.isPlayer && a.mapId === state.currentMapId)
    .map((a) => ({ x: a.x, y: a.y }));
}
