import Phaser from "phaser";
import { viewSize } from "./viewport";

/** Optional drop-ins — unused while chrome is molding-only. Kept so Boot preload stays valid. */
export const CHARCOAL_FRAME_ASSETS: [string, string][] = [];

/** Layout inset around HUD jewels (minimap). */
export const CHARCOAL_RAIL_PX = 20;

/** Max turn-queue cell. Actual band height is the fitted frame, not this cap. */
export const BATTLE_TURN_STRIP_H = 220;

/** Battle chrome keeps this much room below the molding for the turn strip. */
export const BATTLE_CHROME_BOTTOM = BATTLE_TURN_STRIP_H;

export type CharcoalBox = { x: number; y: number; w: number; h: number };
export type CharcoalCornerId = "tl" | "tr" | "bl" | "br";

export interface CharcoalChrome {
  box: CharcoalBox;
  skip?: Partial<Record<CharcoalCornerId, boolean>>;
  /** Full-window art plate already draws the rails. */
  skipMolding?: boolean;
}

export function charcoalMoldingThick(box: CharcoalBox): number {
  return Phaser.Math.Clamp(Math.round(Math.min(box.w, box.h) * 0.028), 18, 28);
}

/** Inner bottom stroke of the charcoal box — the line the arena sits on. */
export function charcoalInnerBottom(box: CharcoalBox): number {
  return box.y + box.h - (charcoalMoldingThick(box) - 2);
}

/**
 * Thin charcoal molding around the viewport. No corner plates —
 * HUD jewels (minimap, plot) sit on top of the rails.
 */
export class ScreenCharcoalFrame {
  private readonly root: Phaser.GameObjects.Container;
  private chrome: CharcoalChrome | null = null;

  constructor(private scene: Phaser.Scene) {
    this.root = scene.add.container(0, 0).setDepth(70).setScrollFactor(0);
    this.rebuild();
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  setChrome(chrome: CharcoalChrome | null): void {
    this.chrome = chrome;
  }

  layout(): void {
    this.rebuild();
  }

  destroy(): void {
    this.root.destroy(true);
  }

  private plate(w: number, h: number): CharcoalChrome {
    if (this.chrome) return this.chrome;
    return { box: { x: 0, y: 0, w, h } };
  }

  private rebuild(): void {
    if (!this.root.active) return;
    this.root.removeAll(true);
    const { w, h } = viewSize(this.scene);
    this.root.setPosition(0, 0).setScrollFactor(0);
    const chrome = this.plate(w, h);
    const { box } = chrome;
    if (box.w < 80 || box.h < 80) return;
    if (chrome.skipMolding) return;
    this.drawMolding(box, charcoalMoldingThick(box));
  }

  private drawMolding(box: CharcoalBox, thick: number): void {
    const { x, y, w, h } = box;
    const g = this.scene.add.graphics().setScrollFactor(0);
    g.fillStyle(0x1a1816, 0.97);
    g.fillRect(x, y, w, thick);
    g.fillRect(x, y + h - thick, w, thick);
    g.fillRect(x, y, thick, h);
    g.fillRect(x + w - thick, y, thick, h);

    g.fillStyle(0x3e3a36, 1);
    g.fillRect(x, y, w, 3);
    g.fillRect(x, y + h - 3, w, 3);
    g.fillRect(x, y, 3, h);
    g.fillRect(x + w - 3, y, 3, h);

    g.lineStyle(1, 0xc8c4bc, 0.55);
    g.strokeRect(x + 2, y + 2, w - 4, h - 4);
    g.lineStyle(1, 0x6a645c, 0.7);
    const inset = thick - 2;
    g.strokeRect(x + inset, y + inset, w - inset * 2, h - inset * 2);
    this.root.add(g);
  }
}
