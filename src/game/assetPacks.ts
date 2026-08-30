import type Phaser from "phaser";
import { RI_BUILDING_ART_ASSETS } from "./buildingsArt";
import { SPELL_ICON_ASSETS } from "./catalog/spells";
import { POTION_ASSETS } from "./items";
import {
  FORMATION_FRAME_PATHS,
  GLASS_PHOTO_ASSETS,
  PORTRAIT_DEF_IDS,
  UNIT_INFO_CARD_ASSETS,
  ARMY_INFO_CARD_ASSETS,
  hurtPortraitPath,
  hurtPortraitTextureKey,
  portraitPath,
  portraitTextureKey,
} from "./portraits";
import { TERRAIN_ART_ASSETS } from "./terrainArt";
import { MAP_FLAG_ASSETS, MAP_TOKEN_ASSETS } from "./mapTokens";
import { MAP_ARMY_WALK_ASSETS } from "./armyWalk";
import { FOLIO_FRAME_ASSETS } from "../ui/screenFolioFrame";
import { RACE_FRAME_ASSETS, SCREEN_FRAME_ASSETS } from "../ui/raceFrameConstructor";
import { CHARCOAL_FRAME_ASSETS } from "../ui/screenCharcoalFrame";
import { MAP_VOID_ASSET } from "../ui/mapVoid";
import { BATTLE_BG_ASSET } from "../ui/battleHud/battleStage";
import { BATTLE_SLOT_IRON_ASSET } from "../ui/battleFormationPlate";
import { BATTLE_WINDOW_ASSET } from "../ui/battleHud/battleWindowFrame";

export type AssetEntry = [string, string];

/** Boot / title screen only. */
export const MENU_ASSETS: AssetEntry[] = [["menu_splash", "assets/ui/menu_splash.png"]];

const WORLD_UI_ASSETS: AssetEntry[] = [
  MAP_VOID_ASSET,
  ["ui_sidebar", "assets/ui/ui_sidebar_panel.png"],
  ["ui_sidebar_folk_harp", "assets/ui/ui_sidebar_folk_harp.png"],
  ["ui_world_frame_gothic", "assets/ui/ui_world_frame_gothic.png"],
  ["ui_portrait_frame", "assets/ui/ui_portrait_frame.png"],
  ["ui_parchment", "assets/ui/ui_parchment.png"],
  ["ui_btn_circle", "assets/ui/ui_btn_circle.png"],
  ["ui_btn_end_turn", "assets/ui/ui_btn_end_turn.png"],
  ["ui_btn_end_turn_hover", "assets/ui/ui_btn_end_turn_hover.png"],
  ["ui_minimap_frame", "assets/ui/ui_minimap_frame.png"],
  ["icon_gold", "assets/ui/icon_gold.png"],
  ["icon_mana", "assets/ui/icon_mana.png"],
  ["icon_people", "assets/ui/icon_people.png"],
  ["icon_coal", "assets/ui/icon_coal.png"],
  ["icon_steel", "assets/ui/icon_steel.png"],
  ["icon_city", "assets/ui/icon_city.png"],
  ["icon_bag", "assets/ui/icon_bag.png"],
  ["icon_magic", "assets/ui/icon_magic.png"],
  ["icon_turn", "assets/ui/icon_turn.png"],
  ["ui_city_window", "assets/ui/ui_city_window.png"],
  ["ui_city_header", "assets/ui/ui_city_header.png"],
  ["ui_city_btn", "assets/ui/ui_city_btn.png"],
  ["ui_city_card", "assets/ui/ui_city_card.png"],
];

const IDLE_PORTRAIT_ASSETS: AssetEntry[] = PORTRAIT_DEF_IDS.map((defId) => [
  portraitTextureKey(defId),
  portraitPath(defId),
]);

const HURT_PORTRAIT_ASSETS: AssetEntry[] = PORTRAIT_DEF_IDS.map((defId) => [
  hurtPortraitTextureKey(defId),
  hurtPortraitPath(defId),
]);

/** Map / editor — terrain, HUD, buildings, idle portraits, race chrome. */
export const WORLD_ASSETS: AssetEntry[] = [
  ...WORLD_UI_ASSETS,
  ...IDLE_PORTRAIT_ASSETS,
  ...RI_BUILDING_ART_ASSETS,
  ...TERRAIN_ART_ASSETS,
  ...MAP_TOKEN_ASSETS,
  ...MAP_FLAG_ASSETS,
  ...MAP_ARMY_WALK_ASSETS,
  ...POTION_ASSETS,
  ...GLASS_PHOTO_ASSETS,
  ...RACE_FRAME_ASSETS,
  ...SCREEN_FRAME_ASSETS,
  ...CHARCOAL_FRAME_ASSETS,
  ...FOLIO_FRAME_ASSETS,
  ...ARMY_INFO_CARD_ASSETS,
];

/** Turn-queue command icons (skip / defend / flee / quick) + splat backing. */
export const BATTLE_ACTION_ASSETS: AssetEntry[] = [
  ["skill_icon_backing", "assets/ui/skill_icon_backing.png"],
  ["skill_skip", "assets/ui/skills/skill_skip.png"],
  ["skill_defend", "assets/ui/skills/skill_defend.png"],
  ["skill_flee", "assets/ui/skills/skill_flee.png"],
  ["skill_quick", "assets/ui/skills/skill_quick.png"],
];

/** Battle-only extras (hurt plates, formations, inspect cards). */
export const BATTLE_ASSETS: AssetEntry[] = [
  BATTLE_BG_ASSET,
  BATTLE_WINDOW_ASSET,
  ...HURT_PORTRAIT_ASSETS,
  ...FORMATION_FRAME_PATHS,
  ...UNIT_INFO_CARD_ASSETS,
  ...GLASS_PHOTO_ASSETS,
  ...RACE_FRAME_ASSETS,
  ...POTION_ASSETS,
  ["combat_focus_frame", "assets/ui/combat_focus_frame.png"],
  BATTLE_SLOT_IRON_ASSET,
  ...SPELL_ICON_ASSETS,
  ...BATTLE_ACTION_ASSETS,
];

/** Keys that may 404 — procedural / chalk fallback; must not stall the loader. */
export const OPTIONAL_ASSET_KEYS = new Set(
  [
    BATTLE_BG_ASSET,
    BATTLE_WINDOW_ASSET,
    BATTLE_SLOT_IRON_ASSET,
    ...SPELL_ICON_ASSETS,
    ...BATTLE_ACTION_ASSETS,
    ...FORMATION_FRAME_PATHS,
    ...RACE_FRAME_ASSETS,
    ...SCREEN_FRAME_ASSETS,
    ...CHARCOAL_FRAME_ASSETS,
    ...FOLIO_FRAME_ASSETS,
    ...TERRAIN_ART_ASSETS,
    ...MAP_TOKEN_ASSETS,
    ...MAP_FLAG_ASSETS,
    ...MAP_ARMY_WALK_ASSETS,
    ...UNIT_INFO_CARD_ASSETS,
    ...ARMY_INFO_CARD_ASSETS,
  ].map(([key]) => key),
);

/** Queue images that are not already in the texture cache. */
export function queueAssetPack(scene: Phaser.Scene, pack: AssetEntry[]): void {
  for (const [key, path] of pack) {
    if (!scene.textures.exists(key)) {
      scene.load.image(key, path);
    }
  }
}

/**
 * Keep Phaser’s parallel queue moving when optional files 404
 * (otherwise missing frames can leave the loader hung).
 */
export function attachOptionalLoadPump(scene: Phaser.Scene, optionalKeys = OPTIONAL_ASSET_KEYS): void {
  const loader = scene.load as Phaser.Loader.LoaderPlugin & {
    list?: { size: number };
    inflight?: { size: number };
    checkLoadQueue?: () => void;
    __optionalPumpAttached?: boolean;
  };
  if (loader.__optionalPumpAttached) return;
  loader.__optionalPumpAttached = true;

  const pumpLoader = () => {
    if (
      loader.isLoading() &&
      (loader.list?.size ?? 0) > 0 &&
      (loader.inflight?.size ?? 0) < loader.maxParallelDownloads
    ) {
      loader.checkLoadQueue?.();
    }
  };
  scene.load.on("loaderror", (file: Phaser.Loader.File) => {
    if (optionalKeys.has(file.key)) {
      console.info(`[frames] no drop-in for ${file.key} — using procedural`);
    }
    pumpLoader();
  });
  scene.load.on("filecomplete", pumpLoader);
}
