import type Phaser from "phaser";

/**
 * Screen-space hit routing for Phaser UIs.
 *
 * Why this exists
 * ---------------
 * Nested `Container` + `setInteractive` often misses clicks (letterboxing,
 * camera zoom, overlapping HUD). Ad-hoc hit boxes kept breaking
 * (recruits worked, heal didn't, etc.).
 *
 * Rule for modal / HUD UI
 * -----------------------
 * - Draw with scrollFactor(0) in screen coordinates.
 * - Never rely on nested Container interactivity for important actions.
 * - Register flat screen rects here; one dispatcher handles pointerdown.
 *
 * World/map tiles can still use Phaser interactivity (camera space).
 */

export type ScreenRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export function pointInRect(x: number, y: number, r: ScreenRect): boolean {
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
}

export function rectFromCenter(cx: number, cy: number, w: number, h: number): ScreenRect {
  const hw = w / 2;
  const hh = h / 2;
  return { left: cx - hw, top: cy - hh, right: cx + hw, bottom: cy + hh };
}

export function rectFromXY(x: number, y: number, w: number, h: number): ScreenRect {
  return { left: x, top: y, right: x + w, bottom: y + h };
}

/** Opaque enough to swallow a map click (anti-aliased frame edges stay solid). */
export const HUD_ALPHA_SOLID = 24;

/** Sample a scrollFactor-0 image at screen pixels. 0 if outside or unreadable. */
export function hudImageAlphaAt(
  img: Phaser.GameObjects.Image,
  screenX: number,
  screenY: number,
): number {
  const dw = img.displayWidth;
  const dh = img.displayHeight;
  if (dw <= 0 || dh <= 0 || !img.visible) return 0;
  const left = img.x - img.originX * dw;
  const top = img.y - img.originY * dh;
  const lx = screenX - left;
  const ly = screenY - top;
  if (lx < 0 || ly < 0 || lx >= dw || ly >= dh) return 0;
  const frame = img.frame;
  const fx = (lx / dw) * frame.width;
  const fy = (ly / dh) * frame.height;
  const alpha = img.texture.manager.getPixelAlpha(
    Math.floor(fx),
    Math.floor(fy),
    img.texture.key,
    frame.name,
  );
  return alpha ?? 0;
}

/** World sidebar icons + battle bag sit here. Modals must not treat this as "click outside". */
let leftHudRect: ScreenRect | null = { left: 16, top: 572, right: 184, bottom: 640 };

export function setLeftHudRect(rect: ScreenRect | null): void {
  leftHudRect = rect;
}

export function isLeftHudClick(x: number, y: number): boolean {
  return leftHudRect ? pointInRect(x, y, leftHudRect) : false;
}

export interface ScreenHit {
  id: string;
  rect: ScreenRect;
  /** Higher wins when rects overlap. Default 0. */
  z?: number;
  data?: unknown;
  onDown?: (pointer: Phaser.Input.Pointer, hit: ScreenHit) => void;
}

export class ScreenHitRouter {
  private hits: ScreenHit[] = [];

  clear(): void {
    this.hits = [];
  }

  setAll(hits: ScreenHit[]): void {
    this.hits = hits.map((h) => ({ ...h, z: h.z ?? 0 }));
  }

  add(hit: ScreenHit): void {
    this.hits.push({ ...hit, z: hit.z ?? 0 });
  }

  pick(x: number, y: number): ScreenHit | null {
    let best: ScreenHit | null = null;
    for (const h of this.hits) {
      if (!pointInRect(x, y, h.rect)) continue;
      if (!best || (h.z ?? 0) > (best.z ?? 0)) best = h;
    }
    return best;
  }

  /** @returns true if a registered hit handled the press */
  dispatch(pointer: Phaser.Input.Pointer): boolean {
    if (!pointer.leftButtonDown()) return false;
    const hit = this.pick(pointer.x, pointer.y);
    if (!hit) return false;
    hit.onDown?.(pointer, hit);
    return true;
  }
}
