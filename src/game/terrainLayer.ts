/**
 * Shared isometric terrain draw — WorldScene and EditorScene.
 *
 * Ground PNGs are stamped with world-space UVs so adjacent cells continue
 * one photograph instead of repeating a diamond crop. Mountain ranges stay
 * photographic range cutouts sitting on the blob footprint (no lifted gray tiles).
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
  drawMapRimMist,
} from "./iso";
import {
  GROUND_SHEET,
  cellShowsTrees,
  isTreeOverlayKey,
  pickGroundKey,
  pickMountainRangeKey,
  pickTreeOverlayKey,
  type MapDecorCell,
  type TerrainGroundKey,
} from "./terrainArt";
import type { Terrain } from "./world";

const FOG_TINT = 0x5c574e;
const UNSEEN_ALPHA = 0.82;
/** Ortho runs follow the diamond; (1,-1) is screen-horizontal, (1,1) screen-vertical. */
const EARTHWORK_DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
  [-1, -1],
];
const TRENCH_BANK = 0xb8a46a;
const TRENCH_LIP = 0xd4c48a;
const TRENCH_FLOOR = 0x4a3e2a;
const DITCH_FLOOR = 0x6a5a3c;
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
const MOUNTAIN_PAD = 0x2a2620;

export interface TerrainLayerView {
  map: Terrain[][];
  ox: number;
  oy: number;
  /** Per-cell ground plate. Missing / null keeps the default island sheet. */
  groundArt?: (TerrainGroundKey | null)[][];
  /** Per-cell overlay. `null` = auto, `""` = none, key = that cutout. */
  decorArt?: MapDecorCell[][];
  discovered?: boolean[][];
  visible?: boolean[][];
  reachables?: { has(key: string): boolean };
  night?: boolean;
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
    this.placeEarthworks(view);

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
        dimGfx.fillStyle(view.night ? 0x120e0a : 0x1a1510, view.night ? 0.58 : 0.38);
        dimGfx.fillPoints(isoDiamondPoints(sx, sy, 1.2), true);
      }
    }

    const mistGfx = this.takeGfx();
    drawMapRimMist(mistGfx, cols, rows, view.ox, view.oy);

    this.placeMountainRanges(view);

    for (const { x, y } of cells) {
      if (view.discovered && !view.discovered[y]?.[x]) continue;
      const terrain = view.map[y][x];
      const inVision = view.visible ? !!view.visible[y]?.[x] : true;
      const { sx, sy } = isoTop(x, y, view.ox, view.oy);
      const decor = view.decorArt?.[y]?.[x];
      if (decor) {
        const tree = isTreeOverlayKey(decor);
        this.placeOverlay(
          decor,
          x,
          y,
          view.ox,
          view.oy,
          inVision,
          tree ? TREE_OVERLAY_HEIGHT : 36,
          tree ? TREE_OVERLAY_LIFT : 4,
        );
      } else if (cellShowsTrees(terrain, decor)) {
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
      if (terrain === "mountain" || terrain === "mountain_foot") continue;
      if (view.reachables?.has(`${x},${y}`) && inVision) {
        reachGfx.fillStyle(0xe8d5a3, 0.28);
        reachGfx.fillPoints(isoDiamondPoints(sx, sy), true);
      }
    }

    if (this.plate) {
      if (view.night) this.plate.setTint(0x6a5a48);
      else this.plate.clearTint();
    }

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
    const sheets = new Set<TerrainGroundKey>();
    for (const { x, y } of cells) {
      if (view.discovered && !view.discovered[y]?.[x]) continue;
      const key = cellGroundKey(view, x, y);
      if (key) sheets.add(key);
    }
    for (const sheet of sheets) {
      if (!paintTerrainIsland(this.scene, layer, bounds, view, cells, sheet)) continue;
      this.plate.draw(LAYER_KEY, 0, 0);
    }
  }

  private placeMountainRanges(view: TerrainLayerView): void {
    const blobs = findMountainBlobs(view.map);
    const pad = this.takeGfx();
    blobs.forEach((blob, index) => {
      const visibleCells = blob.cells.filter((c) => !view.discovered || view.discovered[c.y]?.[c.x]);
      if (visibleCells.length === 0) return;
      const inVision = visibleCells.some((c) => (view.visible ? view.visible[c.y][c.x] : true));

      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      let cx = 0;
      for (const c of visibleCells) {
        const { sx, sy } = isoTop(c.x, c.y, view.ox, view.oy);
        const p = isoCenter(c.x, c.y, view.ox, view.oy);
        cx += p.cx;
        minX = Math.min(minX, sx - HW);
        maxX = Math.max(maxX, sx + HW);
        minY = Math.min(minY, sy);
        maxY = Math.max(maxY, sy + TILE_H);
        pad.fillStyle(MOUNTAIN_PAD, 1);
        pad.fillPoints(isoDiamondPoints(sx, sy, 1.2), true);
      }
      cx /= visibleCells.length;

      const cut = ensureCutout(this.scene, pickMountainRangeKey(index, blob.hasPeak));
      if (!cut) return;

      const w = Math.max(TILE_W * 2, maxX - minX);
      const h = Math.max(TILE_H * 3, maxY - minY + (blob.hasPeak ? 56 : 36));
      const img = this.takeImage(cut, cx, maxY, 0.5, 1);
      img.setDisplaySize(w, h);
      applyFog(img, inVision);
    });
  }

  /**
   * Trench plates are top-down paintings. The map is 2:1 iso, so a stamped
   * PNG cannot share the diamond angle or meet the next cell. The cut is drawn
   * from center to center instead.
   */
  private placeEarthworks(view: TerrainLayerView): void {
    const gfx = this.takeGfx();
    const rows = view.map.length;
    const cols = view.map[0]?.length ?? 0;

    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const kind = earthworkAt(view.map, x, y);
        if (!kind) continue;
        if (view.discovered && !view.discovered[y]?.[x]) continue;
        const inVision = view.visible ? !!view.visible[y]?.[x] : true;
        const fade = inVision ? 1 : 0.42;
        const deep = kind === "trench";
        let links = 0;
        for (const [dx, dy] of EARTHWORK_DIRS) {
          const nx = x + dx;
          const ny = y + dy;
          if (!earthworkAt(view.map, nx, ny)) continue;
          if (view.discovered && !view.discovered[ny]?.[nx]) continue;
          links += 1;
          if (nx < x || (nx === x && ny < y)) continue;
          paintEarthworkLink(gfx, x, y, nx, ny, view.ox, view.oy, deep, fade);
        }
        paintEarthworkJoint(gfx, x, y, view.ox, view.oy, deep, fade, links === 0);
      }
    }
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
    img.setRotation(0);
    img.setFlip(false, false);
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
    gfx.lineStyle(0, 0, 0);
    gfx.setAlpha(1);
    this.root.bringToTop(gfx);
    this.gfxUsed += 1;
    return gfx;
  }
}

function isEarthwork(terrain: Terrain): terrain is "ditch" | "trench" {
  return terrain === "ditch" || terrain === "trench";
}

function earthworkAt(map: Terrain[][], x: number, y: number): "ditch" | "trench" | null {
  const cell = map[y]?.[x];
  return cell && isEarthwork(cell) ? cell : null;
}

function earthworkWidths(deep: boolean): { bank: number; floor: number } {
  return deep ? { bank: 14, floor: 7 } : { bank: 10, floor: 5 };
}

/** Disc at the cell center so strips meet on a corner and a lone pit has a cap. */
function paintEarthworkJoint(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  ox: number,
  oy: number,
  deep: boolean,
  fade: number,
  pit: boolean,
): void {
  const { cx, cy } = isoCenter(x, y, ox, oy);
  const { bank, floor } = earthworkWidths(deep);
  const b = pit ? bank * 1.15 : bank;
  const f = pit ? floor * 1.15 : floor;
  gfx.fillStyle(TRENCH_BANK, 0.96 * fade);
  gfx.fillCircle(cx, cy, b);
  gfx.fillStyle(deep ? TRENCH_FLOOR : DITCH_FLOOR, 0.98 * fade);
  gfx.fillCircle(cx, cy, f);
  gfx.lineStyle(1.15, TRENCH_LIP, 0.65 * fade);
  gfx.strokeCircle(cx, cy, b);
}

function paintEarthworkLink(
  gfx: Phaser.GameObjects.Graphics,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  ox: number,
  oy: number,
  deep: boolean,
  fade: number,
): void {
  const a = isoCenter(ax, ay, ox, oy);
  const b = isoCenter(bx, by, ox, oy);
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const { bank, floor } = earthworkWidths(deep);
  fillStrip(gfx, a.cx, a.cy, b.cx, b.cy, nx * bank, ny * bank, TRENCH_BANK, 0.95 * fade);
  fillStrip(gfx, a.cx, a.cy, b.cx, b.cy, nx * floor, ny * floor, deep ? TRENCH_FLOOR : DITCH_FLOOR, 0.96 * fade);
  gfx.lineStyle(1.1, TRENCH_LIP, 0.55 * fade);
  gfx.beginPath();
  gfx.moveTo(a.cx + nx * bank, a.cy + ny * bank);
  gfx.lineTo(b.cx + nx * bank, b.cy + ny * bank);
  gfx.moveTo(a.cx - nx * bank, a.cy - ny * bank);
  gfx.lineTo(b.cx - nx * bank, b.cy - ny * bank);
  gfx.strokePath();
}

function fillStrip(
  gfx: Phaser.GameObjects.Graphics,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  px: number,
  py: number,
  color: number,
  alpha: number,
): void {
  gfx.fillStyle(color, alpha);
  gfx.fillPoints(
    [
      new Phaser.Geom.Point(ax + px, ay + py),
      new Phaser.Geom.Point(bx + px, by + py),
      new Phaser.Geom.Point(bx - px, by - py),
      new Phaser.Geom.Point(ax - px, ay - py),
    ],
    true,
  );
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

function cellGroundKey(view: TerrainLayerView, x: number, y: number): TerrainGroundKey | null {
  const terrain = view.map[y][x];
  if (terrain === "mountain" || terrain === "mountain_foot") return null;
  // The trench photo is top-down. Keep the field plate and cut the ditch in iso.
  if (terrain === "ditch" || terrain === "trench") return GROUND_SHEET.grass;
  const override = view.groundArt?.[y]?.[x];
  if (override) return override;
  if (terrain === "forest" || terrain === "road") return pickGroundKey(terrain, x, y);
  if (terrain === "grass") return GROUND_SHEET.grass;
  return GROUND_SHEET[terrain];
}

function paintTerrainIsland(
  scene: Phaser.Scene,
  layer: Phaser.Textures.CanvasTexture,
  bounds: { left: number; top: number; w: number; h: number },
  view: TerrainLayerView,
  cells: { x: number; y: number }[],
  sheet: TerrainGroundKey,
): boolean {
  const ctx = layer.getContext();
  ctx.clearRect(0, 0, layer.width, layer.height);
  const members = cells.filter((c) => {
    if (view.discovered && !view.discovered[c.y]?.[c.x]) return false;
    return cellGroundKey(view, c.x, c.y) === sheet;
  });
  if (members.length === 0) return false;

  const sample = view.map[members[0].y][members[0].x];
  const color = `#${TERRAIN_COLOR[sample].toString(16).padStart(6, "0")}`;
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
