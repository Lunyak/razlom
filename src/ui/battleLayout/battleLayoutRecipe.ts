import { GLASS_PHOTO_SIZE } from "../../game/vintagePortrait";
import { battleInnerRect, battleStripHeight, battleTurnFrameSize } from "../battleHud/battleWindowFrame";
import {
  battleFormationBounds,
  battleSlotToPos,
} from "../battleFormationLayout";
import { type CharcoalBox } from "../screenCharcoalFrame";
import {
  getPanelLayout,
  pieceTransform,
  type PanelLayoutConfig,
} from "../panelStack/panelLayoutStore";
export const BATTLE_LAYOUT_ID = "battle-scene";

/** Native combat_focus_frame.png — display never exceeds this (no upscale). */
export const BATTLE_FOCUS_SRC = 599;
/** On-screen medallion size (downscale from source). */
export const BATTLE_FOCUS_FRAME = 350;

/** Fit the thorn ring into the inner opening; never larger than the PNG. */
export function battleFocusFrameSize(w: number, h: number): number {
  const inner = battleInnerRect(w, h);
  const stripH = battleStripHeight(inner.h, inner.w);
  const maxH = Math.max(180, inner.h - stripH - 12);
  const maxW = Math.max(180, Math.floor(inner.w * 0.36));
  return Math.min(BATTLE_FOCUS_FRAME, BATTLE_FOCUS_SRC, maxH, maxW);
}

export const BATTLE_LAYOUT_PIECES = {
  arena: "arena",
  formationCenter: "formation-center",
  playerFormation: "player-formation",
  enemyFormation: "enemy-formation",
  playerFrame: "player-frame",
  enemyFrame: "enemy-frame",
  focusActor: "focus-actor",
  focusTarget: "focus-target",
  actionBar: "action-bar",
  turnStrip: "turn-strip",
  hudTitle: "hud-title",
  hudStatus: "hud-status",
  hudSpell: "hud-spell",
  hudBag: "hud-bag",
  playerSlot: (slot: number) => `p-slot-${slot}`,
  enemySlot: (slot: number) => `e-slot-${slot}`,
} as const;

export type BattlePieceBounds = {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: "rect" | "circle";
};

export const BATTLE_PIECE_CATALOG: { id: string; label: string }[] = [
  { id: BATTLE_LAYOUT_PIECES.arena, label: "Поле боя" },
  { id: BATTLE_LAYOUT_PIECES.formationCenter, label: "Центр · линия боя" },
  { id: BATTLE_LAYOUT_PIECES.playerFormation, label: "Отряд игрока (все)" },
  { id: BATTLE_LAYOUT_PIECES.enemyFormation, label: "Отряд врага (все)" },
  { id: BATTLE_LAYOUT_PIECES.playerFrame, label: "Рамка формации · игрок" },
  { id: BATTLE_LAYOUT_PIECES.enemyFrame, label: "Рамка формации · враг" },
  ...Array.from({ length: 6 }, (_, i) => ({
    id: BATTLE_LAYOUT_PIECES.playerSlot(i),
    label: `Игрок · слот ${i + 1}`,
  })),
  ...Array.from({ length: 6 }, (_, i) => ({
    id: BATTLE_LAYOUT_PIECES.enemySlot(i),
    label: `Враг · слот ${i + 1}`,
  })),
  { id: BATTLE_LAYOUT_PIECES.focusActor, label: "Медальон «Ход»" },
  { id: BATTLE_LAYOUT_PIECES.focusTarget, label: "Медальон «Цель»" },
  { id: BATTLE_LAYOUT_PIECES.actionBar, label: "Кнопки боя" },
  { id: BATTLE_LAYOUT_PIECES.turnStrip, label: "Очередь хода" },
  { id: BATTLE_LAYOUT_PIECES.hudTitle, label: "Заголовок «БОЙ»" },
  { id: BATTLE_LAYOUT_PIECES.hudStatus, label: "Строка статуса" },
  { id: BATTLE_LAYOUT_PIECES.hudSpell, label: "Строка заклинаний" },
  { id: BATTLE_LAYOUT_PIECES.hudBag, label: "Сумка" },
];

const { frameW, frameH } = GLASS_PHOTO_SIZE;
/** Matches BattleSpellBar icon size. */
export const BATTLE_ACTION_ICON = 52;
const ACTION_BAR_W = BATTLE_ACTION_ICON + 24;
const ACTION_BAR_H = 4 * (BATTLE_ACTION_ICON + 20);
const BAG_SIZE = 48;
const HUD_TITLE_H = 36;
const HUD_STATUS_H = 22;
const HUD_SPELL_H = 18;

function scaledRect(w: number, h: number, sx: number, sy: number) {
  return { w: Math.max(8, w * sx), h: Math.max(8, h * sy) };
}

export function battleCharcoalBox(w: number, h: number): CharcoalBox {
  const inner = battleInnerRect(w, h);
  const stripH = battleStripHeight(inner.h, inner.w);
  return {
    x: inner.x,
    y: inner.y,
    w: inner.w,
    h: Math.max(80, inner.h - stripH),
  };
}

export function battleRestBottom(w: number, h: number): number {
  const box = battleCharcoalBox(w, h);
  return box.y + box.h;
}

export function resolveFormationAnchor(
  w: number,
  h: number,
  cfg: PanelLayoutConfig = getPanelLayout(BATTLE_LAYOUT_ID),
): { battleCx: number; formationStartY: number } {
  const inner = battleInnerRect(w, h);
  const stripH = battleStripHeight(inner.h, inner.w);
  const stripTop = inner.y + inner.h - stripH;
  const center = pieceTransform(cfg, BATTLE_LAYOUT_PIECES.formationCenter);
  return {
    battleCx: inner.x + inner.w / 2 + center.x,
    formationStartY: Math.max(inner.y + 72, Math.round(inner.y + (stripTop - inner.y) * 0.22)) + center.y,
  };
}

export function battleArenaLayoutRect(w: number, h: number) {
  const cfg = getPanelLayout(BATTLE_LAYOUT_ID);
  const t = pieceTransform(cfg, BATTLE_LAYOUT_PIECES.arena);
  const inner = battleInnerRect(w, h);
  const stripH = battleStripHeight(inner.h, inner.w);
  const base = {
    x: inner.x,
    y: inner.y + 36,
    w: inner.w,
    h: Math.max(80, inner.h - stripH - 36),
  };
  const size = scaledRect(base.w, base.h, t.scaleX, t.scaleY);
  return {
    x: base.x + t.x,
    y: base.y + t.y,
    w: size.w,
    h: size.h,
  };
}

function gridDefault(side: "player" | "enemy", w: number, h: number) {
  const cfg = getPanelLayout(BATTLE_LAYOUT_ID);
  const anchor = resolveFormationAnchor(w, h, cfg);
  const gridId =
    side === "player"
      ? BATTLE_LAYOUT_PIECES.playerFormation
      : BATTLE_LAYOUT_PIECES.enemyFormation;
  const grid = pieceTransform(cfg, gridId);
  return { anchor, grid };
}

export function battleUnitDefaultPos(
  side: "player" | "enemy",
  slot: number,
  w: number,
  h: number,
): { x: number; y: number } {
  const { anchor, grid } = gridDefault(side, w, h);
  const inner = battleInnerRect(w, h);
  const pos = battleSlotToPos(side, slot, inner, anchor.formationStartY);
  return { x: pos.x + grid.x, y: pos.y + grid.y };
}

export function battleUnitLayoutPos(
  side: "player" | "enemy",
  slot: number,
  w: number,
  h: number,
): { x: number; y: number } {
  return battleUnitDefaultPos(side, slot, w, h);
}

function defaultFocusPositions(w: number, h: number, _restBottom?: number) {
  const inner = battleInnerRect(w, h);
  const stripH = battleStripHeight(inner.h, inner.w);
  const frame = battleFocusFrameSize(w, h);
  const cx = inner.x + inner.w / 2;
  const y = Math.round(inner.y + (inner.h - stripH) / 2);
  const spread = Math.round(frame * 0.5);
  return {
    actor: { x: cx - spread, y },
    target: { x: cx + spread, y },
  };
}

export function battleFocusActorPos(w: number, h: number, restBottom?: number) {
  const cfg = getPanelLayout(BATTLE_LAYOUT_ID);
  const t = pieceTransform(cfg, BATTLE_LAYOUT_PIECES.focusActor);
  const base = defaultFocusPositions(w, h, restBottom).actor;
  return { x: base.x + t.x, y: base.y + t.y };
}

export function battleFocusTargetPos(w: number, h: number, restBottom?: number) {
  const cfg = getPanelLayout(BATTLE_LAYOUT_ID);
  const t = pieceTransform(cfg, BATTLE_LAYOUT_PIECES.focusTarget);
  const base = defaultFocusPositions(w, h, restBottom).target;
  return { x: base.x + t.x, y: base.y + t.y };
}

export type BattleActionSlotId = "skip" | "defend" | "flee" | "quick";

const ACTION_COL: BattleActionSlotId[] = ["quick", "skip", "defend", "flee"];
const ACTION_COL_STEP = BATTLE_ACTION_ICON + 20;

/** Command icons on the inner flank of the player's 2×3 frames. */
export function battleActionButtonPositions(
  w: number,
  h: number,
): Record<BattleActionSlotId, { x: number; y: number }> {
  const cfg = getPanelLayout(BATTLE_LAYOUT_ID);
  const t = pieceTransform(cfg, BATTLE_LAYOUT_PIECES.actionBar);
  const inner = battleInnerRect(w, h);
  const anchor = resolveFormationAnchor(w, h, cfg);
  const grid = battleFormationBounds("player", inner, anchor.formationStartY);
  const x = grid.x + grid.w + BATTLE_ACTION_ICON * 0.55 + t.x;
  const total = (ACTION_COL.length - 1) * ACTION_COL_STEP;
  const y0 = grid.y + grid.h / 2 - total / 2 + t.y;
  const spots = {} as Record<BattleActionSlotId, { x: number; y: number }>;
  ACTION_COL.forEach((id, i) => {
    spots[id] = { x, y: y0 + i * ACTION_COL_STEP };
  });
  return spots;
}

export function battleActionBarPos(w: number, h: number) {
  const p = battleActionButtonPositions(w, h);
  return {
    x: (p.skip.x + p.defend.x + p.flee.x + p.quick.x) / 4,
    y: (p.skip.y + p.defend.y + p.flee.y + p.quick.y) / 4,
  };
}

export function battleHudTitlePos(w: number, h: number) {
  const cfg = getPanelLayout(BATTLE_LAYOUT_ID);
  const t = pieceTransform(cfg, BATTLE_LAYOUT_PIECES.hudTitle);
  const inner = battleInnerRect(w, h);
  return { x: inner.x + inner.w / 2 + t.x, y: inner.y + 8 + t.y };
}

export function battleHudStatusPos(w: number, h: number) {
  const cfg = getPanelLayout(BATTLE_LAYOUT_ID);
  const t = pieceTransform(cfg, BATTLE_LAYOUT_PIECES.hudStatus);
  const inner = battleInnerRect(w, h);
  const stripH = battleStripHeight(inner.h, inner.w);
  return { x: inner.x + inner.w / 2 + t.x, y: inner.y + inner.h - stripH - 70 + t.y };
}

export function battleHudSpellPos(w: number, h: number) {
  const cfg = getPanelLayout(BATTLE_LAYOUT_ID);
  const t = pieceTransform(cfg, BATTLE_LAYOUT_PIECES.hudSpell);
  const inner = battleInnerRect(w, h);
  const actor = defaultFocusPositions(w, h).actor;
  return {
    x: inner.x + inner.w / 2 + t.x,
    y: actor.y - battleFocusFrameSize(w, h) / 2 - 40 + t.y,
  };
}

export function battleHudBagPos(w: number, h: number) {
  const cfg = getPanelLayout(BATTLE_LAYOUT_ID);
  const t = pieceTransform(cfg, BATTLE_LAYOUT_PIECES.hudBag);
  const inner = battleInnerRect(w, h);
  const stripH = battleStripHeight(inner.h, inner.w);
  return { x: inner.x + 64 + t.x, y: inner.y + inner.h - stripH - 28 + t.y };
}

export function battleTurnStripRect(
  w: number,
  h: number,
  opts: { rightInset?: number } = {},
) {
  const cfg = getPanelLayout(BATTLE_LAYOUT_ID);
  const t = pieceTransform(cfg, BATTLE_LAYOUT_PIECES.turnStrip);
  const inner = battleInnerRect(w, h);
  const inset = opts.rightInset ?? 0;
  const width = Math.max(80, inner.w - inset);
  const frame = battleTurnFrameSize(width);
  const stripH = Math.max(64, Math.round(frame * Math.min(1, t.scaleY || 1)));
  return {
    x: inner.x + t.x,
    y: inner.y + inner.h - stripH + t.y,
    w: width * (t.scaleX || 1),
    h: stripH,
  };
}

export function battlePieceBaseMetrics(pieceId: string): { w: number; h: number } | null {
  if (pieceId.startsWith("p-slot-") || pieceId.startsWith("e-slot-")) {
    return { w: frameW, h: frameH };
  }
  switch (pieceId) {
    case BATTLE_LAYOUT_PIECES.arena:
      return { w: 900, h: 480 };
    case BATTLE_LAYOUT_PIECES.playerFormation:
    case BATTLE_LAYOUT_PIECES.enemyFormation:
      return { w: 320, h: 360 };
    case BATTLE_LAYOUT_PIECES.playerFrame:
    case BATTLE_LAYOUT_PIECES.enemyFrame:
      return { w: 340, h: 380 };
    case BATTLE_LAYOUT_PIECES.focusActor:
    case BATTLE_LAYOUT_PIECES.focusTarget:
      return { w: BATTLE_FOCUS_FRAME, h: BATTLE_FOCUS_FRAME };
    case BATTLE_LAYOUT_PIECES.actionBar:
      return { w: ACTION_BAR_W, h: ACTION_BAR_H };
    case BATTLE_LAYOUT_PIECES.turnStrip:
      return { w: 1200, h: battleTurnFrameSize(1200) };
    case BATTLE_LAYOUT_PIECES.hudTitle:
      return { w: 220, h: HUD_TITLE_H };
    case BATTLE_LAYOUT_PIECES.hudStatus:
      return { w: 520, h: HUD_STATUS_H };
    case BATTLE_LAYOUT_PIECES.hudSpell:
      return { w: 640, h: HUD_SPELL_H };
    case BATTLE_LAYOUT_PIECES.hudBag:
      return { w: BAG_SIZE, h: BAG_SIZE };
    case BATTLE_LAYOUT_PIECES.formationCenter:
      return { w: 24, h: 24 };
    default:
      return null;
  }
}

export function battlePieceBounds(
  pieceId: string,
  screenW: number,
  screenH: number,
): BattlePieceBounds | null {
  const cfg = getPanelLayout(BATTLE_LAYOUT_ID);
  const metrics = (id: string) => battlePieceBaseMetrics(id);

  if (pieceId === BATTLE_LAYOUT_PIECES.arena) {
    const arena = battleArenaLayoutRect(screenW, screenH);
    return { ...arena, kind: "rect" };
  }

  if (pieceId === BATTLE_LAYOUT_PIECES.formationCenter) {
    const anchor = resolveFormationAnchor(screenW, screenH, cfg);
    const t = pieceTransform(cfg, pieceId);
    const cx = anchor.battleCx + t.x;
    const cy = anchor.formationStartY + t.y;
    const base = metrics(pieceId)!;
    const size = scaledRect(base.w, base.h, t.scaleX, t.scaleY);
    return {
      x: cx - size.w / 2,
      y: cy - size.h / 2,
      w: size.w,
      h: size.h,
      kind: "circle",
    };
  }

  if (pieceId === BATTLE_LAYOUT_PIECES.playerFormation || pieceId === BATTLE_LAYOUT_PIECES.enemyFormation) {
    const side = pieceId === BATTLE_LAYOUT_PIECES.playerFormation ? "player" : "enemy";
    const anchor = resolveFormationAnchor(screenW, screenH, cfg);
    const inner = battleInnerRect(screenW, screenH);
    const b = battleFormationBounds(side, inner, anchor.formationStartY);
    const t = pieceTransform(cfg, pieceId);
    const base = metrics(pieceId)!;
    const size = scaledRect(base.w, base.h, t.scaleX, t.scaleY);
    return {
      x: b.x + b.w / 2 - size.w / 2 + t.x,
      y: b.y + b.h / 2 - size.h / 2 + t.y,
      w: size.w,
      h: size.h,
      kind: "rect",
    };
  }

  if (pieceId === BATTLE_LAYOUT_PIECES.playerFrame || pieceId === BATTLE_LAYOUT_PIECES.enemyFrame) {
    const side = pieceId === BATTLE_LAYOUT_PIECES.playerFrame ? "player" : "enemy";
    const t = pieceTransform(cfg, pieceId);
    const inner = battleInnerRect(screenW, screenH);
    const anchor = resolveFormationAnchor(screenW, screenH, cfg);
    const grid = battleFormationBounds(side, inner, anchor.formationStartY);
    const size = scaledRect(grid.w, grid.h, t.scaleX, t.scaleY);
    return {
      x: grid.x + grid.w / 2 - size.w / 2 + t.x,
      y: grid.y + grid.h / 2 - size.h / 2 + t.y,
      w: size.w,
      h: size.h,
      kind: "rect",
    };
  }

  const slotMatch = pieceId.match(/^(p|e)-slot-(\d)$/);
  if (slotMatch) {
    const side = slotMatch[1] === "p" ? "player" : "enemy";
    const slot = Number(slotMatch[2]);
    const t = pieceTransform(cfg, pieceId);
    const def = battleUnitDefaultPos(side, slot, screenW, screenH);
    const base = metrics(pieceId)!;
    const size = scaledRect(base.w, base.h, t.scaleX, t.scaleY);
    return {
      x: def.x + t.x - size.w / 2,
      y: def.y + t.y - size.h / 2,
      w: size.w,
      h: size.h,
      kind: "rect",
    };
  }

  if (pieceId === BATTLE_LAYOUT_PIECES.focusActor) {
    const t = pieceTransform(cfg, pieceId);
    const base = defaultFocusPositions(screenW, screenH).actor;
    const frame = battleFocusFrameSize(screenW, screenH);
    const size = scaledRect(frame, frame, t.scaleX, t.scaleY);
    return {
      x: base.x + t.x - size.w / 2,
      y: base.y + t.y - size.h / 2,
      w: size.w,
      h: size.h,
      kind: "circle",
    };
  }

  if (pieceId === BATTLE_LAYOUT_PIECES.focusTarget) {
    const t = pieceTransform(cfg, pieceId);
    const base = defaultFocusPositions(screenW, screenH).target;
    const frame = battleFocusFrameSize(screenW, screenH);
    const size = scaledRect(frame, frame, t.scaleX, t.scaleY);
    return {
      x: base.x + t.x - size.w / 2,
      y: base.y + t.y - size.h / 2,
      w: size.w,
      h: size.h,
      kind: "circle",
    };
  }

  if (pieceId === BATTLE_LAYOUT_PIECES.actionBar) {
    const spots = battleActionButtonPositions(screenW, screenH);
    const pad = BATTLE_ACTION_ICON / 2 + 10;
    const xs = Object.values(spots).map((p) => p.x);
    const ys = Object.values(spots).map((p) => p.y);
    const x0 = Math.min(...xs) - pad;
    const y0 = Math.min(...ys) - pad;
    const x1 = Math.max(...xs) + pad;
    const y1 = Math.max(...ys) + pad;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, kind: "rect" };
  }

  if (pieceId === BATTLE_LAYOUT_PIECES.hudTitle) {
    const pos = battleHudTitlePos(screenW, screenH);
    const t = pieceTransform(cfg, pieceId);
    const base = metrics(pieceId)!;
    const size = scaledRect(base.w, base.h, t.scaleX, t.scaleY);
    return {
      x: pos.x - size.w / 2,
      y: pos.y,
      w: size.w,
      h: size.h,
      kind: "rect",
    };
  }

  if (pieceId === BATTLE_LAYOUT_PIECES.hudStatus) {
    const pos = battleHudStatusPos(screenW, screenH);
    const t = pieceTransform(cfg, pieceId);
    const base = metrics(pieceId)!;
    const size = scaledRect(base.w, base.h, t.scaleX, t.scaleY);
    return {
      x: pos.x - size.w / 2,
      y: pos.y,
      w: size.w,
      h: size.h,
      kind: "rect",
    };
  }

  if (pieceId === BATTLE_LAYOUT_PIECES.hudSpell) {
    const pos = battleHudSpellPos(screenW, screenH);
    const t = pieceTransform(cfg, pieceId);
    const base = metrics(pieceId)!;
    const size = scaledRect(base.w, base.h, t.scaleX, t.scaleY);
    return {
      x: pos.x - size.w / 2,
      y: pos.y,
      w: size.w,
      h: size.h,
      kind: "rect",
    };
  }

  if (pieceId === BATTLE_LAYOUT_PIECES.hudBag) {
    const pos = battleHudBagPos(screenW, screenH);
    const t = pieceTransform(cfg, pieceId);
    const base = metrics(pieceId)!;
    const size = scaledRect(base.w, base.h, t.scaleX, t.scaleY);
    return {
      x: pos.x - size.w / 2,
      y: pos.y - size.h / 2,
      w: size.w,
      h: size.h,
      kind: "circle",
    };
  }

  if (pieceId === BATTLE_LAYOUT_PIECES.turnStrip) {
    const strip = battleTurnStripRect(screenW, screenH);
    return { ...strip, kind: "rect" };
  }

  return null;
}
