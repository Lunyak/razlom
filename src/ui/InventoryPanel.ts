import Phaser from "phaser";
import {
  ARTIFACT_SLOTS,
  ARTIFACTS,
  POTION_IDS,
  POTIONS,
  type ArtifactId,
  type PotionId,
} from "../game/catalog";
import {
  ensureArtifactStash,
  equipFromStash,
  formatArtifactLine,
} from "../game/artifacts";
import { potionCount } from "../game/items";
import { session } from "../game/data";
import { ScreenHitRouter, isLeftHudClick, rectFromCenter } from "./ScreenHitRouter";
import { DOSSIER, buildDossierChrome } from "./vintageDossier";
import { viewH, viewSize, viewW } from "./viewport";

const PANEL_W = 760;
const PANEL_H = 560;
const COLS = 4;
const SLOT_W = 168;
const SLOT_H = 168;
const GRID_TOP = -PANEL_H / 2 + 86;

export interface InventoryPanelCallbacks {
  onMessage: (msg: string) => void;
  onChanged: () => void;
  onSelect: (id: PotionId) => void;
  onBlockInput?: () => void;
}

/**
 * Modal bag — potions + artifact stash (equip on selected hero).
 */
export class InventoryPanel {
  private backdrop: Phaser.GameObjects.Rectangle;
  private window: Phaser.GameObjects.Container;
  private bodyHost: Phaser.GameObjects.Container;
  private hintText: Phaser.GameObjects.Text;
  private slotLayer: Phaser.GameObjects.GameObject[] = [];
  private readonly hits = new ScreenHitRouter();
  private open = false;
  private get cx(): number {
    return viewW(this.scene) / 2;
  }
  private get cy(): number {
    return viewH(this.scene) / 2;
  }

  constructor(
    private scene: Phaser.Scene,
    private callbacks: InventoryPanelCallbacks,
  ) {
    this.backdrop = scene.add
      .rectangle(this.cx, this.cy, viewW(scene), viewH(scene), 0x120e0a, 0.62)
      .setVisible(false)
      .setDepth(42)
      .setScrollFactor(0);

    this.window = scene.add.container(this.cx, this.cy).setVisible(false).setDepth(43).setScrollFactor(0);

    const chrome = buildDossierChrome(scene, PANEL_W, PANEL_H, { title: "СУМКА · АПТЕКА / РЕЛИКВИИ" });
    this.bodyHost = chrome.bodyHost;
    this.hintText = chrome.hintText;
    this.hintText.setText("Зелья · клик. Артефакты внизу · клик = надеть на героя · Esc");
    const closeLabel = scene.add
      .text(PANEL_W / 2 - 28, -PANEL_H / 2 + 16, "✕", {
        fontFamily: "Georgia, serif",
        fontSize: "20px",
        color: DOSSIER.gold,
      })
      .setOrigin(0.5, 0);
    chrome.root.add(closeLabel);
    this.window.add(chrome.root);

    scene.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.onPointerDown(p), this);
  }

  isOpen(): boolean {
    return this.open;
  }

  layout(): void {
    const { w, h } = viewSize(this.scene);
    this.backdrop.setPosition(this.cx, this.cy).setSize(w, h);
    this.window.setPosition(this.cx, this.cy);
    if (this.open) this.refresh();
  }

  toggle(): void {
    if (this.open) this.hide();
    else this.show();
  }

  show(): void {
    this.open = true;
    this.backdrop.setVisible(true);
    this.window.setVisible(true);
    this.refresh();
  }

  hide(): void {
    if (!this.open) return;
    this.clearSlots();
    this.hits.clear();
    this.open = false;
    this.backdrop.setVisible(false);
    this.window.setVisible(false);
    this.callbacks.onBlockInput?.();
  }

  refresh(): void {
    if (!this.open) return;
    this.clearSlots();
    this.paintSlots();
  }

  private paintSlots(): void {
    const hits = this.hits;
    hits.clear();

    const gridW = COLS * SLOT_W;
    const originX = -gridW / 2 + SLOT_W / 2;
    const originY = GRID_TOP + SLOT_H / 2;

    POTION_IDS.forEach((id, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const lx = originX + col * SLOT_W;
      const ly = originY + row * SLOT_H;
      const def = POTIONS[id];
      const count = potionCount(session.state, id);
      const empty = count <= 0;

      const plate = this.scene.add
        .rectangle(lx, ly, SLOT_W - 12, SLOT_H - 20, 0x1a1410, 0.94)
        .setStrokeStyle(1, empty ? 0x3a2e22 : 0xc9a227, empty ? 0.45 : 0.8);
      this.bodyHost.add(plate);
      this.slotLayer.push(plate);

      if (this.scene.textures.exists(def.texture)) {
        const img = this.scene.add
          .image(lx, ly - 22, def.texture)
          .setDisplaySize(88, 88)
          .setAlpha(empty ? 0.28 : 1);
        this.bodyHost.add(img);
        this.slotLayer.push(img);
      }

      const name = this.scene.add
        .text(lx, ly + 36, def.name, {
          fontFamily: "Georgia, serif",
          fontSize: "11px",
          color: empty ? DOSSIER.inkDim : DOSSIER.title,
          align: "center",
          wordWrap: { width: SLOT_W - 22 },
        })
        .setOrigin(0.5, 0);
      this.bodyHost.add(name);
      this.slotLayer.push(name);

      const qty = this.scene.add
        .text(lx, ly + 54, empty ? "пусто" : `×${count}`, {
          fontFamily: "Georgia, serif",
          fontSize: "12px",
          color: empty ? DOSSIER.inkDim : DOSSIER.gold,
        })
        .setOrigin(0.5, 0);
      this.bodyHost.add(qty);
      this.slotLayer.push(qty);

      hits.add({
        id: `potion:${id}`,
        z: 2,
        rect: rectFromCenter(this.cx + lx, this.cy + ly, SLOT_W - 16, SLOT_H - 24),
        onDown: () => {
          if (empty) {
            this.callbacks.onMessage(`${def.name} — нет в сумке`);
            return;
          }
          this.callbacks.onSelect(id);
        },
      });
    });

    const stash = ensureArtifactStash(session.state);
    const artLabel = this.scene.add
      .text(0, PANEL_H / 2 - 118, "АРТЕФАКТЫ (клик — надеть)", {
        fontFamily: "Georgia, serif",
        fontSize: "13px",
        color: DOSSIER.gold,
      })
      .setOrigin(0.5, 0);
    this.bodyHost.add(artLabel);
    this.slotLayer.push(artLabel);

    if (stash.length === 0) {
      const emptyArt = this.scene.add
        .text(0, PANEL_H / 2 - 92, "Пусто — ищите клады и руины", {
          fontFamily: "Georgia, serif",
          fontSize: "12px",
          color: DOSSIER.inkMuted,
        })
        .setOrigin(0.5, 0);
      this.bodyHost.add(emptyArt);
      this.slotLayer.push(emptyArt);
    } else {
      stash.slice(0, 6).forEach((id, i) => {
        const col = i % 3;
        const row = Math.floor(i / 3);
        const lx = -220 + col * 220;
        const ly = PANEL_H / 2 - 70 + row * 36;
        const line = formatArtifactLine(id);
        const t = this.scene.add
          .text(lx, ly, line, {
            fontFamily: "Georgia, serif",
            fontSize: "12px",
            color: DOSSIER.ink,
            wordWrap: { width: 210 },
          })
          .setOrigin(0.5, 0.5);
        this.bodyHost.add(t);
        this.slotLayer.push(t);
        hits.add({
          id: `art:${id}:${i}`,
          z: 2,
          rect: rectFromCenter(this.cx + lx, this.cy + ly, 210, 32),
          onDown: () => this.equipArtifact(id),
        });
      });
    }

    const hero = session.state.armies.find((a) => a.id === session.state.selectedArmyId);
    if (hero && !hero.isMissionary) {
      const eqBits = ARTIFACT_SLOTS.map((s) => {
        const id = hero.hero.equipment?.[s];
        return id ? ARTIFACTS[id]?.name ?? id : "—";
      }).join(" · ");
      const worn = this.scene.add
        .text(0, PANEL_H / 2 - 28, `На герое: ${eqBits}`, {
          fontFamily: "Georgia, serif",
          fontSize: "11px",
          color: DOSSIER.inkMuted,
          wordWrap: { width: PANEL_W - 40 },
          align: "center",
        })
        .setOrigin(0.5, 0.5);
      this.bodyHost.add(worn);
      this.slotLayer.push(worn);
    }

    hits.add({
      id: "inv-close",
      z: 3,
      rect: rectFromCenter(this.cx + PANEL_W / 2 - 28, this.cy - PANEL_H / 2 + 28, 44, 36),
      onDown: () => this.hide(),
    });
  }

  private equipArtifact(id: ArtifactId): void {
    const army = session.state.armies.find((a) => a.id === session.state.selectedArmyId);
    if (!army || army.isMissionary) {
      this.callbacks.onMessage("Выберите отряд героя");
      return;
    }
    const result = equipFromStash(session.state, army.hero, id);
    this.callbacks.onMessage(result.ok ? result.message : result.reason);
    this.refresh();
    this.callbacks.onChanged();
  }

  private clearSlots(): void {
    for (const obj of this.slotLayer) obj.destroy();
    this.slotLayer = [];
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.open || !pointer.leftButtonDown()) return;
    this.callbacks.onBlockInput?.();
    if (this.hits.dispatch(pointer)) return;
    if (isLeftHudClick(pointer.x, pointer.y)) return;
    if (Math.abs(pointer.x - this.cx) > PANEL_W / 2 || Math.abs(pointer.y - this.cy) > PANEL_H / 2) {
      this.hide();
    }
  }
}
