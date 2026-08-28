/**
 * Magenta (#FF00FF) chroma-key → transparent Phaser texture, then crop empty edges.
 * Shared by terrain overlays and map city/army tokens.
 */
import Phaser from "phaser";
import { isUsableTexture } from "../ui/raceFrameConstructor";

function isMagenta(r: number, g: number, b: number): boolean {
  return r > 170 && b > 170 && g < 130 && r - g > 50 && b - g > 50;
}

function keyMagenta(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (isMagenta(r, g, b)) {
      data[i + 3] = 0;
    } else {
      const mag = (r + b) / 2 - g;
      if (r > 150 && b > 150 && g < 150 && mag > 35) {
        data[i + 3] = Math.max(0, Math.round(data[i + 3] * (1 - mag / 180)));
      }
    }
  }
}

function opaqueBounds(data: Uint8ClampedArray, w: number, h: number): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} | null {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] < 10) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  const pad = 2;
  return {
    minX: Math.max(0, minX - pad),
    minY: Math.max(0, minY - pad),
    maxX: Math.min(w - 1, maxX + pad),
    maxY: Math.min(h - 1, maxY + pad),
  };
}

export function ensureCutout(scene: Phaser.Scene, srcKey: string): string | null {
  const destKey = `${srcKey}__cut`;
  if (scene.textures.exists(destKey) && isUsableTexture(scene, destKey)) return destKey;
  if (!isUsableTexture(scene, srcKey)) return null;
  if (scene.textures.exists(destKey)) scene.textures.remove(destKey);

  const srcImg = scene.textures.get(srcKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const w = Math.max(1, srcImg.width);
  const h = Math.max(1, srcImg.height);

  const work = document.createElement("canvas");
  work.width = w;
  work.height = h;
  const workCtx = work.getContext("2d");
  if (!workCtx) return null;
  workCtx.clearRect(0, 0, w, h);
  workCtx.drawImage(srcImg, 0, 0, w, h);
  const imageData = workCtx.getImageData(0, 0, w, h);
  const data = imageData.data;

  const cornerAlpha = (x: number, y: number) => data[(y * w + x) * 4 + 3];
  const transparentCorners =
    (cornerAlpha(0, 0) < 16 ? 1 : 0) +
    (cornerAlpha(w - 1, 0) < 16 ? 1 : 0) +
    (cornerAlpha(0, h - 1) < 16 ? 1 : 0) +
    (cornerAlpha(w - 1, h - 1) < 16 ? 1 : 0);

  if (transparentCorners < 3) keyMagenta(data);
  workCtx.putImageData(imageData, 0, 0);

  const box = opaqueBounds(data, w, h);
  const dw = box ? box.maxX - box.minX + 1 : w;
  const dh = box ? box.maxY - box.minY + 1 : h;
  const sx = box?.minX ?? 0;
  const sy = box?.minY ?? 0;

  const canvas = scene.textures.createCanvas(destKey, dw, dh);
  if (!canvas) return null;
  const ctx = canvas.getContext();
  ctx.clearRect(0, 0, dw, dh);
  ctx.drawImage(work, sx, sy, dw, dh, 0, 0, dw, dh);
  canvas.refresh();
  return destKey;
}

function opaqueBoundsIn(
  data: Uint8ClampedArray,
  imgW: number,
  x0: number,
  y0: number,
  rw: number,
  rh: number,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = x0 + rw;
  let minY = y0 + rh;
  let maxX = -1;
  let maxY = -1;
  const x1 = x0 + rw;
  const y1 = y0 + rh;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (data[(y * imgW + x) * 4 + 3] < 10) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * Magenta-key a frame grid, pack each cell tight around the figure (shared
 * size, feet aligned) so walk tokens match idle scale.
 */
export function ensureFrameStrip(
  scene: Phaser.Scene,
  srcKey: string,
  frames: number,
  columns?: number,
): string | null {
  const count = Math.max(1, frames);
  const cols = Math.max(1, columns ?? count);
  const rows = Math.max(1, Math.ceil(count / cols));
  const destKey = `${srcKey}__strip${count}c${cols}_v4`;
  if (scene.textures.exists(destKey) && isUsableTexture(scene, destKey)) return destKey;
  if (!isUsableTexture(scene, srcKey)) return null;
  if (scene.textures.exists(destKey)) scene.textures.remove(destKey);

  const srcImg = scene.textures.get(srcKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const w = Math.max(1, srcImg.width);
  const h = Math.max(1, srcImg.height);
  const cellW = Math.max(1, Math.floor(w / cols));
  const cellH = Math.max(1, Math.floor(h / rows));
  const usableW = cellW * cols;
  const usableH = cellH * rows;

  const work = document.createElement("canvas");
  work.width = usableW;
  work.height = usableH;
  const workCtx = work.getContext("2d");
  if (!workCtx) return null;
  workCtx.clearRect(0, 0, usableW, usableH);
  workCtx.drawImage(srcImg, 0, 0, usableW, usableH, 0, 0, usableW, usableH);
  const imageData = workCtx.getImageData(0, 0, usableW, usableH);
  keyMagenta(imageData.data);
  workCtx.putImageData(imageData, 0, 0);

  const pad = 2;
  const boxes: ({ minX: number; minY: number; maxX: number; maxY: number } | null)[] = [];
  let packW = 1;
  let packH = 1;
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const box = opaqueBoundsIn(imageData.data, usableW, col * cellW, row * cellH, cellW, cellH);
    boxes.push(box);
    if (!box) continue;
    packW = Math.max(packW, box.maxX - box.minX + 1);
    packH = Math.max(packH, box.maxY - box.minY + 1);
  }
  packW += pad * 2;
  packH += pad * 2;

  const canvas = scene.textures.createCanvas(destKey, packW * count, packH);
  if (!canvas) return null;
  const ctx = canvas.getContext();
  ctx.clearRect(0, 0, packW * count, packH);
  for (let i = 0; i < count; i++) {
    const box = boxes[i];
    if (!box) continue;
    const bw = box.maxX - box.minX + 1;
    const bh = box.maxY - box.minY + 1;
    const dx = i * packW + Math.floor((packW - bw) / 2);
    const dy = packH - pad - bh;
    ctx.drawImage(work, box.minX, box.minY, bw, bh, dx, dy, bw, bh);
  }
  canvas.refresh();

  const tex = scene.textures.get(destKey);
  for (let i = 0; i < count; i++) {
    const name = String(i);
    if (tex.has(name)) tex.remove(name);
    tex.add(name, 0, i * packW, 0, packW, packH);
  }
  return destKey;
}
