import Phaser from "phaser";
import { battleActionBarPos } from "./battleLayout";
import { DOSSIER } from "./vintageDossier";
import { ScreenHitRouter, rectFromCenter } from "./ScreenHitRouter";
import { viewH, viewW } from "./viewport";

export type BattleActionId = "skip" | "defend" | "flee" | "quick";

export interface BattleActionBarHandlers {
  onSkip: () => void;
  onDefend: () => void;
  onFlee: () => void;
  onQuick: () => void;
}

type Btn = {
  id: BattleActionId;
  root: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  hotkey: Phaser.GameObjects.Text;
  enabled: boolean;
};

const BTN_W = 148;
const BTN_H = 40;
const GAP = 10;

/**
 * Bottom battle commands — skip / defend / flee / auto-resolve.
 */
export class BattleActionBar {
  readonly router = new ScreenHitRouter();
  private root: Phaser.GameObjects.Container;
  private buttons: Btn[] = [];
  private playerTurn = false;
  private busy = false;
  private canFlee = true;

  constructor(
    private scene: Phaser.Scene,
    private handlers: BattleActionBarHandlers,
  ) {
    this.root = scene.add.container(viewW(scene) / 2, viewH(scene) - 108).setDepth(30).setScrollFactor(0);

    const defs: { id: BattleActionId; text: string; key: string }[] = [
      { id: "skip", text: "Пропуск", key: "Space" },
      { id: "defend", text: "Защита", key: "D" },
      { id: "flee", text: "Бегство", key: "F" },
      { id: "quick", text: "Быстрый бой", key: "B" },
    ];

    const totalW = defs.length * BTN_W + (defs.length - 1) * GAP;
    let x = -totalW / 2 + BTN_W / 2;

    for (const def of defs) {
      const btn = this.makeButton(x, 0, def.text, def.key, def.id);
      this.buttons.push(btn);
      this.root.add(btn.root);
      x += BTN_W + GAP;
    }

    this.rebuildHits();
    this.refresh();
  }

  private makeButton(
    x: number,
    y: number,
    text: string,
    key: string,
    id: BattleActionId,
  ): Btn {
    const bg = this.scene.textures.exists("ui_city_btn")
      ? this.scene.add.image(0, 0, "ui_city_btn").setDisplaySize(BTN_W, BTN_H)
      : this.scene.add
          .rectangle(0, 0, BTN_W, BTN_H, DOSSIER.headerRi, 0.95)
          .setStrokeStyle(2, 0xc9a227, 0.9);

    const label = this.scene.add
      .text(0, -5, text, {
        fontFamily: "Georgia, serif",
        fontSize: "14px",
        color: DOSSIER.title,
        stroke: "#1a1008",
        strokeThickness: 2,
      })
      .setOrigin(0.5);

    const hotkey = this.scene.add
      .text(0, 12, key, {
        fontFamily: "Georgia, serif",
        fontSize: "10px",
        color: DOSSIER.inkDim,
      })
      .setOrigin(0.5);

    const root = this.scene.add.container(x, y, [bg, label, hotkey]).setSize(BTN_W, BTN_H);
    return { id, root, bg, label, hotkey, enabled: true };
  }

  private rebuildHits() {
    this.router.clear();
    for (const btn of this.buttons) {
      const wx = this.root.x + btn.root.x;
      const wy = this.root.y + btn.root.y;
      this.router.add({
        id: btn.id,
        rect: rectFromCenter(wx, wy, BTN_W, BTN_H),
        z: 20,
        onDown: () => this.press(btn.id),
      });
    }
  }

  private press(id: BattleActionId) {
    const btn = this.buttons.find((b) => b.id === id);
    if (!btn?.enabled) return;
    if (id === "skip") this.handlers.onSkip();
    else if (id === "defend") this.handlers.onDefend();
    else if (id === "flee") this.handlers.onFlee();
    else if (id === "quick") this.handlers.onQuick();
  }

  setState(opts: { playerTurn: boolean; busy: boolean; canFlee: boolean }) {
    this.playerTurn = opts.playerTurn;
    this.busy = opts.busy;
    this.canFlee = opts.canFlee;
    this.refresh();
  }

  private refresh() {
    for (const btn of this.buttons) {
      let enabled = !this.busy;
      if (btn.id === "skip" || btn.id === "defend") enabled = enabled && this.playerTurn;
      if (btn.id === "flee") enabled = enabled && this.canFlee;
      // quick battle allowed on player turn when idle (also mid-enemy via busy=false only)
      if (btn.id === "quick") enabled = enabled && this.playerTurn;
      btn.enabled = enabled;
      btn.root.setAlpha(enabled ? 1 : 0.4);
    }
  }

  /** @returns true if a button consumed the click */
  handlePointer(pointer: Phaser.Input.Pointer): boolean {
    return this.router.dispatch(pointer);
  }

  layout(_opts?: { centerX?: number; y?: number }): void {
    const w = viewW(this.scene);
    const h = viewH(this.scene);
    const pos = battleActionBarPos(w, h);
    this.root.setPosition(pos.x, pos.y);
    this.rebuildHits();
  }

  setVisible(visible: boolean): void {
    this.root.setVisible(visible);
  }

  destroy() {
    this.router.clear();
    this.root.destroy(true);
  }
}
