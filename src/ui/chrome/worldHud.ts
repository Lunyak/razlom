/**
 * World HUD layout contract (design pixels) and sidebar plate variants.
 *
 * Map camera / iso origin start at SIDEBAR_W.
 * PNG plate `ui_sidebar_panel.png` is punched to these windows — keep
 * `scripts/build_player_sidebar_plate.py` in sync if you move numbers.
 */

export const SIDEBAR_W = 480;
/** Authored plate height — extra screen height is filled with rails. */
export const SIDEBAR_ART_H = 720;
export const SIDE_CX = SIDEBAR_W / 2;

export const STEPS_VALUE_Y = 108;
export const NAME_ROW_Y = 175;
export const PORTRAIT_Y = 275;
export const PORTRAIT_FRAME = 240;

export const SIDE_BTN_W = 360;
export const SIDE_BTN_H = 52;
export const SIDE_BTN_YS = [432, 533, 634] as const;

export const MINIMAP_FRAME = 236;
/** Visible metal rim — keep in pixels, not scaled with the PNG. */
export const MINIMAP_INSET = 10;
/** End-turn medallion display size (texture is 512²). */
export const END_TURN_BTN = 168;

export type SidebarVariantId = "ri-glass" | "folk-harp" | "gothic-frame";

export type SidebarPortraitMask = "circle" | "ellipse";

export type SidebarVariantDef = {
  id: SidebarVariantId;
  label: string;
  textureKey: string;
  assetPath: string;
  /** Authored plate height at SIDEBAR_W — extra screen height filled in code. */
  artH: number;
  stepsValueY: number;
  nameRowY: number;
  portraitY: number;
  /** Circle diameter or ellipse width baseline. */
  portraitFrame: number;
  /** Ellipse vertical diameter when mask = ellipse (defaults to portraitFrame). */
  portraitFrameH?: number;
  portraitMask: SidebarPortraitMask;
  sideBtnYs: readonly number[];
  sideBtnW: number;
  sideBtnH: number;
  /** Override left gutter (default SIDEBAR_W). */
  sidebarW?: number;
  /** Portrait / text X center inside the gutter. */
  sideCx?: number;
  /** Full-window PNG (sidebar + map rails). Stretched to the view. */
  fullWindow?: boolean;
  /** Hit-zone layout for the three nav actions. */
  sideBtnLayout?: "column" | "row";
  /** Center X of each nav hit, 1280-space, when sideBtnLayout is row. */
  sideBtnXs?: readonly number[];
  /** Subtracted from portraitFrame when sizing the photo (defaults: circle 40 / ellipse 36). */
  portraitInset?: number;
  /** Hide name / steps overlays — the plate already has those slots in art. */
  hideHudTexts?: boolean;
  /** Inner minimap rect in 1280×720 space (gothic top slot). */
  minimapBox?: { x: number; y: number; w: number; h: number };
};

export const SIDEBAR_VARIANTS: Record<SidebarVariantId, SidebarVariantDef> = {
  "ri-glass": {
    id: "ri-glass",
    label: "RI · золотое стекло",
    textureKey: "ui_sidebar",
    assetPath: "assets/ui/ui_sidebar_panel.png",
    artH: 720,
    stepsValueY: 108,
    nameRowY: 175,
    portraitY: 275,
    portraitFrame: 240,
    portraitMask: "circle",
    sideBtnYs: [432, 533, 634],
    sideBtnW: 360,
    sideBtnH: 52,
  },
  "folk-harp": {
    id: "folk-harp",
    label: "Фолк · арфа",
    textureKey: "ui_sidebar_folk_harp",
    assetPath: "assets/ui/ui_sidebar_folk_harp.png",
    artH: 690,
    stepsValueY: 128,
    nameRowY: 88,
    portraitY: 300,
    portraitFrame: 196,
    portraitFrameH: 256,
    portraitMask: "ellipse",
    sideBtnYs: [520, 585, 650],
    sideBtnW: 300,
    sideBtnH: 48,
  },
  "gothic-frame": {
    id: "gothic-frame",
    label: "Готика · рамка",
    textureKey: "ui_world_frame_gothic",
    assetPath: "assets/ui/ui_world_frame_gothic.png",
    fullWindow: true,
    hideHudTexts: true,
    sidebarW: 180,
    sideCx: 84,
    artH: 720,
    stepsValueY: 75,
    nameRowY: 54,
    portraitY: 266,
    portraitFrame: 100,
    portraitMask: "circle",
    portraitInset: 2,
    minimapBox: { x: 22, y: 42, w: 136, h: 88 },
    sideBtnLayout: "row",
    sideBtnYs: [437, 437, 437],
    sideBtnXs: [27, 68, 109],
    sideBtnW: 41,
    sideBtnH: 46,
  },
};

export const SIDEBAR_VARIANT_LIST = Object.values(SIDEBAR_VARIANTS);
