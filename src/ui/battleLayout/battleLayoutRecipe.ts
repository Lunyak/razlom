import { GLASS_PHOTO_SIZE } from "../../game/vintagePortrait";
import {
  BATTLE_CHROME_BOTTOM,
  charcoalInnerBottom,
  type CharcoalBox,
} from "../screenCharcoalFrame";
import {
  getPanelLayout,
  pieceTransform,
  type PanelLayoutConfig,
} from "../panelStack/panelLayoutStore";
import {
  battleArenaRect,
  battleFormationBounds,
  battleFormationCenter,
  battleSlotToPos,
} from "../battleFormationLayout";

export const BATTLE_LAYOUT_ID = "battle-scene";

/** Medallion on-screen size (matches BattleFocusWindows). */
export const BATTLE_FOCUS_FRAME = Math.round((352 * 2) / 3);

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
  { id: BATTLE_LAYOUT_PIECES.hudTitle, label: "Заголовок «БОЙ»" },
  { id: BATTLE_LAYOUT_PIECES.hudStatus, label: "Строка статуса" },
  { id: BATTLE_LAYOUT_PIECES.hudSpell, label: "Строка заклинаний" },
  { id: BATTLE_LAYOUT_PIECES.hudBag, label: "Сумка" },
];

const { frameW, frameH } = GLASS_PHOTO_SIZE;
const ACTION_BAR_W = 148 * 4 + 10 * 3;
const ACTION_BAR_H = 40;
const BAG_SIZE = 48;
const HUD_TITLE_H = 36;
const HUD_STATUS_H = 22;
const HUD_SPELL_H = 18;

function scaledRect(w: number, h: number, sx: number, sy: number) {
  return { w: Math.max(8, w * sx), h: Math.max(8, h * sy) };
}

export function battleCharcoalBox(w: number, h: number): CharcoalBox {
  return {
    x: 8,
    y: 8,
    w: w - 16,
    h: Math.max(120, h - 8 - BATTLE_CHROME_BOTTOM),
  };
}

export function battleRestBottom(w: number, h: number): number {
  return charcoalInnerBottom(battleCharcoalBox(w, h));
}

export function resolveFormationAnchor(
  w: number,
  h: number,
  cfg: PanelLayoutConfig = getPanelLayout(BATTLE_LAYOUT_ID),
): { battleCx: number; formationStartY: number } {
  const center = pieceTransform(cfg, BATTLE_LAYOUT_PIECES.formationCenter);
  return {
    battleCx: w / 2 + center.x,
    formationStartY: Math.max(140, Math.round(h * 0.28)) + center.y,
  };
}

export function battleArenaLayoutRect(w: number, h: number) {
  const cfg = getPanelLayout(BATTLE_LAYOUT_ID);
  const t = pieceTransform(cfg, BATTLE_LAYOUT_PIECES.arena);
  const base = battleArenaRect(w, h);
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
  const pos = battleSlotToPos(side, slot, anchor.battleCx, anchor.formationStartY);
  return { x: pos.x + grid.x, y: pos.y + grid.y };
}

export function battleUnitLayoutPos(
  side: "player" | "enemy",
  slot: number,
  w: number,
  h: number,
): { x: number; y: number } {
  const cfg = getPanelLayout(BATTLE_LAYOUT_ID);
  const def = battleUnitDefaultPos(side, slot, w, h);
  const slotId =
    side === "player"
      ? BATTLE_LAYOUT_PIECES.playerSlot(slot)
      : BATTLE_LAYOUT_PIECES.enemySlot(slot);
  const slotT = pieceTransform(cfg, slotId);
  return { x: def.x + slotT.x, y: def.y + slotT.y };
}

function defaultFocusPositions(w: number, h: number, restBottom?: number) {
  const bottom = restBottom ?? battleRestBottom(w, h);
  const cx = w / 2;
  const y = Math.round(bottom - BATTLE_FOCUS_FRAME / 2);
  const spread = Math.round(BATTLE_FOCUS_FRAME * 0.72);
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

export function battleActionBarPos(w: number, h: number) {
  const cfg = getPanelLayout(BATTLE_LAYOUT_ID);
  const t = pieceTransform(cfg, BATTLE_LAYOUT_PIECES.actionBar);
  return { x: w / 2 + t.x, y: h - 108 + t.y };
}

export function battleHudTitlePos(w: number, _h: number) {
  const cfg = getPanelLayout(BATTLE_LAYOUT_ID);
  const t = pieceTransform(cfg, BATTLE_LAYOUT_PIECES.hudTitle);
  return { x: w / 2 + t.x, y: 28 + t.y };
}

export function battleHudStatusPos(w: number, h: number) {
  const cfg = getPanelLayout(BATTLE_LAYOUT_ID);
  const t = pieceTransform(cfg, BATTLE_LAYOUT_PIECES.hudStatus);
  return { x: w / 2 + t.x, y: h - 65 + t.y };
}

export function battleHudSpellPos(w: number, h: number) {
  const cfg = getPanelLayout(BATTLE_LAYOUT_ID);
  const t = pieceTransform(cfg, BATTLE_LAYOUT_PIECES.hudSpell);
  return { x: w / 2 + t.x, y: h - 40 + t.y };
}

export function battleHudBagPos(_w: number, h: number) {
  const cfg = getPanelLayout(BATTLE_LAYOUT_ID);
  const t = pieceTransform(cfg, BATTLE_LAYOUT_PIECES.hudBag);
  return { x: 80 + t.x, y: h - 108 + t.y };
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
    const b = battleFormationBounds(side, anchor.battleCx, anchor.formationStartY);
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
    const anchor = resolveFormationAnchor(screenW, screenH, cfg);
    const fc = battleFormationCenter(side, anchor.battleCx, anchor.formationStartY);
    const t = pieceTransform(cfg, pieceId);
    const size = scaledRect(fc.w, fc.h, t.scaleX, t.scaleY);
    return {
      x: fc.x - size.w / 2 + t.x,
      y: fc.y - size.h / 2 + t.y,
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
    const size = scaledRect(BATTLE_FOCUS_FRAME, BATTLE_FOCUS_FRAME, t.scaleX, t.scaleY);
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
    const size = scaledRect(BATTLE_FOCUS_FRAME, BATTLE_FOCUS_FRAME, t.scaleX, t.scaleY);
    return {
      x: base.x + t.x - size.w / 2,
      y: base.y + t.y - size.h / 2,
      w: size.w,
      h: size.h,
      kind: "circle",
    };
  }

  if (pieceId === BATTLE_LAYOUT_PIECES.actionBar) {
    const pos = battleActionBarPos(screenW, screenH);
    const t = pieceTransform(cfg, pieceId);
    const base = metrics(pieceId)!;
    const size = scaledRect(base.w, base.h, t.scaleX, t.scaleY);
    return {
      x: pos.x - size.w / 2,
      y: pos.y - size.h / 2,
      w: size.w,
      h: size.h,
      kind: "rect",
    };
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

  return null;
}
