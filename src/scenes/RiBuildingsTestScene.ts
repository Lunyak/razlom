import Phaser from "phaser";
import { EMPIRE_BUILD_ORDER, type BuildingId } from "../game/catalog";
import {
  BUILDING_OVERLAY_LAYOUT_DEFAULTS,
  clearBuildingOverlayLayoutSave,
  downloadBuildingOverlayLayout,
  getBuildingOverlayLayout,
  loadBuildingOverlayLayoutFromDisk,
  saveBuildingOverlayLayout,
  setBuildingOverlayPose,
} from "../game/buildingOverlayLayout";
import {
  BUILDING_ART_LABELS,
  RI_BUILDING_ART_ASSETS,
  buildingArtKey,
  buildingOverlayKey,
} from "../game/buildingsArt";
import { queueAssetPack } from "../game/assetPacks";

const CARD = 100;
const GAP = 12;
const PLATE = 440;
const PLATE_X = 640;
const PLATE_Y = 290;

type OverlayHandle = {
  id: BuildingId;
  img: Phaser.GameObjects.Image;
  hit: Phaser.GameObjects.Rectangle;
};

/**
 * RI castle overlay layout editor.
 * Drag / scale buildings on the capital plate; S saves into the game (localStorage).
 * Boot menu or `#test/buildings`.
 */
export class RiBuildingsTestScene extends Phaser.Scene {
  private built: BuildingId[] = [];
  private plateChrome: Phaser.GameObjects.GameObject[] = [];
  private overlays: OverlayHandle[] = [];
  private cardFrames = new Map<BuildingId, Phaser.GameObjects.Rectangle>();
  private cardLabels = new Map<BuildingId, Phaser.GameObjects.Text>();
  private selected: BuildingId | null = null;
  private dragging = false;
  private dragOffX = 0;
  private dragOffY = 0;
  private hud!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private selectRing!: Phaser.GameObjects.Rectangle;

  constructor() {
    super("RiBuildingsTest");
  }

  preload() {
    queueAssetPack(this, RI_BUILDING_ART_ASSETS);
  }

  create() {
    this.cameras.main.setBackgroundColor(0x14100c);

    this.built = [...EMPIRE_BUILD_ORDER];
    this.cardFrames.clear();
    this.cardLabels.clear();
    this.selected = null;

    this.add
      .text(640, 18, "РИ · РЕДАКТОР ПОЗИЦИЙ ПОСТРОЕК", {
        fontFamily: "Georgia, serif",
        fontSize: "22px",
        color: "#e8d5a3",
        stroke: "#1a1008",
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    this.add
      .text(
        640,
        44,
        "ЛКМ — выбрать и тащить · колёсико / [ ] — масштаб · ←↑↓→ — сдвиг · S — сохранить в игру · E — экспорт JSON · R — сброс выбранного · Shift+R — всё · ESC — меню",
        {
          fontFamily: "Georgia, serif",
          fontSize: "12px",
          color: "#8a7a5a",
          align: "center",
          wordWrap: { width: 1180 },
        },
      )
      .setOrigin(0.5);

    this.hud = this.add
      .text(24, 70, "", {
        fontFamily: "Consolas, monospace",
        fontSize: "14px",
        color: "#c9a227",
      })
      .setOrigin(0, 0)
      .setDepth(100);

    this.status = this.add
      .text(640, 545, "", {
        fontFamily: "Georgia, serif",
        fontSize: "13px",
        color: "#6a8a4a",
      })
      .setOrigin(0.5)
      .setDepth(100);

    this.selectRing = this.add
      .rectangle(0, 0, 40, 40, 0x000000, 0)
      .setStrokeStyle(2, 0xf0d78c)
      .setVisible(false)
      .setDepth(40);

    this.makeButton(1100, 80, "Сохранить (S)", () => this.saveLayout());
    this.makeButton(1100, 118, "Экспорт (E)", () => this.exportLayout());
    this.makeButton(1100, 156, "Сброс всё", () => this.resetAll());

    this.rebuildPlate();

    const ids = EMPIRE_BUILD_ORDER;
    const totalW = ids.length * CARD + (ids.length - 1) * GAP;
    const startX = 640 - totalW / 2 + CARD / 2;
    ids.forEach((id, i) => {
      this.placeToggleCard(startX + i * (CARD + GAP), 640, id);
    });

    this.input.on("pointermove", (p: Phaser.Input.Pointer) => this.onPointerMove(p));
    this.input.on("pointerup", () => {
      this.dragging = false;
    });
    this.input.on(
      "wheel",
      (
        _p: Phaser.Input.Pointer,
        _o: unknown,
        _dx: number,
        dy: number,
      ) => {
        if (!this.selected) return;
        this.nudgeScale(this.selected, dy > 0 ? -0.02 : 0.02);
      },
    );

    const kb = this.input.keyboard;
    kb?.on("keydown-ESC", () => {
      window.location.hash = "";
      this.scene.start("Boot");
    });
    kb?.on("keydown-S", () => this.saveLayout());
    kb?.on("keydown-E", () => this.exportLayout());
    kb?.on("keydown", (ev: KeyboardEvent) => {
      if (ev.key === "[" && this.selected) this.nudgeScale(this.selected, -0.02);
      if (ev.key === "]" && this.selected) this.nudgeScale(this.selected, 0.02);
      if (ev.key === "r" || ev.key === "R") {
        if (ev.shiftKey) this.resetAll();
        else if (this.selected) this.resetSelected(this.selected);
      }
      if (ev.key === "ArrowLeft") this.nudgePos(-0.01, 0);
      if (ev.key === "ArrowRight") this.nudgePos(0.01, 0);
      if (ev.key === "ArrowUp") this.nudgePos(0, -0.01);
      if (ev.key === "ArrowDown") this.nudgePos(0, 0.01);
    });

    this.refreshHud();
    this.setStatus("Правки локальны, пока не нажмёте Сохранить (S)");

    void loadBuildingOverlayLayoutFromDisk().then(() => {
      this.rebuildPlate();
      this.refreshHud();
    });
  }

  private makeButton(x: number, y: number, label: string, onClick: () => void) {
    const t = this.add
      .text(x, y, label, {
        fontFamily: "Georgia, serif",
        fontSize: "15px",
        color: "#c9a227",
        backgroundColor: "#1a1008",
        padding: { x: 10, y: 6 },
      })
      .setOrigin(0.5)
      .setDepth(100)
      .setInteractive({ useHandCursor: true });
    t.on("pointerover", () => t.setColor("#fff0c0"));
    t.on("pointerout", () => t.setColor("#c9a227"));
    t.on("pointerdown", onClick);
  }

  private rebuildPlate() {
    for (const obj of this.plateChrome) obj.destroy();
    for (const h of this.overlays) {
      h.img.destroy();
      h.hit.destroy();
    }
    this.plateChrome = [];
    this.overlays = [];

    const frame = this.add
      .rectangle(PLATE_X, PLATE_Y, PLATE + 12, PLATE + 12, 0x1a1008)
      .setStrokeStyle(2, 0xc9a227)
      .setDepth(10);
    this.plateChrome.push(frame);

    if (this.textures.exists("ri_building_capital")) {
      this.plateChrome.push(
        this.add
          .image(PLATE_X, PLATE_Y, "ri_building_capital")
          .setDisplaySize(PLATE, PLATE)
          .setDepth(11),
      );
    }

    const layout = getBuildingOverlayLayout();
    const order = [...EMPIRE_BUILD_ORDER].sort((a, b) => layout[a].depth - layout[b].depth);

    for (const id of order) {
      if (!this.built.includes(id)) continue;
      const pose = layout[id];
      const key = buildingOverlayKey(id);
      if (!this.textures.exists(key)) continue;

      const targetW = PLATE * pose.scale;
      const src = this.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
      const srcW = (src as HTMLImageElement).width || (src as HTMLCanvasElement).width || 1;
      const srcH = (src as HTMLImageElement).height || (src as HTMLCanvasElement).height || 1;
      const dispH = targetW * (srcH / srcW);
      const px = PLATE_X + pose.x * PLATE;
      const py = PLATE_Y + pose.y * PLATE;

      const img = this.add
        .image(px, py, key)
        .setOrigin(0.5, 1)
        .setDisplaySize(targetW, dispH)
        .setDepth(12 + pose.depth);

      const hit = this.add
        .rectangle(px, py - dispH / 2, Math.max(40, targetW), Math.max(40, dispH), 0xffffff, 0.001)
        .setDepth(30)
        .setInteractive({ useHandCursor: true, draggable: false });

      hit.on("pointerdown", (p: Phaser.Input.Pointer) => {
        this.selectBuilding(id);
        this.dragging = true;
        this.dragOffX = img.x - p.worldX;
        this.dragOffY = img.y - p.worldY;
      });

      this.overlays.push({ id, img, hit });
    }

    if (this.selected && this.built.includes(this.selected)) {
      this.updateSelectRing();
    } else {
      this.selected = null;
      this.selectRing.setVisible(false);
    }
    this.refreshHud();
  }

  private placeToggleCard(x: number, y: number, id: BuildingId) {
    const key = buildingArtKey(id);
    const frame = this.add
      .rectangle(x, y - 30, CARD + 6, CARD + 6, 0x1a1410)
      .setStrokeStyle(2, this.built.includes(id) ? 0x6a8a4a : 0x5a5040)
      .setInteractive({ useHandCursor: true })
      .setDepth(50);

    if (this.textures.exists(key)) {
      this.add.image(x, y - 30, key).setDisplaySize(CARD, CARD).setOrigin(0.5).setDepth(51);
    }

    const label = this.add
      .text(x, y + CARD / 2 - 14, BUILDING_ART_LABELS[id], {
        fontFamily: "Georgia, serif",
        fontSize: "11px",
        color: this.built.includes(id) ? "#a8c070" : "#8a7a5a",
        align: "center",
        wordWrap: { width: CARD + 8 },
      })
      .setOrigin(0.5, 0)
      .setDepth(52);

    this.cardFrames.set(id, frame);
    this.cardLabels.set(id, label);

    frame.on("pointerdown", () => {
      const idx = this.built.indexOf(id);
      if (idx >= 0) {
        this.built.splice(idx, 1);
        if (this.selected === id) {
          this.selected = null;
          this.selectRing.setVisible(false);
        }
      } else {
        this.built.push(id);
        this.selectBuilding(id);
      }
      frame.setStrokeStyle(2, this.built.includes(id) ? 0x6a8a4a : 0x5a5040);
      label.setColor(this.built.includes(id) ? "#a8c070" : "#8a7a5a");
      this.rebuildPlate();
    });
  }

  private selectBuilding(id: BuildingId) {
    this.selected = id;
    this.updateSelectRing();
    this.refreshHud();
  }

  private updateSelectRing() {
    const h = this.overlays.find((o) => o.id === this.selected);
    if (!h) {
      this.selectRing.setVisible(false);
      return;
    }
    this.selectRing
      .setPosition(h.hit.x, h.hit.y)
      .setSize(h.hit.width + 8, h.hit.height + 8)
      .setVisible(true);
  }

  private onPointerMove(p: Phaser.Input.Pointer) {
    if (!this.dragging || !this.selected) return;
    const nx = (p.worldX + this.dragOffX - PLATE_X) / PLATE;
    const ny = (p.worldY + this.dragOffY - PLATE_Y) / PLATE;
    setBuildingOverlayPose(this.selected, {
      x: Math.max(-0.9, Math.min(0.9, nx)),
      y: Math.max(-0.9, Math.min(0.95, ny)),
    });
    this.applyPoseToHandle(this.selected);
    this.refreshHud();
  }

  private applyPoseToHandle(id: BuildingId) {
    const h = this.overlays.find((o) => o.id === id);
    if (!h) return;
    const pose = getBuildingOverlayLayout()[id];
    const targetW = PLATE * pose.scale;
    const src = this.textures.get(buildingOverlayKey(id)).getSourceImage() as
      | HTMLImageElement
      | HTMLCanvasElement;
    const srcW = (src as HTMLImageElement).width || (src as HTMLCanvasElement).width || 1;
    const srcH = (src as HTMLImageElement).height || (src as HTMLCanvasElement).height || 1;
    const dispH = targetW * (srcH / srcW);
    const px = PLATE_X + pose.x * PLATE;
    const py = PLATE_Y + pose.y * PLATE;
    h.img.setPosition(px, py).setDisplaySize(targetW, dispH);
    h.hit.setPosition(px, py - dispH / 2).setSize(Math.max(40, targetW), Math.max(40, dispH));
    if (this.selected === id) this.updateSelectRing();
  }

  private nudgePos(dx: number, dy: number) {
    if (!this.selected) return;
    const pose = getBuildingOverlayLayout()[this.selected];
    setBuildingOverlayPose(this.selected, {
      x: Math.max(-0.9, Math.min(0.9, pose.x + dx)),
      y: Math.max(-0.9, Math.min(0.95, pose.y + dy)),
    });
    this.applyPoseToHandle(this.selected);
    this.refreshHud();
  }

  private nudgeScale(id: BuildingId, d: number) {
    const pose = getBuildingOverlayLayout()[id];
    setBuildingOverlayPose(id, { scale: pose.scale + d });
    this.applyPoseToHandle(id);
    this.refreshHud();
  }

  private refreshHud() {
    if (!this.selected) {
      this.hud.setText("выбрано: —\nклик по зданию на пластине");
      return;
    }
    const p = getBuildingOverlayLayout()[this.selected];
    this.hud.setText(
      [
        `выбрано: ${BUILDING_ART_LABELS[this.selected]}`,
        `x: ${p.x.toFixed(3)}`,
        `y: ${p.y.toFixed(3)}`,
        `scale: ${p.scale.toFixed(3)}`,
        `depth: ${p.depth}`,
      ].join("\n"),
    );
  }

  private saveLayout() {
    saveBuildingOverlayLayout(getBuildingOverlayLayout());
    this.setStatus("Сохранено в игру (localStorage) — город увидит эти позиции");
  }

  private exportLayout() {
    saveBuildingOverlayLayout(getBuildingOverlayLayout());
    downloadBuildingOverlayLayout();
    const json = JSON.stringify(getBuildingOverlayLayout(), null, 2);
    void navigator.clipboard?.writeText(json).catch(() => undefined);
    this.setStatus(
      "JSON скачан + в буфере. Положите файл в public/assets/ri_building_overlay_layout.json",
    );
  }

  private resetSelected(id: BuildingId) {
    const d = BUILDING_OVERLAY_LAYOUT_DEFAULTS[id];
    setBuildingOverlayPose(id, { ...d });
    this.applyPoseToHandle(id);
    this.refreshHud();
    this.setStatus(`Сброшено: ${BUILDING_ART_LABELS[id]} (не забудьте S)`);
  }

  private resetAll() {
    clearBuildingOverlayLayoutSave();
    this.rebuildPlate();
    this.setStatus("Все позиции сброшены к умолчанию");
  }

  private setStatus(msg: string) {
    this.status.setText(msg);
  }
}

export function shouldOpenRiBuildingsTest(): boolean {
  const hash = window.location.hash.replace(/^#/, "").toLowerCase();
  return (
    hash === "test/buildings" ||
    hash === "test/ri-buildings" ||
    hash === "test/ri-castle"
  );
}
