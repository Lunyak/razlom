/**
 * Shared isometric terrain draw — WorldScene and EditorScene.
 *
 * Ground PNGs are stamped with world-space UVs so adjacent cells continue
 * one photograph instead of repeating a diamond crop. Mountain blobs get
 * a single range cutout over a merged mass.
 */

import Phaser from "phaser";
import { isUsableTexture } from "../ui/raceFrameConstructor";
import { ensureCutout } from "./chromaCutout";
import {
  HH,
  HW,
  TERRAIN_COLOR,
  TILE_H,
  TILE_W,
  findMountainBlobs,
  isoCenter,
  isoDiamondPoints,
  isoDrawOrder,
  isoMapBounds,
  isoTop,
  mountainCellLift,
  drawMapRimMist,
} from "./iso";
import {
  GROUND_SHEET,
  pickMountainRangeKey,
  pickTreeOverlayKey,
} from "./terrainArt";
import type { Terrain } from "./world";

const FOG_TINT = 0x5c574e;
const UNSEEN_ALPHA = 0.82;
/** Must match `placeOverlay(..., TREE_OVERLAY_HEIGHT, TREE_OVERLAY_LIFT)`. */
export const TREE_OVERLAY_HEIGHT = 70;
export const TREE_OVERLAY_LIFT = -2;
export const TREE_OVERLAY_ORIGIN_Y = 0.9;

/** Click the tree sprite, not the diamond it visually covers. */
export function pointInTreeOverlay(
  wx: number,
  wy: number,
  x: number,
  y: number,
  ox: number,
  oy: number,
): boolean {
  const { cx, cy } = isoCenter(x, y, ox, oy);
  const h = TREE_OVERLAY_HEIGHT;
  const w = TILE_W * 1.05;
  const imgY = cy - TREE_OVERLAY_LIFT;
  const top = imgY - TREE_OVERLAY_ORIGIN_Y * h;
  const left = cx - w / 2;
  return wx >= left && wx <= left + w && wy >= top && wy <= top + h;
}
const LAYER_KEY = "__terrain_island_v1";
const GROUND_TYPES: Terrain[] = [
  "grass",
  "forest",
  "road",
  "water",
  "mountain_foot",
  "mountain",
];

export interface TerrainLayerView {
  map: Terrain[][];
  ox: number;
  oy: number;
  discovered?: boolean[][];
  visible?: boolean[][];
  reachables?: { has(key: string): boolean };
}

export class TerrainLayer {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly images: Phaser.GameObjects.Image[] = [];
  private readonly gfxs: Phaser.GameObjects.Graphics[] = [];
  private plate?: Phaser.GameObjects.RenderTexture;
  private imageUsed = 0;
  private gfxUsed = 0;

  constructor(scene: Phaser.Scene, depth = 0) {
    this.scene = scene;
    this.root = scene.add.container(0, 0).setDepth(depth);
  }

  redraw(view: TerrainLayerView): void {
    this.imageUsed = 0;
    this.gfxUsed = 0;

    const rows = view.map.length;
    const cols = view.map[0]?.length ?? 0;
    const cells: { x: number; y: number }[] = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) cells.push({ x, y });
    }
    cells.sort(isoDrawOrder);

    const fogGfx = this.takeGfx();
    const dimGfx = this.takeGfx();
    const reachGfx = this.takeGfx();

    this.blitGroundPlate(view, cells);

    for (const { x, y } of cells) {
      const discovered = view.discovered ? !!view.discovered[y]?.[x] : true;
      if (discovered) continue;
      const { sx, sy } = isoTop(x, y, view.ox, view.oy);
      fogGfx.fillStyle(0x0e0c0a, 1);
      fogGfx.fillPoints(isoDiamondPoints(sx, sy, 1.5), true);
    }

    for (const { x, y } of cells) {
      if (view.discovered && !view.discovered[y]?.[x]) continue;
      if (view.visible && !view.visible[y][x]) {
        const { sx, sy } = isoTop(x, y, view.ox, view.oy);
        dimGfx.fillStyle(0x1a1510, 0.38);
        dimGfx.fillPoints(isoDiamondPoints(sx, sy, 1.2), true);
      }
    }

    this.placeMountainRanges(view);

    for (const { x, y } of cells) {
      if (view.discovered && !view.discovered[y]?.[x]) continue;
      const terrain = view.map[y][x];
      const inVision = view.visible ? !!view.visible[y]?.[x] : true;
      const { sx, sy } = isoTop(x, y, view.ox, view.oy);
      if (terrain === "forest") {
        this.placeOverlay(
          pickTreeOverlayKey(x, y),
          x,
          y,
          view.ox,
          view.oy,
          inVision,
          TREE_OVERLAY_HEIGHT,
          TREE_OVERLAY_LIFT,
        );
      }
      if (view.reachables?.has(`${x},${y}`) && inVision) {
        reachGfx.fillStyle(0xe8d5a3, 0.28);
        reachGfx.fillPoints(isoDiamondPoints(sx, sy), true);
      }
    }

    const mistGfx = this.takeGfx();
    drawMapRimMist(mistGfx, cols, rows, view.ox, view.oy);
    this.root.bringToTop(mistGfx);
    this.root.bringToTop(reachGfx);

    for (let i = this.imageUsed; i < this.images.length; i++) {
      this.images[i].setVisible(false);
    }
    for (let i = this.gfxUsed; i < this.gfxs.length; i++) {
      this.gfxs[i].clear().setVisible(false);
    }
  }

  destroy(): void {
    this.plate?.destroy();
    this.plate = undefined;
    this.root.destroy(true);
    this.images.length = 0;
    this.gfxs.length = 0;
  }

  private blitGroundPlate(view: TerrainLayerView, cells: { x: number; y: number }[]): void {
    const rows = view.map.length;
    const cols = view.map[0]?.length ?? 0;
    const bounds = isoMapBounds(cols, rows, view.ox, view.oy);
    if (!this.plate || this.plate.width !== bounds.w || this.plate.height !== bounds.h) {
      this.plate?.destroy();
      this.plate = this.scene.add.renderTexture(bounds.left, bounds.top, bounds.w, bounds.h);
      this.plate.setOrigin(0, 0);
      this.root.add(this.plate);
    } else {
      this.plate.setPosition(bounds.left, bounds.top);
    }
    this.root.sendToBack(this.plate);
    this.plate.clear();

    const layer = ensureLayerCanvas(this.scene, bounds.w, bounds.h);
    if (!layer) return;
    for (const terrain of GROUND_TYPES) {
      if (!paintTerrainIsland(this.scene, layer, bounds, view, cells, terrain)) continue;
      this.plate.draw(LAYER_KEY, 0, 0);
    }
  }

  private placeMountainRanges(view: TerrainLayerView): void {
    const blobs = findMountainBlobs(view.map);
    blobs.forEach((blob, index) => {
      const visibleCells = blob.cells.filter((c) => !view.discovered || view.discovered[c.y]?.[c.x]);
      if (visibleCells.length === 0) return;
      const inVision = visibleCells.some((c) => (view.visible ? view.visible[c.y][c.x] : true));
      const key = pickMountainRangeKey(index, blob.hasPeak);
      const cut = ensureCutout(this.scene, key);
      if (!cut) return;

      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let cx = 0;
      let cy = 0;
      for (const c of visibleCells) {
        const p = isoCenter(c.x, c.y, view.ox, view.oy);
        const lift = mountainCellLift(view.map, c.x, c.y);
        cx += p.cx;
        cy += p.cy - lift;
        minX = Math.min(minX, p.cx - HW);
        maxX = Math.max(maxX, p.cx + HW);
        minY = Math.min(minY, p.cy - lift - HH);
        maxY = Math.max(maxY, p.cy + HH);
      }
      const n = visibleCells.length;
      cx /= n;
      cy /= n;
      const w = Math.max(TILE_W * 2, (maxX - minX) * 1.35);
      const h = Math.max(TILE_H * 3, (maxY - minY) * 1.55 + (blob.hasPeak ? 28 : 12));
      const img = this.takeImage(cut, cx, cy + 10, 0.5, 0.88);
      img.setDisplaySize(w, h);
      applyFog(img, inVision);
    });
  }

  private placeOverlay(
    srcKey: string,
    x: number,
    y: number,
    ox: number,
    oy: number,
    inVision: boolean,
    height: number,
    lift: number,
  ): void {
    const cut = ensureCutout(this.scene, srcKey);
    if (!cut) return;
    const { cx, cy } = isoCenter(x, y, ox, oy);
    const img = this.takeImage(cut, cx, cy - lift, 0.5, TREE_OVERLAY_ORIGIN_Y);
    const src = img.texture.getSourceImage() as { width: number; height: number };
    const aspect = Math.max(1, src.width) / Math.max(1, src.height);
    img.setDisplaySize(height * aspect * 0.85, height);
    applyFog(img, inVision);
  }

  private takeImage(
    key: string,
    x: number,
    y: number,
    originX: number,
    originY: number,
  ): Phaser.GameObjects.Image {
    let img = this.images[this.imageUsed];
    if (!img) {
      img = this.scene.add.image(x, y, key);
      this.root.add(img);
      this.images.push(img);
    } else {
      img.setTexture(key).setPosition(x, y).setVisible(true);
    }
    img.setOrigin(originX, originY);
    img.clearTint();
    img.setAlpha(1);
    img.setScale(1);
    this.root.bringToTop(img);
    this.imageUsed += 1;
    return img;
  }

  private takeGfx(): Phaser.GameObjects.Graphics {
    let gfx = this.gfxs[this.gfxUsed];
    if (!gfx) {
      gfx = this.scene.add.graphics();
      this.root.add(gfx);
      this.gfxs.push(gfx);
    } else {
      gfx.clear().setVisible(true);
    }
    gfx.lineStyle(0, 0, 0, 0);
    gfx.setAlpha(1);
    this.root.bringToTop(gfx);
    this.gfxUsed += 1;
    return gfx;
  }
}

function applyFog(img: Phaser.GameObjects.Image, inVision: boolean): void {
  if (inVision) return;
  img.setTint(FOG_TINT);
  img.setAlpha(UNSEEN_ALPHA);
}

function ensureLayerCanvas(scene: Phaser.Scene, w: number, h: number): Phaser.Textures.CanvasTexture | null {
  if (scene.textures.exists(LAYER_KEY)) {
    const existing = scene.textures.get(LAYER_KEY) as Phaser.Textures.CanvasTexture;
    if (existing.width === w && existing.height === h) return existing;
    scene.textures.remove(LAYER_KEY);
  }
  return scene.textures.createCanvas(LAYER_KEY, w, h);
}

function paintTerrainIsland(
  scene: Phaser.Scene,
  layer: Phaser.Textures.CanvasTexture,
  bounds: { left: number; top: number; w: number; h: number },
  view: TerrainLayerView,
  cells: { x: number; y: number }[],
  terrain: Terrain,
): boolean {
  const sheet = GROUND_SHEET[terrain];
  const ctx = layer.getContext();
  ctx.clearRect(0, 0, layer.width, layer.height);
  const members = cells.filter((c) => {
    if (view.map[c.y][c.x] !== terrain) return false;
    if (view.discovered && !view.discovered[c.y]?.[c.x]) return false;
    return true;
  });
  if (members.length === 0) return false;

  const color = `#${TERRAIN_COLOR[terrain].toString(16).padStart(6, "0")}`;
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#ffffff";
  for (const { x, y } of members) {
    const { sx, sy } = isoTop(x, y, view.ox, view.oy);
    const lx = sx - bounds.left;
    const ly = sy - bounds.top;
    ctx.beginPath();
    ctx.moveTo(lx, ly - 3);
    ctx.lineTo(lx + HW + 3, ly + HH);
    ctx.lineTo(lx, ly + TILE_H + 3);
    ctx.lineTo(lx - HW - 3, ly + HH);
    ctx.closePath();
    ctx.fill();
  }

  ctx.globalCompositeOperation = "source-in";
  if (isUsableTexture(scene, sheet)) {
    const src = scene.textures.get(sheet).getSourceImage() as CanvasImageSource;
    const pattern = ctx.createPattern(src, "repeat");
    if (pattern) {
      ctx.translate(-bounds.left, -bounds.top);
      ctx.fillStyle = pattern;
      ctx.fillRect(bounds.left, bounds.top, bounds.w, bounds.h);
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, layer.width, layer.height);
    }
  } else {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, layer.width, layer.height);
  }
  ctx.restore();
  layer.refresh();
  return true;
}
