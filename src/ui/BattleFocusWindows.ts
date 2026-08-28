import Phaser from "phaser";
import { UNIT_DEFS } from "../game/catalog";
import { type Army, type UnitInstance } from "../game/data";
import { portraitTextureKey } from "../game/portraits";
import { statusChips } from "../game/status";
import {
  battleFocusActorPos,
  battleFocusTargetPos,
  battleRestBottom,
} from "./battleLayout";
import { DOSSIER } from "./vintageDossier";
import { viewH, viewW } from "./viewport";

/** Source medallion display size (combat_focus_frame.png). */
const FRAME_SRC = 352;
/** On-screen size — one third smaller than the source. */
const FRAME = Math.round((FRAME_SRC * 2) / 3);
/** Inner portrait disc — hole ratio from processed 736² asset (r≈228). */
const PORTRAIT = Math.round(FRAME * ((228 * 2) / 736));
const FRAME_KEY = "combat_focus_frame";

type SlotData = {
  unit: UnitInstance;
  army: Army;
  side: "player" | "enemy";
};

type SlotUi = {
  root: Phaser.GameObjects.Container;
  badge: Phaser.GameObjects.Text;
  name: Phaser.GameObjects.Text;
  meta: Phaser.GameObjects.Text;
  empty: Phaser.GameObjects.Text;
  portrait: Phaser.GameObjects.GameObject | null;
  frame: Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
  key: string;
};

/**
 * Bottom combat focus: raven medallions for who acts (left) vs target (right).
 * No dossier plate — frames rest on the inner charcoal rail, pulled toward center.
 */
export class BattleFocusWindows {
  private root: Phaser.GameObjects.Container;
  private actor: SlotUi;
  private target: SlotUi;

  constructor(private scene: Phaser.Scene) {
    this.root = scene.add.container(0, 0).setDepth(28).setScrollFactor(0);
    this.actor = this.makeSlot("ХОД", "actor");
    this.target = this.makeSlot("ЦЕЛЬ", "target");
    this.root.add([this.actor.root, this.target.root]);
    this.clearActor();
    this.clearTarget();
    this.layout();
  }

  private makeSlot(badgeLabel: string, side: "actor" | "target"): SlotUi {
    const root = this.scene.add.container(0, 0);
    const badge = this.scene.add
      .text(0, -FRAME / 2 + 8, badgeLabel, {
        fontFamily: "Georgia, serif",
        fontSize: "16px",
        color: DOSSIER.gold,
        stroke: "#120c08",
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    const hasFrame = this.scene.textures.exists(FRAME_KEY);
    const frame: Phaser.GameObjects.Image | Phaser.GameObjects.Arc = hasFrame
      ? this.scene.add.image(0, 0, FRAME_KEY).setDisplaySize(FRAME, FRAME)
      : this.scene.add.circle(0, 0, FRAME / 2 - 2, 0x000000, 0).setStrokeStyle(5, 0x8a9098, 0.95);

    // Labels on the outer side — medallions sit as a pair near center
    const outward = side === "actor" ? -1 : 1;
    const labelX = outward * (FRAME / 2 + 12);
    const labelOriginX = side === "actor" ? 1 : 0;
    const name = this.scene.add
      .text(labelX, -FRAME * 0.28, "", {
        fontFamily: "Georgia, serif",
        fontSize: "17px",
        color: DOSSIER.title,
        stroke: "#120c08",
        strokeThickness: 4,
        align: side === "actor" ? "right" : "left",
        wordWrap: { width: 130 },
      })
      .setOrigin(labelOriginX, 1);
    const meta = this.scene.add
      .text(labelX, -FRAME * 0.28 + 6, "", {
        fontFamily: "Georgia, serif",
        fontSize: "14px",
        color: DOSSIER.inkMuted,
        stroke: "#120c08",
        strokeThickness: 3,
        align: side === "actor" ? "right" : "left",
      })
      .setOrigin(labelOriginX, 0);
    const empty = this.scene.add
      .text(0, -FRAME * 0.22, "—", {
        fontFamily: "Georgia, serif",
        fontSize: "22px",
        color: DOSSIER.inkDim,
      })
      .setOrigin(0.5);

    // Order: badge, (portrait inserted later), frame, labels
    root.add([badge, frame, name, meta, empty]);
    return { root, badge, name, meta, empty, portrait: null, frame, key: "" };
  }

  layout(opts?: { centerX?: number; spread?: number; y?: number; restBottom?: number }) {
    const w = viewW(this.scene);
    const h = viewH(this.scene);
    const rest = opts?.restBottom ?? battleRestBottom(w, h);
    const actor = battleFocusActorPos(w, h, rest);
    const target = battleFocusTargetPos(w, h, rest);
    this.actor.root.setPosition(actor.x, actor.y);
    this.target.root.setPosition(target.x, target.y);
  }

  setActor(data: SlotData | null) {
    this.applySlot(this.actor, data);
  }

  setTarget(data: SlotData | null) {
    this.applySlot(this.target, data);
  }

  clearActor() {
    this.setActor(null);
  }

  clearTarget() {
    this.setTarget(null);
  }

  private applySlot(slot: SlotUi, data: SlotData | null) {
    if (!data || !(data.unit.hp > 0)) {
      this.clearPortrait(slot);
      slot.name.setText("");
      slot.meta.setText("");
      slot.empty.setVisible(true);
      slot.badge.setAlpha(0.45);
      slot.frame.setAlpha(0.35);
      slot.key = "";
      return;
    }

    slot.empty.setVisible(false);
    slot.badge.setAlpha(1);
    slot.frame.setAlpha(1);

    const def = UNIT_DEFS[data.unit.defId];
    const title = data.unit.isHero ? data.army.hero.name || def?.name || "?" : def?.name || "?";
    slot.name.setText(title);
    const hp = `${data.unit.hp}/${def?.maxHp ?? "?"}`;
    const chips = statusChips(data.unit)
      .slice(0, 2)
      .map((c) => c.chip)
      .join(" ");
    slot.meta.setText(chips ? `${hp} · ${chips}` : hp);
    slot.meta.setColor(
      data.unit.hp <= (def?.maxHp ?? 1) * 0.35 ? DOSSIER.danger : DOSSIER.inkMuted,
    );

    const tex = portraitTextureKey(data.unit.defId);
    const key = `${data.unit.instanceId}:${data.unit.defId}:${tex}`;
    if (key === slot.key && slot.portrait) return;
    slot.key = key;

    this.clearPortrait(slot);
    const circKey = this.ensureCircularPortrait(tex, PORTRAIT);
    const portrait: Phaser.GameObjects.GameObject = circKey
      ? this.scene.add.image(0, 0, circKey).setDisplaySize(PORTRAIT, PORTRAIT)
      : this.scene.add.circle(0, 0, PORTRAIT / 2, 0x1a1410, 1);

    // Insert under the raven frame (index 1: after badge)
    slot.root.addAt(portrait, 1);
    slot.portrait = portrait;
  }

  private clearPortrait(slot: SlotUi) {
    slot.portrait?.destroy(true);
    slot.portrait = null;
  }

  /** Clip source portrait to a circle once; reuse by cache key. */
  private ensureCircularPortrait(srcKey: string, size: number): string | null {
    if (!this.scene.textures.exists(srcKey)) return null;
    const outKey = `focus_circ_${srcKey}_${size}`;
    if (this.scene.textures.exists(outKey)) return outKey;

    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const src = this.scene.textures.get(srcKey).getSourceImage() as CanvasImageSource;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 0.5, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(src, 0, 0, size, size);

    const grd = ctx.createRadialGradient(
      size / 2,
      size / 2,
      size * 0.35,
      size / 2,
      size / 2,
      size / 2,
    );
    grd.addColorStop(0, "rgba(0,0,0,0)");
    grd.addColorStop(1, "rgba(12,8,4,0.45)");
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, size, size);

    this.scene.textures.addCanvas(outKey, canvas);
    return outKey;
  }

  destroy() {
    this.clearPortrait(this.actor);
    this.clearPortrait(this.target);
    this.root.destroy(true);
  }
}
