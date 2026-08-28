import { FACTION_LABEL } from "../catalog";
import { armyMaxMoves, livingUnits, type Army, type GameState } from "../data";
import { collectPendingPlot } from "./plot";
import { getCampaign, getMapDef, getScenario } from "./runtime";
import type { MapDef, ScenarioDef, WinCondition } from "./types";

export type MissionOutcome = "continue" | "next_map" | "victory" | "defeat";

export function mapWinCondition(scenario: ScenarioDef, map: MapDef): WinCondition {
  return map.win ?? scenario.win;
}

export function formatWinCondition(win: WinCondition): string {
  switch (win.type) {
    case "capture_capital":
      return `Взять столицу: ${FACTION_LABEL[win.faction]}`;
    case "capture_city":
      return `Захватить город (${win.cityId})`;
    case "survive_turns":
      return `Продержаться до хода ${win.turns}`;
    case "eliminate_enemies":
      return "Уничтожить все враждебные отряды";
    default:
      return "Выполнить цель миссии";
  }
}

/** Brief preferred; else readable win condition. */
export function missionObjectiveText(scenario: ScenarioDef, map: MapDef): string {
  if (map.brief?.trim()) return map.brief.trim();
  return formatWinCondition(mapWinCondition(scenario, map));
}

export function nextMapInScenario(scenario: ScenarioDef, currentMapId: string): MapDef | null {
  const i = scenario.maps.findIndex((m) => m.id === currentMapId);
  if (i < 0 || i >= scenario.maps.length - 1) return null;
  return scenario.maps[i + 1];
}

export function nextScenarioId(campaignId: string | null, scenarioId: string): string | null {
  if (!campaignId) return null;
  const campaign = getCampaign(campaignId);
  if (!campaign) return null;
  const i = campaign.scenarioIds.indexOf(scenarioId);
  if (i < 0 || i >= campaign.scenarioIds.length - 1) return null;
  return campaign.scenarioIds[i + 1];
}

export function isMapObjectiveComplete(state: GameState, scenario: ScenarioDef): boolean {
  const map = getMapDef(scenario, state.currentMapId);
  if (!map) return false;
  const win = mapWinCondition(scenario, map);
  const mapId = state.currentMapId;

  switch (win.type) {
    case "capture_capital":
      return !state.cities.some(
        (c) => c.mapId === mapId && c.isCapital && c.faction === win.faction,
      );
    case "capture_city": {
      const city = state.cities.find((c) => c.id === win.cityId);
      return !!city && city.faction === scenario.playerFaction;
    }
    case "survive_turns":
      return state.turn >= win.turns;
    case "eliminate_enemies":
      return !state.armies.some(
        (a) => a.mapId === mapId && !a.isPlayer && livingUnits(a).length > 0,
      );
    default:
      return false;
  }
}

export function checkDefeat(state: GameState): boolean {
  const playerHeroAlive = state.armies.some(
    (a) => a.isPlayer && !a.isNeutral && livingUnits(a).length > 0,
  );
  if (playerHeroAlive) return false;

  const hasRiCity = state.cities.some((c) => c.faction === "ri");
  const hasGrave = (state.graves?.length ?? 0) > 0;
  // Can still hire a missionary / raise a grave
  if (hasRiCity || hasGrave) return false;
  return true;
}

/** Place living player armies on the next map entry / capital / center. */
export function advanceToNextMap(state: GameState, next: MapDef): void {
  const entry =
    next.entry ??
    next.armies?.find((a) => a.isPlayer) ??
    next.cities.find((c) => c.faction === "ri") ??
    { x: Math.min(2, next.cols - 1), y: Math.min(2, next.rows - 1) };

  const players = state.armies.filter((a) => a.isPlayer && livingUnits(a).length > 0);
  let offset = 0;
  for (const army of players) {
    army.mapId = next.id;
    army.x = Math.min(next.cols - 1, Math.max(0, entry.x + offset));
    army.y = Math.min(next.rows - 1, Math.max(0, entry.y));
    army.movesLeft = armyMaxMoves(army);
    offset += 1;
  }

  state.currentMapId = next.id;
  state.selectedArmyId = players[0]?.id ?? null;
  state.lastMessage =
    next.brief ?? `Миссия выполнена. Следующая карта: ${next.name}`;
}

export interface CarriedArmy {
  name: string;
  hero: Army["hero"];
  unitDefIds: string[];
  unitHps: number[];
  unitHeroFlags: boolean[];
  unitSlots: Array<number | undefined>;
  isMissionary?: boolean;
}

export function snapshotPlayerArmies(state: GameState): CarriedArmy[] {
  return state.armies
    .filter((a) => a.isPlayer && livingUnits(a).length > 0)
    .map((a) => ({
      name: a.name,
      hero: { ...a.hero },
      unitDefIds: a.units.map((u) => u.defId),
      unitHps: a.units.map((u) => u.hp),
      unitHeroFlags: a.units.map((u) => !!u.isHero),
      unitSlots: a.units.map((u) => u.slot),
      isMissionary: a.isMissionary,
    }));
}

/**
 * After a capture / battle / end turn — check defeat, map clear, next map, or full victory.
 */
export function resolveMissionOutcome(state: GameState): MissionOutcome {
  if (state.gameOver === "victory") return "victory";
  if (state.gameOver === "defeat") return "defeat";

  if (checkDefeat(state)) {
    state.gameOver = "defeat";
    return "defeat";
  }

  const scenario = getScenario(state.scenarioId);
  if (!scenario) return "continue";

  if (!isMapObjectiveComplete(state, scenario)) return "continue";

  const pendingWin = collectPendingPlot(scenario, state, [
    { type: "map_win", mapId: state.currentMapId },
  ]);
  if (pendingWin.length) return "continue";

  const next = nextMapInScenario(scenario, state.currentMapId);
  if (next) {
    advanceToNextMap(state, next);
    return "next_map";
  }

  state.gameOver = "victory";
  const nextSc = nextScenarioId(state.campaignId, state.scenarioId);
  state.lastMessage = nextSc
    ? "Сценарий пройден. Можно перейти к следующему."
    : "Сценарий пройден.";
  return "victory";
}

/** @deprecated use resolveMissionOutcome */
export function checkVictory(state: GameState): "victory" | "defeat" | null {
  const outcome = resolveMissionOutcome(state);
  if (outcome === "victory") return "victory";
  if (outcome === "defeat") return "defeat";
  return null;
}
