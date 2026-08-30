/**
 * Battle HUD (screen-space chrome around the combat arena).
 *
 * Start here: BattleHud.ts — title, status, spell line, bag button.
 * Action bar / focus portraits stay in src/ui/BattleActionBar.ts
 * and src/ui/BattleFocusWindows.ts.
 */
export { BattleHud } from "./BattleHud";
export type { BattleHudActions } from "./BattleHud";
export { BattleSpellBar } from "./BattleSpellBar";
export type { SpellBarItem } from "./BattleSpellBar";
export {
  BattleTurnStrip,
  unitsInInitiativeOrder,
  type TurnStripEntry,
} from "./BattleTurnStrip";
export {
  BATTLE_BG_ASSET,
  BATTLE_BG_KEY,
  BATTLE_STAGE_COLOR,
  createBattleStage,
  layoutBattleStage,
  paintBattleArena,
  type BattleStage,
} from "./battleStage";
export {
  BATTLE_WINDOW_ASSET,
  BATTLE_WINDOW_KEY,
  BattleWindowFrame,
  BATTLE_TURN_STRIP_GAP,
  BATTLE_TURN_STRIP_MIN,
  battleInnerRect,
  battleStripHeight,
  battleTurnFrameSize,
  battleWindowFit,
  battleWindowReady,
  setBattleTurnStripCount,
} from "./battleWindowFrame";
