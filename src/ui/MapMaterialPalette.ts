import Phaser from "phaser";
import { TERRAIN_COLOR } from "../game/iso";
import { ensureCutout } from "../game/chromaCutout";
import {
  MAP_DECOR_MATERIALS,
  MAP_GROUND_MATERIALS,
  type MapDecorMaterial,
  type MapGroundMaterial,
} from "../game/terrainArt";
import { isUsableTexture } from "./raceFrameConstructor";

export const MAP_PALETTE_H = 146;

export type MapMaterialPick =
  | { kind: "ground"; material: MapGroundMaterial }
  | { kind: "decor"; material: MapDecorMaterial };

type Chip = {
  kind: "ground" | "decor";
  key: string;
  label: string;
  hit: Phaser.GameObjects.Rectangle;
  frame: Phaser.GameObjects.Rectangle;
  caption: Phaser.GameObjects.Text;
  thumb?: Phaser.GameObjects.Image;
};

export class MapMaterialPalette {
  private readonly root: Phaser.GameObjects.Container;
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly panelHit: Phaser.GameObjects.Rectangle;
  private readonly chips: Chip[] = [];
  private selectedKind: "ground" | "decor" = "ground";
  private selectedKey: string = MAP_GROUND_MATERIALS[0].key;
  private hover = "";

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly onPick: (pick: MapMaterialPick) => void,
  ) {
    this.root = scene.add.container(0, 0).setDepth(24).setScrollFactor(0);
    this.gfx = scene.add.graphics().setScrollFactor(0);
    this.panelHit = scene.add.rectangle(0, 0, 8, 8, 0x000000, 0.001).setOrigin(0, 0);
    this.root.add([this.gfx, this.panelHit]);
    this.buildChips();
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  contains(x: number, y: number): boolean {
    const b = this.root.getBounds();
    return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
  }

  setSelected(kind: "ground" | "decor", key: string): void {
    this.selectedKind = kind;
    this.selectedKey = key;
    this.paintSelection();
  }

  hoverLabel(): string {
    return this.hover;
  }

  layout(x: number, y: number, w: number, h: number): void {
    this.root.setPosition(x, y);
    this.panelHit.setSize(w, h);
    this.gfx.clear();
    this.gfx.fillStyle(0x120e0a, 0.94);
    this.gfx.fillRect(0, 0, w, h);
    this.gfx.lineStyle(1, 0x5a4a30, 1);
    this.gfx.strokeRect(0.5, 0.5, w - 1, h - 1);
    this.gfx.lineStyle(1, 0x3a3020, 0.8);
    this.gfx.lineBetween(8, h / 2, w - 8, h / 2);

    const rowH = (h - 12) / 2;
    this.layoutRow("Текстуры", 8, 6, w - 16, rowH, this.chips.filter((c) => c.kind === "ground"));
    this.layoutRow("Декорации", 8, 6 + rowH, w - 16, rowH, this.chips.filter((c) => c.kind === "decor"));
    this.paintSelection();
  }

  destroy(): void {
    this.root.destroy(true);
    this.chips.length = 0;
  }

  private buildChips(): void {
    for (const material of MAP_GROUND_MATERIALS) {
      this.chips.push(this.makeChip("ground", material.key, material.label, material.terrain));
    }
    for (const material of MAP_DECOR_MATERIALS) {
      this.chips.push(this.makeChip("decor", material.key, material.label, material.terrain ?? "grass"));
    }
  }

  private makeChip(
    kind: "ground" | "decor",
    key: string,
    label: string,
    terrain: keyof typeof TERRAIN_COLOR,
  ): Chip {
    const hit = this.scene.add
      .rectangle(0, 0, 56, 48, 0x1a1510, 0.95)
      .setOrigin(0, 0)
      .setInteractive({ useHandCursor: true });
    const frame = this.scene.add.rectangle(0, 0, 56, 48).setOrigin(0, 0).setStrokeStyle(1, 0x5a4a30, 1);
    let thumb: Phaser.GameObjects.Image | undefined;
    const tex = key ? this.previewKey(key, kind === "decor") : "";
    if (tex && isUsableTexture(this.scene, tex)) {
      thumb = this.scene.add.image(0, 0, tex).setOrigin(0.5, 0.5);
    } else {
      hit.setFillStyle(key ? TERRAIN_COLOR[terrain] : 0x2a2418, 0.95);
    }
    const caption = this.scene.add
      .text(0, 0, label, {
        fontFamily: "Georgia, serif",
        fontSize: "10px",
        color: "#a09070",
      })
      .setOrigin(0.5, 0);
    this.root.add([hit, frame]);
    if (thumb) this.root.add(thumb);
    this.root.add(caption);

    hit.on("pointerover", () => {
      this.hover = `${kind === "ground" ? "Текстура" : "Декор"}: ${label}`;
      if (this.selectedKind !== kind || this.selectedKey !== key) frame.setStrokeStyle(1, 0xc9a227, 0.7);
    });
    hit.on("pointerout", () => {
      this.hover = "";
      this.paintSelection();
    });
    hit.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      if (kind === "ground") {
        const material = MAP_GROUND_MATERIALS.find((m) => m.key === key);
        if (material) this.onPick({ kind, material });
      } else {
        const material = MAP_DECOR_MATERIALS.find((m) => m.key === key);
        if (material) this.onPick({ kind, material });
      }
    });

    return { kind, key, label, hit, frame, caption, thumb };
  }

  private layoutRow(
    title: string,
    x: number,
    y: number,
    w: number,
    h: number,
    chips: Chip[],
  ): void {
    const header = this.takeHeader(title);
    header.setPosition(x, y + 4);
    const chipX = x + 78;
    const inner = 42;
    const gap = 6;
    const avail = Math.max(1, w - 78);
    const need = chips.length * (inner + gap) - gap;
    const scale = need > avail ? avail / need : 1;
    const size = inner * scale;
    const step = (inner + gap) * scale;
    chips.forEach((chip, i) => {
      const cx = chipX + i * step;
      const cy = y + 2;
      chip.hit.setPosition(cx, cy).setSize(size, size);
      chip.hit.setInteractive({
        useHandCursor: true,
        hitArea: new Phaser.Geom.Rectangle(0, 0, size, size),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      });
      chip.frame.setPosition(cx, cy).setSize(size, size);
      if (chip.thumb) {
        chip.thumb.setPosition(cx + size / 2, cy + size / 2);
        chip.thumb.setDisplaySize(size - 4, size - 4);
      }
      chip.caption.setPosition(cx + size / 2, cy + size + 1).setScale(scale < 0.85 ? 0.9 : 1);
      this.root.bringToTop(chip.hit);
    });
    void h;
  }

  private headers = new Map<string, Phaser.GameObjects.Text>();

  private takeHeader(title: string): Phaser.GameObjects.Text {
    let t = this.headers.get(title);
    if (!t) {
      t = this.scene.add
        .text(0, 0, title, {
          fontFamily: "Georgia, serif",
          fontSize: "12px",
          color: "#c9a227",
        })
        .setOrigin(0, 0);
      this.root.add(t);
      this.headers.set(title, t);
    }
    return t;
  }

  private paintSelection(): void {
    for (const chip of this.chips) {
      const on = chip.kind === this.selectedKind && chip.key === this.selectedKey;
      chip.frame.setStrokeStyle(on ? 2 : 1, on ? 0xfff0c0 : 0x5a4a30, 1);
      chip.hit.setFillStyle(on ? 0x2a2214 : 0x1a1510, 0.95);
      chip.caption.setColor(on ? "#fff0c0" : "#a09070");
    }
  }

  private previewKey(src: string, cutout: boolean): string {
    const dest = `__map_mat_${src}`;
    if (this.scene.textures.exists(dest) && isUsableTexture(this.scene, dest)) return dest;
    const srcKey = cutout ? (ensureCutout(this.scene, src) ?? src) : src;
    if (!isUsableTexture(this.scene, srcKey)) return srcKey;
    const img = this.scene.textures.get(srcKey).getSourceImage() as CanvasImageSource;
    const size = 64;
    const canvas = this.scene.textures.createCanvas(dest, size, size);
    if (!canvas) return srcKey;
    const ctx = canvas.getContext();
    ctx.fillStyle = "#2a2418";
    ctx.fillRect(0, 0, size, size);
    const iw = Math.max(1, (img as { width: number }).width);
    const ih = Math.max(1, (img as { height: number }).height);
    const scale = Math.min(size / iw, size / ih) * 0.9;
    const dw = iw * scale;
    const dh = ih * scale;
    ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
    if (cutout) {
      const data = ctx.getImageData(0, 0, size, size);
      const px = data.data;
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i];
        const g = px[i + 1];
        const b = px[i + 2];
        if (r > 170 && b > 170 && g < 130 && r - g > 50 && b - g > 50) px[i + 3] = 0;
      }
      ctx.putImageData(data, 0, 0);
    }
    canvas.refresh();
    return dest;
  }
}
