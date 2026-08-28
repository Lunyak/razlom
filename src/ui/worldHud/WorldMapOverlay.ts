import Phaser from "phaser";
import { viewSize } from "../viewport";
import { paintMinimap, tileAtMinimap, type MinimapPaintModel } from "./minimapPaint";

export type WorldMapOverlayHandlers = {
  onPickTile: (gx: number, gy: number) => void;
};

/**
 * Full-screen world map: paint discovered terrain, pick a tile to move the camera.
 */
export class WorldMapOverlay {
  private root?: Phaser.GameObjects.Container;
  private mapGfx?: Phaser.GameObjects.Graphics;
  private model?: MinimapPaintModel;
  private mapBox = { mapX: 0, mapY: 0, mapW: 1, mapH: 1 };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly handlers: WorldMapOverlayHandlers,
  ) {}

  isOpen(): boolean {
    return !!this.root?.visible;
  }

  toggle(model: MinimapPaintModel): void {
    if (this.isOpen()) this.hide();
    else this.show(model);
  }

  show(model: MinimapPaintModel): void {
    this.model = model;
    const { w, h } = viewSize(this.scene);
    this.rebuild(w, h);
  }

  hide(): void {
    this.root?.setVisible(false);
  }

  layout(w: number, h: number): void {
    if (!this.isOpen()) return;
    this.rebuild(w, h);
  }

  refresh(model: MinimapPaintModel): void {
    this.model = model;
    if (this.isOpen()) this.paint();
  }

  private rebuild(w: number, h: number): void {
    this.root?.destroy(true);
    this.root = undefined;
    this.mapGfx = undefined;

    const plateSize = Math.min(w, h) * 0.78;
    const pad = 24;
    const header = 40;
    const footer = 32;
    const mapW = plateSize - pad * 2;
    const mapH = plateSize - pad * 2 - header - footer;
    const mapX = -mapW / 2;
    const mapY = -plateSize / 2 + pad + header;
    this.mapBox = { mapX, mapY, mapW, mapH };

    const root = this.scene.add.container(w / 2, h / 2).setDepth(88).setScrollFactor(0);

    const backdrop = this.scene.add
      .rectangle(0, 0, w, h, 0x000000, 0.7)
      .setInteractive()
      .on("pointerdown", () => this.hide());

    const plate = this.scene.add
      .rectangle(0, 0, plateSize, plateSize, 0x1a1410, 0.96)
      .setStrokeStyle(2, 0xc9a227, 0.85)
      .setInteractive();
    plate.on(
      "pointerdown",
      (_p: Phaser.Input.Pointer, _x: number, _y: number, event: Phaser.Types.Input.EventData) => {
        event.stopPropagation();
      },
    );

    const title = this.scene.add
      .text(0, -plateSize / 2 + pad + 4, "КАРТА", {
        fontFamily: "Georgia, serif",
        fontSize: "26px",
        color: "#f5e6c8",
      })
      .setOrigin(0.5, 0);

    const hint = this.scene.add
      .text(0, plateSize / 2 - pad / 2 - 2, "Клик по клетке — камера  ·  Esc — закрыть", {
        fontFamily: "Georgia, serif",
        fontSize: "14px",
        color: "#8a7a5a",
      })
      .setOrigin(0.5, 1);

    const mapGfx = this.scene.add.graphics();
    const mapHit = this.scene.add.zone(mapX, mapY, mapW, mapH).setOrigin(0).setInteractive();
    mapHit.on(
      "pointerdown",
      (
        _pointer: Phaser.Input.Pointer,
        localX: number,
        localY: number,
        event: Phaser.Types.Input.EventData,
      ) => {
        event.stopPropagation();
        this.tryPick(localX, localY);
      },
    );

    root.add([backdrop, plate, title, hint, mapGfx, mapHit]);
    this.root = root;
    this.mapGfx = mapGfx;
    this.paint();
  }

  private tryPick(localX: number, localY: number): void {
    if (!this.model) return;
    const tile = tileAtMinimap(
      this.mapBox.mapX + localX,
      this.mapBox.mapY + localY,
      this.mapBox,
      this.model.cols,
      this.model.rows,
    );
    if (!tile) return;
    if (!this.model.fog[tile.gy]?.[tile.gx]) return;
    this.handlers.onPickTile(tile.gx, tile.gy);
    this.hide();
  }

  private paint(): void {
    if (!this.mapGfx || !this.model) return;
    const cell = Math.min(
      this.mapBox.mapW / Math.max(1, this.model.cols),
      this.mapBox.mapH / Math.max(1, this.model.rows),
    );
    paintMinimap(this.mapGfx, this.model, this.mapBox, {
      armyDotRadius: Math.max(3, Math.min(6, cell * 0.4)),
      viewRect: true,
    });
  }
}
