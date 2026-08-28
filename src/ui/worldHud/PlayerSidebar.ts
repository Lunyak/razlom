import Phaser from "phaser";
import type { Army } from "../../game/data";
import { ScreenHitRouter, rectFromCenter, setLeftHudRect, hudImageAlphaAt, HUD_ALPHA_SOLID } from "../ScreenHitRouter";
import { getPanelLayout, PANEL_LAYOUT_IDS, pieceTransform } from "../panelStack/panelLayoutStore";
import type { PanelStack } from "../panelStack";
import {
  applySidebarPlateVariant,
  buildPlayerSidebarStack,
  layoutPlayerSidebarStack,
  PLAYER_SIDEBAR_LAYERS,
  PLAYER_SIDEBAR_EDITOR_PIECES,
  PLAYER_SIDEBAR_PIECE_CATALOG,
  refreshPlayerSidebarPieces,
  sidebarPanelOrigin,
  sidebarPieceBaseMetrics,
  sidebarPieceBounds,
  type PlayerSidebarPieces,
  type SidebarPieceBounds,
} from "./playerSidebarRecipe";
import {
  activeSidebarVariant,
  loadSidebarVariantPreference,
  setActiveSidebarVariant,
  sidebarVariantLayout,
  type SidebarVariantId,
} from "./sidebarVariants";
import { viewSize } from "../viewport";
import type { PlayerSidebarActions } from "./playerSidebarTypes";

export type { PlayerSidebarActions, SidebarButtonId } from "./playerSidebarTypes";

/**
 * Left player plate — assembled from {@link PLAYER_SIDEBAR_LAYERS} via PanelStack.
 */
export class PlayerSidebar {
  private stack!: PanelStack;
  private pieces!: PlayerSidebarPieces;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly actions: PlayerSidebarActions,
  ) {}

  build(): void {
    loadSidebarVariantPreference();
    const built = buildPlayerSidebarStack(this.scene, this.actions);
    this.stack = built.stack;
    this.pieces = built.pieces;
  }

  get activeVariantId(): SidebarVariantId {
    return activeSidebarVariant().id;
  }

  setVariant(id: SidebarVariantId): void {
    setActiveSidebarVariant(id);
    applySidebarPlateVariant(this.pieces);
  }

  get panelStack(): PanelStack {
    return this.stack;
  }

  get editorPieceIds(): readonly string[] {
    return PLAYER_SIDEBAR_EDITOR_PIECES;
  }

  get editorCatalog(): readonly { id: string; label: string }[] {
    return PLAYER_SIDEBAR_PIECE_CATALOG;
  }

  pieceBounds(pieceId: string, screenW: number, screenH: number) {
    return sidebarPieceBounds(pieceId, screenW, screenH);
  }

  pieceBaseMetrics(pieceId: string) {
    return sidebarPieceBaseMetrics(pieceId);
  }

  /** Bottom → top layer list (for gallery / debug). */
  describeStack(): string[] {
    return this.stack.describeStack();
  }

  layout(screenW: number, screenH: number): void {
    layoutPlayerSidebarStack(this.stack, this.pieces, screenW, screenH);
  }

  registerHits(hits: ScreenHitRouter, screenW: number, screenH: number): void {
    const vl = sidebarVariantLayout(screenW, screenH);
    const cfg = getPanelLayout(PANEL_LAYOUT_IDS.playerSidebar);
    const origin = vl.fullWindow
      ? { x: 0, y: 0 }
      : sidebarPanelOrigin(screenW, screenH);
    const btnT = pieceTransform(cfg, "buttons");
    const btnW = vl.sideBtnW * btnT.scaleX;
    const btnH = vl.sideBtnH * btnT.scaleY;
    for (let i = 0; i < this.pieces.buttons.length; i++) {
      const btn = this.pieces.buttons[i]!;
      const bx =
        vl.sideBtnLayout === "row"
          ? origin.x + (vl.sideBtnXs[i] ?? vl.sideCx) + btnT.x
          : origin.x + vl.sideCx + btnT.x;
      const by = origin.y + btn.designY + btnT.y;
      hits.add({
        id: btn.id,
        z: 10,
        rect: rectFromCenter(bx, by, btnW, btnH),
        onDown: btn.action,
      });
    }
    setLeftHudRect({
      left: origin.x,
      top: origin.y,
      right: origin.x + vl.sidebarW,
      bottom: screenH,
    });
  }

  /**
   * True when the pointer is on opaque plate pixels or the portrait hole.
   * Full-window plates must not treat the map hole as HUD.
   */
  coversPointer(x: number, y: number): boolean {
    if (!this.pieces?.plate?.visible) return false;
    const { w, h } = viewSize(this.scene);
    const vl = sidebarVariantLayout(w, h);
    if (vl.fullWindow) {
      const portrait = sidebarPieceBounds("portrait", w, h);
      if (portrait && hitPieceBounds(portrait, x, y)) return true;
      return hudImageAlphaAt(this.pieces.plate, x, y) >= HUD_ALPHA_SOLID;
    }
    for (const id of ["portrait", "fill", "stepsValue", "nameText", "turnText"] as const) {
      const b = sidebarPieceBounds(id, w, h);
      if (!b) continue;
      if (hitPieceBounds(b, x, y)) return true;
    }
    const plate = this.pieces.plate;
    const box = plate.getBounds();
    if (x < box.x || x > box.x + box.width || y < box.y || y > box.y + box.height) return false;
    const alpha = hudImageAlphaAt(plate, x, y);
    if (alpha >= HUD_ALPHA_SOLID) return true;
    const probe = hudImageAlphaAt(plate, box.x + box.width * 0.5, box.y + box.height * 0.08);
    return probe < HUD_ALPHA_SOLID;
  }

  hover(hitId: string | undefined): void {
    for (const btn of this.pieces.buttons) {
      btn.label.setColor(hitId === btn.id ? "#fff0c0" : "#e8d5a3");
    }
  }

  setVisible(visible: boolean): void {
    this.stack.setVisible(visible);
  }

  refresh(army: Army | undefined, turn: number): void {
    refreshPlayerSidebarPieces(this.pieces, army, turn);
  }
}

export { PLAYER_SIDEBAR_LAYERS, PLAYER_SIDEBAR_EDITOR_PIECES, PLAYER_SIDEBAR_PIECE_CATALOG };

function hitPieceBounds(b: SidebarPieceBounds, x: number, y: number): boolean {
  if (b.kind === "circle") {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const rx = Math.max(4, b.w / 2);
    const ry = Math.max(4, b.h / 2);
    const dx = (x - cx) / rx;
    const dy = (y - cy) / ry;
    return dx * dx + dy * dy <= 1;
  }
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}
