import Phaser from "phaser";
import { ensureBlackHollow } from "../game/chromaCutout";
import { FORMATION_FRAME_KEYS } from "../game/portraits";
import { battleInnerRect, battleStripHeight } from "./battleHud/battleWindowFrame";

export const BATTLE_SLOT_IRON_KEY = "battle_slot_iron";
export const BATTLE_SLOT_IRON_ASSET: [string, string] = [
  BATTLE_SLOT_IRON_KEY,
  "assets/ui/battle_slot_iron.png",
];

/** Processed PNG sizes after chroma-key crop. */
export const PLATE_SRC = {
  player: { w: 671, h: 1024 },
  enemy: { w: 638, h: 997 },
} as const;

type UvRect = { x: number; y: number; w: number; h: number };

/** 2×3 niches, row-major left→right, top→bottom (measured on keyed plates). */
const PLATE_CELLS: Record<"player" | "enemy", UvRect[]> = {
  player: [
    { x: 0.15, y: 0.198, w: 0.319, h: 0.196 },
    { x: 0.53, y: 0.198, w: 0.319, h: 0.196 },
    { x: 0.15, y: 0.432, w: 0.319, h: 0.196 },
    { x: 0.53, y: 0.432, w: 0.319, h: 0.196 },
    { x: 0.15, y: 0.665, w: 0.319, h: 0.196 },
    { x: 0.53, y: 0.665, w: 0.319, h: 0.196 },
  ],
  enemy: [
    { x: 0.15, y: 0.198, w: 0.319, h: 0.196 },
    { x: 0.53, y: 0.198, w: 0.319, h: 0.196 },
    { x: 0.15, y: 0.432, w: 0.319, h: 0.196 },
    { x: 0.53, y: 0.432, w: 0.319, h: 0.196 },
    { x: 0.15, y: 0.665, w: 0.319, h: 0.196 },
    { x: 0.53, y: 0.665, w: 0.319, h: 0.196 },
  ],
};

export type PlateRect = { x: number; y: number; w: number; h: number };

/**
 * Disciples slot → plate cell. Player front is the right column;
 * enemy front is the left column.
 */
export function plateCellIndex(side: "player" | "enemy", slot: number): number {
  const row = slot % 3;
  const front = slot < 3;
  const col = side === "player" ? (front ? 1 : 0) : front ? 0 : 1;
  return row * 2 + col;
}

let plateRightInset = 0;

/** Sidebar (mechanics sandbox) — keep the enemy plate out from under it. */
export function setFormationPlateRightInset(px: number): void {
  plateRightInset = Math.max(0, px);
}

/** Aspect-fit the plate into the side of the inner opening, above the turn strip. */
export function battlePlateRect(
  side: "player" | "enemy",
  viewW: number,
  viewH: number,
): PlateRect {
  const inner = battleInnerRect(viewW, viewH);
  const stripH = battleStripHeight(inner.h, inner.w);
  const src = PLATE_SRC[side];
  const usableW = Math.max(80, inner.w - plateRightInset);
  const maxW = usableW * 0.32;
  const maxH = Math.max(120, inner.h - stripH - 12);
  const scale = Math.min(maxW / src.w, maxH / src.h);
  const w = Math.round(src.w * scale);
  const h = Math.round(src.h * scale);
  const y = inner.y + 6;
  const x = side === "player" ? inner.x + 8 : inner.x + usableW - w - 8;
  return { x, y, w, h };
}

export function battlePlateSlotRect(
  side: "player" | "enemy",
  slot: number,
  viewW: number,
  viewH: number,
): PlateRect {
  const plate = battlePlateRect(side, viewW, viewH);
  const uv = PLATE_CELLS[side][plateCellIndex(side, slot)]!;
  return {
    x: plate.x + uv.x * plate.w,
    y: plate.y + uv.y * plate.h,
    w: uv.w * plate.w,
    h: uv.h * plate.h,
  };
}

export function battlePlateSlotCenter(
  side: "player" | "enemy",
  slot: number,
  viewW: number,
  viewH: number,
): { x: number; y: number } {
  const r = battlePlateSlotRect(side, slot, viewW, viewH);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

export function battlePlateSlotSize(
  side: "player" | "enemy",
  slot: number,
  viewW: number,
  viewH: number,
): { frame: number; portrait: number } {
  const r = battlePlateSlotRect(side, slot, viewW, viewH);
  const frame = Math.max(36, Math.floor(Math.min(r.w, r.h) * 0.92));
  return { frame, portrait: Math.max(28, Math.round(frame * 0.9)) };
}

export function addFormationPlateImage(
  scene: Phaser.Scene,
  side: "player" | "enemy",
  viewW: number,
  viewH: number,
): Phaser.GameObjects.Image | null {
  const srcKey = side === "player" ? FORMATION_FRAME_KEYS.player : FORMATION_FRAME_KEYS.enemy;
  const key = ensureBlackHollow(scene, srcKey) ?? (scene.textures.exists(srcKey) ? srcKey : null);
  if (!key) return null;
  const r = battlePlateRect(side, viewW, viewH);
  return scene.add
    .image(r.x + r.w / 2, r.y + r.h / 2, key)
    .setDisplaySize(r.w, r.h)
    .setDepth(1)
    .setScrollFactor(0);
}
