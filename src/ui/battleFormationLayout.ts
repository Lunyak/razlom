import { GLASS_PHOTO_SIZE } from "../game/vintagePortrait";

/** Default vertical anchor for 2×3 battle grids. */
export const FORMATION_START_Y = 200;

const { frameW: UNIT_FRAME_W, frameH: UNIT_FRAME_H } = GLASS_PHOTO_SIZE;
const ROW_OVERLAP = 3;
const ROW_STEP = UNIT_FRAME_H - ROW_OVERLAP;
const COL_STEP = UNIT_FRAME_W - ROW_OVERLAP;
/** Gap from the battle window's inner lip to the outer column. */
const EDGE_PAD = 10;

export type InnerBand = { x: number; w: number };

export interface FormationBounds {
  x: number;
  y: number;
  w: number;
  h: number;
  frontX: number;
  backX: number;
}

/** Front / back column centers, pinned to the inner window edge. */
export function battleFormationColumns(
  side: "player" | "enemy",
  inner: InnerBand,
): { frontX: number; backX: number } {
  if (side === "player") {
    const backX = inner.x + EDGE_PAD + UNIT_FRAME_W / 2;
    return { backX, frontX: backX + COL_STEP };
  }
  const backX = inner.x + inner.w - EDGE_PAD - UNIT_FRAME_W / 2;
  return { backX, frontX: backX - COL_STEP };
}

export function battleSlotToPos(
  side: "player" | "enemy",
  slot: number,
  inner: InnerBand,
  startY: number = FORMATION_START_Y,
): { x: number; y: number } {
  const isFront = slot < 3;
  const row = slot % 3;
  const { frontX, backX } = battleFormationColumns(side, inner);
  return { x: isFront ? frontX : backX, y: startY + row * ROW_STEP };
}

export function battleFormationBounds(
  side: "player" | "enemy",
  inner: InnerBand,
  startY: number = FORMATION_START_Y,
): FormationBounds {
  const { frontX, backX } = battleFormationColumns(side, inner);
  const left = Math.min(frontX, backX) - UNIT_FRAME_W / 2 - 10;
  const right = Math.max(frontX, backX) + UNIT_FRAME_W / 2 + 10;
  const top = startY - UNIT_FRAME_H / 2 - 10;
  const bottom = startY + 2 * ROW_STEP + UNIT_FRAME_H / 2 + 10;
  return { x: left, y: top, w: right - left, h: bottom - top, frontX, backX };
}

export function battleFormationCenter(
  side: "player" | "enemy",
  inner: InnerBand,
  startY: number = FORMATION_START_Y,
): { x: number; y: number; w: number; h: number } {
  const b = battleFormationBounds(side, inner, startY);
  return { x: b.x + b.w / 2, y: b.y + b.h / 2, w: b.w, h: b.h };
}

export function battleArenaRect(
  viewW: number,
  viewH: number,
  opts: { rightInset?: number; left?: number; top?: number; bottom?: number } = {},
): { x: number; y: number; w: number; h: number } {
  const left = opts.left ?? 40;
  const rightInset = opts.rightInset ?? 0;
  const top = opts.top ?? 56;
  const bottom = opts.bottom ?? 140;
  return { x: left, y: top, w: viewW - left - rightInset - 40, h: viewH - top - bottom };
}
