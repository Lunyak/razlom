/**
 * Session barrel — mutable game state for the current run.
 *
 *   types.ts     Army, City, GameState (runtime shapes)
 *   army.ts      createUnit, formation, livingUnits, armyMaxMoves
 *   catalog/     UNIT_DEFS and other balance tables
 *   this file    session singleton + map/city state helpers
 */
export * from "./types";
export * from "./army";

import type { City, FactionId, GameState } from "./types";

/** Culture used for recruit / upgrade / build trees. */
export function cityCulture(city: City): FactionId {
  if (city.culture) return city.culture;
  return city.faction ?? "ri";
}

/** Fog for the active map */
export function currentDiscovered(state: GameState): boolean[][] {
  return state.discoveredByMap[state.currentMapId] ?? [];
}

/** Shared mutable session — world ↔ battle. Filled by bootstrapSession(). */
export const session: { state: GameState } = {
  state: null as unknown as GameState,
};
