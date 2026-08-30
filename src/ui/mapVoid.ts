import type Phaser from "phaser";
import { HH, HW, TILE_H, isoMapBounds, isoTop } from "../game/iso";
import { isUsableTexture } from "./raceFrameConstructor";
import { viewSize } from "./viewport";

/** Tiled granite under / around the iso map island. */
export const MAP_VOID_KEY = "map_void";
export const MAP_VOID_ASSET: [string, string] = [MAP_VOID_KEY, "assets/ui/map_void.jpg"];

/** Above terrain / mountain overflow, below tile highlights and tokens. */
export const MAP_VOID_LID_DEPTH = 2.4;
const LID_KEY = "__map_void_lid";
const LID_PAD = 220;
const WALL_DROP = 64;
const PEAK_ALLOW = 168;
const WALL_LEFT = "#3a342c";
const WALL_LEFT_DEEP = "#2a251f";
const WALL_RIGHT = "#5c5448";
const WALL_RIGHT_DEEP = "#454038";
const WALL_LIP = "#6e6658";
const WALL_CREASE = "#1c1814";

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

/** Granite tray with perimeter walls; sky above the island stays open for mountain height. */
export function createMapVoidLid(
  scene: Phaser.Scene,
  depth = MAP_VOID_LID_DEPTH,
): Phaser.GameObjects.Image | undefined {
  if (!isUsableTexture(scene, MAP_VOID_KEY)) return undefined;
  return scene.add.image(0, 0, MAP_VOID_KEY).setOrigin(0, 0).setDepth(depth).setVisible(false);
}

export function layoutMapVoidLid(
  scene: Phaser.Scene,
  lid: Phaser.GameObjects.Image | undefined,
  cols: number,
  rows: number,
  ox: number,
  oy: number,
): void {
  if (!lid?.active || !isUsableTexture(scene, MAP_VOID_KEY)) return;
  const hull = isoMapBounds(cols, rows, ox, oy, 0);
  const left = Math.floor(hull.left - LID_PAD);
  const top = Math.floor(hull.top - LID_PAD);
  const w = Math.max(32, Math.ceil(hull.w + LID_PAD * 2));
  const h = Math.max(32, Math.ceil(hull.h + LID_PAD * 2 + WALL_DROP));
  const canvas = replaceLidCanvas(scene, lid, w, h);
  if (!canvas) return;
  const ctx = canvas.getContext();
  ctx.clearRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";
  const src = scene.textures.get(MAP_VOID_KEY).getSourceImage() as CanvasImageSource;
  const pattern = ctx.createPattern(src, "repeat");
  ctx.fillStyle = pattern ?? "#080706";
  ctx.fillRect(0, 0, w, h);
  punchIslandSky(ctx, cols, rows, ox, oy, left, top);
  paintPerimeterWalls(ctx, cols, rows, ox, oy, left, top, pattern);
  canvas.refresh();
  lid.setTexture(LID_KEY).setPosition(left, top).setDisplaySize(w, h).setVisible(true);
}

function punchIslandSky(
  ctx: CanvasRenderingContext2D,
  cols: number,
  rows: number,
  ox: number,
  oy: number,
  left: number,
  top: number,
): void {
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "#ffffff";
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const { sx, sy } = isoTop(x, y, ox, oy);
      const lx = sx - left;
      const ly = sy - top;
      ctx.beginPath();
      ctx.moveTo(lx, ly - 2);
      ctx.lineTo(lx + HW + 2, ly + HH);
      ctx.lineTo(lx, ly + TILE_H + 2);
      ctx.lineTo(lx - HW - 2, ly + HH);
      ctx.closePath();
      ctx.fill();
    }
  }
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (x > 0 && y > 0) continue;
      const { sx, sy } = isoTop(x, y, ox, oy);
      const lx = sx - left;
      const ly = sy - top;
      ctx.beginPath();
      ctx.moveTo(lx, ly - PEAK_ALLOW);
      ctx.lineTo(lx + HW + 8, ly + HH - PEAK_ALLOW * 0.15);
      ctx.lineTo(lx + HW + 2, ly + HH);
      ctx.lineTo(lx, ly + TILE_H + 2);
      ctx.lineTo(lx - HW - 2, ly + HH);
      ctx.lineTo(lx - HW - PEAK_ALLOW * 0.75, ly + HH - PEAK_ALLOW * 0.45);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function inMap(x: number, y: number, cols: number, rows: number): boolean {
  return x >= 0 && y >= 0 && x < cols && y < rows;
}

function paintPerimeterWalls(
  ctx: CanvasRenderingContext2D,
  cols: number,
  rows: number,
  ox: number,
  oy: number,
  left: number,
  top: number,
  pattern: CanvasPattern | null,
): void {
  ctx.globalCompositeOperation = "source-over";
  const faces: { ax: number; ay: number; bx: number; by: number; fill: string; deep: string }[] = [];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const { sx, sy } = isoTop(x, y, ox, oy);
      const E = { x: sx + HW - left, y: sy + HH - top };
      const S = { x: sx - left, y: sy + TILE_H - top };
      const W = { x: sx - HW - left, y: sy + HH - top };
      if (!inMap(x + 1, y, cols, rows)) {
        faces.push({ ax: E.x, ay: E.y, bx: S.x, by: S.y, fill: WALL_RIGHT, deep: WALL_RIGHT_DEEP });
      }
      if (!inMap(x, y + 1, cols, rows)) {
        faces.push({ ax: W.x, ay: W.y, bx: S.x, by: S.y, fill: WALL_LEFT, deep: WALL_LEFT_DEEP });
      }
    }
  }
  faces.sort((a, b) => a.ay + a.by - (b.ay + b.by));
  for (const face of faces) {
    paintWallFace(ctx, face.ax, face.ay, face.bx, face.by, face.fill, face.deep, pattern);
  }
}

function paintWallFace(
  ctx: CanvasRenderingContext2D,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  fill: string,
  deep: string,
  pattern: CanvasPattern | null,
): void {
  const drop = WALL_DROP;
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx, by + drop);
    ctx.lineTo(ax, ay + drop);
    ctx.closePath();
  };
  trace();
  ctx.fillStyle = fill;
  ctx.fill();
  if (pattern) {
    ctx.save();
    trace();
    ctx.clip();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = pattern;
    ctx.fillRect(Math.min(ax, bx) - 2, Math.min(ay, by), Math.abs(bx - ax) + 4, drop + Math.abs(by - ay) + 4);
    ctx.restore();
  }
  ctx.beginPath();
  ctx.moveTo(ax, ay + drop * 0.62);
  ctx.lineTo(bx, by + drop * 0.62);
  ctx.lineTo(bx, by + drop);
  ctx.lineTo(ax, ay + drop);
  ctx.closePath();
  ctx.fillStyle = deep;
  ctx.globalAlpha = 0.55;
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.lineTo(bx, by + 5);
  ctx.lineTo(ax, ay + 5);
  ctx.closePath();
  ctx.fillStyle = WALL_LIP;
  ctx.fill();
  ctx.strokeStyle = WALL_CREASE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(ax, ay);
  ctx.lineTo(bx, by);
  ctx.stroke();
}

function replaceLidCanvas(
  scene: Phaser.Scene,
  lid: Phaser.GameObjects.Image,
  w: number,
  h: number,
): Phaser.Textures.CanvasTexture | null {
  if (scene.textures.exists(LID_KEY)) {
    const existing = scene.textures.get(LID_KEY) as Phaser.Textures.CanvasTexture;
    if (existing.width === w && existing.height === h) return existing;
    if (lid.texture.key === LID_KEY) lid.setTexture(MAP_VOID_KEY);
    scene.textures.remove(LID_KEY);
  }
  return scene.textures.createCanvas(LID_KEY, w, h);
}
