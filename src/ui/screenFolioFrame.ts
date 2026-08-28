import Phaser from "phaser";
import { isUsableTexture } from "./raceFrameConstructor";

export const FOLIO_CORNER_KEYS = {
  tl: "folio_corner_tl",
  tr: "folio_corner_tr",
  bl: "folio_corner_bl",
  br: "folio_corner_br",
} as const;

export const FOLIO_RAIL_H_KEY = "folio_rail_h";
export const FOLIO_RAIL_V_KEY = "folio_rail_v";

export const FOLIO_FRAME_ASSETS: [string, string][] = [
  [FOLIO_CORNER_KEYS.tl, "assets/ui/folio_corner_tl.png?v=join360"],
  [FOLIO_CORNER_KEYS.tr, "assets/ui/folio_corner_tr.png?v=join360"],
  [FOLIO_CORNER_KEYS.bl, "assets/ui/folio_corner_bl.png?v=join360"],
  [FOLIO_CORNER_KEYS.br, "assets/ui/folio_corner_br.png?v=join360"],
  [FOLIO_RAIL_H_KEY, "assets/ui/folio_rail_h.png?v=join360"],
  [FOLIO_RAIL_V_KEY, "assets/ui/folio_rail_v.png?v=join360"],
];

/** Source crop size in `process_folio_frame.py` — keep in lockstep. */
const FOLIO_CORNER_SRC = 360;
/** Top/bottom rim on the source plate (px). */
const FOLIO_RIM_H = 69;
/** Left/right rim on the source plate (px). */
const FOLIO_RIM_V = 63;

type FolioCornerId = "tl" | "tr" | "bl" | "br";
type Box = { x: number; y: number; w: number; h: number };

const INK = "#3a2414";
const MUTED = "#6a4e32";
const TITLE = "#4a3420";

export function folioAssetsReady(scene: Phaser.Scene): boolean {
  return isUsableTexture(scene, FOLIO_CORNER_KEYS.tl);
}

export function folioPanelWidth(viewW: number): number {
  return Phaser.Math.Clamp(Math.round(viewW * 0.168), 196, 248);
}

/**
 * Manuscript filigree chrome: tiled knotwork rails + ornate corners.
 * `withPanel` adds a left dossier column and a matching vertical divider.
 */
export function paintFolioChrome(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  w: number,
  h: number,
  withPanel: boolean,
): boolean {
  if (!folioAssetsReady(scene) || w < 80 || h < 80) return false;

  if (withPanel) {
    const panelW = folioPanelWidth(w);
    const box = { x: 0, y: 0, w, h };
    const corner = cornerSize(box);
    const rV = Math.max(2, Math.round(FOLIO_RIM_V * (corner / FOLIO_CORNER_SRC)));
    const tuck = Math.round(corner * 0.42);
    paintDossier(scene, parent, panelW, h);
    paintFolioBox(scene, parent, box);
    paintDivider(scene, parent, panelW, h, rV, tuck);
    return true;
  }

  paintFolioBox(scene, parent, { x: 0, y: 0, w, h });
  return true;
}

function paintDossier(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  panelW: number,
  h: number,
): void {
  const g = scene.add.graphics().setScrollFactor(0);
  g.fillStyle(0xe6d6b0, 0.94);
  g.fillRect(1, 1, panelW - 2, h - 2);
  g.fillStyle(0xd8c49a, 0.35);
  g.fillRect(panelW - 10, 1, 10, h - 2);
  parent.add(g);

  const cx = panelW / 2;
  const title = scene.add
    .text(cx, 28, "Досье", {
      fontFamily: "Georgia, serif",
      fontSize: "18px",
      color: TITLE,
    })
    .setOrigin(0.5)
    .setScrollFactor(0);
  parent.add(title);

  const body = scene.add
    .text(
      16,
      56,
      "Герой · Элиана\nОтряд · RI\n\nЗолото  240\nЛюди    18\nХод     3",
      {
        fontFamily: "Georgia, serif",
        fontSize: "14px",
        color: INK,
        lineSpacing: 6,
      },
    )
    .setOrigin(0, 0)
    .setScrollFactor(0);
  parent.add(body);

  const hint = scene.add
    .text(cx, h - 36, "левая панель", {
      fontFamily: "Georgia, serif",
      fontSize: "12px",
      color: MUTED,
    })
    .setOrigin(0.5)
    .setScrollFactor(0);
  parent.add(hint);
}

function paintDivider(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  x: number,
  h: number,
  thick: number,
  tuck: number,
): void {
  paintRailV(scene, parent, x - Math.round(thick / 2), tuck, Math.max(8, h - tuck * 2), thick);
}

function paintFolioBox(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  box: Box,
): void {
  const corner = cornerSize(box);
  const s = corner / FOLIO_CORNER_SRC;
  const rH = Math.max(2, Math.round(FOLIO_RIM_H * s));
  const rV = Math.max(2, Math.round(FOLIO_RIM_V * s));
  // Tuck under the rail-arm of the corner so the crop edge never shows as a seam.
  const tuck = Math.round(corner * 0.42);
  paintRailH(scene, parent, box.x + tuck, box.y, Math.max(8, box.w - tuck * 2), rH);
  paintRailH(scene, parent, box.x + tuck, box.y + box.h - rH, Math.max(8, box.w - tuck * 2), rH);
  paintRailV(scene, parent, box.x, box.y + tuck, Math.max(8, box.h - tuck * 2), rV);
  paintRailV(scene, parent, box.x + box.w - rV, box.y + tuck, Math.max(8, box.h - tuck * 2), rV);
  placeCorner(scene, parent, "tl", box.x, box.y, corner);
  placeCorner(scene, parent, "tr", box.x + box.w - corner, box.y, corner);
  placeCorner(scene, parent, "bl", box.x, box.y + box.h - corner, corner);
  placeCorner(scene, parent, "br", box.x + box.w - corner, box.y + box.h - corner, corner);
}

function cornerSize(box: Box): number {
  return Phaser.Math.Clamp(Math.round(Math.min(box.w, box.h) * 0.22), 176, 268);
}

function placeCorner(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  id: FolioCornerId,
  x: number,
  y: number,
  size: number,
): void {
  const key = FOLIO_CORNER_KEYS[id];
  if (!isUsableTexture(scene, key)) return;
  const img = scene.add.image(x, y, key).setOrigin(0, 0).setScrollFactor(0);
  img.setDisplaySize(size, size);
  parent.add(img);
}

function paintRailH(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  x: number,
  y: number,
  w: number,
  thick: number,
): void {
  if (w < 8 || thick < 2) return;
  if (isUsableTexture(scene, FOLIO_RAIL_H_KEY)) {
    tileRail(scene, parent, FOLIO_RAIL_H_KEY, x, y, w, thick, true);
    return;
  }
  strokeRail(scene, parent, x, y, w, thick, true);
}

function paintRailV(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  x: number,
  y: number,
  h: number,
  thick: number,
): void {
  if (h < 8 || thick < 2) return;
  if (isUsableTexture(scene, FOLIO_RAIL_V_KEY)) {
    tileRail(scene, parent, FOLIO_RAIL_V_KEY, x, y, thick, h, false);
    return;
  }
  strokeRail(scene, parent, x, y, thick, h, false);
}

function tileRail(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  key: string,
  x: number,
  y: number,
  dw: number,
  dh: number,
  horizontal: boolean,
): void {
  const src = scene.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  const native = horizontal ? src.height : src.width;
  const s = native > 0 ? (horizontal ? dh : dw) / native : 1;
  const ts = scene.add.tileSprite(x, y, dw, dh, key).setOrigin(0, 0).setScrollFactor(0);
  ts.tileScaleX = s;
  ts.tileScaleY = s;
  parent.add(ts);
}

function strokeRail(
  scene: Phaser.Scene,
  parent: Phaser.GameObjects.Container,
  x: number,
  y: number,
  w: number,
  h: number,
  horizontal: boolean,
): void {
  const g = scene.add.graphics().setScrollFactor(0);
  g.fillStyle(0xe8d8b4, 0.95);
  g.fillRect(x, y, w, h);
  g.fillStyle(0x3a2414, 0.85);
  if (horizontal) {
    g.fillRect(x, y + 2, w, 1);
    g.fillRect(x, y + h - 3, w, 1);
  } else {
    g.fillRect(x + 2, y, 1, h);
    g.fillRect(x + w - 3, y, 1, h);
  }
  parent.add(g);
}
