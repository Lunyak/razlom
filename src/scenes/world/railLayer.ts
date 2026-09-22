/**
 * Iso rail overlay: gravel-bed sprites between neighbouring tiles.
 */
import type { FactionId, GameState, RailTile } from "../../game/data";
import { ensureRails, isRailhead, type GridCell } from "../../game/rails";
import { ensureCutout } from "../../game/chromaCutout";
import { HH, HW, TILE_H, TILE_W, isoCenter, isoDiamondPoints, isoDrawOrder, isoTop } from "../../game/iso";
import {
  pickRailOverlayKey,
  railPieceFromMask,
  type RailPiece,
} from "../../game/terrainArt";

const BED = 0x3a3428;
const IRON = 0x8a8478;
const IRON_LIT = 0xc4b89a;
const PREVIEW = 0xe8d5a3;
const STATION = 0xc9a227;

const ORTHO: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export interface RailLayerView {
  state: GameState;
  ox: number;
  oy: number;
  fog?: boolean[][];
  preview?: GridCell[];
  previewDest?: GridCell;
}

function visible(fog: boolean[][] | undefined, x: number, y: number): boolean {
  if (!fog) return true;
  return !!fog[y]?.[x];
}

function railOrHead(
  state: GameState,
  x: number,
  y: number,
  owner: FactionId,
  mapId: string,
): boolean {
  if (isRailhead(state, x, y, owner, mapId)) return true;
  return ensureRails(state).some((r) => r.mapId === mapId && r.x === x && r.y === y && r.owner === owner);
}

function railMask(
  state: GameState,
  x: number,
  y: number,
  owner: FactionId,
  mapId: string,
): number {
  let mask = 0;
  ORTHO.forEach(([dx, dy], i) => {
    if (railOrHead(state, x + dx, y + dy, owner, mapId)) mask |= 1 << i;
  });
  return mask;
}

function railFlip(piece: RailPiece, mask: number): { flipX: boolean; flipY: boolean } {
  if (piece === "end") {
    if (mask & 1) return { flipX: false, flipY: false };
    if (mask & 2) return { flipX: true, flipY: true };
    if (mask & 4) return { flipX: true, flipY: false };
    if (mask & 8) return { flipX: false, flipY: true };
    return { flipX: false, flipY: false };
  }
  if (piece === "tee_ne") return { flipX: false, flipY: (mask & 8) !== 0 && (mask & 4) === 0 };
  if (piece === "tee_nw") return { flipX: (mask & 2) !== 0 && (mask & 1) === 0, flipY: false };
  return {
    flipX: (mask & 2) !== 0 && (mask & 1) === 0,
    flipY: (mask & 8) !== 0 && (mask & 4) === 0,
  };
}

function railSpriteSize(piece: RailPiece): { w: number; h: number } {
  if (piece === "cross") return { w: TILE_W * 1.38, h: TILE_H * 1.32 };
  if (piece === "tee_ne" || piece === "tee_nw") return { w: TILE_W * 1.36, h: TILE_H * 1.28 };
  if (piece === "ell") return { w: TILE_W * 1.28, h: TILE_H * 1.22 };
  if (piece === "end") return { w: TILE_W * 1.12, h: TILE_H * 1.12 };
  return { w: TILE_W * 1.18, h: TILE_H * 1.08 };
}

function drawBed(
  gfx: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  ox: number,
  oy: number,
  color: number,
  alpha: number,
): void {
  const { sx, sy } = isoTop(x, y, ox, oy);
  gfx.fillStyle(color, alpha);
  gfx.fillPoints(isoDiamondPoints(sx, sy, -6), true);
}

function drawLink(
  gfx: Phaser.GameObjects.Graphics,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  ox: number,
  oy: number,
  color: number,
  alpha: number,
): void {
  const a = isoCenter(ax, ay, ox, oy);
  const b = isoCenter(bx, by, ox, oy);
  const mx = (a.cx + b.cx) / 2;
  const my = (a.cy + b.cy) / 2;
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const len = Math.hypot(dx, dy) || 1;
  const px = (-dy / len) * 3.2;
  const py = (dx / len) * 3.2;
  gfx.lineStyle(2.2, color, alpha);
  gfx.beginPath();
  gfx.moveTo(a.cx + px, a.cy + py);
  gfx.lineTo(mx + px, my + py);
  gfx.moveTo(a.cx - px, a.cy - py);
  gfx.lineTo(mx - px, my - py);
  gfx.strokePath();
}

function paintFallbackTile(
  gfx: Phaser.GameObjects.Graphics,
  state: GameState,
  rail: RailTile,
  ox: number,
  oy: number,
  fog: boolean[][] | undefined,
  mapId: string,
): void {
  drawBed(gfx, rail.x, rail.y, ox, oy, BED, 0.72);
  gfx.lineStyle(1.2, IRON, 0.85);
  const { sx, sy } = isoTop(rail.x, rail.y, ox, oy);
  gfx.strokePoints(isoDiamondPoints(sx, sy, -7), true);
  for (const [dx, dy] of ORTHO) {
    const nx = rail.x + dx;
    const ny = rail.y + dy;
    if (!railOrHead(state, nx, ny, rail.owner, mapId)) continue;
    if (!visible(fog, nx, ny) && !isRailhead(state, nx, ny, rail.owner, mapId)) continue;
    drawLink(gfx, rail.x, rail.y, nx, ny, ox, oy, IRON_LIT, 0.95);
  }
}

function paintStations(
  gfx: Phaser.GameObjects.Graphics,
  state: GameState,
  ox: number,
  oy: number,
  fog: boolean[][] | undefined,
  mapId: string,
): void {
  for (const city of state.cities) {
    if (city.mapId !== mapId || !city.faction || !visible(fog, city.x, city.y)) continue;
    const hooked = ORTHO.some(([dx, dy]) =>
      railOrHead(state, city.x + dx, city.y + dy, city.faction!, mapId),
    );
    if (!hooked) continue;
    const { cx, cy } = isoCenter(city.x, city.y, ox, oy);
    gfx.fillStyle(STATION, 0.9);
    gfx.fillRect(cx - 3, cy + HH * 0.15, 6, 4);
    gfx.lineStyle(1, 0x1a1008, 0.7);
    gfx.strokeRect(cx - 3, cy + HH * 0.15, 6, 4);
  }
}

function paintPreview(
  gfx: Phaser.GameObjects.Graphics,
  view: RailLayerView,
): void {
  const { ox, oy, fog, preview, previewDest } = view;
  if (preview?.length) {
    for (const tile of preview) {
      if (!visible(fog, tile.x, tile.y)) continue;
      drawBed(gfx, tile.x, tile.y, ox, oy, PREVIEW, 0.42);
    }
    for (let i = 1; i < preview.length; i++) {
      const a = preview[i - 1];
      const b = preview[i];
      drawLink(gfx, a.x, a.y, b.x, b.y, ox, oy, PREVIEW, 0.9);
    }
  }
  if (previewDest && visible(fog, previewDest.x, previewDest.y)) {
    const { cx, cy } = isoCenter(previewDest.x, previewDest.y, ox, oy);
    gfx.lineStyle(2, PREVIEW, 0.95);
    gfx.strokeCircle(cx, cy, HW * 0.28);
  }
}

export class RailLayer {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly images: Phaser.GameObjects.Image[] = [];
  private readonly gfx: Phaser.GameObjects.Graphics;
  private imageUsed = 0;

  constructor(scene: Phaser.Scene, depth = 2.8) {
    this.scene = scene;
    this.root = scene.add.container(0, 0).setDepth(depth);
    this.gfx = scene.add.graphics();
    this.root.add(this.gfx);
  }

  redraw(view: RailLayerView): void {
    this.imageUsed = 0;
    this.gfx.clear();
    const { state, ox, oy, fog } = view;
    const mapId = state.currentMapId;
    const rails = ensureRails(state)
      .filter((rail) => rail.mapId === mapId && visible(fog, rail.x, rail.y))
      .sort(isoDrawOrder);

    for (const rail of rails) {
      const mask = railMask(state, rail.x, rail.y, rail.owner, mapId);
      const piece = railPieceFromMask(mask);
      const { cx, cy } = isoCenter(rail.x, rail.y, ox, oy);
      const size = railSpriteSize(piece);
      const flip = railFlip(piece, mask);
      if (!this.placeSprite(pickRailOverlayKey(piece), cx, cy, size.w, size.h, flip.flipX, flip.flipY)) {
        paintFallbackTile(this.gfx, state, rail, ox, oy, fog, mapId);
      }
    }

    paintStations(this.gfx, state, ox, oy, fog, mapId);
    paintPreview(this.gfx, view);
    this.hideSpareImages();
  }

  private placeSprite(
    srcKey: string,
    cx: number,
    cy: number,
    displayW: number,
    displayH: number,
    flipX: boolean,
    flipY: boolean,
  ): boolean {
    const cut = ensureCutout(this.scene, srcKey);
    if (!cut) return false;
    let img = this.images[this.imageUsed];
    if (!img) {
      img = this.scene.add.image(cx, cy, cut);
      this.root.add(img);
      this.images.push(img);
    } else {
      img.setTexture(cut).setPosition(cx, cy).setVisible(true);
    }
    img.setOrigin(0.5, 0.5);
    img.clearTint();
    img.setAlpha(1);
    img.setRotation(0);
    img.setFlip(flipX, flipY);
    img.setDisplaySize(displayW, displayH);
    this.root.bringToTop(img);
    this.imageUsed += 1;
    return true;
  }

  private hideSpareImages(): void {
    for (let i = this.imageUsed; i < this.images.length; i++) {
      this.images[i].setVisible(false);
    }
    this.root.bringToTop(this.gfx);
  }
}
