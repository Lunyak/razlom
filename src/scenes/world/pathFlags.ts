import { isoDiamondPoints } from "../../game/iso";
import { turnsToReach, type GridPos } from "../../game/world";

export type PathOrderKind = "move" | "attack";

export interface ArmyPathGoal {
  dest: GridPos;
  kind: PathOrderKind;
  enemyId?: string;
}

export interface PendingPathOrder extends ArmyPathGoal {
  armyId: string;
  path: GridPos[];
  costs: number[];
  movesLeft: number;
  maxMoves: number;
}

type IsoTop = (x: number, y: number) => { sx: number; sy: number };
type IsoCenter = (x: number, y: number) => { cx: number; cy: number };

const MOVE_NOW = 0xd4af37;
const MOVE_LATER = 0x8a7350;
const ATTACK_NOW = 0xa84840;
const ATTACK_LATER = 0x6a4038;

/** Disciples-style pennants: first click marks the path, second click commits. */
export function paintPathFlags(
  gfx: Phaser.GameObjects.Graphics,
  label: Phaser.GameObjects.Text | undefined,
  order: PendingPathOrder | null,
  isoTop: IsoTop,
  isoCenter: IsoCenter,
): void {
  gfx.clear();
  if (label) {
    label.setVisible(false);
  }
  if (!order || order.path.length < 2) return;

  const total = order.costs[order.costs.length - 1] ?? 0;
  const destTurns = turnsToReach(total, order.movesLeft, order.maxMoves);
  const destNow = destTurns <= 1;
  const { sx, sy } = isoTop(order.dest.x, order.dest.y);
  const fill = order.kind === "attack" ? (destNow ? ATTACK_NOW : ATTACK_LATER) : destNow ? MOVE_NOW : MOVE_LATER;
  gfx.fillStyle(fill, destNow ? 0.5 : 0.38);
  gfx.fillPoints(isoDiamondPoints(sx, sy), true);
  gfx.lineStyle(3, fill, 1);
  gfx.strokePoints(isoDiamondPoints(sx, sy), true);

  const steps = order.path.slice(1);
  for (let i = 0; i < steps.length; i++) {
    const cell = steps[i];
    const cost = order.costs[i + 1] ?? 0;
    const later = turnsToReach(cost, order.movesLeft, order.maxMoves) > 1;
    const { cx, cy } = isoCenter(cell.x, cell.y);
    paintPennant(gfx, cx, cy, order.kind, i === steps.length - 1, later);
  }

  if (label && destTurns > 0) {
    const { cx, cy } = isoCenter(order.dest.x, order.dest.y);
    label.setText(String(destTurns));
    label.setColor(destNow ? "#f0d070" : "#d8c8a8");
    label.setPosition(cx + 22, cy - 18);
    label.setVisible(true);
  }
}

function paintPennant(
  gfx: Phaser.GameObjects.Graphics,
  cx: number,
  cy: number,
  kind: PathOrderKind,
  isDest: boolean,
  later: boolean,
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

  const clothFill =
    kind === "attack"
      ? later
        ? isDest
          ? 0x8a5048
          : 0x7a5850
        : isDest
          ? 0xc45c54
          : 0xd08078
      : later
        ? isDest
          ? 0xb8a070
          : 0x9a8860
        : isDest
          ? 0xf0d070
          : 0xe8d5a3;
  gfx.fillStyle(clothFill, 1);
  gfx.fillTriangle(hx + 1, hy + 1, hx + 1, hy + drop, hx + 1 + cloth, hy + drop * 0.55);
  gfx.lineStyle(1.2, 0x1a1510, 0.9);
  gfx.strokeTriangle(hx + 1, hy + 1, hx + 1, hy + drop, hx + 1 + cloth, hy + drop * 0.55);
}
