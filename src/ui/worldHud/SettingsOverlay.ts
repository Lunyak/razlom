import Phaser from "phaser";
import { menuDirge } from "../../audio/menuDirge";
import { session } from "../../game/data";
import { settingsEndTurnLabel } from "../../game/dayNight";
import {
  cycleDisplayResolution,
  fullscreenLabel,
  resolutionLabel,
  toggleFullscreen,
} from "../displayPrefs";
import { viewSize } from "../viewport";

const FONT = "Georgia, serif";
const GOLD = "#c9a227";
const GOLD_SOFT = "#e8d5a3";
const GOLD_MUTED = "#c8b890";
const HOVER = "#fff0c0";
const PLATE_W = 520;
const PLATE_H = 560;

export type SettingsOverlayActions = {
  onGoMenu: () => void;
  onCity?: () => void;
  onInventory?: () => void;
  onEndTurn?: () => void;
};

/**
 * World settings plate: gramophone, volume, resolution, city / bag / end-turn.
 */
export class SettingsOverlay {
  private root?: Phaser.GameObjects.Container;
  private playBtn?: Phaser.GameObjects.Text;
  private trackTitle?: Phaser.GameObjects.Text;
  private volPct?: Phaser.GameObjects.Text;
  private volBar?: Phaser.GameObjects.Graphics;
  private muteBtn?: Phaser.GameObjects.Text;
  private resValue?: Phaser.GameObjects.Text;
  private fsBtn?: Phaser.GameObjects.Text;
  private endTurnLabel?: Phaser.GameObjects.Text;
  private readonly actions: SettingsOverlayActions;

  constructor(scene: Phaser.Scene, actions: SettingsOverlayActions);
  constructor(scene: Phaser.Scene, onGoMenu: () => void);
  constructor(
    private readonly scene: Phaser.Scene,
    actions: SettingsOverlayActions | (() => void),
  ) {
    this.actions = typeof actions === "function" ? { onGoMenu: actions } : actions;
  }

  isOpen(): boolean {
    return !!this.root?.visible;
  }

  toggle(): void {
    if (this.isOpen()) this.hide();
    else this.show();
  }

  show(): void {
    if (this.root) {
      const { w, h } = viewSize(this.scene);
      this.root.setPosition(w / 2, h / 2).setVisible(true);
      this.refreshMusicUi();
      this.refreshVolumeUi();
      this.refreshDisplayUi();
      this.endTurnLabel?.setText(settingsEndTurnLabel(session.state));
      return;
    }
    this.build();
    this.endTurnLabel?.setText(settingsEndTurnLabel(session.state));
  }

  hide(): void {
    this.root?.setVisible(false);
  }

  layout(w: number, h: number): void {
    if (this.root?.visible) this.root.setPosition(w / 2, h / 2);
  }

  private build(): void {
    const { w, h } = viewSize(this.scene);
    const root = this.scene.add.container(w / 2, h / 2).setDepth(90).setScrollFactor(0);

    const backdrop = this.scene.add
      .rectangle(0, 0, 4000, 4000, 0x000000, 0.55)
      .setInteractive()
      .on("pointerdown", () => this.hide());

    const plate = this.scene.add.rectangle(0, 0, PLATE_W, PLATE_H, 0x1a1410, 0.96).setStrokeStyle(2, 0xc9a227, 0.7);
    plate.setInteractive();
    plate.on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
    });

    const title = this.scene.add
      .text(0, -238, "НАСТРОЙКИ", {
        fontFamily: FONT,
        fontSize: "26px",
        color: GOLD_SOFT,
      })
      .setOrigin(0.5);

    const prevBtn = this.ctl("‹", -96, -178, () => {
      void menuDirge.start().then(() => {
        menuDirge.prevTrack();
        this.refreshMusicUi();
      });
    });
    this.playBtn = this.ctl("▶", -56, -178, () => {
      void menuDirge.toggle().then(() => this.refreshMusicUi());
    });
    const nextBtn = this.ctl("›", -16, -178, () => {
      void menuDirge.start().then(() => {
        menuDirge.nextTrack();
        this.refreshMusicUi();
      });
    });
    this.trackTitle = this.scene.add
      .text(16, -178, "", {
        fontFamily: FONT,
        fontSize: "16px",
        color: GOLD_SOFT,
      })
      .setOrigin(0, 0.5)
      .setWordWrapWidth(220, true);

    const volLabel = this.scene.add
      .text(-220, -118, "Громкость", {
        fontFamily: FONT,
        fontSize: "16px",
        color: GOLD_MUTED,
      })
      .setOrigin(0, 0.5);
    const volMinus = this.ctl("−", -70, -118, () => {
      menuDirge.setVolume(Math.round((menuDirge.getVolume() - 0.1) * 10) / 10);
      this.refreshVolumeUi();
    });
    this.volBar = this.scene.add.graphics();
    this.volPct = this.scene.add
      .text(86, -118, "", {
        fontFamily: FONT,
        fontSize: "15px",
        color: GOLD_SOFT,
      })
      .setOrigin(0.5);
    const volPlus = this.ctl("+", 148, -118, () => {
      menuDirge.setVolume(Math.round((menuDirge.getVolume() + 0.1) * 10) / 10);
      this.refreshVolumeUi();
    });
    this.muteBtn = this.ctl("Выкл", 206, -118, () => {
      menuDirge.toggleMuted();
      this.refreshVolumeUi();
    });
    this.muteBtn.setFontSize(15);

    const resLabel = this.scene.add
      .text(-220, -62, "Разрешение", {
        fontFamily: FONT,
        fontSize: "16px",
        color: GOLD_MUTED,
      })
      .setOrigin(0, 0.5);
    const resPrev = this.ctl("‹", -28, -62, () => {
      cycleDisplayResolution(this.scene.game, -1);
      this.refreshDisplayUi();
    });
    this.resValue = this.scene.add
      .text(86, -62, "", {
        fontFamily: FONT,
        fontSize: "16px",
        color: GOLD_SOFT,
      })
      .setOrigin(0.5);
    const resNext = this.ctl("›", 200, -62, () => {
      cycleDisplayResolution(this.scene.game, 1);
      this.refreshDisplayUi();
    });

    this.fsBtn = this.scene.add
      .text(0, -14, "", {
        fontFamily: FONT,
        fontSize: "18px",
        color: GOLD_SOFT,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.fsBtn.on("pointerover", () => this.fsBtn?.setColor(HOVER));
    this.fsBtn.on("pointerout", () => this.fsBtn?.setColor(GOLD_SOFT));
    this.fsBtn.on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      toggleFullscreen(this.scene.game);
      this.refreshDisplayUi();
    });

    const cityBtn = this.cmdBtn(0, 42, "Город (C)", () => this.actions.onCity?.());
    const bagBtn = this.cmdBtn(0, 92, "Сумка (I)", () => this.actions.onInventory?.());
    const endBtn = this.cmdBtn(0, 142, settingsEndTurnLabel(session.state), () => this.actions.onEndTurn?.());
    this.endTurnLabel = endBtn;

    const menuBtn = this.scene.add
      .text(0, 200, "[ В меню ]", {
        fontFamily: FONT,
        fontSize: "20px",
        color: GOLD,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    menuBtn.on("pointerover", () => menuBtn.setColor(HOVER));
    menuBtn.on("pointerout", () => menuBtn.setColor(GOLD));
    menuBtn.on("pointerdown", (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      this.actions.onGoMenu();
    });

    const hint = this.scene.add
      .text(0, 246, "Окно не растягивает игру · Esc — закрыть", {
        fontFamily: FONT,
        fontSize: "14px",
        color: GOLD_MUTED,
      })
      .setOrigin(0.5);

    root.add([
      backdrop,
      plate,
      title,
      prevBtn,
      this.playBtn,
      nextBtn,
      this.trackTitle,
      volLabel,
      volMinus,
      this.volBar,
      this.volPct,
      volPlus,
      this.muteBtn,
      resLabel,
      resPrev,
      this.resValue,
      resNext,
      this.fsBtn,
      cityBtn,
      bagBtn,
      endBtn,
      menuBtn,
      hint,
    ]);
    this.root = root;
    this.refreshMusicUi();
    this.refreshVolumeUi();
    this.refreshDisplayUi();

    const onFs = () => this.refreshDisplayUi();
    this.scene.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, onFs);
    this.scene.scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, onFs);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.scale.off(Phaser.Scale.Events.ENTER_FULLSCREEN, onFs);
      this.scene.scale.off(Phaser.Scale.Events.LEAVE_FULLSCREEN, onFs);
    });
  }

  private ctl(label: string, x: number, y: number, onClick: () => void): Phaser.GameObjects.Text {
    const btn = this.scene.add
      .text(x, y, label, {
        fontFamily: FONT,
        fontSize: "22px",
        color: GOLD,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    btn.on("pointerover", () => btn.setColor(HOVER));
    btn.on("pointerout", () => btn.setColor(GOLD));
    btn.on("pointerdown", (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      onClick();
    });
    return btn;
  }

  private cmdBtn(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Text {
    const btn = this.scene.add
      .text(x, y, label, {
        fontFamily: FONT,
        fontSize: "18px",
        color: GOLD_SOFT,
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    btn.on("pointerover", () => btn.setColor(HOVER));
    btn.on("pointerout", () => btn.setColor(GOLD_SOFT));
    btn.on("pointerdown", (_p: Phaser.Input.Pointer, _lx: number, _ly: number, event: Phaser.Types.Input.EventData) => {
      event.stopPropagation();
      onClick();
      this.hide();
    });
    return btn;
  }

  private refreshMusicUi(): void {
    const st = menuDirge.getState();
    this.playBtn?.setText(st.running && !st.paused ? "❚❚" : "▶");
    this.trackTitle?.setText(st.track.title);
  }

  private refreshVolumeUi(): void {
    const v = menuDirge.getVolume();
    const muted = menuDirge.isMuted();
    this.volPct?.setText(`${Math.round(v * 100)}%`);
    this.muteBtn?.setText(muted ? "Звук" : "Выкл");

    const g = this.volBar;
    if (!g) return;
    const x = -48;
    const y = -123;
    const bw = 108;
    const bh = 10;
    g.clear();
    g.fillStyle(0x3a3020, 1);
    g.fillRect(x, y, bw, bh);
    g.lineStyle(1, 0xc9a227, muted ? 0.35 : 0.7);
    g.strokeRect(x, y, bw, bh);
    g.fillStyle(0xc9a227, muted ? 0.35 : 0.9);
    g.fillRect(x, y, bw * v, bh);
  }

  private refreshDisplayUi(): void {
    this.resValue?.setText(resolutionLabel());
    this.fsBtn?.setText(fullscreenLabel(this.scene.game));
  }
}
