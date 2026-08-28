import Phaser from "phaser";
import { isUsableTexture } from "./raceFrameConstructor";

/**
 * Viewport chrome from a PNG plate: **four corners only**, no rails.
 *
 * Never `setDisplaySize` the whole plate (corners smear).
 * Never NineSlice here — that is what draws the stretching rails.
 * Each corner is cropped from the source and scaled uniformly.
 */
export interface FrameSlice {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const SCREEN_FRAME_SLICES: Record<string, FrameSlice> = {
  screen_frame_folk: { left: 96, right: 96, top: 96, bottom: 120 },
  screen_frame_charcoal: { left: 220, right: 220, top: 200, bottom: 250 },
  screen_frame_moderne: { left: 200, right: 200, top: 190, bottom: 190 },
  screen_frame_thorn: { left: 180, right: 180, top: 160, bottom: 180 },
};

export function addHollowArtFrame(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  key: string,
  w: number,
  h: number,
  slice: FrameSlice,
): boolean {
  if (!isUsableTexture(scene, key)) return false;
  return tryCornerFrame(scene, parent, key, w, h, slice);
}

function srcSize(scene: Phaser.Scene, key: string): { sw: number; sh: number } | null {
  const tex = scene.textures.get(key);
  const src = tex?.getSourceImage() as HTMLImageElement | HTMLCanvasElement | undefined;
  const sw = src && "width" in src ? src.width : 0;
  const sh = src && "height" in src ? src.height : 0;
  if (sw < 16 || sh < 16) return null;
  return { sw, sh };
}

function addFrame(
  tex: Phaser.Textures.Texture,
  name: string,
  x: number,
  y: number,
  fw: number,
  fh: number,
  sw: number,
  sh: number,
): string | null {
  const px = Math.max(0, Math.round(x));
  const py = Math.max(0, Math.round(y));
  const pw = Math.min(Math.round(fw), sw - px);
  const ph = Math.min(Math.round(fh), sh - py);
  if (pw < 1 || ph < 1) return null;
  if (!tex.has(name)) tex.add(name, 0, px, py, pw, ph);
  return name;
}

function put(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  key: string,
  frame: string | null,
  x: number,
  y: number,
  dw: number,
  dh: number,
): void {
  if (!frame || dw < 1 || dh < 1) return;
  const img = scene.add.image(x, y, key, frame).setOrigin(0, 0).setScrollFactor(0);
  img.setDisplaySize(dw, dh);
  parent.add(img);
}

function tryCornerFrame(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  key: string,
  w: number,
  h: number,
  slice: FrameSlice,
): boolean {
  const size = srcSize(scene, key);
  if (!size) return false;
  const { sw, sh } = size;
  const left = Math.min(slice.left, Math.floor(sw * 0.42));
  const right = Math.min(slice.right, Math.floor(sw * 0.42));
  const top = Math.min(slice.top, Math.floor(sh * 0.42));
  const bottom = Math.min(slice.bottom, Math.floor(sh * 0.42));
  if (left < 8 || right < 8 || top < 8 || bottom < 8) return false;

  const tex = scene.textures.get(key);
  const p = `${key}__c${left}x${top}_`;
  const tl = addFrame(tex, `${p}tl`, 0, 0, left, top, sw, sh);
  const tr = addFrame(tex, `${p}tr`, sw - right, 0, right, top, sw, sh);
  const bl = addFrame(tex, `${p}bl`, 0, sh - bottom, left, bottom, sw, sh);
  const br = addFrame(tex, `${p}br`, sw - right, sh - bottom, right, bottom, sw, sh);

  const s = Math.min(w / sw, h / sh);
  const L = Math.round(left * s);
  const R = Math.round(right * s);
  const T = Math.round(top * s);
  const B = Math.round(bottom * s);
  if (L + R >= w - 8 || T + B >= h - 8) return false;

  put(scene, parent, key, tl, 0, 0, L, T);
  put(scene, parent, key, tr, w - R, 0, R, T);
  put(scene, parent, key, bl, 0, h - B, L, B);
  put(scene, parent, key, br, w - R, h - B, R, B);
  return true;
}
