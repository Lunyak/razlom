import { GLASS_PHOTO_SIZE } from "../game/vintagePortrait";

/** Default vertical anchor for 2×3 battle grids. */
export const FORMATION_START_Y = 200;

const { frameW: UNIT_FRAME_W, frameH: UNIT_FRAME_H } = GLASS_PHOTO_SIZE;
const ROW_OVERLAP = 3;
const ROW_STEP = UNIT_FRAME_H - ROW_OVERLAP;

const FRONT_FROM_CENTER = 260;
const BACK_FROM_CENTER = FRONT_FROM_CENTER + UNIT_FRAME_W - ROW_OVERLAP;

export interface FormationBounds {
  x: number;
  y: number;
  w: number;
  h: number;
  frontX: number;
  backX: number;
}

export function battleSlotToPos(
  side: "player" | "enemy",
  slot: number,
  centerX: number,
  startY: number = FORMATION_START_Y,
): { x: number; y: number } {
  const isFront = slot < 3;
  const col = slot % 3;
  const baseY = startY + col * ROW_STEP;
  const dist = isFront ? FRONT_FROM_CENTER : BACK_FROM_CENTER;

  if (side === "player") {
    return { x: centerX - dist, y: baseY };
  }
  return { x: centerX + dist, y: baseY };
}

export function battleFormationBounds(
  side: "player" | "enemy",
  centerX: number,
  startY: number = FORMATION_START_Y,
): FormationBounds {
  const frontX =
    side === "player" ? centerX - FRONT_FROM_CENTER : centerX + FRONT_FROM_CENTER;
  const backX =
    side === "player" ? centerX - BACK_FROM_CENTER : centerX + BACK_FROM_CENTER;
  const left = Math.min(frontX, backX) - UNIT_FRAME_W / 2 - 10;
  const right = Math.max(frontX, backX) + UNIT_FRAME_W / 2 + 10;
  const top = startY - UNIT_FRAME_H / 2 - 10;
  const bottom = startY + 2 * ROW_STEP + UNIT_FRAME_H / 2 + 10;
  return { x: left, y: top, w: right - left, h: bottom - top, frontX, backX };
}

export function battleFormationCenter(
  side: "player" | "enemy",
  centerX: number,
  startY: number = FORMATION_START_Y,
): { x: number; y: number; w: number; h: number } {
  const b = battleFormationBounds(side, centerX, startY);
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
