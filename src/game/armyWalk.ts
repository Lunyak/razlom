import { ensureFrameStrip } from "./chromaCutout";
import { armyMapTokenKey, type MapArmyTokenKey } from "./mapTokens";
import type { Army } from "./types";
import type { GridPos } from "./world";

export const ARMY_WALK_FRAMES = 8;
export const ARMY_WALK_COLS = 4;
/** Rest pose from the walk sheet (no separate idle painting — same китель). */
export const ARMY_IDLE_FRAME = 2;

export type IsoDir = "se" | "sw" | "nw" | "ne";
export type WalkFacing = "se" | "nw";

export function armyWalkStripKey(token: MapArmyTokenKey, facing: WalkFacing): string {
  return `${token}_walk_${facing}`;
}

export const MAP_ARMY_WALK_KEYS: string[] = (
  ["map_army_ri", "map_army_ordo", "map_army_risen", "map_army_cossack", "map_army_highlander", "map_army_neutral"] as const
).flatMap((token) => [armyWalkStripKey(token, "se"), armyWalkStripKey(token, "nw")]);

export const MAP_ARMY_WALK_ASSETS: [string, string][] = MAP_ARMY_WALK_KEYS.map((key) => [
  key,
  `assets/map/${key}.png`,
]);

export function isoDirFromStep(from: GridPos, to: GridPos): IsoDir {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx > 0) return "se";
  if (dx < 0) return "nw";
  if (dy > 0) return "sw";
  return "ne";
}

/**
 * Unflipped `_walk_se` does not face the same iso axis for every faction
 * (image-gen wander). `FRONT_NATIVE` is the axis the painting already matches.
 */
const FRONT_NATIVE: Record<MapArmyTokenKey, "se" | "sw"> = {
  map_army_ri: "sw",
  map_army_ri_night: "sw",
  map_army_ordo: "se",
  map_army_risen: "se",
  map_army_cossack: "se",
  map_army_highlander: "se",
  map_army_neutral: "se",
};

const BACK_NATIVE: Record<MapArmyTokenKey, "nw" | "ne"> = {
  map_army_ri: "nw",
  map_army_ri_night: "nw",
  map_army_ordo: "ne",
  map_army_risen: "nw",
  map_army_cossack: "nw",
  map_army_highlander: "nw",
  map_army_neutral: "nw",
};

export function defaultIsoDir(token: MapArmyTokenKey): IsoDir {
  return FRONT_NATIVE[token] ?? "se";
}

export function walkVisual(
  dir: IsoDir,
  token: MapArmyTokenKey,
): { facing: WalkFacing; flip: boolean } {
  if (dir === "se" || dir === "sw") {
    const native = FRONT_NATIVE[token] ?? "se";
    return { facing: "se", flip: dir !== native };
  }
  const native = BACK_NATIVE[token] ?? "nw";
  return { facing: "nw", flip: dir !== native };
}

export function armyWalkStripFor(
  army: Pick<Army, "faction" | "isNeutral" | "isNightHero">,
  dir: IsoDir,
): { key: string; flip: boolean } {
  const token = armyMapTokenKey(army);
  const vis = walkVisual(dir, token);
  return { key: armyWalkStripKey(token, vis.facing), flip: vis.flip };
}

export function walkFrameAt(progress: number, frames = ARMY_WALK_FRAMES): number {
  const p = Math.max(0, Math.min(0.999, progress));
  return Math.floor(p * frames);
}

export function ensureArmyWalkSheet(scene: Phaser.Scene, stripKey: string): string | null {
  return ensureFrameStrip(scene, stripKey, ARMY_WALK_FRAMES, ARMY_WALK_COLS);
}
