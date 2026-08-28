import Phaser from "phaser";
import type { Army } from "../../game/data";
import type { Terrain } from "../../game/world";
import { session } from "../../game/data";
import { SITE_COLOR } from "../../game/sites";
import { RI_FIELD_KHAKI } from "../../game/factionVisual";

export type MinimapPaintModel = {
  army: Army | undefined;
  map: Terrain[][];
  fog: boolean[][];
  visible: boolean[][];
  cols: number;
  rows: number;
};

export function paintMinimap(
  gfx: Phaser.GameObjects.Graphics,
  model: MinimapPaintModel,
  box: { mapX: number; mapY: number; mapW: number; mapH: number },
  opts?: { armyDotRadius?: number; viewRect?: boolean; chromeStroke?: boolean },
): void {
  gfx.clear();
  const { mapX, mapY, mapW, mapH } = box;
  const cellW = mapW / model.cols;
  const cellH = mapH / model.rows;
  const armyDotRadius = opts?.armyDotRadius ?? 3;

  gfx.fillStyle(0x0a0908, 1);
  gfx.fillRect(mapX, mapY, mapW, mapH);

  for (let y = 0; y < model.rows; y++) {
    for (let x = 0; x < model.cols; x++) {
      if (!model.fog[y]?.[x]) continue;
      const terrain = model.map[y][x];
      let color = 0x2f4d2f;
      if (terrain === "water") color = 0x2a4a6a;
      else if (terrain === "road") color = 0x6b5a3e;
      else if (terrain === "mountain" || terrain === "mountain_foot") color = 0x666666;
      else if (terrain === "forest") color = 0x284020;
      gfx.fillStyle(color, model.visible[y][x] ? 1 : 0.7);
      gfx.fillRect(
        mapX + x * cellW,
        mapY + y * cellH,
        Math.max(1, cellW),
        Math.max(1, cellH),
      );
    }
  }

  if (opts?.chromeStroke !== false) {
    gfx.lineStyle(1, 0xc9a227, 0.55);
    gfx.strokeRect(mapX + 0.5, mapY + 0.5, mapW - 1, mapH - 1);
  }

  for (const site of session.state.sites) {
    if (site.mapId !== session.state.currentMapId) continue;
    if (!model.fog[site.y]?.[site.x]) continue;
    gfx.fillStyle(SITE_COLOR[site.kind] ?? 0xc9a227, 1);
    gfx.fillRect(
      mapX + site.x * cellW + cellW * 0.25,
      mapY + site.y * cellH + cellH * 0.25,
      Math.max(1, cellW * 0.5),
      Math.max(1, cellH * 0.5),
    );
  }

  for (const otherArmy of session.state.armies) {
    if (otherArmy.mapId !== session.state.currentMapId) continue;
    if (!model.fog[otherArmy.y]?.[otherArmy.x]) continue;
    const dotX = mapX + otherArmy.x * cellW + cellW / 2;
    const dotY = mapY + otherArmy.y * cellH + cellH / 2;
    const dotColor = otherArmy.isPlayer
      ? RI_FIELD_KHAKI
      : otherArmy.isNeutral
        ? 0xd0b050
        : otherArmy.faction === "ordo"
          ? 0xa0b0c8
          : 0xff5050;
    gfx.fillStyle(dotColor, 1);
    gfx.fillCircle(dotX, dotY, armyDotRadius);
  }

  if (opts?.viewRect !== false && model.army) {
    const viewCols = 8;
    const viewRows = 6;
    const rx = mapX + Math.max(0, model.army.x - viewCols / 2) * cellW;
    const ry = mapY + Math.max(0, model.army.y - viewRows / 2) * cellH;
    gfx.lineStyle(1.5, 0xf5e6c8, 0.9);
    gfx.strokeRect(rx, ry, viewCols * cellW, viewRows * cellH);
  }
}

export function tileAtMinimap(
  px: number,
  py: number,
  box: { mapX: number; mapY: number; mapW: number; mapH: number },
  cols: number,
  rows: number,
): { gx: number; gy: number } | null {
  if (px < box.mapX || py < box.mapY || px >= box.mapX + box.mapW || py >= box.mapY + box.mapH) {
    return null;
  }
  if (cols <= 0 || rows <= 0 || box.mapW <= 0 || box.mapH <= 0) return null;
  const gx = Math.max(0, Math.min(cols - 1, Math.floor(((px - box.mapX) / box.mapW) * cols)));
  const gy = Math.max(0, Math.min(rows - 1, Math.floor(((py - box.mapY) / box.mapH) * rows)));
  return { gx, gy };
}
