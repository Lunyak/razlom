import Phaser from "phaser";
import { ensureBlackHollow } from "../game/chromaCutout";
import {
  BATTLE_ACTION_ICON,
  battleActionButtonPositions,
  type BattleActionSlotId,
} from "./battleLayout";
import { DOSSIER } from "./vintageDossier";
import { ScreenHitRouter, rectFromCenter } from "./ScreenHitRouter";
import { viewH, viewW } from "./viewport";

export type BattleActionId = BattleActionSlotId;

export interface BattleActionBarHandlers {
  onSkip: () => void;
  onDefend: () => void;
  onFlee: () => void;
  onQuick: () => void;
}

type Btn = {
  id: BattleActionId;
  root: Phaser.GameObjects.Container;
  back: Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
  icon: Phaser.GameObjects.Image | Phaser.GameObjects.Text;
  hotkey: Phaser.GameObjects.Text;
  enabled: boolean;
};

const BACK = 70;
const BACKING_KEY = "skill_icon_backing";

const DEFS: { id: BattleActionId; key: string; icon: string; letter: string }[] = [
  { id: "skip", key: "Space", icon: "skill_skip", letter: "П" },
  { id: "defend", key: "D", icon: "skill_defend", letter: "З" },
  { id: "flee", key: "F", icon: "skill_flee", letter: "Б" },
  { id: "quick", key: "B", icon: "skill_quick", letter: "Б" },
];

/**
 * Command icons on the inner flank of the player's 2×3 frames.
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
    this.root = scene.add.container(0, 0).setDepth(32).setScrollFactor(0);

    for (const def of DEFS) {
      const btn = this.makeButton(def);
      this.buttons.push(btn);
      this.root.add(btn.root);
    }

    this.layout();
    this.refresh();
  }

  private makeButton(def: (typeof DEFS)[number]): Btn {
    const back = this.scene.textures.exists(BACKING_KEY)
      ? this.scene.add.image(0, 0, BACKING_KEY).setDisplaySize(BACK, BACK)
      : this.scene.add.circle(0, 0, BACK / 2, 0x080706, 0.72);

    const tex = this.scene.textures.exists(def.icon)
      ? (ensureBlackHollow(this.scene, def.icon) ?? def.icon)
      : "";
    const icon = tex
      ? this.scene.add.image(0, 0, tex).setDisplaySize(BATTLE_ACTION_ICON, BATTLE_ACTION_ICON)
      : this.scene.add
          .text(0, 0, def.letter, {
            fontFamily: "Georgia, serif",
            fontSize: "22px",
            color: "#efe6d2",
            stroke: "#120c08",
            strokeThickness: 4,
          })
          .setOrigin(0.5);

    const hotkey = this.scene.add
      .text(0, BATTLE_ACTION_ICON / 2 + 2, def.key, {
        fontFamily: "Georgia, serif",
        fontSize: "11px",
        color: DOSSIER.gold,
        stroke: "#120c08",
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0);

    const root = this.scene.add.container(0, 0, [back, icon, hotkey]);
    return { id: def.id, root, back, icon, hotkey, enabled: true };
  }

  private rebuildHits() {
    this.router.clear();
    for (const btn of this.buttons) {
      this.router.add({
        id: btn.id,
        rect: rectFromCenter(btn.root.x, btn.root.y, BATTLE_ACTION_ICON + 4, BATTLE_ACTION_ICON + 18),
        z: 32,
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
    const spots = battleActionButtonPositions(viewW(this.scene), viewH(this.scene));
    for (const btn of this.buttons) {
      const pos = spots[btn.id];
      btn.root.setPosition(pos.x, pos.y);
    }
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
