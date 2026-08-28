/**
 * City castle composite: capital photo + transparent building overlays.
 * Layout comes from buildingOverlayLayout (editable in test scene, persisted).
 * Chrome is the city's race frame — not a gold rectangle.
 */

import Phaser from "phaser";
import { EMPIRE_BUILD_ORDER, type BuildingId } from "../game/catalog";
import type { FactionId } from "../game/data";
import { getBuildingOverlayLayout } from "../game/buildingOverlayLayout";
import { RI_CAPITAL_ART_KEY, buildingOverlayKey } from "../game/buildingsArt";
import { glassStyleForFaction } from "../game/factionVisual";
import { buildRaceFrame } from "./raceFrameConstructor";
import { DOSSIER } from "./chrome";

export type CastleCompositeOpts = {
  x: number;
  y: number;
  size: number;
  built: readonly BuildingId[];
  depth?: number;
  scrollFactor?: number;
  faction?: FactionId;
  /** Animate newly added overlays */
  appear?: BuildingId[];
};

export type CastleOverlayImage = Phaser.GameObjects.Image & { buildingId?: BuildingId };

/**
 * Draws the large capital plate and overlays every built structure.
 * Returns flat list of game objects (caller owns destroy).
 */
export function spawnCastleComposite(
  scene: Phaser.Scene,
  opts: CastleCompositeOpts,
): Phaser.GameObjects.GameObject[] {
  const {
    x,
    y,
    size,
    built,
    depth = 50,
    scrollFactor = 0,
    faction = "ri",
    appear = [],
  } = opts;
  const out: Phaser.GameObjects.GameObject[] = [];
  const layoutMap = getBuildingOverlayLayout();
  const race = glassStyleForFaction(faction);

  const frame = buildRaceFrame(scene, race, {
    w: size + 28,
    h: size + 28,
    hero: true,
    rim: Math.max(10, Math.round(size * 0.055)),
  });

  const paper = scene.add
    .rectangle(x, y, size + 6, size + 6, frame.paperColor, 1)
    .setStrokeStyle(1, DOSSIER.plateEdge, 0.55)
    .setDepth(depth)
    .setScrollFactor(scrollFactor);
  out.push(paper);

  if (scene.textures.exists(RI_CAPITAL_ART_KEY)) {
    const base = scene.add
      .image(x, y, RI_CAPITAL_ART_KEY)
      .setDisplaySize(size, size)
      .setDepth(depth + 1)
      .setScrollFactor(scrollFactor);
    out.push(base);
  }

  const appearSet = new Set(appear);
  const order = [...EMPIRE_BUILD_ORDER].sort(
    (a, b) => layoutMap[a].depth - layoutMap[b].depth,
  );

  for (const id of order) {
    if (!built.includes(id)) continue;
    const layout = layoutMap[id];
    const key = buildingOverlayKey(id);
    if (!scene.textures.exists(key)) continue;

    const targetW = size * layout.scale;
    const src = scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const srcW = (src as HTMLImageElement).width || (src as HTMLCanvasElement).width || 1;
    const srcH = (src as HTMLImageElement).height || (src as HTMLCanvasElement).height || 1;
    const img = scene.add
      .image(x + layout.x * size, y + layout.y * size, key)
      .setOrigin(0.5, 1)
      .setDisplaySize(targetW, targetW * (srcH / srcW))
      .setDepth(depth + 2 + layout.depth)
      .setScrollFactor(scrollFactor) as CastleOverlayImage;
    img.buildingId = id;

    if (appearSet.has(id)) {
      img.setAlpha(0);
      scene.tweens.add({
        targets: img,
        alpha: 1,
        duration: 480,
        ease: "Sine.easeOut",
      });
    }

    out.push(img);
  }

  if (scene.textures.exists("glass_overlay_dust")) {
    out.push(
      scene.add
        .image(x, y, "glass_overlay_dust")
        .setDisplaySize(size, size)
        .setAlpha(0.16)
        .setTint(0xc8b890)
        .setDepth(depth + 36)
        .setScrollFactor(scrollFactor),
    );
  }

  frame.root
    .setPosition(x, y)
    .setDepth(depth + 40)
    .setScrollFactor(scrollFactor);
  out.push(frame.root);

  return out;
}
