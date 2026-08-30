import Phaser from "phaser";
import { isUsableTexture } from "../raceFrameConstructor";
import { viewSize } from "../viewport";
import { battleInnerRect, battleStripHeight } from "./battleWindowFrame";

/** Full-page gothic plate behind the combat window. */
export const BATTLE_BG_KEY = "battle_bg";
export const BATTLE_BG_ASSET: [string, string] = [BATTLE_BG_KEY, "assets/ui/battle_bg.jpg"];

/** Fallback if the plate is missing. */
export const BATTLE_STAGE_COLOR = 0x0c0c0c;

export type BattleStage = {
  plate?: Phaser.GameObjects.Image;
  wash?: Phaser.GameObjects.Graphics;
};

/**
 * Cover-fit the battle plate and a quiet wash so portraits / HUD stay readable.
 * Formation frames and units sit above this (depth 0+).
 */
export function createBattleStage(scene: Phaser.Scene, depth = -12): BattleStage {
  const stage: BattleStage = {};
  if (isUsableTexture(scene, BATTLE_BG_KEY)) {
    stage.plate = scene.add
      .image(0, 0, BATTLE_BG_KEY)
      .setOrigin(0.5)
      .setDepth(depth)
      .setScrollFactor(0);
  }
  stage.wash = scene.add.graphics().setDepth(depth + 1).setScrollFactor(0);
  layoutBattleStage(scene, stage);
  return stage;
}

export function layoutBattleStage(scene: Phaser.Scene, stage: BattleStage | undefined): void {
  if (!stage) return;
  const { w, h } = viewSize(scene);
  const plate = stage.plate;
  if (plate?.active) {
    const src = plate.texture.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const tw = Math.max(1, src.width || plate.width);
    const th = Math.max(1, src.height || plate.height);
    const scale = Math.max(w / tw, h / th);
    plate.setPosition(w / 2, h / 2).setDisplaySize(tw * scale, th * scale);
  }
  const wash = stage.wash;
  if (!wash?.active) return;
  const inner = battleInnerRect(w, h);
  const stripH = battleStripHeight(inner.h, inner.w);
  wash.clear();
  wash.fillStyle(0x000000, 0.18);
  wash.fillRect(inner.x, inner.y, inner.w, inner.h);
  wash.fillStyle(0x000000, 0.22);
  wash.fillRect(inner.x, inner.y, inner.w, 64);
  wash.fillStyle(0x000000, 0.32);
  wash.fillRect(inner.x, inner.y + inner.h - stripH, inner.w, stripH);
}

/** Center seam only — the page plate is the arena now, not a brown box. */
export function paintBattleArena(
  g: Phaser.GameObjects.Graphics,
  arena: { x: number; y: number; w: number; h: number },
  battleCx: number,
): void {
  g.lineStyle(1, 0xc8c4bc, 0.2);
  g.lineBetween(battleCx, arena.y + 18, battleCx, arena.y + arena.h - 18);
}
