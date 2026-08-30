/**
 * Battle HUD facade — screen-space chrome around the combat arena.
 *
 * BattleScene owns the combat loop (turns, AI, damage, spells).
 * This class owns title / status / spell line / bag button.
 *
 * Action bar: src/ui/BattleActionBar.ts
 * Focus portraits: src/ui/BattleFocusWindows.ts
 */
import Phaser from "phaser";
import { type SpellId } from "../../game/catalog";
import { ScreenHitRouter, rectFromCenter, setLeftHudRect } from "../ScreenHitRouter";
import {
  battleCharcoalBox,
  battleHudBagPos,
  battleHudSpellPos,
  battleHudStatusPos,
  battleHudTitlePos,
} from "../battleLayout";
import { type CharcoalChrome } from "../screenCharcoalFrame";
import { BattleSpellBar, type SpellBarItem } from "./BattleSpellBar";
import { battleWindowReady } from "./battleWindowFrame";
import { viewH, viewW } from "../viewport";

export type BattleHudActions = {
  onBag: () => void;
  onSpell?: (id: SpellId) => void;
};

export class BattleHud {
  readonly bagHits = new ScreenHitRouter();
  readonly spellBar: BattleSpellBar;
  private titleText?: Phaser.GameObjects.Text;
  private status?: Phaser.GameObjects.Text;
  private spellUi?: Phaser.GameObjects.Text;
  private bagCircle?: Phaser.GameObjects.Image;
  private bagIcon?: Phaser.GameObjects.Image;
  private built = false;

  constructor(
    private scene: Phaser.Scene,
    private actions: BattleHudActions,
  ) {
    this.spellBar = new BattleSpellBar(scene, actions.onSpell);
  }

  build(title: string): void {
    if (this.built) return;
    this.built = true;

    const w = viewW(this.scene);
    const h = viewH(this.scene);

    this.titleText = this.scene.add
      .text(w / 2, 28, title, {
        fontFamily: "Georgia, serif",
        fontSize: "32px",
        color: "#efe6d2",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(33)
      .setStroke("#0a0806", 5)
      .setShadow(0, 2, "#000000", 8, true, true);
    if (typeof this.titleText.setLetterSpacing === "function") {
      this.titleText.setLetterSpacing(10);
    }

    this.status = this.scene.add
      .text(w / 2, h - 65, "", {
        fontFamily: "Georgia, serif",
        fontSize: "15px",
        color: "#d8ccb0",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setStroke("#0a0806", 4)
      .setShadow(0, 1, "#000000", 5, true, true);

    this.spellUi = this.scene.add
      .text(w / 2, h - 40, "", {
        fontFamily: "Georgia, serif",
        fontSize: "12px",
        color: "#c8b896",
      })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setStroke("#0a0806", 3)
      .setDepth(32);

    const bag = battleHudBagPos(w, h);
    this.bagCircle = this.scene.add
      .image(bag.x, bag.y, "ui_btn_circle")
      .setDisplaySize(40, 40)
      .setDepth(31)
      .setScrollFactor(0);
    this.bagIcon = this.scene.add
      .image(bag.x, bag.y, "icon_bag")
      .setDisplaySize(24, 24)
      .setDepth(32)
      .setScrollFactor(0);
    this.registerBagHit(bag.x, bag.y);
  }

  layout(w: number, h: number): void {
    const title = battleHudTitlePos(w, h);
    const status = battleHudStatusPos(w, h);
    const spell = battleHudSpellPos(w, h);
    const bag = battleHudBagPos(w, h);

    this.titleText?.setPosition(title.x, title.y);
    this.status?.setPosition(status.x, status.y);
    this.spellUi?.setPosition(spell.x, spell.y + 36);
    this.spellBar.layout();
    this.bagCircle?.setPosition(bag.x, bag.y);
    this.bagIcon?.setPosition(bag.x, bag.y);
    this.registerBagHit(bag.x, bag.y);
    setLeftHudRect({ left: 16, top: bag.y - 32, right: 184, bottom: bag.y + 32 });
  }

  setStatus(msg: string): void {
    this.status?.setText(msg);
  }

  setSpellLine(text: string): void {
    this.spellUi?.setText(text);
  }

  setSpells(items: SpellBarItem[], active: SpellId | null): void {
    this.spellBar.setSpells(items, active);
  }

  setBagHover(on: boolean): void {
    if (on) this.bagIcon?.setTint(0xffe8a0);
    else this.bagIcon?.clearTint();
  }

  charcoalChrome(w: number, h: number): CharcoalChrome {
    return { box: battleCharcoalBox(w, h), skipMolding: battleWindowReady(this.scene) };
  }

  private registerBagHit(bagX: number, bagY: number): void {
    this.bagHits.clear();
    this.bagHits.add({
      id: "bag",
      z: 30,
      rect: rectFromCenter(bagX, bagY, 48, 48),
      onDown: () => this.actions.onBag(),
    });
  }
}
