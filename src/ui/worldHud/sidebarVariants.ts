/** Left player sidebar plate variants. Table lives in ui/chrome/worldHud.ts. */

import {
  SIDEBAR_W,
  SIDEBAR_VARIANTS,
  SIDEBAR_VARIANT_LIST,
  type SidebarVariantDef,
  type SidebarVariantId,
} from "../chrome";

export type { SidebarVariantId, SidebarPortraitMask, SidebarVariantDef } from "../chrome";
export { SIDEBAR_W, SIDEBAR_VARIANTS, SIDEBAR_VARIANT_LIST };

const STORAGE_KEY = "disciples-like.sidebarVariant.v2";

let activeId: SidebarVariantId = "gothic-frame";

export function getActiveSidebarVariantId(): SidebarVariantId {
  return activeId;
}

export function activeSidebarVariant(): SidebarVariantDef {
  return SIDEBAR_VARIANTS[activeId];
}

export function loadSidebarVariantPreference(): SidebarVariantId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && raw in SIDEBAR_VARIANTS) {
      activeId = raw as SidebarVariantId;
    }
  } catch {
    /* ignore */
  }
  return activeId;
}

export function setActiveSidebarVariant(id: SidebarVariantId): void {
  activeId = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
}

export function sidebarVariantAssetEntries(): [string, string][] {
  return SIDEBAR_VARIANT_LIST.map((v) => [v.textureKey, v.assetPath]);
}

/** Layout numbers for the active variant (used by recipe + editor bounds). */
export function sidebarVariantLayout(screenW = 1280, screenH = 720) {
  const v = activeSidebarVariant();
  const sx = v.fullWindow ? screenW / 1280 : 1;
  const sy = v.fullWindow ? screenH / 720 : 1;
  const sidebarW = Math.round((v.sidebarW ?? SIDEBAR_W) * sx);
  return {
    sidebarW,
    sidebarArtH: v.fullWindow ? screenH : v.artH,
    sideCx: Math.round((v.sideCx ?? (v.sidebarW ?? SIDEBAR_W) / 2) * sx),
    stepsValueY: Math.round(v.stepsValueY * sy),
    nameRowY: Math.round(v.nameRowY * sy),
    portraitY: Math.round(v.portraitY * sy),
    portraitFrame: Math.round(v.portraitFrame * sx),
    portraitFrameH: Math.round((v.portraitFrameH ?? v.portraitFrame) * sy),
    portraitMask: v.portraitMask,
    portraitInset: v.portraitInset ?? (v.portraitMask === "circle" ? 40 : 36),
    hideHudTexts: !!v.hideHudTexts,
    minimapBox: v.minimapBox
      ? {
          x: Math.round(v.minimapBox.x * sx),
          y: Math.round(v.minimapBox.y * sy),
          w: Math.round(v.minimapBox.w * sx),
          h: Math.round(v.minimapBox.h * sy),
        }
      : undefined,
    sideBtnYs: v.sideBtnYs.map((y) => Math.round(y * sy)),
    sideBtnW: Math.round(v.sideBtnW * sx),
    sideBtnH: Math.round(v.sideBtnH * sy),
    fullWindow: !!v.fullWindow,
    sideBtnLayout: v.sideBtnLayout ?? "column",
    sideBtnXs: (v.sideBtnXs ?? []).map((x) => Math.round(x * sx)),
  };
}

/** Left gutter for the iso map — narrower on the full-window gothic plate. */
export function worldGutterW(screenW = 1280): number {
  return sidebarVariantLayout(screenW, Math.round((screenW * 9) / 16)).sidebarW;
}
