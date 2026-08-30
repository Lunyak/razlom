/**
 * World-map weather: drifting wet-plate clouds and ground fog on the iso hull.
 * Procedural canvas textures — no extra assets. Cream/sepia only (not frost).
 */
import Phaser from "phaser";
import { session } from "../../game/data";
import { isNight } from "../../game/dayNight";
import { isoCenter, isoMapBounds, mapRimDistance } from "../../game/iso";

/** Warm soot multiply — wet collodion, never ice-blue. */
const NIGHT_TINT = 0x3a322c;
const NIGHT_FOG_ALPHA = 1.55;

const CLOUD_DEPTH = 7.65;
const FOG_DEPTH = 2.18;

const TEX = {
  cloudA: "__wx_cloud_a2",
  cloudB: "__wx_cloud_b2",
  cloudC: "__wx_cloud_c2",
  wispA: "__wx_wisp_a2",
  wispB: "__wx_wisp_b2",
  bank: "__wx_bank2",
} as const;

type DriftKind = "cloud" | "wisp" | "bank";

interface DriftSprite {
  img: Phaser.GameObjects.Image;
  kind: DriftKind;
  vx: number;
  vy: number;
  baseAlpha: number;
  baseScale: number;
  phase: number;
  pulse: number;
  ax: number;
  ay: number;
}

interface WrapBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
  w: number;
  h: number;
}

export class MapAtmosphere {
  private readonly fogRoot: Phaser.GameObjects.Container;
  private readonly cloudRoot: Phaser.GameObjects.Container;
  private sprites: DriftSprite[] = [];
  private wrap: WrapBox = { left: 0, top: 0, right: 0, bottom: 0, w: 1, h: 1 };
  private layoutKey = "";
  private elapsed = 0;
  private night = false;

  constructor(private readonly scene: Phaser.Scene) {
    ensureWeatherTextures(scene);
    this.fogRoot = scene.add.container(0, 0).setDepth(FOG_DEPTH);
    this.cloudRoot = scene.add.container(0, 0).setDepth(CLOUD_DEPTH);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.tick, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  /** Wet-collodion night: multiply soot tint, denser ground fog. Not frost. */
  setNight(night: boolean): void {
    this.night = night;
    this.applyNightLook();
  }

  layout(cols: number, rows: number, ox: number, oy: number): void {
    const key = `${cols}x${rows}:${Math.round(ox)}:${Math.round(oy)}`;
    if (key === this.layoutKey && this.sprites.length > 0) {
      this.syncPhaseFromSession();
      return;
    }
    this.layoutKey = key;

    const bounds = isoMapBounds(cols, rows, ox, oy);
    const pad = 320;
    this.wrap = {
      left: bounds.left - pad,
      top: bounds.top - pad,
      right: bounds.left + bounds.w + pad,
      bottom: bounds.top + bounds.h + pad,
      w: bounds.w + pad * 2,
      h: bounds.h + pad * 2,
    };

    this.fogRoot.removeAll(true);
    this.cloudRoot.removeAll(true);
    this.sprites = [];

    const rand = rng(cols * 7919 + rows * 104729);
    this.spawnBanks(cols, rows, ox, oy, rand);
    this.spawnWisps(cols, rows, ox, oy, rand);
    this.spawnClouds(cols, rows, ox, oy, rand);
    this.syncPhaseFromSession();
  }

  private syncPhaseFromSession(): void {
    const state = session.state;
    if (!state) return;
    this.setNight(isNight(state));
  }

  private applyNightLook(): void {
    for (const s of this.sprites) {
      if (!s.img.active) continue;
      if (this.night) s.img.setTint(NIGHT_TINT);
      else s.img.clearTint();
    }
  }

  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.tick, this);
    if (this.fogRoot.scene) this.fogRoot.destroy(true);
    if (this.cloudRoot.scene) this.cloudRoot.destroy(true);
    this.sprites = [];
    this.layoutKey = "";
  }

  private spawnClouds(
    cols: number,
    rows: number,
    ox: number,
    oy: number,
    rand: () => number,
  ): void {
    const keys = [TEX.cloudA, TEX.cloudB, TEX.cloudC];
    const n = 12;
    for (let i = 0; i < n; i++) {
      const high = i < 7;
      const key = keys[i % keys.length];
      const img = this.scene.add.image(0, 0, key);
      const scale = (high ? 1.35 : 0.95) + rand() * 0.7;
      img.setScale(scale);
      img.setScrollFactor(1);
      this.cloudRoot.add(img);
      const gx = Math.floor(rand() * cols);
      const gy = Math.floor(rand() * rows);
      const { cx, cy } = isoCenter(gx, gy, ox, oy);
      img.setPosition(cx + (rand() - 0.5) * 90, cy - 40 - rand() * 70);
      const baseAlpha = high ? 0.2 + rand() * 0.1 : 0.26 + rand() * 0.1;
      img.setAlpha(baseAlpha);
      this.sprites.push({
        img,
        kind: "cloud",
        vx: (high ? 9 : 16) + rand() * (high ? 8 : 12),
        vy: (high ? 2.2 : 4) + rand() * 2.8,
        baseAlpha,
        baseScale: scale,
        phase: rand() * Math.PI * 2,
        pulse: 0.16 + rand() * 0.14,
        ax: 0,
        ay: 0,
      });
    }
  }

  private spawnWisps(
    cols: number,
    rows: number,
    ox: number,
    oy: number,
    rand: () => number,
  ): void {
    const cells: { x: number; y: number }[] = [];
    for (let ring = 1; ring <= 3; ring++) {
      for (let y = -ring; y < rows + ring; y++) {
        for (let x = -ring; x < cols + ring; x++) {
          if (mapRimDistance(x, y, cols, rows) === ring) cells.push({ x, y });
        }
      }
    }
    const count = Math.min(14, Math.max(8, Math.round(cells.length / 18)));
    const step = Math.max(1, Math.floor(cells.length / count));
    const keys = [TEX.wispA, TEX.wispB];
    for (let i = 0; i < count; i++) {
      const cell = cells[(i * step + Math.floor(rand() * step)) % cells.length];
      if (!cell) continue;
      const { cx, cy } = isoCenter(cell.x, cell.y, ox, oy);
      const img = this.scene.add.image(cx, cy, keys[i % keys.length]);
      const scale = 0.85 + rand() * 0.55;
      img.setScale(scale);
      img.setAlpha(0.34);
      img.setRotation((rand() - 0.5) * 0.5);
      this.fogRoot.add(img);
      this.sprites.push({
        img,
        kind: "wisp",
        vx: 0,
        vy: 0,
        baseAlpha: 0.32 + rand() * 0.14,
        baseScale: scale,
        phase: rand() * Math.PI * 2,
        pulse: 0.28 + rand() * 0.22,
        ax: cx,
        ay: cy,
      });
    }
  }

  private spawnBanks(
    cols: number,
    rows: number,
    ox: number,
    oy: number,
    rand: () => number,
  ): void {
    const midX = (cols - 1) / 2;
    const midY = (rows - 1) / 2;
    const { cx: mx, cy: my } = isoCenter(midX, midY, ox, oy);
    const hull = [
      { x: 0, y: 0 },
      { x: cols - 1, y: 0 },
      { x: cols - 1, y: rows - 1 },
      { x: 0, y: rows - 1 },
      { x: Math.floor(midX), y: 0 },
      { x: cols - 1, y: Math.floor(midY) },
      { x: Math.floor(midX), y: rows - 1 },
      { x: 0, y: Math.floor(midY) },
    ];
    for (const cell of hull) {
      const { cx, cy } = isoCenter(cell.x, cell.y, ox, oy);
      const dx = cx - mx;
      const dy = cy - my;
      const len = Math.hypot(dx, dy) || 1;
      const ax = cx + (dx / len) * 56;
      const ay = cy + (dy / len) * 36;
      const img = this.scene.add.image(ax, ay, TEX.bank);
      const scale = 1.35 + rand() * 0.7;
      img.setScale(scale);
      img.setAlpha(0.36);
      img.setRotation((rand() - 0.5) * 0.35);
      this.fogRoot.add(img);
      this.sprites.push({
        img,
        kind: "bank",
        vx: 0,
        vy: 0,
        baseAlpha: 0.34 + rand() * 0.12,
        baseScale: scale,
        phase: rand() * Math.PI * 2,
        pulse: 0.12 + rand() * 0.1,
        ax,
        ay,
      });
    }
  }

  private tick(_time: number, delta: number): void {
    if (this.sprites.length === 0) return;
    this.syncPhaseFromSession();
    this.elapsed += delta / 1000;
    const t = this.elapsed;
    for (const s of this.sprites) {
      if (!s.img.active) continue;
      const breathe = 0.82 + 0.18 * Math.sin(t * s.pulse + s.phase);
      const fogLift = this.night && s.kind !== "cloud" ? NIGHT_FOG_ALPHA : 1;
      s.img.setAlpha(Math.min(0.88, s.baseAlpha * breathe * fogLift));
      if (s.kind === "cloud") {
        s.img.x += s.vx * (delta / 1000);
        s.img.y += s.vy * (delta / 1000);
        wrapIn(s.img, this.wrap);
      } else {
        const amp = s.kind === "bank" ? 10 : 22;
        s.img.x = s.ax + Math.sin(t * s.pulse * 0.55 + s.phase) * amp;
        s.img.y = s.ay + Math.cos(t * s.pulse * 0.4 + s.phase) * (amp * 0.45);
      }
    }
  }
}

function wrapIn(img: Phaser.GameObjects.Image, box: WrapBox): void {
  if (img.x > box.right) img.x -= box.w;
  else if (img.x < box.left) img.x += box.w;
  if (img.y > box.bottom) img.y -= box.h;
  else if (img.y < box.top) img.y += box.h;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ensureWeatherTextures(scene: Phaser.Scene): void {
  paintCloud(scene, TEX.cloudA, 280, 150, 1);
  paintCloud(scene, TEX.cloudB, 240, 128, 2);
  paintCloud(scene, TEX.cloudC, 200, 110, 3);
  paintWisp(scene, TEX.wispA, 200, 80, 4);
  paintWisp(scene, TEX.wispB, 170, 68, 5);
  paintBank(scene, TEX.bank, 320, 150, 6);
}

function canvas(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
): Phaser.Textures.CanvasTexture | null {
  if (scene.textures.exists(key)) return null;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return null;
  tex.getContext().clearRect(0, 0, w, h);
  return tex;
}

function blob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = Math.max(rx, ry) * 0.7;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Wet-plate stratus — cream dust, never ice-blue. */
function paintCloud(scene: Phaser.Scene, key: string, w: number, h: number, seed: number): void {
  const tex = canvas(scene, key, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  const rand = rng(seed * 9973);
  const cream = "rgb(214, 200, 176)";
  const dust = "rgb(156, 142, 118)";
  const ash = "rgb(98, 90, 76)";
  const cx = w * 0.5;
  const cy = h * 0.52;
  blob(ctx, cx, cy, w * 0.28, h * 0.22, ash, 0.42);
  blob(ctx, cx - w * 0.18, cy + h * 0.04, w * 0.2, h * 0.16, dust, 0.48);
  blob(ctx, cx + w * 0.16, cy - h * 0.02, w * 0.22, h * 0.18, dust, 0.46);
  blob(ctx, cx + w * 0.04, cy - h * 0.08, w * 0.14, h * 0.12, cream, 0.38);
  blob(ctx, cx - w * 0.08, cy + h * 0.02, w * 0.12, h * 0.1, cream, 0.28);
  for (let i = 0; i < 4; i++) {
    blob(
      ctx,
      cx + (rand() - 0.5) * w * 0.42,
      cy + (rand() - 0.5) * h * 0.28,
      w * (0.08 + rand() * 0.1),
      h * (0.06 + rand() * 0.08),
      rand() > 0.45 ? dust : cream,
      0.2 + rand() * 0.16,
    );
  }
  tex.refresh();
}

function paintWisp(scene: Phaser.Scene, key: string, w: number, h: number, seed: number): void {
  const tex = canvas(scene, key, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  const rand = rng(seed * 7919);
  const dust = "rgb(168, 154, 130)";
  const ash = "rgb(88, 80, 68)";
  const cx = w * 0.5;
  const cy = h * 0.5;
  blob(ctx, cx, cy, w * 0.34, h * 0.18, ash, 0.48);
  blob(ctx, cx - w * 0.12, cy, w * 0.24, h * 0.14, dust, 0.42);
  blob(ctx, cx + w * 0.14, cy + h * 0.04, w * 0.22, h * 0.12, dust, 0.38);
  blob(ctx, cx + (rand() - 0.5) * w * 0.2, cy, w * 0.16, h * 0.1, "rgb(204, 190, 166)", 0.24);
  tex.refresh();
}

function paintBank(scene: Phaser.Scene, key: string, w: number, h: number, seed: number): void {
  const tex = canvas(scene, key, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  const rand = rng(seed * 4999);
  const ash = "rgb(72, 66, 56)";
  const dust = "rgb(140, 128, 108)";
  const cx = w * 0.5;
  const cy = h * 0.58;
  blob(ctx, cx, cy, w * 0.38, h * 0.22, ash, 0.52);
  blob(ctx, cx - w * 0.2, cy + h * 0.02, w * 0.26, h * 0.16, dust, 0.42);
  blob(ctx, cx + w * 0.18, cy, w * 0.28, h * 0.18, dust, 0.4);
  blob(ctx, cx, cy - h * 0.06, w * 0.2, h * 0.12, "rgb(196, 184, 160)", 0.22);
  blob(
    ctx,
    cx + (rand() - 0.5) * w * 0.15,
    cy + h * 0.04,
    w * 0.18,
    h * 0.1,
    ash,
    0.18,
  );
  tex.refresh();
}
