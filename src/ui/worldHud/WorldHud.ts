/**
 * World-map HUD facade.
 *
 * WorldScene owns map / armies / turns. This class owns everything painted
 * in screen space around the map:
 *
 *   PlayerSidebar     — left plate (steps, portrait, ОТРЯД/КАРТА/НАСТРОЙКИ)
 *   PlayChrome        — resources, title, toast, corner minimap
 *   End-turn medallion — left of minimap (or bottom-right on gothic plate)
 *   WorldMapOverlay   — full map (КАРТА / click corner minimap)
 *   SettingsOverlay   — music, volume, город / сумка / ход
 *
 * Clicks: register rects on {@link hits}; WorldScene calls `hits.dispatch`.
 */
import Phaser from "phaser";
import { session, type Army } from "../../game/data";
import { endTurnButtonHint, isNight } from "../../game/dayNight";
import { ScreenHitRouter, rectFromCenter, rectFromXY } from "../ScreenHitRouter";
import { endTurnButtonLayout, mapCharcoalChrome, minimapLayout, SIDEBAR_W } from "./layout";
import { PlayerSidebar, type PlayerSidebarActions } from "./PlayerSidebar";
import { PlayChrome, type MinimapModel, type PlayChromeModel } from "./PlayChrome";
import { SettingsOverlay } from "./SettingsOverlay";
import { WorldMapOverlay } from "./WorldMapOverlay";

export type WorldHudActions = PlayerSidebarActions & {
  onGoMenu: () => void;
  onCity: () => void;
  onInventory: () => void;
  onEndTurn: () => void;
  onContinuePath: () => void;
  onToggleRail: () => void;
  onPickMapTile: (gx: number, gy: number) => void;
};

export type WorldHudRefresh = PlayChromeModel &
  MinimapModel & {
    army: Army | undefined;
    turn: number;
  };

export class WorldHud {
  readonly hits = new ScreenHitRouter();
  readonly sidebar: PlayerSidebar;
  readonly chrome: PlayChrome;
  readonly settings: SettingsOverlay;
  readonly mapOverlay: WorldMapOverlay;
  private built = false;
  private lastMinimap?: MinimapModel;
  private endTurnBtn?: Phaser.GameObjects.Image;
  private endTurnLabel?: Phaser.GameObjects.Text;
  private endTurnSize = 0;
  private endTurnPressTimer?: Phaser.Time.TimerEvent;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly actions: WorldHudActions,
  ) {
    this.sidebar = new PlayerSidebar(scene, {
      onSquad: actions.onSquad,
      onMap: () => this.toggleMap(),
      onSettings: actions.onSettings,
    });
    this.chrome = new PlayChrome(scene);
    this.settings = new SettingsOverlay(scene, {
      onGoMenu: actions.onGoMenu,
      onCity: actions.onCity,
      onInventory: actions.onInventory,
      onEndTurn: actions.onEndTurn,
    });
    this.mapOverlay = new WorldMapOverlay(scene, { onPickTile: actions.onPickMapTile });
  }

  build(): void {
    if (this.built) return;
    this.built = true;
    this.sidebar.build();
    this.chrome.build();
    if (this.scene.textures.exists("ui_btn_end_turn")) {
      this.endTurnBtn = this.scene.add
        .image(0, 0, "ui_btn_end_turn")
        .setScrollFactor(0)
        .setDepth(74)
        .setVisible(true);
      this.endTurnLabel = this.scene.add
        .text(0, 0, "", {
          fontFamily: "Georgia, serif",
          fontSize: "13px",
          color: "#e8d5a3",
          stroke: "#1a1008",
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setScrollFactor(0)
        .setDepth(75)
        .setVisible(true);
    }
  }

  layout(w: number, h: number): void {
    this.sidebar.layout(w, h);
    this.chrome.layout(w, h);
    this.settings.layout(w, h);
    this.mapOverlay.layout(w, h);
    this.layoutEndTurn(w, h);
    this.hits.clear();
    this.chrome.registerHits(this.hits, w, h);
    const mm = minimapLayout(w, h);
    this.hits.add({
      id: "minimap",
      z: 6,
      rect: mm.embedded
        ? rectFromXY(mm.mapX, mm.mapY, mm.mapW, mm.mapH)
        : rectFromCenter(mm.cx, mm.cy, mm.frame, mm.frame),
      onDown: () => this.toggleMap(),
    });
    const et = endTurnButtonLayout(w, h);
    if (this.endTurnBtn?.visible) {
      this.hits.add({
        id: "endTurn",
        z: 12,
        rect: rectFromCenter(et.cx, et.cy, et.size * 0.86, et.size * 0.86),
        onDown: () => {
          if (this.settings.isOpen() || this.mapOverlay.isOpen()) return;
          this.flashEndTurnPress();
          this.actions.onEndTurn();
        },
      });
    }
    this.sidebar.registerHits(this.hits, w, h);
  }

  hover(pointerX: number, pointerY: number): { hitId: string | undefined; overHud: boolean } {
    const hit = this.hits.pick(pointerX, pointerY);
    this.sidebar.hover(hit?.id);
    this.chrome.paintContinue(hit?.id === "continuePath");
    this.chrome.paintRail(hit?.id === "railTrack");
    return { hitId: hit?.id, overHud: !!hit };
  }

  /** Glow + squash on click (or hotkey E) — not on hover. */
  flashEndTurnPress(): void {
    const btn = this.endTurnBtn;
    if (!btn?.visible) return;
    const size = this.endTurnSize || btn.displayWidth;
    if (size <= 0) return;
    this.scene.tweens.killTweensOf(btn);
    this.endTurnPressTimer?.remove(false);
    btn.setDisplaySize(size, size);
    this.setEndTurnTexture("ui_btn_end_turn_hover");
    const sx = btn.scaleX;
    const sy = btn.scaleY;
    btn.setScale(sx * 0.9, sy * 0.9);
    this.scene.tweens.add({
      targets: btn,
      scaleX: sx,
      scaleY: sy,
      duration: 280,
      ease: "Back.easeOut",
    });
    this.endTurnPressTimer = this.scene.time.delayedCall(520, () => {
      this.setEndTurnTexture("ui_btn_end_turn");
      btn.setDisplaySize(this.endTurnSize || size, this.endTurnSize || size);
      this.refreshEndTurnLook();
    });
  }

  refresh(model: WorldHudRefresh): void {
    this.lastMinimap = model;
    this.sidebar.refresh(model.army, model.turn);
    this.chrome.refresh(model);
    this.chrome.redrawMinimap(model);
    this.mapOverlay.refresh(model);
    this.refreshEndTurnLook();
    this.hits.remove("continuePath");
    this.hits.remove("railTrack");
    const continueRect = this.chrome.continueHitRect();
    if (continueRect) {
      this.hits.add({
        id: "continuePath",
        z: 14,
        rect: continueRect,
        onDown: () => this.actions.onContinuePath(),
      });
    }
    const railRect = this.chrome.railHitRect();
    if (railRect) {
      this.hits.add({
        id: "railTrack",
        z: 14,
        rect: railRect,
        onDown: () => this.actions.onToggleRail(),
      });
    }
  }

  hitsMinimap(x: number, y: number): boolean {
    return this.chrome.hitsMinimap(x, y);
  }

  /** Sidebar art, corner minimap, or the end-turn medallion. */
  blocksMapPointer(x: number, y: number): boolean {
    const hitId = this.hits.pick(x, y)?.id;
    return (
      this.sidebar.coversPointer(x, y) ||
      this.hitsMinimap(x, y) ||
      hitId === "endTurn" ||
      hitId === "continuePath" ||
      hitId === "railTrack"
    );
  }

  settingsOpen(): boolean {
    return this.settings.isOpen();
  }

  hideSettings(): void {
    this.settings.hide();
  }

  mapOpen(): boolean {
    return this.mapOverlay.isOpen();
  }

  hideMap(): void {
    this.mapOverlay.hide();
  }

  toggleMap(): void {
    if (!this.lastMinimap) return;
    this.hideSettings();
    this.mapOverlay.toggle(this.lastMinimap);
  }

  setSidebarVisible(visible: boolean): void {
    this.sidebar.setVisible(visible);
  }

  setChromeVisible(visible: boolean): void {
    this.chrome.setVisible(visible);
    this.endTurnBtn?.setVisible(visible);
    this.endTurnLabel?.setVisible(visible);
  }

  charcoalChrome(w: number, h: number) {
    return mapCharcoalChrome(w, h);
  }

  private layoutEndTurn(w: number, h: number): void {
    const btn = this.endTurnBtn;
    if (!btn) return;
    const et = endTurnButtonLayout(w, h);
    this.endTurnSize = et.size;
    btn.setPosition(et.cx, et.cy).setDisplaySize(et.size, et.size);
    this.endTurnLabel?.setPosition(et.cx, et.cy);
  }

  private refreshEndTurnLook(): void {
    const btn = this.endTurnBtn;
    if (!btn) return;
    if (isNight(session.state)) btn.setTint(0x8a6a48);
    else btn.clearTint();
    this.endTurnLabel?.setText(endTurnButtonHint(session.state).toUpperCase());
  }

  private setEndTurnTexture(key: string): void {
    const btn = this.endTurnBtn;
    if (!btn || !this.scene.textures.exists(key) || btn.texture.key === key) return;
    const size = this.endTurnSize || btn.displayWidth;
    btn.setTexture(key);
    btn.setDisplaySize(size, size);
  }
}

export { SIDEBAR_W };
