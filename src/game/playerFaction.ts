import type { City, FactionId, GameState } from "./data";
import { getScenario } from "./scenario";

export function playerFactionOf(state: GameState): FactionId {
  return getScenario(state.scenarioId)?.playerFaction ?? "ri";
}

export function isPlayerCity(state: GameState, city: City): boolean {
  return city.faction === playerFactionOf(state);
}
