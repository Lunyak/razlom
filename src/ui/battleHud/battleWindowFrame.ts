import Phaser from "phaser";
import { isUsableTexture } from "../raceFrameConstructor";
import { BATTLE_TURN_STRIP_H } from "../screenCharcoalFrame";
import { viewSize } from "../viewport";

/**
 * Compact turn-queue cell. Formation frames stay 160;
 * the strip must stay a small band, not a second row of full portraits.
 */
const TURN_CELL = 96;

export const BATTLE_WINDOW_KEY = "battle_window_frame";
export const BATTLE_WINDOW_ASSET: [string, string] = [
  BATTLE_WINDOW_KEY,
  "assets/ui/battle_window_frame.png",
];

/** Authored plate (Figma). Hole UV is relative to this. */
export const BATTLE_WINDOW_SRC = { w: 2560, h: 1400 } as const;
/** Inner opening measured on the 2560×1400 plate (flood from center). */
export const BATTLE_WINDOW_HOLE = { x: 60, y: 58, w: 2441, h: 1287 } as const;

const HOLE_UV = {
  x: BATTLE_WINDOW_HOLE.x / BATTLE_WINDOW_SRC.w,
  y: BATTLE_WINDOW_HOLE.y / BATTLE_WINDOW_SRC.h,
  w: BATTLE_WINDOW_HOLE.w / BATTLE_WINDOW_SRC.w,
  h: BATTLE_WINDOW_HOLE.h / BATTLE_WINDOW_SRC.h,
} as const;

/** Extra pad so HUD does not sit on the inner metal lip. */
const INNER_PAD = 8;
const HOLE_RGB = 12;
const HOLLOW_KEY = `${BATTLE_WINDOW_KEY}__hole`;
const OVERLAY_ID = "battle-window-overlay";

/** Packed gap between turn-queue cells — left-aligned, never justified. */
export const BATTLE_TURN_STRIP_GAP = 2;
export const BATTLE_TURN_STRIP_MIN = 72;
const STRIP_SIDE_PAD = 0;

/** Last known turn-queue length — strip height follows the fitted cell. */
let stripUnitCount = 12;

export function setBattleTurnStripCount(n: number): void {
  if (n > 0) stripUnitCount = n;
}

export type BattleInnerRect = { x: number; y: number; w: number; h: number };

export type BattleWindowFit = {
  x: number;
  y: number;
  w: number;
  h: number;
  scale: number;
};

export function battleWindowReady(scene: Phaser.Scene): boolean {
  return isUsableTexture(scene, BATTLE_WINDOW_KEY) || isUsableTexture(scene, HOLLOW_KEY);
}

/** Uniform cover — fill the view, crop the outer lip. Never squash the filigree. */
export function battleWindowFit(
  viewW: number,
  viewH: number,
  srcW: number = BATTLE_WINDOW_SRC.w,
  srcH: number = BATTLE_WINDOW_SRC.h,
): BattleWindowFit {
  const scale = Math.max(viewW / srcW, viewH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return {
    x: (viewW - w) / 2,
    y: (viewH - h) / 2,
    w,
    h,
    scale,
  };
}

/** Inner opening of the battle window at the current view size. */
export function battleInnerRect(viewW: number, viewH: number): BattleInnerRect {
  const fit = battleWindowFit(viewW, viewH);
  const x = Math.round(fit.x + HOLE_UV.x * fit.w) + INNER_PAD;
  const y = Math.round(fit.y + HOLE_UV.y * fit.h) + INNER_PAD;
  const w = Math.round(HOLE_UV.w * fit.w) - INNER_PAD * 2;
  const h = Math.round(HOLE_UV.h * fit.h) - INNER_PAD * 2;
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  return {
    x: x0,
    y: y0,
    w: Math.max(80, Math.min(viewW, x + w) - x0),
    h: Math.max(80, Math.min(viewH, y + h) - y0),
  };
}

/** One turn-queue cell: shrinks if the row is crowded, never larger than a formation frame. */
export function battleTurnFrameSize(bandW: number, unitCount = stripUnitCount): number {
  const n = Math.max(1, unitCount);
  const maxByW = Math.floor((bandW - STRIP_SIDE_PAD * 2 - BATTLE_TURN_STRIP_GAP * (n - 1)) / n);
  return Math.max(BATTLE_TURN_STRIP_MIN, Math.min(maxByW, TURN_CELL, BATTLE_TURN_STRIP_H));
}

/** Turn-order band = the unit frame that actually fits, not a reserved 220px slab. */
export function battleStripHeight(innerH: number, innerW = 1600): number {
  return Math.min(battleTurnFrameSize(innerW), Math.max(1, innerH));
}

/**
 * Punch the solid-black center to transparent via flood-fill.
 * Dark metal (≈50,50,49) stays; only the hole goes.
 */
export function ensureBattleWindowHollow(scene: Phaser.Scene): string | null {
  if (isUsableTexture(scene, HOLLOW_KEY)) return HOLLOW_KEY;
  if (!isUsableTexture(scene, BATTLE_WINDOW_KEY)) return null;
  if (scene.textures.exists(HOLLOW_KEY)) scene.textures.remove(HOLLOW_KEY);

  const src = scene.textures.get(BATTLE_WINDOW_KEY).getSourceImage() as
    | HTMLImageElement
    | HTMLCanvasElement;
  const w = Math.max(1, src.width);
  const h = Math.max(1, src.height);
  const work = document.createElement("canvas");
  work.width = w;
  work.height = h;
  const ctx = work.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(src, 0, 0, w, h);
  const image = ctx.getImageData(0, 0, w, h);
  punchBlackHole(image.data, w, h);
  ctx.putImageData(image, 0, 0);

  const canvas = scene.textures.createCanvas(HOLLOW_KEY, w, h);
  if (!canvas) return null;
  canvas.getContext().drawImage(work, 0, 0);
  canvas.refresh();
  return HOLLOW_KEY;
}

function isHolePixel(r: number, g: number, b: number, a: number): boolean {
  if (a < 16) return true;
  return r <= HOLE_RGB && g <= HOLE_RGB && b <= HOLE_RGB;
}

function punchBlackHole(data: Uint8ClampedArray, w: number, h: number): void {
  const start = (Math.floor(h / 2) * w + Math.floor(w / 2)) * 4;
  if (!isHolePixel(data[start], data[start + 1], data[start + 2], data[start + 3])) return;

  const seen = new Uint8Array(w * h);
  const stack = [Math.floor(w / 2), Math.floor(h / 2)];
  while (stack.length) {
    const y = stack.pop()!;
    const x = stack.pop()!;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    const i = y * w + x;
    if (seen[i]) continue;
    seen[i] = 1;
    const p = i * 4;
    if (!isHolePixel(data[p], data[p + 1], data[p + 2], data[p + 3])) continue;
    data[p + 3] = 0;
    stack.push(x + 1, y, x - 1, y, x, y + 1, x, y - 1);
  }
}

function hollowSource(scene: Phaser.Scene): HTMLImageElement | HTMLCanvasElement | null {
  const key = ensureBattleWindowHollow(scene);
  if (!key) return null;
  return scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
}

/**
 * Full-viewport gothic iron window.
 * Drawn as a DOM overlay on the canvas CSS box so FIT / retina do not
 * bilinear-stretch the plate twice. Phaser fallback if the overlay cannot mount.
 */
export class BattleWindowFrame {
  private readonly root: Phaser.GameObjects.Container;
  private plate?: Phaser.GameObjects.Image;
  private overlay?: HTMLImageElement;
  private readonly onResize = () => this.layout();

  constructor(private scene: Phaser.Scene) {
    this.root = scene.add.container(0, 0).setDepth(60).setScrollFactor(0);
    this.mountOverlay();
    this.rebuild();
    scene.scale.on("resize", this.onResize);
    window.addEventListener("resize", this.onResize);
    document.addEventListener("fullscreenchange", this.onResize);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  hasArt(): boolean {
    return battleWindowReady(this.scene);
  }

  layout(): void {
    this.rebuild();
  }

  destroy(): void {
    this.scene.scale.off("resize", this.onResize);
    window.removeEventListener("resize", this.onResize);
    document.removeEventListener("fullscreenchange", this.onResize);
    this.overlay?.remove();
    this.overlay = undefined;
    this.root.destroy(true);
  }

  private mountOverlay(): void {
    if (typeof document === "undefined") return;
    document.getElementById(OVERLAY_ID)?.remove();
    const parent = this.scene.game.canvas?.parentElement;
    if (!parent) return;
    if (getComputedStyle(parent).position === "static") {
      parent.style.position = "relative";
    }
    const img = document.createElement("img");
    img.id = OVERLAY_ID;
    img.alt = "";
    img.draggable = false;
    img.style.position = "absolute";
    img.style.pointerEvents = "none";
    img.style.zIndex = "8";
    img.style.objectFit = "cover";
    img.style.imageRendering = "auto";
    img.style.userSelect = "none";
    parent.appendChild(img);
    this.overlay = img;
  }

  private syncOverlayRect(): void {
    const img = this.overlay;
    const canvas = this.scene.game.canvas;
    const parent = canvas?.parentElement;
    if (!img || !canvas || !parent) return;
    const cr = canvas.getBoundingClientRect();
    const pr = parent.getBoundingClientRect();
    img.style.left = `${cr.left - pr.left}px`;
    img.style.top = `${cr.top - pr.top}px`;
    img.style.width = `${cr.width}px`;
    img.style.height = `${cr.height}px`;
  }

  private ensureOverlaySrc(src: HTMLImageElement | HTMLCanvasElement): void {
    const img = this.overlay;
    if (!img || img.src) return;
    if (src instanceof HTMLCanvasElement) {
      img.src = src.toDataURL("image/png");
      return;
    }
    const w = Math.max(1, src.width);
    const h = Math.max(1, src.height);
    const work = document.createElement("canvas");
    work.width = w;
    work.height = h;
    const ctx = work.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(src, 0, 0);
    img.src = work.toDataURL("image/png");
  }

  private rebuild(): void {
    if (!this.root.active) return;
    this.root.removeAll(true);
    this.plate = undefined;
    const src = hollowSource(this.scene);
    if (!src) return;

    this.ensureOverlaySrc(src);
    this.syncOverlayRect();

    if (this.overlay) {
      this.overlay.style.display = "block";
      return;
    }

    const { w, h } = viewSize(this.scene);
    const fit = battleWindowFit(w, h, src.width || BATTLE_WINDOW_SRC.w, src.height || BATTLE_WINDOW_SRC.h);
    const key = ensureBattleWindowHollow(this.scene);
    if (!key) return;
    this.plate = this.scene.add.image(fit.x, fit.y, key).setOrigin(0, 0).setScrollFactor(0);
    this.plate.setDisplaySize(fit.w, fit.h);
    this.root.add(this.plate);
  }
}
