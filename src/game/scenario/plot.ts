import type { FactionId, GameState } from "../data";
import { portraitTextureKey } from "../portraits";
import type { ScenarioDef } from "./types";

export const PLOT_STEP_TYPES = [
  "title",
  "narration",
  "dialogue",
  "camera",
  "message",
  "grant",
] as const;

export type PlotStepType = (typeof PLOT_STEP_TYPES)[number];

export const PLOT_TRIGGER_TYPES = [
  "map_start",
  "map_win",
  "turn",
  "city_captured",
  "tile",
] as const;

export type PlotTriggerType = (typeof PLOT_TRIGGER_TYPES)[number];

export type PlotTrigger =
  | { type: "map_start" }
  | { type: "map_win" }
  | { type: "turn"; turn: number }
  | { type: "city_captured"; cityId?: string }
  | { type: "tile"; x: number; y: number };

export type PlotStep =
  | { type: "title"; title: string; text?: string }
  | { type: "narration"; text: string }
  | { type: "dialogue"; speaker: string; text: string; portrait?: string; faction?: FactionId }
  | { type: "camera"; x: number; y: number }
  | { type: "message"; text: string }
  | { type: "grant"; gold?: number; mana?: number; people?: number };

/** Ordered story beat: trigger → list of frames/steps. */
export interface PlotSequence {
  id: string;
  name: string;
  /** If set, only this mission map. If omitted: start-map for map_start, else any map. */
  mapId?: string;
  trigger: PlotTrigger;
  steps: PlotStep[];
  /** Default true — fire once per playthrough. */
  once?: boolean;
}

export type PlotFireEvent =
  | { type: "map_start"; mapId: string }
  | { type: "map_win"; mapId: string }
  | { type: "turn"; turn: number; mapId: string }
  | { type: "city_captured"; cityId: string; mapId: string }
  | { type: "tile"; x: number; y: number; mapId: string };

const FACTIONS: FactionId[] = ["ri", "ordo", "risen", "neutral", "cossack", "highlander"];

export function createEmptyStep(type: PlotStepType): PlotStep {
  switch (type) {
    case "title":
      return { type: "title", title: "Кадр", text: "" };
    case "narration":
      return { type: "narration", text: "Что происходит." };
    case "dialogue":
      return {
        type: "dialogue",
        speaker: "Герой",
        text: "…",
        portrait: "hero_ri",
        faction: "ri",
      };
    case "camera":
      return { type: "camera", x: 0, y: 0 };
    case "message":
      return { type: "message", text: "Весть на полях." };
    case "grant":
      return { type: "grant", gold: 0, mana: 0, people: 0 };
    default:
      return { type: "narration", text: "…" };
  }
}

export function createEmptySequence(id: string, mapId?: string): PlotSequence {
  return {
    id,
    name: "Новая сцена",
    mapId,
    trigger: { type: "map_start" },
    steps: [createEmptyStep("title")],
    once: true,
  };
}

export function cloneStep(step: PlotStep): PlotStep {
  return { ...step };
}

export function cloneSequence(seq: PlotSequence): PlotSequence {
  return {
    ...seq,
    trigger: { ...seq.trigger },
    steps: seq.steps.map(cloneStep),
  };
}

export function clonePlot(plot: PlotSequence[] | undefined): PlotSequence[] | undefined {
  if (!plot?.length) return plot ? [] : undefined;
  return plot.map(cloneSequence);
}

export function stepTypeLabel(type: PlotStepType): string {
  switch (type) {
    case "title":
      return "Титул";
    case "narration":
      return "Речь";
    case "dialogue":
      return "Реплика";
    case "camera":
      return "Камера";
    case "message":
      return "Весть";
    case "grant":
      return "Дар";
    default:
      return type;
  }
}

export function stepSummary(step: PlotStep): string {
  switch (step.type) {
    case "title":
      return step.title || "титул";
    case "narration":
      return clip(step.text, 36);
    case "dialogue":
      return `${step.speaker}: ${clip(step.text, 28)}`;
    case "camera":
      return `${step.x},${step.y}`;
    case "message":
      return clip(step.text, 36);
    case "grant":
      return `+${step.gold ?? 0}з +${step.mana ?? 0}м +${step.people ?? 0}л`;
    default:
      return "";
  }
}

export function triggerLabel(trigger: PlotTrigger): string {
  switch (trigger.type) {
    case "map_start":
      return "Старт карты";
    case "map_win":
      return "Победа на карте";
    case "turn":
      return `Ход ${trigger.turn}`;
    case "city_captured":
      return trigger.cityId ? `Город ${trigger.cityId}` : "Любой захват города";
    case "tile":
      return `Клетка ${trigger.x},${trigger.y}`;
    default:
      return "событие";
  }
}

export function cycleTrigger(current: PlotTrigger): PlotTrigger {
  const i = PLOT_TRIGGER_TYPES.indexOf(current.type);
  const next = PLOT_TRIGGER_TYPES[(i + 1) % PLOT_TRIGGER_TYPES.length];
  switch (next) {
    case "map_start":
      return { type: "map_start" };
    case "map_win":
      return { type: "map_win" };
    case "turn":
      return { type: "turn", turn: current.type === "turn" ? current.turn : 2 };
    case "city_captured":
      return { type: "city_captured" };
    case "tile":
      return { type: "tile", x: 0, y: 0 };
    default:
      return { type: "map_start" };
  }
}

function mapScopeMatches(seq: PlotSequence, mapId: string, scenario: ScenarioDef): boolean {
  if (seq.mapId) return seq.mapId === mapId;
  if (seq.trigger.type === "map_start") return mapId === scenario.startMapId;
  return true;
}

function triggerMatches(seq: PlotSequence, event: PlotFireEvent, scenario: ScenarioDef): boolean {
  if (!mapScopeMatches(seq, event.mapId, scenario)) return false;
  const t = seq.trigger;
  if (t.type !== event.type) return false;
  switch (t.type) {
    case "map_start":
    case "map_win":
      return true;
    case "turn":
      return event.type === "turn" && event.turn === t.turn;
    case "city_captured":
      return event.type === "city_captured" && (!t.cityId || t.cityId === event.cityId);
    case "tile":
      return event.type === "tile" && t.x === event.x && t.y === event.y;
    default:
      return false;
  }
}

export function pendingPlotSequences(
  scenario: ScenarioDef,
  state: GameState,
  event: PlotFireEvent,
): PlotSequence[] {
  const fired = new Set(state.firedPlotIds ?? []);
  return (scenario.plot ?? []).filter((seq) => {
    if (seq.once !== false && fired.has(seq.id)) return false;
    if (!seq.steps.length) return false;
    return triggerMatches(seq, event, scenario);
  });
}

export function collectPendingPlot(
  scenario: ScenarioDef,
  state: GameState,
  events: PlotFireEvent[],
): PlotSequence[] {
  const seen = new Set<string>();
  const out: PlotSequence[] = [];
  for (const event of events) {
    for (const seq of pendingPlotSequences(scenario, state, event)) {
      if (seen.has(seq.id)) continue;
      seen.add(seq.id);
      out.push(seq);
    }
  }
  return out;
}

export function markPlotFired(state: GameState, sequences: PlotSequence[]): void {
  if (!state.firedPlotIds) state.firedPlotIds = [];
  for (const seq of sequences) {
    if (seq.once === false) continue;
    if (!state.firedPlotIds.includes(seq.id)) state.firedPlotIds.push(seq.id);
  }
}

export function applyPlotGrant(
  state: GameState,
  step: Extract<PlotStep, { type: "grant" }>,
): void {
  if (step.gold) state.gold += step.gold;
  if (step.mana) state.mana += step.mana;
  if (step.people) state.people += step.people;
}

export function resolvePlotPortraitKey(portrait?: string): string | undefined {
  if (!portrait?.trim()) return undefined;
  return portraitTextureKey(portrait.trim());
}

export function isFactionId(value: string | undefined): value is FactionId {
  return !!value && (FACTIONS as string[]).includes(value);
}

function clip(text: string, n: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= n ? t : `${t.slice(0, n - 1)}…`;
}

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
}

function asString(raw: unknown, fallback = ""): string {
  return typeof raw === "string" ? raw : fallback;
}

function asInt(raw: unknown, fallback = 0): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

export function sanitizeStep(raw: unknown): PlotStep | null {
  const o = asRecord(raw);
  if (!o) return null;
  const type = asString(o.type);
  switch (type) {
    case "title":
      return { type: "title", title: asString(o.title, "Кадр"), text: asString(o.text) || undefined };
    case "narration":
      return { type: "narration", text: asString(o.text, "…") };
    case "dialogue": {
      const faction = asString(o.faction);
      return {
        type: "dialogue",
        speaker: asString(o.speaker, "Голос"),
        text: asString(o.text, "…"),
        portrait: asString(o.portrait) || undefined,
        faction: isFactionId(faction) ? faction : undefined,
      };
    }
    case "camera":
      return { type: "camera", x: asInt(o.x), y: asInt(o.y) };
    case "message":
      return { type: "message", text: asString(o.text, "…") };
    case "grant":
      return {
        type: "grant",
        gold: o.gold != null ? asInt(o.gold) : undefined,
        mana: o.mana != null ? asInt(o.mana) : undefined,
        people: o.people != null ? asInt(o.people) : undefined,
      };
    default:
      return null;
  }
}

export function sanitizeTrigger(raw: unknown): PlotTrigger {
  const o = asRecord(raw);
  const type = asString(o?.type);
  switch (type) {
    case "map_win":
      return { type: "map_win" };
    case "turn":
      return { type: "turn", turn: Math.max(1, asInt(o?.turn, 2)) };
    case "city_captured": {
      const cityId = asString(o?.cityId);
      return { type: "city_captured", cityId: cityId || undefined };
    }
    case "tile":
      return { type: "tile", x: asInt(o?.x), y: asInt(o?.y) };
    default:
      return { type: "map_start" };
  }
}

export function sanitizeSequence(raw: unknown, index = 0): PlotSequence | null {
  const o = asRecord(raw);
  if (!o) return null;
  const steps = Array.isArray(o.steps)
    ? o.steps.map(sanitizeStep).filter((s): s is PlotStep => !!s)
    : [];
  const mapId = asString(o.mapId);
  return {
    id: asString(o.id, `plot_${index}`),
    name: asString(o.name, "Сцена"),
    mapId: mapId || undefined,
    trigger: sanitizeTrigger(o.trigger),
    steps,
    once: o.once === false ? false : true,
  };
}

export function sanitizePlot(raw: unknown): PlotSequence[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const list = raw.map(sanitizeSequence).filter((s): s is PlotSequence => !!s);
  return list.length ? list : undefined;
}
