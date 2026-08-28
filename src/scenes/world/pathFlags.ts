import { isoDiamondPoints } from "../../game/iso";
import type { GridPos } from "../../game/world";

export type PathOrderKind = "move" | "attack";

export interface PendingPathOrder {
  armyId: string;
  dest: GridPos;
  kind: PathOrderKind;
  path: GridPos[];
}

type IsoTop = (x: number, y: number) => { sx: number; sy: number };
type IsoCenter = (x: number, y: number) => { cx: number; cy: number };

const MOVE_FILL = 0xd4af37;
const ATTACK_FILL = 0xa84840;

/** Disciples-style pennants: first click marks the path, second click commits. */
export function paintPathFlags(
  gfx: Phaser.GameObjects.Graphics,
  order: PendingPathOrder | null,
  isoTop: IsoTop,
  isoCenter: IsoCenter,
): void {
  gfx.clear();
  if (!order || order.path.length < 2) return;

  const { sx, sy } = isoTop(order.dest.x, order.dest.y);
  const fill = order.kind === "attack" ? ATTACK_FILL : MOVE_FILL;
  gfx.fillStyle(fill, order.kind === "attack" ? 0.42 : 0.5);
  gfx.fillPoints(isoDiamondPoints(sx, sy), true);
  gfx.lineStyle(3, fill, 1);
  gfx.strokePoints(isoDiamondPoints(sx, sy), true);

  const steps = order.path.slice(1);
  for (let i = 0; i < steps.length; i++) {
    const cell = steps[i];
    const { cx, cy } = isoCenter(cell.x, cell.y);
    paintPennant(gfx, cx, cy, order.kind, i === steps.length - 1);
  }
}

function paintPennant(
  gfx: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  kind: PathOrderKind,
  isDest: boolean,
): void {
  const scale = isDest ? 1.45 : 1.2;
  const pole = 26 * scale;
  const cloth = 18 * scale;
  const drop = 12 * scale;
  const ox = cx + 6;
  const oy = cy + 4;
  const hx = ox + 4;
  const hy = oy - pole;

  gfx.lineStyle(2.2, 0x2a2318, 1);
  gfx.lineBetween(ox, oy, hx, hy);

  const clothFill = kind === "attack" ? (isDest ? 0xc45c54 : 0xd08078) : isDest ? 0xf0d070 : 0xe8d5a3;
  gfx.fillStyle(clothFill, 1);
  gfx.fillTriangle(hx + 1, hy + 1, hx + 1, hy + drop, hx + 1 + cloth, hy + drop * 0.55);
  gfx.lineStyle(1.2, 0x1a1510, 0.9);
  gfx.strokeTriangle(hx + 1, hy + 1, hx + 1, hy + drop, hx + 1 + cloth, hy + drop * 0.55);
}
