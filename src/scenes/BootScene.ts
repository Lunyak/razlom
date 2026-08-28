import Phaser from "phaser";
import { MENU_ASSETS, attachOptionalLoadPump, queueAssetPack } from "../game/assetPacks";
import { isUsableTexture } from "../ui/raceFrameConstructor";
import { applyLoadedState, hasSave, loadGame } from "../game/save";
import {
  getScenario,
  listCustomScenarios,
  loadCustomScenariosFromStorage,
} from "../game/scenario";
import { playScenario, resetGame } from "../game/session";
import { shouldOpenGlassFrameTest } from "./GlassFrameTestScene";
import { shouldOpenRiBuildingsTest } from "./RiBuildingsTestScene";
import { shouldOpenPanelGallery } from "./PanelGalleryTestScene";
import { shouldOpenBattleMechanicsTest } from "./BattleMechanicsTestScene";
import { shouldOpenBattleLayoutTest } from "./BattleLayoutTestScene";
import { loadBuildingOverlayLayoutFromDisk } from "../game/buildingOverlayLayout";
import { onViewResize, viewH, viewSize, viewW } from "../ui/viewport";
import {
  cycleDisplayResolution,
  fullscreenLabel,
  resolutionLabel,
  toggleFullscreen,
} from "../ui/displayPrefs";
import { MenuPhonograph } from "../ui/MenuPhonograph";
import { ScreenCharcoalFrame } from "../ui/screenCharcoalFrame";

const INK = "#efe9df";
const MUTED = "#a8a198";
const GHOST = "#8a847a";
const HOVER = "#ffffff";
const STROKE = "#0a0806";
const FONT = "Georgia, 'Times New Roman', serif";

type MenuKind = "title" | "sub" | "primary" | "ghost" | "label" | "hint";

interface MenuRow {
  obj: Phaser.GameObjects.Text;
  kind: MenuKind;
}

export class BootScene extends Phaser.Scene {
  private splash?: Phaser.GameObjects.Image;
  private rim?: ScreenCharcoalFrame;
  private rows: MenuRow[] = [];
  private phonograph?: MenuPhonograph;
  private resBtn?: Phaser.GameObjects.Text;
  private fsBtn?: Phaser.GameObjects.Text;

  constructor() {
    super("Boot");
  }

  init() {
    this.cameras.main.setBackgroundColor(0x080706);
    this.add
      .text(viewW(this) / 2, viewH(this) / 2, "Загрузка…", {
        fontFamily: FONT,
        fontSize: "22px",
        color: MUTED,
      })
      .setOrigin(0.5)
      .setName("loadingLabel");
  }

  preload() {
    attachOptionalLoadPump(this);
    queueAssetPack(this, MENU_ASSETS);
  }

  create() {
    this.children.getByName("loadingLabel")?.destroy();
    this.cameras.main.setBackgroundColor(0x080706);
    loadCustomScenariosFromStorage();
    this.rows = [];

    if (isUsableTexture(this, "menu_splash")) {
      this.splash = this.add.image(0, 0, "menu_splash").setOrigin(0.5).setDepth(0);
    }

    this.addRow("title", "РАЗЛОМ");
    this.addRow("sub", "Часть I  ·  1914  ·  Ordo Lumen несёт Pax");

    this.addButton("Новая игра", "primary", () => {
      resetGame();
      this.scene.start("World");
    });

    if (hasSave()) {
      this.addButton("Продолжить", "primary", () => {
        const loaded = loadGame();
        if (loaded) {
          applyLoadedState(loaded);
          this.scene.start("World");
        }
      });
    }

    this.addButton("Редактор карт", "ghost", () => {
      this.scene.start("Editor");
    });
    this.addButton("Править 1914", "ghost", () => {
      this.scene.start("Editor", { scenarioId: "1914-frontier" });
    });
    this.addButton("Тест · стилистика RI / Ordo", "ghost", () => {
      window.location.hash = "test/glass";
      this.scene.start("GlassFrameTest");
    });
    this.addButton("Тест · панели UI", "ghost", () => {
      window.location.hash = "test/panels";
      this.scene.start("PanelGalleryTest");
    });
    this.addButton("Конструктор · экран боя", "ghost", () => {
      window.location.hash = "test/battle-layout";
      this.scene.start("BattleLayoutTest");
    });
    this.addButton("Тест · механики боя", "ghost", () => {
      window.location.hash = "test/battle";
      this.scene.start("BattleMechanicsTest");
    });
    this.addButton("Тест · редактор построек РИ", "ghost", () => {
      window.location.hash = "test/buildings";
      this.scene.start("RiBuildingsTest");
    });

    void loadBuildingOverlayLayoutFromDisk();

    const custom = listCustomScenarios();
    if (custom.length > 0) {
      this.addRow("label", "Свои сценарии");
      for (const s of custom.slice(0, 4)) {
        const id = s.id;
        this.addButton(s.name, "ghost", () => {
          if (!getScenario(id)) return;
          playScenario(id, null);
          this.scene.start("World");
        });
      }
    }

    this.addRow("hint", "Enter — новая игра   ·   S сохранить   ·   L загрузить");
    this.buildDisplayChrome();

    this.rim = new ScreenCharcoalFrame(this);
    this.layoutMenu();
    onViewResize(this, () => {
      this.layoutMenu();
      this.phonograph?.layout();
    });

    this.cameras.main.fadeIn(1200, 6, 5, 4);

    this.input.keyboard?.once("keydown-ENTER", () => {
      resetGame();
      this.scene.start("World");
    });

    const jump = shouldOpenGlassFrameTest()
      ? "GlassFrameTest"
      : shouldOpenPanelGallery()
        ? "PanelGalleryTest"
        : shouldOpenBattleLayoutTest()
          ? "BattleLayoutTest"
          : shouldOpenBattleMechanicsTest()
            ? "BattleMechanicsTest"
            : shouldOpenRiBuildingsTest()
              ? "RiBuildingsTest"
              : shouldOpenEditor()
                ? "Editor"
                : null;
    if (jump) this.time.delayedCall(0, () => this.scene.start(jump));
    else this.phonograph = new MenuPhonograph(this);
  }

  private addRow(kind: MenuKind, text: string): Phaser.GameObjects.Text {
    const obj = this.add
      .text(0, 0, text, {
        fontFamily: FONT,
        fontSize: "18px",
        color: kind === "title" ? INK : kind === "primary" ? INK : MUTED,
      })
      .setOrigin(0.5)
      .setDepth(10)
      .setStroke(STROKE, kind === "title" ? 6 : 4)
      .setShadow(0, 2, "#000000", kind === "title" ? 10 : 6, true, true);
    if (kind === "title" && typeof obj.setLetterSpacing === "function") {
      obj.setLetterSpacing(14);
    }
    this.rows.push({ obj, kind });
    return obj;
  }

  private buildDisplayChrome(): void {
    const mk = (y: number, onClick: () => void) => {
      const t = this.add
        .text(0, y, "", {
          fontFamily: FONT,
          fontSize: "16px",
          color: GHOST,
        })
        .setOrigin(1, 0)
        .setDepth(20)
        .setStroke(STROKE, 4)
        .setInteractive({ useHandCursor: true });
      t.on("pointerover", () => t.setColor(HOVER));
      t.on("pointerout", () => t.setColor(GHOST));
      t.on("pointerdown", onClick);
      return t;
    };
    this.resBtn = mk(28, () => {
      cycleDisplayResolution(this.game, 1);
      this.refreshDisplayBtns();
    });
    this.fsBtn = mk(52, () => {
      toggleFullscreen(this.game);
      this.refreshDisplayBtns();
    });
    this.refreshDisplayBtns();

    const onFs = () => this.refreshDisplayBtns();
    this.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, onFs);
    this.scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, onFs);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.ENTER_FULLSCREEN, onFs);
      this.scale.off(Phaser.Scale.Events.LEAVE_FULLSCREEN, onFs);
    });
  }

  private refreshDisplayBtns(): void {
    this.resBtn?.setText(`Разрешение · ${resolutionLabel()}`);
    this.fsBtn?.setText(fullscreenLabel(this.game));
  }

  private addButton(label: string, kind: "primary" | "ghost", onClick: () => void) {
    const idle = kind === "primary" ? INK : GHOST;
    const btn = this.addRow(kind, label).setInteractive({ useHandCursor: true });
    btn.on("pointerover", () => btn.setColor(HOVER));
    btn.on("pointerout", () => btn.setColor(idle));
    btn.on("pointerdown", onClick);
    return btn;
  }

  private fitSplash(w: number, h: number) {
    const img = this.splash;
    if (!img) return;
    const src = img.texture.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const tw = Math.max(1, src.width || img.width);
    const th = Math.max(1, src.height || img.height);
    const scale = Math.max(w / tw, h / th);
    img.setPosition(w / 2, h / 2).setDisplaySize(tw * scale, th * scale);
  }

  private layoutMenu() {
    const { w, h } = viewSize(this);
    this.fitSplash(w, h);
    this.rim?.layout();
    this.resBtn?.setPosition(w - 36, 28);
    this.fsBtn?.setPosition(w - 36, 52);
    const cx = w / 2;
    const s = Math.min(w, h);

    const sizes: Record<MenuKind, number> = {
      title: Phaser.Math.Clamp(s * 0.056, 34, 56),
      sub: Phaser.Math.Clamp(s * 0.018, 13, 18),
      primary: Phaser.Math.Clamp(s * 0.026, 18, 24),
      ghost: Phaser.Math.Clamp(s * 0.02, 14, 18),
      label: Phaser.Math.Clamp(s * 0.016, 12, 15),
      hint: Phaser.Math.Clamp(s * 0.015, 11, 14),
    };
    const gaps: Record<MenuKind, number> = {
      title: s * 0.034,
      sub: s * 0.055,
      primary: s * 0.042,
      ghost: s * 0.034,
      label: s * 0.032,
      hint: 0,
    };

    let needed = 0;
    for (const row of this.rows) needed += gaps[row.kind];
    const top = h * 0.12;
    const bottom = h * 0.68;
    const budget = Math.max(120, bottom - top);
    const squeeze = Math.min(1, budget / Math.max(1, needed));

    let y = top;
    if (needed * squeeze < budget) y += (budget - needed * squeeze) * 0.12;

    for (const row of this.rows) {
      row.obj.setX(cx);
      row.obj.setY(y);
      row.obj.setFontSize(sizes[row.kind] * (squeeze < 0.92 ? squeeze : 1));
      y += gaps[row.kind] * squeeze;
    }
  }
}

function shouldOpenEditor(): boolean {
  const hash = window.location.hash.replace(/^#/, "").toLowerCase();
  return hash === "editor" || hash.startsWith("editor/") || hash === "test/editor";
}
