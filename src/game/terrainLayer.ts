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
  GROUND_VARIANTS,
  pickDitchOverlayKey,
  pickGroundKey,
  pickMountainRangeKey,
  pickTrenchOverlayKey,
  pickTreeOverlayKey,
  type EarthworkPiece,
  type TerrainGroundKey,
} from "./terrainArt";
import type { Terrain } from "./world";

const FOG_TINT = 0x5c574e;
const UNSEEN_ALPHA = 0.82;
const EARTHWORK_ORTHO: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
/** Unique edges: iso diagonals plus screen-axis (painted "visual" lines). */
const EARTHWORK_LINKS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [1, -1],
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
const GROUND_TYPES: Terrain[] = ["grass", "forest", "road", "water"];
const MOUNTAIN_PAD = 0x2a2620;

export interface TerrainLayerView {
  map: Terrain[][];
  ox: number;
  oy: number;
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
    for (const terrain of GROUND_TYPES) {
      const sheets =
        terrain === "forest" ? GROUND_VARIANTS.forest : [GROUND_SHEET[terrain]];
      for (const sheet of sheets) {
        if (!paintTerrainIsland(this.scene, layer, bounds, view, cells, terrain, sheet)) continue;
        this.plate.draw(LAYER_KEY, 0, 0);
      }
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
        for (const [dx, dy] of EARTHWORK_LINKS) {
          const nx = x + dx;
          const ny = y + dy;
          const other = earthworkAt(view.map, nx, ny);
          if (!other) continue;
          if (view.discovered && !view.discovered[ny]?.[nx]) continue;
          links += 1;
          const a = isoCenter(x, y, view.ox, view.oy);
          const b = isoCenter(nx, ny, view.ox, view.oy);
          paintEarthworkLink(
            gfx,
            x,
            y,
            nx,
            ny,
            view.ox,
            view.oy,
            deep || other === "trench",
            fade * 0.55,
          );
          const spec = earthworkLinkSprite(dx, dy, x, y, deep || other === "trench");
          this.placeEarthworkSprite(
            spec.key,
            (a.cx + b.cx) / 2,
            (a.cy + b.cy) / 2,
            spec.rot,
            spec.w,
            spec.h,
            inVision,
          );
        }
        for (const [dx, dy] of [
          [-1, 0],
          [0, -1],
          [-1, -1],
          [-1, 1],
        ] as const) {
          if (earthworkAt(view.map, x + dx, y + dy)) links += 1;
        }
        const mask = earthworkMask(view.map, x, y);
        const piece = earthworkPiece(mask);
        const { cx, cy } = isoCenter(x, y, view.ox, view.oy);
        if (links === 0) {
          const key =
            kind === "trench"
              ? pickTrenchOverlayKey("pit", x, y)
              : pickDitchOverlayKey("pit", x, y);
          const size = earthworkSpriteSize("pit", deep);
          const placed = this.placeEarthworkSprite(key, cx, cy, 0, size.w, size.h, inVision);
          if (!placed) paintEarthworkNode(gfx, x, y, view.ox, view.oy, deep, fade);
          continue;
        }
        if (piece === "ell" || piece === "tee") {
          const key =
            kind === "trench"
              ? pickTrenchOverlayKey(piece, x, y)
              : pickDitchOverlayKey(piece, x, y);
          const size = earthworkSpriteSize(piece, deep);
          this.placeEarthworkSprite(
            key,
            cx,
            cy,
            0,
            size.w * 0.82,
            size.h * 0.82,
            inVision,
            earthworkFlipX(mask),
            earthworkFlipY(mask),
          );
        }
      }
    }
  }

  private placeEarthworkSprite(
    srcKey: string,
    cx: number,
    cy: number,
    rotation: number,
    displayW: number,
    displayH: number,
    inVision: boolean,
    flipX = false,
    flipY = false,
  ): boolean {
    const cut = ensureCutout(this.scene, srcKey);
    if (!cut) return false;
    const img = this.takeImage(cut, cx, cy, 0.5, 0.5);
    img.setDisplaySize(displayW, displayH);
    img.setRotation(rotation);
    img.setFlip(flipX, flipY);
    applyFog(img, inVision);
    return true;
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

function earthworkMask(map: Terrain[][], x: number, y: number): number {
  let mask = 0;
  EARTHWORK_ORTHO.forEach(([dx, dy], i) => {
    if (earthworkAt(map, x + dx, y + dy)) mask |= 1 << i;
  });
  return mask;
}

function earthworkPiece(mask: number): EarthworkPiece {
  const bits = (mask & 1) + ((mask >> 1) & 1) + ((mask >> 2) & 1) + ((mask >> 3) & 1);
  if (bits >= 3) return "tee";
  if (bits === 2) {
    if ((mask & 3) === 3) return "ne";
    if ((mask & 12) === 12) return "nw";
    return "ell";
  }
  if (bits === 1) return mask & 3 ? "ne" : "nw";
  return "pit";
}

function earthworkSpriteSize(piece: EarthworkPiece, deep: boolean): { w: number; h: number } {
  const s = deep ? 1 : 0.86;
  if (piece === "pit") return { w: TILE_W * 0.98 * s, h: TILE_H * 1.12 * s };
  if (piece === "tee") return { w: TILE_W * 1.62 * s, h: TILE_H * 1.55 * s };
  if (piece === "ell") return { w: TILE_W * 1.32 * s, h: TILE_H * 1.48 * s };
  return { w: TILE_W * 1.48 * s, h: TILE_H * 1.38 * s };
}

function earthworkFlipX(mask: number): boolean {
  return (mask & 2) !== 0 && (mask & 1) === 0;
}

function earthworkFlipY(mask: number): boolean {
  return (mask & 8) !== 0 && (mask & 4) === 0;
}

function earthworkLinkSprite(
  dx: number,
  dy: number,
  x: number,
  y: number,
  deep: boolean,
): { key: string; rot: number; w: number; h: number } {
  const s = deep ? 1 : 0.86;
  if (dx === 1 && dy === 0) {
    return {
      key: pickTrenchOverlayKey("ne", x, y),
      rot: 0,
      w: TILE_W * 1.22 * s,
      h: TILE_H * 1.15 * s,
    };
  }
  if (dx === 0 && dy === 1) {
    return {
      key: pickTrenchOverlayKey("nw", x, y),
      rot: 0,
      w: TILE_W * 1.22 * s,
      h: TILE_H * 1.15 * s,
    };
  }
  if (dx === 1 && dy === -1) {
    return { key: "overlay_trench_h_0", rot: 0, w: TILE_W * 1.35 * s, h: TILE_H * 0.78 * s };
  }
  return { key: "overlay_trench_h_0", rot: Math.PI / 2, w: TILE_W * 1.35 * s, h: TILE_H * 0.78 * s };
}

function paintEarthworkNode(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  ox: number,
  oy: number,
  deep: boolean,
  fade: number,
): void {
  const { cx, cy } = isoCenter(x, y, ox, oy);
  const rw = deep ? 11 : 8;
  const rh = deep ? 6 : 4.5;
  gfx.fillStyle(TRENCH_BANK, 0.95 * fade);
  gfx.fillEllipse(cx, cy, rw * 2.15, rh * 2.15);
  gfx.fillStyle(deep ? TRENCH_FLOOR : DITCH_FLOOR, 0.95 * fade);
  gfx.fillEllipse(cx, cy, rw * 1.35, rh * 1.2);
  gfx.lineStyle(1.2, TRENCH_LIP, 0.7 * fade);
  gfx.strokeEllipse(cx, cy, rw * 2.15, rh * 2.15);
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
  const bank = deep ? 9 : 6.5;
  const floor = deep ? 4.6 : 3.2;
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

function paintTerrainIsland(
  scene: Phaser.Scene,
  layer: Phaser.Textures.CanvasTexture,
  bounds: { left: number; top: number; w: number; h: number },
  view: TerrainLayerView,
  cells: { x: number; y: number }[],
  terrain: Terrain,
  sheet: TerrainGroundKey,
): boolean {
  const ctx = layer.getContext();
  ctx.clearRect(0, 0, layer.width, layer.height);
  const members = cells.filter((c) => {
    const cell = view.map[c.y][c.x];
    const painted =
      terrain === "grass"
        ? cell === "grass" || cell === "forest" || isEarthwork(cell)
        : cell === terrain && cell !== "forest";
    if (!painted) return false;
    if (view.discovered && !view.discovered[c.y]?.[c.x]) return false;
    if (terrain === "forest" && pickGroundKey(terrain, c.x, c.y) !== sheet) return false;
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
