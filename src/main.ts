import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { WorldScene } from "./scenes/WorldScene";
import { BattleScene } from "./scenes/BattleScene";
import { EditorScene } from "./scenes/EditorScene";
import { GlassFrameTestScene } from "./scenes/GlassFrameTestScene";
import { RiBuildingsTestScene } from "./scenes/RiBuildingsTestScene";
import { BattleMechanicsTestScene } from "./scenes/BattleMechanicsTestScene";
import { BattleLookTestScene } from "./scenes/BattleLookTestScene";
import { BattleLayoutTestScene } from "./scenes/BattleLayoutTestScene";
import { PanelGalleryTestScene } from "./scenes/PanelGalleryTestScene";
import { bootstrapSession } from "./game/session";
import { loadCustomScenariosFromStorage } from "./game/scenario";
import { getResolution, loadDisplayPrefs } from "./ui/displayPrefs";

loadCustomScenariosFromStorage();
bootstrapSession("part1-1914");

const display = getResolution(loadDisplayPrefs());

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game-root",
  backgroundColor: "#080706",
  loader: { maxParallelDownloads: 128 },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: display.w,
    height: display.h,
    autoRound: true,
    fullscreenTarget: "game-root",
  },
  scene: [
    BootScene,
    WorldScene,
    BattleScene,
    EditorScene,
    GlassFrameTestScene,
    RiBuildingsTestScene,
    BattleMechanicsTestScene,
    BattleLookTestScene,
    BattleLayoutTestScene,
    PanelGalleryTestScene,
  ],
};

new Phaser.Game(config);
