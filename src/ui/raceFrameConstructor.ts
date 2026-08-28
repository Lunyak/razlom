import Phaser from "phaser";
import type { FactionId } from "../game/data";

/**
 * ## Race frame drop-in assets (authoring standard)
 *
 * Put PNGs here — Boot loads them; if missing, procedural fallback is used.
 *
 * | File | Texture key |
 * |---|---|
 * | `public/assets/ui/race_frame_ri.png` | `race_frame_ri` |
 * | `public/assets/ui/race_frame_ordo.png` | `race_frame_ordo` |
 * | `public/assets/ui/race_frame_risen.png` | `race_frame_risen` |
 * | `public/assets/ui/race_frame_neutral.png` | `race_frame_neutral` |
 * | `public/assets/ui/race_frame_folk.png` | `race_frame_folk` |
 * | screen chrome: `public/assets/ui/screen_frame_folk.png` | `screen_frame_folk` (four corners, no rails) |
 * | `public/assets/ui/screen_frame_thorn.png` | `screen_frame_thorn` (four corners, no rails) |
 * | `public/assets/ui/screen_frame_moderne.png` | `screen_frame_moderne` (four corners, no rails) |
 * | `public/assets/ui/folio_corner_{tl,tr,bl,br}.png` + `folio_rail_{h,v}.png` | manuscript filigree, tiled rails |
 * | `public/assets/ui/charcoal_corner_{tl,tr,bl,br}.png` | full L-corners, chroma inner, never cropped |
 * | optional hero: `race_frame_{race}_hero.png` | `race_frame_{race}_hero` |
 *
 * ### Spec
 * - **Size:** 780×780 px (same as `glass_frame_border.png`)
 * - **Format:** PNG-24 + alpha
 * - **Center:** fully transparent photo window ≈ **708×708** (inset ~36 px / ~4.6% each side)
 * - **Outer:** opaque / semi-opaque frame art only — never fill the window
 * - **Color:** bake metals into the art; runtime may apply a light hero tint
 * - **Display:** scaled to 160×160 in battle (`GLASS_PHOTO_SIZE`); portrait plate is 146×146
 *
 * ### Gen prompt skeleton
 * `Square ornate picture FRAME BORDER ONLY, 780x780, transparent hollow center
 * window 708x708, no portrait inside, no text, alpha PNG, [race material notes]`
 */

/** Race / faction id used by the frame constructor. */
export type RaceFrameId =
  | "ri"
  | "ordo"
  | "risen"
  | "neutral"
  | "folk"
  | "thorn"
  | "moderne"
  | "folio"
  | "folioPanel";

export const RACE_FRAME_IDS: RaceFrameId[] = [
  "ri",
  "ordo",
  "risen",
  "neutral",
  "folk",
  "thorn",
  "moderne",
  "folio",
  "folioPanel",
];

export interface RaceFrameBuildOpts {
  hero?: boolean;
  w: number;
  h: number;
  /** Rim thickness for procedural recipes (portrait default ~9–11). */
  rim?: number;
  /** Skip drop-in PNG — screen chrome must construct at live aspect, not stretch 780² plates. */
  skipAsset?: boolean;
  /** Screen chrome: L-corners only, no connecting rails. */
  cornersOnly?: boolean;
}

export interface BuiltRaceFrame {
  /** Shadow + rim; add to parent after the photo layer. */
  root: Phaser.GameObjects.Container;
  /** Object to tint for targeting highlights (image or rectangle). */
  highlightTarget: Phaser.GameObjects.Components.Tint & Phaser.GameObjects.GameObject;
  /** Default metal / wood tint for “none” highlight. */
  baseTint: number;
  /** Paper color behind the portrait plate. */
  paperColor: number;
}

/** Texture key for a drop-in race frame PNG. */
export function raceFrameTextureKey(race: RaceFrameId, hero = false): string {
  return hero ? `race_frame_${race}_hero` : `race_frame_${race}`;
}

export function raceFrameAssetPath(race: RaceFrameId, hero = false): string {
  return `assets/ui/${raceFrameTextureKey(race, hero)}.png`;
}

/**
 * Optional race-frame drop-ins that exist on disk.
 * Add a row when a new `race_frame_*.png` is dropped in — do not list missing files
 * (each 404 stalls Phaser’s loader).
 */
export const RACE_FRAME_ASSETS: [string, string][] = [
  [raceFrameTextureKey("ri", false), raceFrameAssetPath("ri", false)],
  [raceFrameTextureKey("ordo", false), raceFrameAssetPath("ordo", false)],
];

/** Widescreen hollow chrome (not the 780² portrait plates). */
export const SCREEN_FRAME_ASSETS: [string, string][] = [
  ["screen_frame_folk", "assets/ui/screen_frame_folk.png"],
  ["screen_frame_thorn", "assets/ui/screen_frame_thorn.png"],
  ["screen_frame_moderne", "assets/ui/screen_frame_moderne.png"],
  ["screen_frame_charcoal", "assets/ui/screen_frame_charcoal.png"],
  ["screen_frame_folio", "assets/ui/screen_frame_folio.png"],
  ["screen_frame_folio_panel", "assets/ui/screen_frame_folio_panel.png"],
];

/** Prompt notes for generating each race’s frame border. */
export const RACE_FRAME_GEN_NOTES: Record<RaceFrameId, string> = {
  ri: "Victorian ornate gold glass frame, warm gilt, cracked varnish, cream matte edge",
  ordo: "Iron occult plaque frame, bone-grey metal, geometric bevels, corner diamonds, rivets, no gold, no ice-blue",
  risen: "Rotten mourning wood frame, mildew green-black, frayed funerary border, uneven edge",
  neutral: "Simple brass tintype corner frame, muddy brown wood, L-shaped brass corners, sparse",
  folk: "Russian lubok / Mezen woodcut frame, beige ink on black, repeating diamond-cross embroidery, solar corner stars, no gold glass, no ice-blue",
  thorn: "Gothic grimoire frame, uneven thorny vines, skull at top, ornate cross at bottom, bone-white on black, organic not geometric",
  moderne: "Russian northern Art Nouveau 1914, patinated bronze, birch leaves and rowan berries, sinuous irregular inner edge, not gold glass, not ice-blue",
  folio:
    "Baroque manuscript filigree, dark sepia ink on cream parchment, thin knotwork rails, flared acanthus corners, inner hairline, not gold glass, not charcoal",
  folioPanel:
    "Same Baroque manuscript filigree as folio, with a left dossier column and vertical knotwork divider",
};

/**
 * How each race presents portraits — art pipeline, NOT screen overlays.
 * Frames are built by {@link buildRaceFrame}; avatars should match these notes when generated.
 */
export interface RacePortraitStyle {
  id: RaceFrameId;
  /** Short locked description for artists / GenerateImage prompts. */
  avatarArt: string;
  paperColor: number;
  metal: number;
  metalHero: number;
  shadow: number;
}

export const RACE_PORTRAIT_STYLE: Record<RaceFrameId, RacePortraitStyle> = {
  ri: {
    id: "ri",
    avatarArt:
      "Victorian daguerreotype bust, warm sepia, cracked glass-plate emulsion, torn cream paper edges, olive-khaki 1914 mundir, gold погоны, not British scarlet",
    paperColor: 0x1a1410,
    metal: 0xffe0a8,
    metalHero: 0xffe8c0,
    shadow: 0x000000,
  },
  ordo: {
    id: "ordo",
    avatarArt:
      "Occult wet-plate / ash-print bust, desaturated bone-grey, geometric occult matte, no gold, no ice-blue",
    paperColor: 0x101208,
    metal: 0x8a8578,
    metalHero: 0xc4bca8,
    shadow: 0x0a0c08,
  },
  risen: {
    id: "risen",
    avatarArt:
      "Rotting funerary plate, mildew greens and bone, frayed black mourning border",
    paperColor: 0x0e140e,
    metal: 0x6a7860,
    metalHero: 0x9aaa88,
    shadow: 0x050805,
  },
  neutral: {
    id: "neutral",
    avatarArt:
      "Rough field tintype, muddy browns, simple brass corners, less ornate than RI",
    paperColor: 0x181410,
    metal: 0xb89860,
    metalHero: 0xd4b878,
    shadow: 0x000000,
  },
  folk: {
    id: "folk",
    avatarArt:
      "Lubok woodcut bust, beige ink on black, Mezen embroidery fill, kokoshnik or peasant collar, no daguerreotype, no gold glass",
    paperColor: 0x080808,
    metal: 0xe6d5b8,
    metalHero: 0xf4ead4,
    shadow: 0x000000,
  },
  thorn: {
    id: "thorn",
    avatarArt:
      "Etched grimoire bust, bone-white ink on black, thorns and skull filigree, no gold, no ice-blue, no daguerreotype",
    paperColor: 0x050505,
    metal: 0xc8c4bc,
    metalHero: 0xe8e4dc,
    shadow: 0x000000,
  },
  moderne: {
    id: "moderne",
    avatarArt:
      "Art Nouveau wet-plate bust, bronze-green patina matte, birch-leaf filigree, 1914 northern moderne, no ice-blue, no daguerreotype gold",
    paperColor: 0x0c0e0a,
    metal: 0xb89860,
    metalHero: 0xd4b878,
    shadow: 0x050805,
  },
  folio: {
    id: "folio",
    avatarArt:
      "Sepia manuscript bust, dark espresso ink on cream parchment, Baroque filigree plate, no gold glass, no ice-blue",
    paperColor: 0x1a140c,
    metal: 0x5a3c22,
    metalHero: 0x7a5634,
    shadow: 0x0a0804,
  },
  folioPanel: {
    id: "folioPanel",
    avatarArt:
      "Sepia manuscript bust, dark espresso ink on cream parchment, Baroque filigree plate, no gold glass, no ice-blue",
    paperColor: 0x1a140c,
    metal: 0x5a3c22,
    metalHero: 0x7a5634,
    shadow: 0x0a0804,
  },
};

export function raceFromFaction(faction: FactionId): RaceFrameId {
  if (faction === "ordo") return "ordo";
  if (faction === "risen") return "risen";
  if (faction === "neutral") return "neutral";
  if (faction === "cossack") return "folk";
  if (faction === "highlander") return "thorn";
  return "ri";
}

/**
 * Constructor: prefers drop-in PNG (`race_frame_{race}.png`); else procedural recipe.
 */
export function buildRaceFrame(
  scene: Phaser.Scene,
  race: RaceFrameId,
  opts: RaceFrameBuildOpts,
): BuiltRaceFrame {
  const style = RACE_PORTRAIT_STYLE[race];
  const w = opts.w;
  const h = opts.h;
  const hero = !!opts.hero;
  const metal = hero ? style.metalHero : style.metal;
  const root = scene.add.container(0, 0);

  const fromAsset = opts.skipAsset
    ? null
    : tryBuildFromRaceAsset(scene, root, race, hero, w, h, metal, style);
  if (fromAsset) return fromAsset;

  const prevRim = rimDrawMode;
  rimDrawMode = opts.cornersOnly ? "corners" : "full";
  try {
    const rim = opts.rim;
    switch (race) {
      case "ri":
        return buildRiOrnateGlass(scene, root, w, h, metal, style, rim);
      case "ordo":
        return buildOrdoIronOccult(scene, root, w, h, metal, style, rim);
      case "risen":
        return buildRisenMourning(scene, root, w, h, metal, style, rim);
      case "neutral":
        return buildNeutralTintype(scene, root, w, h, metal, style, rim);
      case "folk":
        return buildFolkLubok(scene, root, w, h, metal, style, rim);
      case "thorn":
        return buildThornGrimoire(scene, root, w, h, metal, style, rim);
      case "moderne":
        return buildModerneNouveau(scene, root, w, h, metal, style, rim);
      case "folio":
      case "folioPanel":
        return buildFolioManuscript(scene, root, w, h, metal, style, rim);
      default:
        return buildRiOrnateGlass(scene, root, w, h, metal, style, rim);
    }
  } finally {
    rimDrawMode = prevRim;
  }
}

/** Resolve which texture to use for a race frame (hero → base → legacy RI border). */
export function resolveRaceFrameTextureKey(
  scene: Phaser.Scene,
  race: RaceFrameId,
  hero = false,
): string | null {
  if (hero && isUsableTexture(scene, raceFrameTextureKey(race, true))) {
    return raceFrameTextureKey(race, true);
  }
  if (isUsableTexture(scene, raceFrameTextureKey(race, false))) {
    return raceFrameTextureKey(race, false);
  }
  if (race === "ri") {
    if (isUsableTexture(scene, "glass_frame_border")) return "glass_frame_border";
    if (isUsableTexture(scene, "glass_frame_vintage")) return "glass_frame_vintage";
  }
  return null;
}

/** True when a loaded texture is real art (not a failed / missing stub). */
export function isUsableTexture(scene: Phaser.Scene, key: string): boolean {
  if (!scene.textures.exists(key)) return false;
  const tex = scene.textures.get(key);
  if (!tex || tex.key === "__MISSING") return false;
  const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement | undefined;
  const w = src && "width" in src ? src.width : 0;
  return w > 8;
}

function tryBuildFromRaceAsset(
  scene: Phaser.Scene,
  root: Phaser.GameObjects.Container,
  race: RaceFrameId,
  hero: boolean,
  w: number,
  h: number,
  metal: number,
  style: RacePortraitStyle,
): BuiltRaceFrame | null {
  const key = resolveRaceFrameTextureKey(scene, race, hero);
  if (!key) return null;
  // Procedural races: only use dedicated race_frame_* (not shared RI glass)
  if (race !== "ri" && !key.startsWith("race_frame_")) return null;
  return buildBorderTextureFrame(scene, root, key, w, h, metal, style);
}

function buildBorderTextureFrame(
  scene: Phaser.Scene,
  root: Phaser.GameObjects.Container,
  key: string,
  w: number,
  h: number,
  metal: number,
  style: RacePortraitStyle,
): BuiltRaceFrame {
  // Drop-in race_frame_* art is authored in final colors; legacy RI border uses metal tint.
  const mainTint = key.startsWith("race_frame_") ? 0xffffff : metal;
  root.add(
    scene.add.image(5, 7, key).setDisplaySize(w, h).setTint(style.shadow).setAlpha(0.5).setName("frameShadow"),
  );
  const highlight = scene.add.image(0, 0, key).setDisplaySize(w, h).setTint(mainTint).setName("frameLayer");
  root.add(highlight);
  return {
    root,
    highlightTarget: highlight as unknown as BuiltRaceFrame["highlightTarget"],
    baseTint: mainTint,
    paperColor: style.paperColor,
  };
}

/** Hollow band: `inset` from the outer edge, then `thickness` inward. */
let rimDrawMode: "full" | "corners" = "full";

function wantRails(): boolean {
  return rimDrawMode === "full";
}

function fillFourCornerLs(
  g: Phaser.GameObjects.Graphics,
  hw: number,
  hh: number,
  w: number,
  h: number,
  inset: number,
  thickness: number,
  color: number,
  alpha = 1,
  ox = 0,
  oy = 0,
) {
  const t = Math.max(1, Math.round(thickness));
  const inn = Math.max(0, inset);
  const arm = Math.max(t * 7, Math.round(Math.min(w, h) * 0.12));
  g.fillStyle(color, alpha);
  const spots: [number, number, number, number][] = [
    [-hw + inn + ox, -hh + inn + oy, 1, 1],
    [hw - inn + ox, -hh + inn + oy, -1, 1],
    [-hw + inn + ox, hh - inn + oy, 1, -1],
    [hw - inn + ox, hh - inn + oy, -1, -1],
  ];
  for (const [x, y, sx, sy] of spots) {
    const hx = sx > 0 ? x : x - arm;
    const hy = sy > 0 ? y : y - t;
    g.fillRect(hx, hy, arm, t);
    const vx = sx > 0 ? x : x - t;
    const vy = sy > 0 ? y : y - arm;
    g.fillRect(vx, vy, t, arm);
  }
}

function fillInsetRim(
  g: Phaser.GameObjects.Graphics,
  hw: number,
  hh: number,
  w: number,
  h: number,
  inset: number,
  thickness: number,
  color: number,
  alpha = 1,
  ox = 0,
  oy = 0,
) {
  if (!wantRails()) {
    fillFourCornerLs(g, hw, hh, w, h, inset, thickness, color, alpha, ox, oy);
    return;
  }
  const t = Math.max(1, Math.round(thickness));
  const inn = Math.max(0, inset);
  const tw = w - inn * 2;
  const th = h - inn * 2;
  if (tw <= 0 || th <= 0) return;
  const x0 = -hw + inn + ox;
  const y0 = -hh + inn + oy;
  g.fillStyle(color, alpha);
  g.fillRect(x0, y0, tw, Math.min(t, th));
  if (th > t) g.fillRect(x0, y0 + th - t, tw, t);
  const side = th - t * 2;
  if (side > 0) {
    g.fillRect(x0, y0 + t, Math.min(t, tw), side);
    if (tw > t) g.fillRect(x0 + tw - t, y0 + t, t, side);
  }
}

/** Walk the rim with inward unit normals (top ny=1, bottom ny=-1, left nx=1, right nx=-1). */
function walkSides(
  hw: number,
  hh: number,
  inset: number,
  spacing: number,
  cornerSkip: number,
  fn: (x: number, y: number, nx: number, ny: number) => void,
) {
  if (!wantRails()) return;
  const x0 = -hw + inset;
  const y0 = -hh + inset;
  const x1 = hw - inset;
  const y1 = hh - inset;
  const skip = Math.max(spacing, cornerSkip);
  for (let x = x0 + skip; x <= x1 - skip + 0.5; x += spacing) {
    fn(x, y0, 0, 1);
    fn(x, y1, 0, -1);
  }
  for (let y = y0 + skip; y <= y1 - skip + 0.5; y += spacing) {
    fn(x0, y, 1, 0);
    fn(x1, y, -1, 0);
  }
}

function liftColor(c: number, d: number): number {
  const col = Phaser.Display.Color.IntegerToColor(c);
  return Phaser.Display.Color.GetColor(
    Math.min(255, col.red + d),
    Math.min(255, col.green + d),
    Math.min(255, col.blue + Math.round(d * 0.72)),
  );
}

function strokeInsetRect(
  g: Phaser.GameObjects.Graphics,
  hw: number,
  hh: number,
  w: number,
  h: number,
  inset: number,
  width: number,
  color: number,
  alpha = 1,
) {
  if (!wantRails()) return;
  g.lineStyle(Math.max(1, width), color, alpha);
  g.strokeRect(-hw + inset, -hh + inset, w - inset * 2, h - inset * 2);
}

function strokePoly(g: Phaser.GameObjects.Graphics, pts: [number, number][], close = false) {
  if (pts.length < 2) return;
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  if (close) g.closePath();
  g.strokePath();
}

function drawVolute(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  ang: number,
  scale: number,
  color: number,
  alpha: number,
  width: number,
) {
  g.lineStyle(Math.max(1, width), color, alpha);
  const pts: [number, number][] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const r = scale * (1 - t * 0.84);
    const th = ang + t * Math.PI * 1.9;
    pts.push([x + Math.cos(th) * r, y + Math.sin(th) * r]);
  }
  strokePoly(g, pts);
}

function drawRosette(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  r: number,
  dark: number,
  metal: number,
  light: number,
) {
  g.fillStyle(dark, 1);
  g.fillCircle(x, y, r);
  g.lineStyle(Math.max(1, r * 0.1), metal, 0.95);
  g.strokeCircle(x, y, r * 0.86);
  const petals = r >= 5 ? 8 : 6;
  g.fillStyle(metal, 0.92);
  for (let i = 0; i < petals; i++) {
    const a = (i / petals) * Math.PI * 2;
    g.fillCircle(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, Math.max(1, r * 0.15));
  }
  g.fillStyle(light, 1);
  g.fillCircle(x, y, Math.max(1.2, r * 0.2));
  g.fillStyle(0xfff8e8, 0.4);
  g.fillCircle(x - r * 0.12, y - r * 0.14, Math.max(0.7, r * 0.09));
}

function drawLeaf(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  nx: number,
  ny: number,
  s: number,
  color: number,
  alpha = 0.92,
) {
  const tx = -ny;
  const ty = nx;
  g.fillStyle(color, alpha);
  g.fillTriangle(
    x + tx * s * 0.32,
    y + ty * s * 0.32,
    x - tx * s * 0.32,
    y - ty * s * 0.32,
    x + nx * s,
    y + ny * s,
  );
}

function drawPalmette(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  nx: number,
  ny: number,
  s: number,
  color: number,
) {
  const tx = -ny;
  const ty = nx;
  g.lineStyle(Math.max(1, s * 0.1), color, 0.88);
  for (const k of [-0.85, -0.4, 0, 0.4, 0.85]) {
    const pts: [number, number][] = [
      [x, y],
      [x + nx * s * 0.45 + tx * k * s * 0.35, y + ny * s * 0.45 + ty * k * s * 0.35],
      [x + nx * s * 0.95 + tx * k * s * 0.55, y + ny * s * 0.95 + ty * k * s * 0.55],
    ];
    strokePoly(g, pts);
  }
}

/** RI gold-glass plaque — concentric gilt, cream matte, corner bosses. Drawn, never stretched. */
function buildRiOrnateGlass(
  scene: Phaser.Scene,
  root: Phaser.GameObjects.Container,
  w: number,
  h: number,
  metal: number,
  style: RacePortraitStyle,
  rimPx?: number,
): BuiltRaceFrame {
  const g = scene.add.graphics().setName("frameLayer");
  const hw = w / 2;
  const hh = h / 2;
  const rim = rimPx ?? 10;
  const cream = 0xefe0c4;
  const dark = 0x3a2810;
  const gilt = 0xc9a227;
  const giltHi = liftColor(metal, 18);
  const lavish = rim >= 36;

  fillInsetRim(g, hw, hh, w, h, 0, rim, style.shadow, 0.42, 5, 7);
  fillInsetRim(g, hw, hh, w, h, 0, rim, dark, 1);
  fillInsetRim(g, hw, hh, w, h, 1, Math.max(2, rim * 0.18), 0x5a3c12, 1);
  fillInsetRim(g, hw, hh, w, h, Math.max(2, rim * 0.16), Math.max(2, rim * 0.22), metal, 1);
  fillInsetRim(g, hw, hh, w, h, Math.max(3, rim * 0.38), Math.max(2, rim * 0.14), gilt, 0.92);
  fillInsetRim(g, hw, hh, w, h, Math.max(4, rim * 0.54), Math.max(2, rim * 0.16), cream, 0.95);
  fillInsetRim(g, hw, hh, w, h, Math.max(5, rim * 0.72), Math.max(1, rim * 0.1), metal, 1);

  strokeInsetRect(g, hw, hh, w, h, 0.6, Math.max(1, rim / 20), 0x6a4a18, 0.9);
  strokeInsetRect(g, hw, hh, w, h, rim * 0.08, 1, giltHi, 0.55);
  strokeInsetRect(g, hw, hh, w, h, rim * 0.48, Math.max(1, rim / 22), cream, 0.75);
  strokeInsetRect(g, hw, hh, w, h, rim - 1.5, 1, gilt, 0.8);

  const boss = Math.max(7, Math.round(rim * 0.58));
  const corners: [number, number][] = [
    [-hw + rim * 0.48, -hh + rim * 0.48],
    [hw - rim * 0.48, -hh + rim * 0.48],
    [-hw + rim * 0.48, hh - rim * 0.48],
    [hw - rim * 0.48, hh - rim * 0.48],
  ];
  for (const [cx, cy] of corners) {
    g.fillStyle(dark, 1);
    g.fillRect(cx - boss / 2, cy - boss / 2, boss, boss);
    g.lineStyle(Math.max(1, rim / 24), gilt, 1);
    g.strokeRect(cx - boss / 2, cy - boss / 2, boss, boss);
    g.lineStyle(1, cream, 0.65);
    g.strokeRect(cx - boss * 0.32, cy - boss * 0.32, boss * 0.64, boss * 0.64);
    drawRosette(g, cx, cy, Math.max(2.4, boss * 0.28), dark, metal, cream);
    if (lavish) {
      const inwardX = cx < 0 ? 1 : -1;
      const inwardY = cy < 0 ? 1 : -1;
      drawVolute(g, cx + inwardX * boss * 0.7, cy + inwardY * boss * 0.15, Math.atan2(inwardY, inwardX), boss * 0.55, gilt, 0.7, 1.2);
      drawVolute(g, cx + inwardX * boss * 0.15, cy + inwardY * boss * 0.7, Math.atan2(inwardY, inwardX), boss * 0.55, gilt, 0.7, 1.2);
    }
  }

  const beadR = Math.max(1.3, rim * 0.055);
  walkSides(hw, hh, rim * 0.32, Math.max(14, Math.round(rim * 0.55)), boss + 8, (x, y) => {
    g.fillStyle(gilt, 1);
    g.fillCircle(x, y, beadR);
    g.fillStyle(cream, 0.5);
    g.fillCircle(x - beadR * 0.3, y - beadR * 0.3, beadR * 0.38);
  });

  if (wantRails() && rim >= 22) {
    const palm = Math.max(6, rim * 0.32);
    const mids: [number, number, number, number][] = [
      [0, -hh + rim * 0.5, 0, 1],
      [0, hh - rim * 0.5, 0, -1],
      [-hw + rim * 0.5, 0, 1, 0],
      [hw - rim * 0.5, 0, -1, 0],
    ];
    for (const [x, y, nx, ny] of mids) drawPalmette(g, x, y, nx, ny, palm, gilt);
  }

  root.add(g);
  const highlight = addFrameHighlight(scene, root, w, h, metal);
  return {
    root,
    highlightTarget: highlight as unknown as BuiltRaceFrame["highlightTarget"],
    baseTint: metal,
    paperColor: style.paperColor,
  };
}

function addFrameHighlight(
  scene: Phaser.Scene,
  root: Phaser.GameObjects.Container,
  w: number,
  h: number,
  metal: number,
): Phaser.GameObjects.Rectangle {
  const highlight = scene.add
    .rectangle(0, 0, w, h)
    .setStrokeStyle(2, metal, 0)
    .setFillStyle(0x000000, 0)
    .setName("frameHighlight");
  root.add(highlight);
  return highlight;
}

/**
 * Ordo — iron occult plaque rim: bevels, corner diamonds, rivets.
 * Hollow center — must not cover the portrait (unlike RI border texture).
 */
function buildOrdoIronOccult(
  scene: Phaser.Scene,
  root: Phaser.GameObjects.Container,
  w: number,
  h: number,
  metal: number,
  style: RacePortraitStyle,
  rimPx?: number,
): BuiltRaceFrame {
  const g = scene.add.graphics().setName("frameLayer");
  const hw = w / 2;
  const hh = h / 2;
  const rim = rimPx ?? 12;
  const dark = style.shadow;
  const mid = metal;
  const hilite = liftColor(metal, 42);
  const iron = 0x1a1c16;
  const plate = Math.max(8, Math.round(rim * 0.72));
  const diamond = Math.max(4, Math.round(rim * 0.3));
  const lavish = rim >= 36;

  fillInsetRim(g, hw, hh, w, h, 0, rim, dark, 0.55, 4, 5);
  fillInsetRim(g, hw, hh, w, h, 0, rim, iron, 1);
  fillInsetRim(g, hw, hh, w, h, 2, Math.max(2, rim * 0.2), 0x24261e, 1);
  fillInsetRim(g, hw, hh, w, h, Math.max(3, rim * 0.28), Math.max(2, rim * 0.18), 0x2e3028, 1);
  fillInsetRim(g, hw, hh, w, h, Math.max(5, rim * 0.62), Math.max(2, rim * 0.12), mid, 0.88);

  strokeInsetRect(g, hw, hh, w, h, 0, Math.max(2, rim / 16), mid, 1);
  strokeInsetRect(g, hw, hh, w, h, rim * 0.12, 1, hilite, 0.55);
  strokeInsetRect(g, hw, hh, w, h, rim * 0.55, Math.max(1, rim / 22), hilite, 0.8);
  strokeInsetRect(g, hw, hh, w, h, rim - 2, 1, dark, 0.9);

  const corners: [number, number][] = [
    [-hw + rim * 0.5, -hh + rim * 0.5],
    [hw - rim * 0.5, -hh + rim * 0.5],
    [-hw + rim * 0.5, hh - rim * 0.5],
    [hw - rim * 0.5, hh - rim * 0.5],
  ];
  for (const [cx, cy] of corners) {
    g.fillStyle(iron, 1);
    g.fillRect(cx - plate / 2, cy - plate / 2, plate, plate);
    g.lineStyle(1, hilite, 0.85);
    g.strokeRect(cx - plate / 2, cy - plate / 2, plate, plate);
    g.lineStyle(1, mid, 0.7);
    g.strokeRect(cx - plate * 0.32, cy - plate * 0.32, plate * 0.64, plate * 0.64);
    g.fillStyle(mid, 1);
    g.fillTriangle(cx, cy - diamond, cx + diamond, cy, cx, cy + diamond);
    g.fillTriangle(cx, cy - diamond, cx - diamond, cy, cx, cy + diamond);
    g.lineStyle(1, hilite, 0.8);
    const d2 = diamond * 0.55;
    g.strokeTriangle(cx, cy - d2, cx + d2, cy, cx, cy + d2);
    g.strokeTriangle(cx, cy - d2, cx - d2, cy, cx, cy + d2);
    g.fillStyle(hilite, 0.8);
    g.fillCircle(cx, cy, Math.max(1.4, diamond * 0.24));
  }

  const rivet = Math.max(1.5, rim * 0.065);
  walkSides(hw, hh, rim * 0.38, Math.max(16, Math.round(rim * 0.7)), plate + 6, (x, y, nx, ny) => {
    g.fillStyle(hilite, 0.92);
    g.fillCircle(x, y, rivet);
    g.fillStyle(dark, 0.5);
    g.fillCircle(x + 0.55, y + 0.55, rivet * 0.42);
    if (lavish) {
      g.lineStyle(1, mid, 0.55);
      g.lineBetween(x - ny * rivet * 1.8, y + nx * rivet * 1.8, x + ny * rivet * 1.8, y - nx * rivet * 1.8);
    }
  });

  if (wantRails() && rim >= 22) {
    const chev = Math.max(4, rim * 0.22);
    const mids: [number, number, number, number][] = [
      [0, -hh + rim * 0.5, 0, 1],
      [0, hh - rim * 0.5, 0, -1],
      [-hw + rim * 0.5, 0, 1, 0],
      [hw - rim * 0.5, 0, -1, 0],
    ];
    for (const [x, y, nx, ny] of mids) {
      const tx = -ny;
      const ty = nx;
      g.fillStyle(mid, 0.95);
      g.fillTriangle(
        x + tx * chev,
        y + ty * chev,
        x - tx * chev,
        y - ty * chev,
        x + nx * chev * 1.15,
        y + ny * chev * 1.15,
      );
      g.lineStyle(1, hilite, 0.7);
      g.strokeTriangle(
        x + tx * chev * 0.55,
        y + ty * chev * 0.55,
        x - tx * chev * 0.55,
        y - ty * chev * 0.55,
        x + nx * chev * 0.7,
        y + ny * chev * 0.7,
      );
    }
  }

  root.add(g);
  const highlight = addFrameHighlight(scene, root, w, h, metal);

  return {
    root,
    highlightTarget: highlight as unknown as BuiltRaceFrame["highlightTarget"],
    baseTint: metal,
    paperColor: style.paperColor,
  };
}

/** Risen — mourning rim with rotten edge (hollow photo window). */
function buildRisenMourning(
  scene: Phaser.Scene,
  root: Phaser.GameObjects.Container,
  w: number,
  h: number,
  metal: number,
  style: RacePortraitStyle,
  rimPx?: number,
): BuiltRaceFrame {
  const g = scene.add.graphics().setName("frameLayer");
  const hw = w / 2;
  const hh = h / 2;
  const rim = rimPx ?? 12;
  const moss = 0x3a4a32;
  const wood = 0x141810;
  const pale = liftColor(metal, 28);

  fillInsetRim(g, hw, hh, w, h, 0, rim, style.shadow, 0.58, 3, 4);
  fillInsetRim(g, hw, hh, w, h, 0, rim, wood, 1);
  fillInsetRim(g, hw, hh, w, h, 2, Math.max(2, rim * 0.22), 0x1c2418, 1);
  fillInsetRim(g, hw, hh, w, h, Math.max(4, rim * 0.42), Math.max(2, rim * 0.16), moss, 0.55);
  fillInsetRim(g, hw, hh, w, h, Math.max(5, rim * 0.68), Math.max(1, rim * 0.1), metal, 0.5);

  if (wantRails()) {
  const samples = Math.max(16, Math.round(Math.min(w, h) / 18));
  const rot = rim * 0.22;
  const outer: [number, number][] = [];
  const pushRotten = (count: number, fx: (t: number) => number, fy: (t: number) => number, nx: number, ny: number) => {
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const chew = (Math.sin(t * Math.PI * 7 + i * 0.9) * 0.55 + Math.sin(t * Math.PI * 13) * 0.25) * rot;
      outer.push([fx(t) + nx * chew, fy(t) + ny * chew]);
    }
  };
  pushRotten(samples, (t) => -hw + t * w, () => -hh, 0, 1);
  pushRotten(samples, () => hw, (t) => -hh + t * h, -1, 0);
  pushRotten(samples, (t) => hw - t * w, () => hh, 0, -1);
  pushRotten(samples, () => -hw, (t) => hh - t * h, 1, 0);
  g.lineStyle(Math.max(1.5, rim / 16), 0x0a0c0a, 1);
  strokePoly(g, outer, true);
  g.lineStyle(1, metal, 0.45);
  strokePoly(g, outer, true);
  }

  strokeInsetRect(g, hw, hh, w, h, rim * 0.42, Math.max(1, rim / 22), metal, 0.75);
  strokeInsetRect(g, hw, hh, w, h, rim * 0.78, 1, pale, 0.4);

  const jag = Math.max(3.5, rim * 0.18);
  walkSides(hw, hh, rim * 0.28, Math.max(10, Math.round(rim * 0.42)), rim * 0.7, (x, y, nx, ny) => {
    g.lineStyle(1, metal, 0.42);
    g.lineBetween(x, y, x + nx * jag, y + ny * jag);
    if (Math.abs(x + y) % 3 < 1) {
      g.fillStyle(moss, 0.35);
      g.fillCircle(x + nx * jag * 0.4, y + ny * jag * 0.4, Math.max(1, jag * 0.22));
    }
  });

  const mid = rim * 0.5;
  const corners: [number, number][] = [
    [-hw + mid, -hh + mid],
    [hw - mid, -hh + mid],
    [-hw + mid, hh - mid],
    [hw - mid, hh - mid],
  ];
  for (const [cx, cy] of corners) {
    const cr = Math.max(4, rim * 0.28);
    g.lineStyle(Math.max(1, rim / 24), metal, 0.8);
    g.strokeCircle(cx, cy, cr);
    g.lineStyle(1, pale, 0.55);
    g.lineBetween(cx, cy - cr * 0.7, cx, cy + cr * 0.7);
    g.lineBetween(cx - cr * 0.45, cy - cr * 0.15, cx + cr * 0.45, cy - cr * 0.15);
    g.fillStyle(moss, 0.5);
    g.fillCircle(cx + cr * 0.35, cy + cr * 0.3, Math.max(1.2, cr * 0.18));
  }

  root.add(g);
  const highlight = addFrameHighlight(scene, root, w, h, metal);

  return {
    root,
    highlightTarget: highlight as unknown as BuiltRaceFrame["highlightTarget"],
    baseTint: metal,
    paperColor: style.paperColor,
  };
}

/** Neutral — brass tintype corners (hollow photo window). */
function buildNeutralTintype(
  scene: Phaser.Scene,
  root: Phaser.GameObjects.Container,
  w: number,
  h: number,
  metal: number,
  style: RacePortraitStyle,
  rimPx?: number,
): BuiltRaceFrame {
  const g = scene.add.graphics().setName("frameLayer");
  const hw = w / 2;
  const hh = h / 2;
  const rim = rimPx ?? 11;
  const brass = metal;
  const brassHi = liftColor(metal, 32);
  const wood = 0x2a2218;
  const arm = Math.max(18, Math.round(rim * 1.7));

  fillInsetRim(g, hw, hh, w, h, 0, rim, style.shadow, 0.4, 3, 3);
  fillInsetRim(g, hw, hh, w, h, 0, rim, wood, 1);
  fillInsetRim(g, hw, hh, w, h, 1, Math.max(1, rim * 0.12), 0x1c1812, 0.7);
  fillInsetRim(g, hw, hh, w, h, Math.max(3, rim * 0.38), Math.max(2, rim * 0.14), 0x3a3020, 1);
  fillInsetRim(g, hw, hh, w, h, Math.max(5, rim * 0.72), 1, brass, 0.45);

  strokeInsetRect(g, hw, hh, w, h, 0.5, Math.max(1.5, rim / 16), brass, 0.95);
  strokeInsetRect(g, hw, hh, w, h, rim * 0.22, 1, 0x1c1812, 0.55);
  strokeInsetRect(g, hw, hh, w, h, rim * 0.58, 1, brassHi, 0.55);

  walkSides(hw, hh, rim * 0.5, Math.max(11, Math.round(rim * 0.55)), arm * 0.45, (x, y, nx, ny) => {
    g.lineStyle(1, 0x1a140e, 0.28);
    g.lineBetween(x - ny * 3, y + nx * 3, x + nx * rim * 0.22, y + ny * rim * 0.22);
  });

  const corners: [number, number, number, number][] = [
    [-hw + 2, -hh + 2, 1, 1],
    [hw - 2, -hh + 2, -1, 1],
    [-hw + 2, hh - 2, 1, -1],
    [hw - 2, hh - 2, -1, -1],
  ];
  const thick = Math.max(2.2, rim / 12);
  for (const [x, y, sx, sy] of corners) {
    g.lineStyle(thick + 1.2, 0x3a2810, 1);
    g.lineBetween(x, y, x + arm * sx, y);
    g.lineBetween(x, y, x, y + arm * sy);
    g.lineStyle(thick, brass, 1);
    g.lineBetween(x, y, x + arm * sx, y);
    g.lineBetween(x, y, x, y + arm * sy);
    g.lineStyle(1, brassHi, 0.75);
    g.lineBetween(x + 1.5 * sx, y + 1.5 * sy, x + (arm - 2) * sx, y + 1.5 * sy);
    g.lineBetween(x + 1.5 * sx, y + 1.5 * sy, x + 1.5 * sx, y + (arm - 2) * sy);
    const screw = Math.max(1.6, rim * 0.09);
    for (const t of [0.18, 0.55, 0.88]) {
      const px = x + arm * sx * t;
      const py = y + 3 * sy;
      g.fillStyle(brass, 1);
      g.fillCircle(px, py, screw);
      g.fillStyle(0x3a2810, 0.7);
      g.fillCircle(px, py, screw * 0.35);
      const qx = x + 3 * sx;
      const qy = y + arm * sy * t;
      g.fillStyle(brass, 1);
      g.fillCircle(qx, qy, screw);
      g.fillStyle(0x3a2810, 0.7);
      g.fillCircle(qx, qy, screw * 0.35);
    }
  }

  root.add(g);
  const highlight = addFrameHighlight(scene, root, w, h, metal);

  return {
    root,
    highlightTarget: highlight as unknown as BuiltRaceFrame["highlightTarget"],
    baseTint: metal,
    paperColor: style.paperColor,
  };
}

function folkDiamond(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, ink: number) {
  g.fillStyle(ink, 1);
  g.fillTriangle(x, y - r, x + r, y, x, y + r);
  g.fillTriangle(x, y - r, x - r, y, x, y + r);
}

function folkCross(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, ink: number) {
  const t = Math.max(1, r * 0.32);
  g.fillStyle(ink, 1);
  g.fillRect(x - t, y - r, t * 2, r * 2);
  g.fillRect(x - r, y - t, r * 2, t * 2);
}

function folkStar(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, ink: number) {
  folkDiamond(g, x, y, r, ink);
  folkCross(g, x, y, r * 0.72, ink);
  g.fillStyle(ink, 1);
  g.fillCircle(x, y, Math.max(1.2, r * 0.22));
}

function folkHook(g: Phaser.GameObjects.Graphics, x: number, y: number, r: number, ink: number, nx: number, ny: number) {
  const tx = -ny;
  const ty = nx;
  g.lineStyle(Math.max(1, r * 0.22), ink, 0.95);
  strokePoly(g, [
    [x - tx * r, y - ty * r],
    [x + nx * r * 0.55, y + ny * r * 0.55],
    [x + tx * r, y + ty * r],
  ]);
}

/**
 * Folk / lubok — beige woodcut ink on black, Mezen diamond-cross chain.
 * Tiled geometry (never a stretched poster). Source: Russian folk ornament sheet.
 */
function buildFolkLubok(
  scene: Phaser.Scene,
  root: Phaser.GameObjects.Container,
  w: number,
  h: number,
  metal: number,
  style: RacePortraitStyle,
  rimPx?: number,
): BuiltRaceFrame {
  const g = scene.add.graphics().setName("frameLayer");
  const hw = w / 2;
  const hh = h / 2;
  const rim = rimPx ?? 12;
  const ink = metal;
  const black = 0x0a0a0a;
  const unit = Math.max(4.5, Math.round(rim * 0.2));
  const step = Math.max(9, Math.round(unit * 2.05));
  const mid = rim * 0.5;

  fillInsetRim(g, hw, hh, w, h, 0, rim, style.shadow, 0.35, 3, 4);
  fillInsetRim(g, hw, hh, w, h, 0, rim, black, 1);
  fillInsetRim(g, hw, hh, w, h, 1, 1, ink, 0.35);

  strokeInsetRect(g, hw, hh, w, h, 1.2, Math.max(1, rim / 28), ink, 1);
  strokeInsetRect(g, hw, hh, w, h, rim * 0.18, 1, ink, 0.55);
  strokeInsetRect(g, hw, hh, w, h, rim - 2, Math.max(1, rim / 22), ink, 0.95);
  strokeInsetRect(g, hw, hh, w, h, rim * 0.72, 1, ink, 0.4);

  let n = 0;
  walkSides(hw, hh, mid, step, step * 1.1, (x, y, nx, ny) => {
    const k = n % 3;
    if (k === 0) folkDiamond(g, x, y, unit, ink);
    else if (k === 1) folkCross(g, x, y, unit * 0.72, ink);
    else folkHook(g, x, y, unit * 0.85, ink, nx, ny);
    n += 1;
  });

  walkSides(hw, hh, rim * 0.22, step * 1.6, step * 1.2, (x, y) => {
    g.fillStyle(ink, 1);
    g.fillCircle(x, y, Math.max(1, unit * 0.2));
  });

  const starR = Math.max(6, Math.round(rim * 0.4));
  const corners: [number, number][] = [
    [-hw + mid, -hh + mid],
    [hw - mid, -hh + mid],
    [-hw + mid, hh - mid],
    [hw - mid, hh - mid],
  ];
  for (const [cx, cy] of corners) {
    folkStar(g, cx, cy, starR, ink);
    g.lineStyle(1, ink, 0.7);
    g.strokeCircle(cx, cy, starR * 1.15);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.lineBetween(
        cx + Math.cos(a) * starR * 0.7,
        cy + Math.sin(a) * starR * 0.7,
        cx + Math.cos(a) * starR * 1.28,
        cy + Math.sin(a) * starR * 1.28,
      );
    }
  }

  const sunR = Math.max(4.5, Math.round(rim * 0.3));
  if (wantRails()) {
    folkStar(g, 0, -hh + mid, sunR, ink);
    folkStar(g, 0, hh - mid, sunR, ink);
    folkStar(g, -hw + mid, 0, sunR, ink);
    folkStar(g, hw - mid, 0, sunR, ink);
  }

  root.add(g);
  const highlight = addFrameHighlight(scene, root, w, h, metal);
  return {
    root,
    highlightTarget: highlight as unknown as BuiltRaceFrame["highlightTarget"],
    baseTint: metal,
    paperColor: style.paperColor,
  };
}

/** Portrait fallback: gnarled uneven thorn rim (screen uses `screen_frame_thorn.png`). */
function buildThornGrimoire(
  scene: Phaser.Scene,
  root: Phaser.GameObjects.Container,
  w: number,
  h: number,
  metal: number,
  style: RacePortraitStyle,
  rimPx?: number,
): BuiltRaceFrame {
  const g = scene.add.graphics().setName("frameLayer");
  const hw = w / 2;
  const hh = h / 2;
  const rim = rimPx ?? 13;
  const ink = metal;
  const bone = liftColor(metal, 24);

  fillInsetRim(g, hw, hh, w, h, 0, rim, 0x050505, 1);
  fillInsetRim(g, hw, hh, w, h, 1, Math.max(1, rim * 0.12), 0x12100e, 1);
  fillInsetRim(g, hw, hh, w, h, Math.max(3, rim * 0.55), 1, ink, 0.35);

  if (wantRails()) {
  const jags = Math.max(14, Math.round(Math.min(w, h) / 20));
  const inset = rim * 0.32;
  const outer: [number, number][] = [];
  const inner: [number, number][] = [];
  const pushEdge = (
    count: number,
    fx: (t: number) => number,
    fy: (t: number) => number,
    nx: number,
    ny: number,
  ) => {
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const wobble = Math.sin(t * Math.PI * 6 + i * 1.4) * inset * 0.42;
      const spike = i % 2 === 0 ? inset * 0.7 : inset * 0.18;
      outer.push([fx(t) + nx * wobble * 0.25 + nx * spike * 0.15, fy(t) + ny * wobble * 0.25 + ny * spike * 0.15]);
      inner.push([
        fx(t) + nx * (inset * 0.85 + wobble * 0.5),
        fy(t) + ny * (inset * 0.85 + wobble * 0.5),
      ]);
    }
  };
  pushEdge(jags, (t) => -hw + t * w, () => -hh, 0, 1);
  pushEdge(jags, () => hw, (t) => -hh + t * h, -1, 0);
  pushEdge(jags, (t) => hw - t * w, () => hh, 0, -1);
  pushEdge(jags, () => -hw, (t) => hh - t * h, 1, 0);

  g.lineStyle(Math.max(1.4, rim / 16), ink, 0.92);
  strokePoly(g, outer, true);
  g.lineStyle(1, bone, 0.55);
  strokePoly(g, inner, true);
  }

  walkSides(hw, hh, rim * 0.22, Math.max(9, Math.round(rim * 0.38)), rim * 0.45, (x, y, nx, ny) => {
    const tx = -ny;
    const ty = nx;
    const len = rim * 0.38;
    g.fillStyle(ink, 0.9);
    g.fillTriangle(
      x + tx * 1.6,
      y + ty * 1.6,
      x - tx * 1.6,
      y - ty * 1.6,
      x + nx * len,
      y + ny * len,
    );
  });

  const corners: [number, number, number][] = [
    [-hw + rim * 0.55, -hh + rim * 0.55, 0.4],
    [hw - rim * 0.55, -hh + rim * 0.55, 2.2],
    [hw - rim * 0.55, hh - rim * 0.55, 3.8],
    [-hw + rim * 0.55, hh - rim * 0.55, 5.2],
  ];
  for (const [cx, cy, ang] of corners) {
    drawVolute(g, cx, cy, ang, rim * 0.42, ink, 0.8, Math.max(1, rim / 22));
  }

  if (wantRails() && rim >= 20) {
    const s = Math.max(5, rim * 0.28);
    g.lineStyle(Math.max(1, rim / 22), bone, 0.9);
    g.strokeEllipse(0, -hh + rim * 0.52, s * 1.55, s * 1.25);
    g.fillStyle(ink, 0.85);
    g.fillCircle(-s * 0.32, -hh + rim * 0.48, s * 0.16);
    g.fillCircle(s * 0.32, -hh + rim * 0.48, s * 0.16);
    const cy = hh - rim * 0.55;
    g.lineStyle(Math.max(1.2, rim / 20), bone, 0.9);
    g.lineBetween(0, cy - s * 0.85, 0, cy + s * 0.7);
    g.lineBetween(-s * 0.45, cy - s * 0.15, s * 0.45, cy - s * 0.15);
    g.lineBetween(-s * 0.22, cy + s * 0.55, s * 0.22, cy + s * 0.55);
  }

  root.add(g);
  const highlight = addFrameHighlight(scene, root, w, h, metal);
  return {
    root,
    highlightTarget: highlight as unknown as BuiltRaceFrame["highlightTarget"],
    baseTint: metal,
    paperColor: style.paperColor,
  };
}

/** Portrait fallback: sinuous bronze-patina rim (screen uses `screen_frame_moderne.png`). */
function buildModerneNouveau(
  scene: Phaser.Scene,
  root: Phaser.GameObjects.Container,
  w: number,
  h: number,
  metal: number,
  style: RacePortraitStyle,
  rimPx?: number,
): BuiltRaceFrame {
  const g = scene.add.graphics().setName("frameLayer");
  const hw = w / 2;
  const hh = h / 2;
  const rim = rimPx ?? 13;
  const bronze = metal;
  const bronzeHi = liftColor(metal, 36);
  const patina = 0x6a7a52;
  const berry = 0x8a4038;

  fillInsetRim(g, hw, hh, w, h, 0, rim, 0x1a1610, 1);
  fillInsetRim(g, hw, hh, w, h, 1, Math.max(2, rim * 0.2), bronze, 0.88);
  fillInsetRim(g, hw, hh, w, h, Math.max(3, rim * 0.4), Math.max(1, rim * 0.12), patina, 0.45);
  fillInsetRim(g, hw, hh, w, h, Math.max(4, rim * 0.72), 1, bronzeHi, 0.55);

  if (wantRails()) {
  const samples = Math.max(28, Math.round(Math.min(w, h) / 8));
  const wave = rim * 0.3;
  const whip: [number, number][] = [];
  const inner: [number, number][] = [];
  const pushEdge = (
    count: number,
    fx: (t: number) => number,
    fy: (t: number) => number,
    nx: number,
    ny: number,
  ) => {
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const swell = Math.sin(t * Math.PI * 3.4) * wave + Math.sin(t * Math.PI * 8.2 + 0.5) * wave * 0.32;
      whip.push([fx(t) + nx * swell, fy(t) + ny * swell]);
      inner.push([fx(t) + nx * (swell * 0.45 + rim * 0.18), fy(t) + ny * (swell * 0.45 + rim * 0.18)]);
    }
  };
  const inn = rim * 0.38;
  pushEdge(samples, (t) => -hw + inn + t * (w - inn * 2), () => -hh + inn, 0, 1);
  pushEdge(samples, () => hw - inn, (t) => -hh + inn + t * (h - inn * 2), -1, 0);
  pushEdge(samples, (t) => hw - inn - t * (w - inn * 2), () => hh - inn, 0, -1);
  pushEdge(samples, () => -hw + inn, (t) => hh - inn - t * (h - inn * 2), 1, 0);

  g.lineStyle(Math.max(1.6, rim / 13), bronze, 0.95);
  strokePoly(g, whip, true);
  g.lineStyle(1, patina, 0.7);
  strokePoly(g, inner, true);
  strokeInsetRect(g, hw, hh, w, h, rim * 0.12, 1, bronzeHi, 0.45);
  }

  const leaf = Math.max(3, rim * 0.2);
  const corners: [number, number, number, number][] = [
    [-hw + rim * 0.55, -hh + rim * 0.55, 0.75, 0.75],
    [hw - rim * 0.55, -hh + rim * 0.55, -0.75, 0.75],
    [hw - rim * 0.55, hh - rim * 0.55, -0.75, -0.75],
    [-hw + rim * 0.55, hh - rim * 0.55, 0.75, -0.75],
  ];
  for (const [cx, cy, nx, ny] of corners) {
    drawVolute(g, cx, cy, Math.atan2(ny, nx), leaf * 1.8, bronze, 0.8, Math.max(1, rim / 20));
    drawLeaf(g, cx, cy, nx, ny, leaf * 1.6, patina);
    drawLeaf(g, cx, cy, ny, -nx, leaf * 1.15, patina, 0.75);
    drawLeaf(g, cx, cy, -ny, nx, leaf * 1.15, patina, 0.75);
    g.fillStyle(berry, 0.9);
    g.fillCircle(cx + nx * leaf * 0.35, cy + ny * leaf * 0.35, leaf * 0.22);
    g.fillCircle(cx + ny * leaf * 0.28, cy - nx * leaf * 0.28, leaf * 0.16);
    g.fillCircle(cx - ny * leaf * 0.2, cy + nx * leaf * 0.2, leaf * 0.14);
  }

  if (wantRails() && rim >= 22) {
    const mids: [number, number, number, number][] = [
      [0, -hh + rim * 0.5, 0, 1],
      [0, hh - rim * 0.5, 0, -1],
      [-hw + rim * 0.5, 0, 1, 0],
      [hw - rim * 0.5, 0, -1, 0],
    ];
    for (const [x, y, nx, ny] of mids) {
      drawLeaf(g, x, y, nx, ny, leaf * 1.4, patina);
      g.fillStyle(berry, 0.85);
      g.fillCircle(x + nx * leaf * 0.4, y + ny * leaf * 0.4, leaf * 0.16);
    }
  }

  root.add(g);
  const highlight = addFrameHighlight(scene, root, w, h, metal);
  return {
    root,
    highlightTarget: highlight as unknown as BuiltRaceFrame["highlightTarget"],
    baseTint: metal,
    paperColor: style.paperColor,
  };
}

/** Portrait / procedural fallback: sepia manuscript filigree on cream parchment. */
function buildFolioManuscript(
  scene: Phaser.Scene,
  root: Phaser.GameObjects.Container,
  w: number,
  h: number,
  metal: number,
  style: RacePortraitStyle,
  rimPx?: number,
): BuiltRaceFrame {
  const g = scene.add.graphics().setName("frameLayer");
  const hw = w / 2;
  const hh = h / 2;
  const rim = rimPx ?? 12;
  const ink = metal;
  const inkHi = liftColor(metal, 28);
  const cream = 0xe6d6b0;
  const creamSh = 0xc8b48c;

  fillInsetRim(g, hw, hh, w, h, 0, rim, cream, 1);
  fillInsetRim(g, hw, hh, w, h, 0, Math.max(1, rim * 0.12), creamSh, 0.55);
  strokeInsetRect(g, hw, hh, w, h, 1.2, Math.max(1, rim / 18), ink, 0.92);
  strokeInsetRect(g, hw, hh, w, h, rim * 0.22, 1, ink, 0.55);
  strokeInsetRect(g, hw, hh, w, h, rim - 1.4, 1, ink, 0.88);

  if (wantRails()) {
    const spacing = Math.max(5, rim * 0.42);
    walkSides(hw, hh, rim * 0.48, spacing, rim * 1.35, (x, y, nx, ny) => {
      const px = x + nx * rim * 0.12;
      const py = y + ny * rim * 0.12;
      g.fillStyle(ink, 0.82);
      g.fillCircle(px, py, Math.max(0.6, rim * 0.055));
      g.lineStyle(Math.max(1, rim / 22), ink, 0.55);
      g.lineBetween(px, py, px + nx * rim * 0.18, py + ny * rim * 0.18);
    });
  }

  const leaf = Math.max(3, rim * 0.22);
  const corners: [number, number, number, number][] = [
    [-hw + rim * 0.55, -hh + rim * 0.55, 0.72, 0.72],
    [hw - rim * 0.55, -hh + rim * 0.55, -0.72, 0.72],
    [hw - rim * 0.55, hh - rim * 0.55, -0.72, -0.72],
    [-hw + rim * 0.55, hh - rim * 0.55, 0.72, -0.72],
  ];
  for (const [cx, cy, nx, ny] of corners) {
    drawPalmette(g, cx, cy, nx, ny, leaf * 1.7, ink);
    drawVolute(g, cx, cy, Math.atan2(ny, nx), leaf * 1.6, ink, 0.9, Math.max(1, rim / 18));
    drawLeaf(g, cx, cy, ny, -nx, leaf * 1.1, inkHi, 0.8);
    drawLeaf(g, cx, cy, -ny, nx, leaf * 1.1, inkHi, 0.8);
  }

  root.add(g);
  const highlight = addFrameHighlight(scene, root, w, h, metal);
  return {
    root,
    highlightTarget: highlight as unknown as BuiltRaceFrame["highlightTarget"],
    baseTint: metal,
    paperColor: style.paperColor,
  };
}

/** Apply targeting highlight onto a built frame’s highlight target. */
export function tintRaceFrameHighlight(
  target: BuiltRaceFrame["highlightTarget"],
  baseTint: number,
  mode: "valid" | "front" | "back" | "none",
): void {
  if (!target || !("setTint" in target)) return;
  if (mode === "valid") target.setTint(0xffaa66);
  else if (mode === "front") target.setTint(0xc9a227);
  else if (mode === "back") target.setTint(0x888888);
  else target.setTint(baseTint);

  // Procedural frames use a stroke rectangle — show stroke when highlighting
  if (target instanceof Phaser.GameObjects.Rectangle) {
    if (mode === "none") target.setStrokeStyle(2, baseTint, 0);
    else if (mode === "valid") target.setStrokeStyle(3, 0xffaa66, 1);
    else if (mode === "front") target.setStrokeStyle(3, 0xc9a227, 1);
    else target.setStrokeStyle(2, 0x888888, 0.8);
  }
}
