import Phaser from "phaser";
import { SPELLS, type SpellId } from "../../game/catalog";
import { ensureBlackHollow } from "../../game/chromaCutout";
import { battleHudSpellPos } from "../battleLayout";
import { ScreenHitRouter, rectFromCenter } from "../ScreenHitRouter";
import { DOSSIER } from "../vintageDossier";
import { viewH, viewW } from "../viewport";

const ICON = 52;
const GAP = 8;

export type SpellBarItem = {
  id: SpellId;
  enabled: boolean;
};

/**
 * QWER (and extra) spiked-ring spell icons, centered above the focus medallions.
 */
export class BattleSpellBar {
  readonly hits = new ScreenHitRouter();
  private root: Phaser.GameObjects.Container;
  private icons: Phaser.GameObjects.Image[] = [];
  private keys: Phaser.GameObjects.Text[] = [];
  private rings: Phaser.GameObjects.Graphics[] = [];
  private items: SpellBarItem[] = [];
  private active: SpellId | null = null;

  constructor(
    private scene: Phaser.Scene,
    private onPick?: (id: SpellId) => void,
  ) {
    this.root = scene.add.container(0, 0).setDepth(32).setScrollFactor(0);
  }

  setSpells(items: SpellBarItem[], active: SpellId | null): void {
    this.items = items;
    this.active = active;
    this.rebuild();
  }

  layout(): void {
    const pos = battleHudSpellPos(viewW(this.scene), viewH(this.scene));
    this.root.setPosition(pos.x, pos.y);
    this.rebuildHits();
  }

  destroy(): void {
    this.root.destroy(true);
  }

  private rebuild(): void {
    this.root.removeAll(true);
    this.icons = [];
    this.keys = [];
    this.rings = [];
    const n = this.items.length;
    const total = n * ICON + Math.max(0, n - 1) * GAP;
    let x = -total / 2 + ICON / 2;
    for (const item of this.items) {
      const spell = SPELLS[item.id];
      const tex = ensureBlackHollow(this.scene, spell.icon) ?? spell.icon;
      const img = this.scene.add
        .image(x, 0, this.scene.textures.exists(tex) ? tex : spell.icon)
        .setDisplaySize(ICON, ICON)
        .setAlpha(item.enabled ? 1 : 0.38);
      const ring = this.scene.add.graphics();
      if (this.active === item.id) {
        ring.lineStyle(2, 0xc9a227, 0.95);
        ring.strokeCircle(x, 0, ICON / 2 + 1);
      }
      const key = this.scene.add
        .text(x, ICON / 2 + 2, spell.key, {
          fontFamily: "Georgia, serif",
          fontSize: "11px",
          color: this.active === item.id ? DOSSIER.gold : "#efe6d2",
          stroke: "#120c08",
          strokeThickness: 3,
        })
        .setOrigin(0.5, 0);
      this.root.add([img, ring, key]);
      this.icons.push(img);
      this.keys.push(key);
      this.rings.push(ring);
      x += ICON + GAP;
    }
    this.layout();
  }

  private rebuildHits(): void {
    this.hits.clear();
    const pos = battleHudSpellPos(viewW(this.scene), viewH(this.scene));
    const n = this.items.length;
    const total = n * ICON + Math.max(0, n - 1) * GAP;
    let x = pos.x - total / 2 + ICON / 2;
    for (const item of this.items) {
      const id = item.id;
      this.hits.add({
        id: `spell:${id}`,
        z: 32,
        rect: rectFromCenter(x, pos.y, ICON + 4, ICON + 18),
        onDown: () => {
          if (item.enabled) this.onPick?.(id);
        },
      });
      x += ICON + GAP;
    }
  }
}
