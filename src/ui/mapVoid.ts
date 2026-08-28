import type Phaser from "phaser";
import { isUsableTexture } from "./raceFrameConstructor";
import { viewSize } from "./viewport";

/** Tiled granite under / around the iso map island. */
export const MAP_VOID_KEY = "map_void";
export const MAP_VOID_ASSET: [string, string] = [MAP_VOID_KEY, "assets/ui/map_void.jpg"];

export function createMapVoid(scene: Phaser.Scene, depth = -8): Phaser.GameObjects.TileSprite | undefined {
  if (!isUsableTexture(scene, MAP_VOID_KEY)) return undefined;
  const ts = scene.add.tileSprite(0, 0, 8, 8, MAP_VOID_KEY).setOrigin(0, 0).setDepth(depth);
  layoutMapVoid(scene, ts);
  return ts;
}

export function layoutMapVoid(
  scene: Phaser.Scene,
  ts: Phaser.GameObjects.TileSprite | undefined,
): void {
  if (!ts?.active) return;
  const bounds = scene.cameras.main.getBounds();
  if (Number.isFinite(bounds.width) && bounds.width > 64 && bounds.width < 1e7) {
    ts.setScrollFactor(1);
    ts.setPosition(bounds.x, bounds.y);
    ts.setSize(bounds.width, bounds.height);
    return;
  }
  const { w, h } = viewSize(scene);
  ts.setScrollFactor(0);
  ts.setPosition(0, 0);
  ts.setSize(w, h);
}
