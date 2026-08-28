/**
 * World-map HUD (screen-space, left of / around the iso map).
 *
 * Start here: WorldHud.ts → PlayerSidebar / PlayChrome / SettingsOverlay.
 * Pixel contract: ui/chrome/worldHud.ts (layout.ts re-exports + minimap helpers).
 */
export { WorldHud, SIDEBAR_W } from "./WorldHud";
export { worldGutterW } from "./sidebarVariants";
export type { WorldHudActions, WorldHudRefresh } from "./WorldHud";
export { showGameOverOverlay } from "./GameOverOverlay";
export { WorldMapOverlay } from "./WorldMapOverlay";
export {
  SIDEBAR_ART_H,
  SIDE_BTN_YS,
  SIDE_CX,
  mapCharcoalChrome,
  minimapLayout,
  hitsMinimap,
} from "./layout";
export { PLAYER_SIDEBAR_LAYERS } from "./playerSidebarRecipe";
export {
  activeSidebarVariant,
  getActiveSidebarVariantId,
  SIDEBAR_VARIANT_LIST,
  type SidebarVariantId,
} from "./sidebarVariants";
