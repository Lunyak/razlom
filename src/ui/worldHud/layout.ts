/**
 * World HUD layout contract (design pixels).
 *
 * Numbers live in ui/chrome/worldHud.ts. This file re-exports them and
 * keeps layout functions (minimap, charcoal chrome).
 *
 * PNG plate `ui_sidebar_panel.png` is punched to these windows — keep
 * `scripts/build_player_sidebar_plate.py` in sync if you move numbers.
 */
import type { CharcoalChrome } from "../screenCharcoalFrame";
import { END_TURN_BTN, MINIMAP_FRAME, MINIMAP_INSET } from "../chrome";
import { activeSidebarVariant, sidebarVariantLayout } from "./sidebarVariants";

export {
  MINIMAP_FRAME,
  MINIMAP_INSET,
  NAME_ROW_Y,
  PORTRAIT_FRAME,
  PORTRAIT_Y,
  SIDEBAR_ART_H,
  SIDEBAR_W,
  SIDE_BTN_H,
  SIDE_BTN_W,
  SIDE_BTN_YS,
  SIDE_CX,
  STEPS_VALUE_Y,
  END_TURN_BTN,
} from "../chrome";

export {
  activeSidebarVariant,
  getActiveSidebarVariantId,
  loadSidebarVariantPreference,
  setActiveSidebarVariant,
  sidebarVariantAssetEntries,
  sidebarVariantLayout,
  worldGutterW,
  SIDEBAR_VARIANT_LIST,
  type SidebarVariantId,
} from "./sidebarVariants";

export type MinimapLayout = {
  cx: number;
  cy: number;
  frame: number;
  mapX: number;
  mapY: number;
  mapW: number;
  mapH: number;
  /** True when the map sits in a plate slot (no separate jewel frame). */
  embedded: boolean;
};

export function minimapLayout(screenW: number, screenH: number): MinimapLayout {
  const box = sidebarVariantLayout(screenW, screenH).minimapBox;
  if (box) {
    return {
      cx: box.x + box.w / 2,
      cy: box.y + box.h / 2,
      frame: Math.max(box.w, box.h),
      mapX: box.x,
      mapY: box.y,
      mapW: box.w,
      mapH: box.h,
      embedded: true,
    };
  }
  const inner = MINIMAP_FRAME - MINIMAP_INSET * 2;
  const cx = screenW - MINIMAP_FRAME / 2;
  const cy = screenH - MINIMAP_FRAME / 2;
  return {
    cx,
    cy,
    frame: MINIMAP_FRAME,
    mapX: cx - inner / 2,
    mapY: cy - inner / 2,
    mapW: inner,
    mapH: inner,
    embedded: false,
  };
}

export type EndTurnButtonLayout = { cx: number; cy: number; size: number };

/** End-turn medallion: left of the corner minimap, or bottom-right when the map is in the plate. */
export function endTurnButtonLayout(screenW: number, screenH: number): EndTurnButtonLayout {
  const mm = minimapLayout(screenW, screenH);
  const size = END_TURN_BTN;
  if (mm.embedded) {
    return { cx: screenW - size / 2 - 20, cy: screenH - size / 2 - 22, size };
  }
  return {
    cx: mm.cx - mm.frame / 2 - size / 2 - 12,
    cy: mm.cy,
    size,
  };
}

export function hitsMinimap(x: number, y: number, screenW: number, screenH: number): boolean {
  const mm = minimapLayout(screenW, screenH);
  if (mm.embedded) {
    return x >= mm.mapX && x < mm.mapX + mm.mapW && y >= mm.mapY && y < mm.mapY + mm.mapH;
  }
  const hw = mm.frame / 2;
  return x >= mm.cx - hw && x <= mm.cx + hw && y >= mm.cy - hw && y <= mm.cy + hw;
}

/** Charcoal frame around the full game window (sidebar + map). */
export function mapCharcoalChrome(screenW: number, screenH: number): CharcoalChrome {
  return {
    box: { x: 0, y: 0, w: screenW, h: screenH },
    skipMolding: !!activeSidebarVariant().fullWindow,
  };
}
