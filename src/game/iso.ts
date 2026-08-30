import Phaser from "phaser";
import type { Terrain } from "./world";

export const TILE_W = 80;
export const TILE_H = 40;
export const HW = TILE_W / 2;
export const HH = TILE_H / 2;

export const TERRAIN_COLOR: Record<Terrain, number> = {
  grass: 0x3d5c34,
  forest: 0x2a4224,
  road: 0x6b5a3e,
  water: 0x243028,
  mountain: 0x3a3834,
  mountain_foot: 0x454038,
  ditch: 0x8a7848,
  trench: 0x6e5c38,
};

export const TERRAIN_LABEL: Record<Terrain, string> = {
  grass: "Трава",
  forest: "Лес",
  road: "Дорога",
  water: "Вода",
  mountain: "Гора",
  mountain_foot: "Подгорье",
  ditch: "Ров",
  trench: "Траншея",
};

const MOUNTAIN_RISE: Record<"mountain" | "mountain_foot", number> = {
  mountain: 48,
  mountain_foot: 20,
};

const ROCK_LEFT = 0x3a3732;
const ROCK_RIGHT = 0x534e46;
const ROCK_TOP = 0x625e56;
const ROCK_TOP_LIT = 0x736e64;
const ROCK_CRAG = 0x7a756c;
const ROCK_CREASE = 0x2e2b27;

export function computeIsoOrigin(
  cols: number,
  rows: number,
  screenW = 1280,
  hudTop = 72,
  hudBottom = 668,
  sidebarW = 0,
): { ox: number; oy: number } {
  const centerX = sidebarW + (screenW - sidebarW) / 2;
  const centerY = (hudTop + hudBottom) / 2;
  const ox = centerX - ((cols - 1 - (rows - 1)) / 2) * HW;
  const mapHeight = (cols + rows - 2) * HH + TILE_H;
  const oy = centerY - mapHeight / 2;
  return { ox, oy };
}

export function isoTop(x: number, y: number, ox: number, oy: number): { sx: number; sy: number } {
  return { sx: (x - y) * HW + ox, sy: (x + y) * HH + oy };
}

export function isoCenter(x: number, y: number, ox: number, oy: number): { cx: number; cy: number } {
  const { sx, sy } = isoTop(x, y, ox, oy);
  return { cx: sx, cy: sy + HH };
}

export function screenToGrid(
  px: number,
  py: number,
  ox: number,
  oy: number,
): { gx: number; gy: number } {
  const cx = px - ox;
  const cy = py - oy - HH;
  return {
    gx: Math.round((cx / HW + cy / HH) / 2),
    gy: Math.round((cy / HH - cx / HW) / 2),
  };
}

/** True if (px, py) lies in the iso diamond whose top vertex is (sx, sy). */
export function pointInIsoDiamond(px: number, py: number, sx: number, sy: number): boolean {
  return Math.abs(px - sx) / HW + Math.abs(py - (sy + HH)) / HH <= 1 + 1e-6;
}

export function isoDrawOrder(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const da = a.x + a.y;
  const db = b.x + b.y;
  return da !== db ? da - db : a.x - b.x;
}

export function isoDiamondPoints(sx: number, sy: number, pad = 0): Phaser.Geom.Point[] {
  return [
    new Phaser.Geom.Point(sx, sy - pad),
    new Phaser.Geom.Point(sx + HW + pad, sy + HH),
    new Phaser.Geom.Point(sx, sy + TILE_H + pad),
    new Phaser.Geom.Point(sx - HW - pad, sy + HH),
  ];
}

export function isoMapBounds(
  cols: number,
  rows: number,
  ox: number,
  oy: number,
  peakPad = 56,
): { left: number; top: number; w: number; h: number } {
  const left = ox - (rows - 1) * HW - HW - 8;
  const top = oy - peakPad;
  const right = ox + (cols - 1) * HW + HW + 8;
  const bottom = oy + (cols + rows - 2) * HH + TILE_H + 8;
  return {
    left,
    top,
    w: Math.max(32, Math.ceil(right - left)),
    h: Math.max(32, Math.ceil(bottom - top)),
  };
}

/** How far a ghost cell sits outside the playable rectangle (Chebyshev). */
export function mapRimDistance(x: number, y: number, cols: number, rows: number): number {
  if (x >= 0 && x < cols && y >= 0 && y < rows) return 0;
  const dx = x < 0 ? -x : x >= cols ? x - cols + 1 : 0;
  const dy = y < 0 ? -y : y >= rows ? y - rows + 1 : 0;
  return Math.max(dx, dy);
}

const RIM_VOID = 0x080706;
const RIM_HAZE = 0xa09078;
const RIM_RINGS = 6;

function paintRimRing(
  gfx: Phaser.GameObjects.Graphics,
  cols: number,
  rows: number,
  ox: number,
  oy: number,
  ring: number,
  pad: number,
): void {
  for (let y = -ring; y < rows + ring; y++) {
    for (let x = -ring; x < cols + ring; x++) {
      if (mapRimDistance(x, y, cols, rows) !== ring) continue;
      if (x < 0 || y < 0) continue;
      const { sx, sy } = isoTop(x, y, ox, oy);
      gfx.fillPoints(isoDiamondPoints(sx, sy, pad), true);
    }
  }
}

/**
 * Fog bank on the map hull: dark dissolve into the granite void, plus a
 * warm sepia haze so the island edge reads as mist, not a cut line.
 */
export function drawMapRimMist(
  gfx: Phaser.GameObjects.Graphics,
  cols: number,
  rows: number,
  ox: number,
  oy: number,
): void {
  for (let ring = RIM_RINGS; ring >= 1; ring--) {
    const t = ring / RIM_RINGS;
    gfx.fillStyle(RIM_VOID, 0.06 + t * t * 0.24);
    paintRimRing(gfx, cols, rows, ox, oy, ring, 1.6);
  }
  for (let ring = 1; ring <= 3; ring++) {
    const inner = 1 - (ring - 1) / 3;
    gfx.fillStyle(RIM_HAZE, 0.04 + inner * 0.09);
    paintRimRing(gfx, cols, rows, ox, oy, ring, 4.2);
  }
}

export interface MountainBlob {
  cells: { x: number; y: number }[];
  hasPeak: boolean;
}

export function findMountainBlobs(map: Terrain[][]): MountainBlob[] {
  const rows = map.length;
  const cols = map[0]?.length ?? 0;
  const seen = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));
  const blobs: MountainBlob[] = [];
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (seen[y][x] || !isMountain(map[y][x])) continue;
      const cells: { x: number; y: number }[] = [];
      let hasPeak = false;
      const q = [{ x, y }];
      seen[y][x] = true;
      while (q.length > 0) {
        const c = q.pop()!;
        cells.push(c);
        if (map[c.y][c.x] === "mountain") hasPeak = true;
        for (const [dx, dy] of dirs) {
          const nx = c.x + dx;
          const ny = c.y + dy;
          if (ny < 0 || nx < 0 || ny >= rows || nx >= cols) continue;
          if (seen[ny][nx] || !isMountain(map[ny][nx])) continue;
          seen[ny][nx] = true;
          q.push({ x: nx, y: ny });
        }
      }
      blobs.push({ cells, hasPeak });
    }
  }
  return blobs;
}

export function isMountain(terrain: Terrain): terrain is "mountain" | "mountain_foot" {
  return terrain === "mountain" || terrain === "mountain_foot";
}

export function mountainRise(kind: "mountain" | "mountain_foot"): number {
  return MOUNTAIN_RISE[kind];
}

export function terrainElevation(terrain: Terrain): number {
  if (terrain === "mountain") return MOUNTAIN_RISE.mountain;
  if (terrain === "mountain_foot") return MOUNTAIN_RISE.mountain_foot;
  return 0;
}

function cellElevation(map: Terrain[][], x: number, y: number): number {
  const row = map[y];
  if (!row || x < 0 || x >= row.length) return 0;
  return terrainElevation(row[x]);
}

/** 0..1 hash stable per integer lattice point. */
function hash01(x: number, y: number): number {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/**
 * Elevation at the screen-top vertex of cell (vx, vy).
 * Shared by four neighbouring cells so adjacent mountains form one mass.
 * Peak vertices stay high (slope lives on foothills, not on every peak tile).
 */
export function isoVertexElevation(map: Terrain[][], vx: number, vy: number): number {
  const vals = [
    cellElevation(map, vx, vy),
    cellElevation(map, vx - 1, vy),
    cellElevation(map, vx, vy - 1),
    cellElevation(map, vx - 1, vy - 1),
  ];
  const raised = vals.filter((h) => h > 0);
  if (raised.length === 0) return 0;
  const hasPeak = vals.some((h) => h >= MOUNTAIN_RISE.mountain);
  const base = hasPeak ? raised.reduce((s, h) => s + h, 0) / raised.length : vals.reduce((s, h) => s + h, 0) / 4;
  return Math.max(0, base + (hash01(vx, vy) - 0.5) * 3);
}

export function mountainCellLift(map: Terrain[][], x: number, y: number): number {
  return (
    (isoVertexElevation(map, x, y) +
      isoVertexElevation(map, x + 1, y) +
      isoVertexElevation(map, x, y + 1) +
      isoVertexElevation(map, x + 1, y + 1)) /
    4
  );
}

function vertexTouchesFlat(map: Terrain[][], vx: number, vy: number): boolean {
  return (
    cellElevation(map, vx, vy) === 0 ||
    cellElevation(map, vx - 1, vy) === 0 ||
    cellElevation(map, vx, vy - 1) === 0 ||
    cellElevation(map, vx - 1, vy - 1) === 0
  );
}

function pt(x: number, y: number): Phaser.Geom.Point {
  return new Phaser.Geom.Point(x, y);
}

function lerpPt(
  a: Phaser.Geom.Point,
  b: Phaser.Geom.Point,
  t: number,
): Phaser.Geom.Point {
  return pt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
}

function shade(color: number, dim: boolean): number {
  if (!dim) return color;
  return Phaser.Display.Color.ValueToColor(color).darken(28).color;
}

function fillQuad(
  gfx: Phaser.GameObjects.Graphics,
  a: Phaser.Geom.Point,
  b: Phaser.Geom.Point,
  c: Phaser.Geom.Point,
  d: Phaser.Geom.Point,
  color: number,
): void {
  gfx.fillStyle(color, 1);
  gfx.fillPoints([a, b, c, d], true);
}

/**
 * Continuous mountain mass: interpolated corners, skirts only on exposed
 * edges, irregular ridges instead of per-tile cubes.
 */
export function drawMountainCell(
  gfx: Phaser.GameObjects.Graphics,
  map: Terrain[][],
  x: number,
  y: number,
  ox: number,
  oy: number,
  dim = false,
  volumeOnly = false,
): void {
  const { sx, sy } = isoTop(x, y, ox, oy);
  const hN = isoVertexElevation(map, x, y);
  const hE = isoVertexElevation(map, x + 1, y);
  const hW = isoVertexElevation(map, x, y + 1);
  const hS = isoVertexElevation(map, x + 1, y + 1);
  if (hN + hE + hW + hS <= 0) return;

  const jN = hash01(x, y);
  const jE = hash01(x + 1, y);
  const jW = hash01(x, y + 1);
  const jS = hash01(x + 1, y + 1);
  const edgeN = vertexTouchesFlat(map, x, y) ? 6 : 1;
  const edgeE = vertexTouchesFlat(map, x + 1, y) ? 6 : 1;
  const edgeW = vertexTouchesFlat(map, x, y + 1) ? 6 : 1;
  const edgeS = vertexTouchesFlat(map, x + 1, y + 1) ? 6 : 1;

  const N = pt(sx + (jN - 0.5) * edgeN, sy - hN + (jN - 0.5) * edgeN * 0.4);
  const E = pt(sx + HW + (jE - 0.5) * edgeE, sy + HH - hE + (jE - 0.5) * edgeE * 0.4);
  const S = pt(sx + (jS - 0.5) * edgeS, sy + TILE_H - hS + (jS - 0.5) * edgeS * 0.4);
  const W = pt(sx - HW + (jW - 0.5) * edgeW, sy + HH - hW + (jW - 0.5) * edgeW * 0.4);

  const gE = pt(sx + HW, sy + HH);
  const gS = pt(sx, sy + TILE_H);
  const gW = pt(sx - HW, sy + HH);

  const self = cellElevation(map, x, y);
  const neighX = cellElevation(map, x + 1, y);
  const neighY = cellElevation(map, x, y + 1);

  if (self > neighY + 1) {
    const midT = 0.35 + hash01(x, y + 17) * 0.3;
    const bulge = 3 + hash01(x + 3, y) * 6;
    const raisedMid = lerpPt(W, S, midT);
    raisedMid.x -= bulge;
    raisedMid.y += bulge * 0.35;
    const groundMid = lerpPt(gW, gS, midT);
    groundMid.x -= bulge * 0.7;
    fillQuad(gfx, W, raisedMid, groundMid, gW, shade(ROCK_LEFT, dim));
    fillQuad(gfx, raisedMid, S, gS, groundMid, shade(ROCK_LEFT + 0x080604, dim));
  }

  if (self > neighX + 1) {
    const midT = 0.35 + hash01(x + 11, y) * 0.3;
    const bulge = 3 + hash01(x, y + 5) * 6;
    const raisedMid = lerpPt(S, E, midT);
    raisedMid.x += bulge;
    raisedMid.y += bulge * 0.35;
    const groundMid = lerpPt(gS, gE, midT);
    groundMid.x += bulge * 0.7;
    fillQuad(gfx, S, raisedMid, groundMid, gS, shade(ROCK_RIGHT, dim));
    fillQuad(gfx, raisedMid, E, gE, groundMid, shade(ROCK_RIGHT + 0x0a0806, dim));
  }

  if (volumeOnly) return;

  gfx.fillStyle(shade(ROCK_TOP, dim), 1);
  gfx.fillTriangle(N.x, N.y, E.x, E.y, S.x, S.y);
  gfx.fillTriangle(N.x, N.y, S.x, S.y, W.x, W.y);

  const nMax =
    Math.max(
      cellElevation(map, x + 1, y),
      cellElevation(map, x - 1, y),
      cellElevation(map, x, y + 1),
      cellElevation(map, x, y - 1),
    );
  const isolatedPeak =
    self >= MOUNTAIN_RISE.mountain && nMax < self && hash01(x, y) > 0.45;
  if (isolatedPeak) {
    const tip = pt((N.x + E.x + S.x + W.x) / 4, Math.min(N.y, E.y, W.y) - 6 - hash01(x + 9, y) * 8);
    gfx.fillStyle(shade(ROCK_CRAG, dim), 1);
    gfx.fillTriangle(tip.x, tip.y, N.x, N.y, E.x, E.y);
    gfx.fillStyle(shade(ROCK_LEFT, dim), 1);
    gfx.fillTriangle(tip.x, tip.y, N.x, N.y, W.x, W.y);
  }
}

/** @deprecated Cube extrusion — used only if a caller has no map grid. */
export function drawMountainBlock(
  gfx: Phaser.GameObjects.Graphics,
  sx: number,
  sy: number,
  kind: "mountain" | "mountain_foot",
  _opts?: { skipTop?: boolean },
): void {
  const rise = MOUNTAIN_RISE[kind];
  const N = pt(sx, sy - rise);
  const E = pt(sx + HW, sy + HH - rise);
  const S = pt(sx, sy + TILE_H - rise);
  const W = pt(sx - HW, sy + HH - rise);
  const gE = pt(sx + HW, sy + HH);
  const gS = pt(sx, sy + TILE_H);
  const gW = pt(sx - HW, sy + HH);
  fillQuad(gfx, W, S, gS, gW, ROCK_LEFT);
  fillQuad(gfx, S, E, gE, gS, ROCK_RIGHT);
  gfx.fillStyle(ROCK_TOP, 1);
  gfx.fillPoints([N, E, S, W], true);
}
