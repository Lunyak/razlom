/**
 * Foe march on one face of the day. The world scene plays the path.
 * Player night ends into: enemy day, enemy night, then dawn.
 */
import { armyMaxMoves, livingUnits } from "./army";
import { armyPresentOnPhase, sameVeilLayer } from "./dayNight";
import type { Army, DayPhase, GameState } from "./types";
import {
  computeReachable,
  findPath,
  type GridPos,
  type StepCostFn,
  type Terrain,
} from "./world";

/** Fogged stacks farther than this stay in camp. Seen stacks always march. */
export const ENEMY_AGGRO = 6;

export function enemyMarchBudget(army: Army): number {
  return Math.max(0, armyMaxMoves(army));
}

export function hostileMarchers(state: GameState, phase: DayPhase): Army[] {
  return state.armies.filter(
    (a) =>
      !a.isPlayer &&
      !a.isNeutral &&
      a.mapId === state.currentMapId &&
      livingUnits(a).length > 0 &&
      armyPresentOnPhase(a, phase),
  );
}

/** Nearest living player stack on this face. Missionaries are not quarry. */
export function pickMarchTarget(
  state: GameState,
  enemy: Army,
  phase: DayPhase,
): Army | undefined {
  let best: Army | undefined;
  let bestD = Infinity;
  for (const army of state.armies) {
    if (!army.isPlayer || army.isNeutral || army.isMissionary) continue;
    if (army.mapId !== enemy.mapId) continue;
    if (livingUnits(army).length === 0) continue;
    if (!armyPresentOnPhase(army, phase)) continue;
    if (!sameVeilLayer(enemy, army)) continue;
    const d = Math.abs(army.x - enemy.x) + Math.abs(army.y - enemy.y);
    if (d < bestD) {
      best = army;
      bestD = d;
    }
  }
  return best;
}

export function inEnemyAggro(enemy: Army, target: Army, visible?: boolean[][]): boolean {
  if (visible?.[enemy.y]?.[enemy.x]) return true;
  return Math.abs(enemy.x - target.x) + Math.abs(enemy.y - target.y) <= ENEMY_AGGRO;
}

/**
 * Path that spends this turn's AP and gets closer to `target`.
 * Includes the start cell. The target cell itself is allowed (assault).
 */
export function planEnemyMarch(
  map: Terrain[][],
  enemy: Army,
  target: GridPos,
  cols: number,
  rows: number,
  occupied: (x: number, y: number) => boolean,
  stepCost: StepCostFn,
): GridPos[] | null {
  const budget = enemyMarchBudget(enemy);
  if (budget <= 0) return null;
  const startDist = Math.abs(enemy.x - target.x) + Math.abs(enemy.y - target.y);
  if (startDist === 0) return null;

  const reach = computeReachable(
    map,
    enemy.x,
    enemy.y,
    budget,
    cols,
    rows,
    occupied,
    stepCost,
  );

  let best: GridPos | null = null;
  let bestD = startDist;
  let bestCost = Infinity;
  for (const [key, cell] of reach) {
    const comma = key.indexOf(",");
    const x = Number(key.slice(0, comma));
    const y = Number(key.slice(comma + 1));
    const d = Math.abs(x - target.x) + Math.abs(y - target.y);
    if (d >= startDist) continue;
    if (d < bestD || (d === bestD && cell.cost < bestCost)) {
      bestD = d;
      bestCost = cell.cost;
      best = { x, y };
    }
  }
  if (!best) return null;

  const path = findPath(
    map,
    enemy.x,
    enemy.y,
    best.x,
    best.y,
    budget,
    cols,
    rows,
    occupied,
    stepCost,
  );
  if (!path || path.length < 2) return null;
  return path;
}
