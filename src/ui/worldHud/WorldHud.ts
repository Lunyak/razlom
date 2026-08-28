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
import type { Army } from "../../game/data";
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
          this.actions.onEndTurn();
        },
      });
    }
    this.sidebar.registerHits(this.hits, w, h);
  }

  hover(pointerX: number, pointerY: number): { hitId: string | undefined; overHud: boolean } {
    const hit = this.hits.pick(pointerX, pointerY);
    this.sidebar.hover(hit?.id);
    this.paintEndTurn(hit?.id === "endTurn");
    return { hitId: hit?.id, overHud: !!hit };
  }

  refresh(model: WorldHudRefresh): void {
    this.lastMinimap = model;
    this.sidebar.refresh(model.army, model.turn);
    this.chrome.refresh(model);
    this.chrome.redrawMinimap(model);
    this.mapOverlay.refresh(model);
  }

  hitsMinimap(x: number, y: number): boolean {
    return this.chrome.hitsMinimap(x, y);
  }

  /** Sidebar art, corner minimap, or the end-turn medallion. */
  blocksMapPointer(x: number, y: number): boolean {
    return this.sidebar.coversPointer(x, y) || this.hitsMinimap(x, y) || this.hits.pick(x, y)?.id === "endTurn";
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
  }

  charcoalChrome(w: number, h: number) {
    return mapCharcoalChrome(w, h);
  }

  private layoutEndTurn(w: number, h: number): void {
    const btn = this.endTurnBtn;
    if (!btn) return;
    const et = endTurnButtonLayout(w, h);
    btn.setPosition(et.cx, et.cy).setDisplaySize(et.size, et.size);
  }

  private paintEndTurn(hover: boolean): void {
    const btn = this.endTurnBtn;
    if (!btn) return;
    const key = hover && this.scene.textures.exists("ui_btn_end_turn_hover")
      ? "ui_btn_end_turn_hover"
      : "ui_btn_end_turn";
    if (btn.texture.key !== key) {
      const dw = btn.displayWidth;
      const dh = btn.displayHeight;
      btn.setTexture(key);
      btn.setDisplaySize(dw, dh);
    }
  }
}

export { SIDEBAR_W };
