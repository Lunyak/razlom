import { session, type GameState } from "./data";

export type Terrain =
  | "grass"
  | "forest"
  | "road"
  | "water"
  | "mountain"
  | "mountain_foot"
  | "ditch"
  | "trench";

export function terrainMoveCost(terrain: Terrain): number {
  if (terrain === "forest" || terrain === "ditch" || terrain === "trench") return 2;
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

export type StepCostFn = (x: number, y: number, terrain: Terrain) => number;

function searchReachable(
  map: Terrain[][],
  startX: number,
  startY: number,
  moves: number,
  cols: number,
  rows: number,
  blocked: (x: number, y: number) => boolean,
  stepCost?: StepCostFn,
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

      const step = stepCost ? stepCost(nx, ny, map[ny][nx]) : terrainMoveCost(map[ny][nx]);
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

export interface FoundPath {
  path: GridPos[];
  /** Cumulative move cost to each cell (path[0] is 0). */
  costs: number[];
}

function rebuildPath(
  parent: Map<string, string>,
  best: Map<string, number>,
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
): FoundPath | null {
  const goalKey = `${goalX},${goalY}`;
  if (!best.has(goalKey)) return null;
  if (startX === goalX && startY === goalY) {
    return { path: [{ x: startX, y: startY }], costs: [0] };
  }

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
  return { path, costs: path.map((p) => best.get(`${p.x},${p.y}`) ?? 0) };
}

/** How many player turns until `cost` is paid, given leftover AP this turn. */
export function turnsToReach(cost: number, movesLeft: number, maxMoves: number): number {
  if (cost <= 0) return 0;
  const cap = Math.max(1, maxMoves);
  let left = cost;
  let budget = Math.max(0, movesLeft);
  let turns = 0;
  if (budget <= 0) {
    turns = 1;
    budget = cap;
  }
  while (left > 0) {
    turns += 1;
    if (left <= budget) return turns;
    left -= budget;
    budget = cap;
    if (turns > 99) return 99;
  }
  return turns;
}

export function hodWord(n: number): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n100 >= 11 && n100 <= 14) return "ходов";
  if (n10 === 1) return "ход";
  if (n10 >= 2 && n10 <= 4) return "хода";
  return "ходов";
}

/** Prefix of `path` that still fits in this turn's leftover AP. */
export function slicePathThisTurn(path: GridPos[], costs: number[], movesLeft: number): GridPos[] | null {
  let last = 0;
  for (let i = 1; i < path.length; i++) {
    if ((costs[i] ?? Infinity) <= movesLeft) last = i;
    else break;
  }
  if (last === 0) return null;
  return path.slice(0, last + 1);
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
  stepCost?: StepCostFn,
): Map<string, ReachableCell> {
  const { best } = searchReachable(map, startX, startY, moves, cols, rows, blocked, stepCost);
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
  stepCost?: StepCostFn,
): GridPos[] | null {
  return findPathAny(map, startX, startY, goalX, goalY, cols, rows, blocked, moves, stepCost)?.path ?? null;
}

/** Cheapest path with no (or custom) AP cap. */
export function findPathAny(
  map: Terrain[][],
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
  cols: number,
  rows: number,
  blocked: (x: number, y: number) => boolean,
  moves = Number.POSITIVE_INFINITY,
  stepCost?: StepCostFn,
): FoundPath | null {
  if (startX === goalX && startY === goalY) {
    return { path: [{ x: startX, y: startY }], costs: [0] };
  }
  const { best, parent } = searchReachable(map, startX, startY, moves, cols, rows, blocked, stepCost);
  return rebuildPath(parent, best, startX, startY, goalX, goalY);
}

export function getPlayerArmyPositions(state: GameState = session.state): { x: number; y: number }[] {
  return state.armies
    .filter((a) => a.isPlayer && a.mapId === state.currentMapId)
    .map((a) => ({ x: a.x, y: a.y }));
}
