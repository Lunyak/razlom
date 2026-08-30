import Phaser from "phaser";
import { firstUnitSkill, UNIT_DEFS, type UnitSkillId } from "../game/catalog";
import { ensureBlackHollow } from "../game/chromaCutout";
import { type Army, type UnitInstance } from "../game/data";
import { portraitTextureKey } from "../game/portraits";
import { statusChips } from "../game/status";
import {
  battleFocusActorPos,
  battleFocusFrameSize,
  battleFocusTargetPos,
  battleRestBottom,
} from "./battleLayout";
import { ScreenHitRouter, rectFromCenter } from "./ScreenHitRouter";
import { DOSSIER } from "./vintageDossier";
import { viewH, viewW } from "./viewport";

/** Inner photo vs thorn ring — measured on the 599² plate (hole ≈0.56). */
const PORTRAIT_RATIO = 0.56;
const FRAME_KEY = "combat_focus_frame";
const SKILL_ICON = 52;

type SlotData = {
  unit: UnitInstance;
  army: Army;
  side: "player" | "enemy";
};

type ChipUi = {
  root: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Arc;
  text: Phaser.GameObjects.Text;
};

type SkillUi = {
  root: Phaser.GameObjects.Container;
  icon: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Graphics;
  id: UnitSkillId | null;
};

type SlotUi = {
  root: Phaser.GameObjects.Container;
  name: Phaser.GameObjects.Text;
  meta: Phaser.GameObjects.Text;
  empty: Phaser.GameObjects.Text;
  portrait: Phaser.GameObjects.GameObject | null;
  frame: Phaser.GameObjects.Image | Phaser.GameObjects.Arc;
  chips: ChipUi[];
  skill: SkillUi;
  key: string;
};

/**
 * Combat focus: thorn rings for who acts (left) vs target (right).
 * First character skill sits on the actor medallion.
 */
export class BattleFocusWindows {
  readonly hits = new ScreenHitRouter();
  private root: Phaser.GameObjects.Container;
  private actor: SlotUi;
  private target: SlotUi;
  private frameTex: string | null;
  private frameSize = 0;
  private skillEnabled = false;
  private skillArmed: UnitSkillId | null = null;

  constructor(
    private scene: Phaser.Scene,
    private onSkill?: (id: UnitSkillId) => void,
  ) {
    this.root = scene.add.container(0, 0).setDepth(28).setScrollFactor(0);
    this.frameTex = ensureBlackHollow(scene, FRAME_KEY, { fromCenter: true });
    this.frameSize = this.fittedFrame();
    this.actor = this.makeSlot("actor");
    this.target = this.makeSlot("target");
    this.root.add([this.actor.root, this.target.root]);
    this.clearActor();
    this.clearTarget();
    this.layout();
  }

  private fittedFrame(): number {
    return battleFocusFrameSize(viewW(this.scene), viewH(this.scene));
  }

  private portraitSize(): number {
    return Math.round(this.frameSize * PORTRAIT_RATIO);
  }

  private placeLabels(slot: SlotUi) {
    const photo = this.portraitSize();
    const bottom = photo / 2 - 4;
    const wrap = Math.max(64, photo - 12);
    slot.name.setOrigin(0.5, 1);
    slot.name.setPosition(0, bottom - 16);
    slot.name.setStyle({ align: "center", wordWrap: { width: wrap } });
    slot.meta.setOrigin(0.5, 1);
    slot.meta.setPosition(0, bottom);
    slot.meta.setStyle({ align: "center" });
    slot.empty.setPosition(0, photo * 0.12);
  }

  private makeSlot(_side: "actor" | "target"): SlotUi {
    const root = this.scene.add.container(0, 0);
    const frame = this.frameSize;

    const tex = this.frameTex && this.scene.textures.exists(this.frameTex) ? this.frameTex : FRAME_KEY;
    const hasFrame = this.scene.textures.exists(tex);
    const ring: Phaser.GameObjects.Image | Phaser.GameObjects.Arc = hasFrame
      ? this.scene.add.image(0, 0, tex).setDisplaySize(frame, frame)
      : this.scene.add.circle(0, 0, frame / 2 - 2, 0x000000, 0).setStrokeStyle(5, 0x8a9098, 0.95);

    const name = this.scene.add
      .text(0, 0, "", {
        fontFamily: "Georgia, serif",
        fontSize: "15px",
        color: DOSSIER.title,
        stroke: "#120c08",
        strokeThickness: 4,
        align: "center",
      })
      .setOrigin(0.5, 1);
    const meta = this.scene.add
      .text(0, 0, "", {
        fontFamily: "Georgia, serif",
        fontSize: "14px",
        color: DOSSIER.inkMuted,
        stroke: "#120c08",
        strokeThickness: 3,
        align: "center",
      })
      .setOrigin(0.5, 1);
    const empty = this.scene.add
      .text(0, 0, "—", {
        fontFamily: "Georgia, serif",
        fontSize: "22px",
        color: DOSSIER.inkDim,
      })
      .setOrigin(0.5);

    const chips: ChipUi[] = [];
    root.add([ring, name, meta, empty]);
    for (let i = 0; i < 4; i++) {
      const chipRoot = this.scene.add.container(0, 0).setVisible(false);
      const bg = this.scene.add.circle(0, 0, 11, 0x1a1210, 0.92).setStrokeStyle(1, 0xc9a227, 0.7);
      const text = this.scene.add
        .text(0, 0, "", {
          fontFamily: "Georgia, serif",
          fontSize: "9px",
          color: "#efe6d2",
          stroke: "#120c08",
          strokeThickness: 2,
        })
        .setOrigin(0.5);
      chipRoot.add([bg, text]);
      chips.push({ root: chipRoot, bg, text });
      root.add(chipRoot);
    }

    const skill = this.makeSkill();
    root.add(skill.root);

    const slot: SlotUi = { root, name, meta, empty, portrait: null, frame: ring, chips, skill, key: "" };
    this.placeLabels(slot);
    this.placeSkill(slot);
    return slot;
  }

  private makeSkill(): SkillUi {
    const root = this.scene.add.container(0, 0).setVisible(false);
    const icon = this.scene.add.image(0, 0, FRAME_KEY).setDisplaySize(SKILL_ICON, SKILL_ICON).setVisible(false);
    const ring = this.scene.add.graphics();
    root.add([icon, ring]);
    return { root, icon, ring, id: null };
  }

  private placeSkill(slot: SlotUi) {
    const r = this.frameSize * 0.42;
    slot.skill.root.setPosition(r * 0.72, r * 0.72);
  }

  layout(opts?: { restBottom?: number }) {
    const w = viewW(this.scene);
    const h = viewH(this.scene);
    const next = this.fittedFrame();
    if (next !== this.frameSize) {
      this.frameSize = next;
      this.applyFrameSize(this.actor);
      this.applyFrameSize(this.target);
    }
    const rest = opts?.restBottom ?? battleRestBottom(w, h);
    const actor = battleFocusActorPos(w, h, rest);
    const target = battleFocusTargetPos(w, h, rest);
    this.actor.root.setPosition(actor.x, actor.y);
    this.target.root.setPosition(target.x, target.y);
    this.rebuildHits();
  }

  setSkillState(opts: { enabled: boolean; armed?: UnitSkillId | null }) {
    this.skillEnabled = opts.enabled;
    if (opts.armed !== undefined) this.skillArmed = opts.armed;
    this.refreshSkillLook(this.actor);
    this.rebuildHits();
  }

  handlePointer(pointer: Phaser.Input.Pointer): boolean {
    return this.hits.dispatch(pointer);
  }

  private applyFrameSize(slot: SlotUi) {
    const frame = this.frameSize;
    if (slot.frame instanceof Phaser.GameObjects.Image) {
      slot.frame.setDisplaySize(frame, frame);
    } else {
      slot.frame.setRadius(frame / 2 - 2);
    }
    this.placeLabels(slot);
    this.placeSkill(slot);
    if (slot.portrait instanceof Phaser.GameObjects.Image) {
      const p = this.portraitSize();
      slot.portrait.setDisplaySize(p, p);
    }
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
      slot.frame.setAlpha(0.35);
      this.layoutChips(slot, []);
      this.setSlotSkill(slot, null);
      slot.key = "";
      return;
    }

    slot.empty.setVisible(false);
    slot.frame.setAlpha(1);

    const def = UNIT_DEFS[data.unit.defId];
    const title = data.unit.isHero ? data.army.hero.name || def?.name || "?" : def?.name || "?";
    slot.name.setText(title);
    const hp = `${data.unit.hp}/${def?.maxHp ?? "?"}`;
    slot.meta.setText(hp);
    slot.meta.setColor(
      data.unit.hp <= (def?.maxHp ?? 1) * 0.35 ? DOSSIER.danger : DOSSIER.inkMuted,
    );
    this.layoutChips(slot, statusChips(data.unit).slice(0, 4));
    this.setSlotSkill(slot, slot === this.actor ? firstUnitSkill(def?.skills) ?? null : null);

    const tex = portraitTextureKey(data.unit.defId);
    const key = `${data.unit.instanceId}:${data.unit.defId}:${tex}`;
    if (key === slot.key && slot.portrait) return;
    slot.key = key;

    this.clearPortrait(slot);
    const p = this.portraitSize();
    const circKey = this.ensureCircularPortrait(tex, p);
    const portrait: Phaser.GameObjects.GameObject = circKey
      ? this.scene.add.image(0, 0, circKey).setDisplaySize(p, p)
      : this.scene.add.circle(0, 0, p / 2, 0x1a1410, 1);

    slot.root.addAt(portrait, 1);
    slot.portrait = portrait;
  }

  private setSlotSkill(slot: SlotUi, skill: ReturnType<typeof firstUnitSkill> | null) {
    slot.skill.id = skill?.id ?? null;
    if (!skill) {
      slot.skill.root.setVisible(false);
      this.rebuildHits();
      return;
    }
    const tex = ensureBlackHollow(this.scene, skill.icon) ?? skill.icon;
    if (this.scene.textures.exists(tex)) {
      slot.skill.icon.setTexture(tex).setDisplaySize(SKILL_ICON, SKILL_ICON).setVisible(true);
    }
    slot.skill.root.setVisible(true);
    this.refreshSkillLook(slot);
    this.rebuildHits();
  }

  private refreshSkillLook(slot: SlotUi) {
    const canUse = slot === this.actor && this.skillEnabled && !!slot.skill.id;
    slot.skill.root.setAlpha(slot.skill.id ? (canUse ? 1 : 0.4) : 0);
    slot.skill.ring.clear();
    if (slot.skill.id && this.skillArmed === slot.skill.id) {
      slot.skill.ring.lineStyle(2, 0xc9a227, 0.95);
      slot.skill.ring.strokeCircle(0, 0, SKILL_ICON / 2 + 1);
    }
  }

  private rebuildHits() {
    this.hits.clear();
    const id = this.actor.skill.id;
    if (!id || !this.skillEnabled || !this.onSkill) return;
    this.hits.add({
      id: `unit-skill:${id}`,
      z: 34,
      rect: rectFromCenter(
        this.actor.root.x + this.actor.skill.root.x,
        this.actor.root.y + this.actor.skill.root.y,
        SKILL_ICON + 8,
        SKILL_ICON + 8,
      ),
      onDown: () => this.onSkill?.(id),
    });
  }

  private layoutChips(slot: SlotUi, chips: { chip: string; color: string }[]) {
    const n = chips.length;
    const r = this.frameSize * 0.38;
    for (let i = 0; i < slot.chips.length; i++) {
      const ui = slot.chips[i]!;
      const data = chips[i];
      if (!data) {
        ui.root.setVisible(false);
        continue;
      }
      const t = n === 1 ? 0.5 : i / (n - 1);
      const ang = Math.PI * (1.22 + t * 0.56);
      ui.root.setPosition(Math.cos(ang) * r, Math.sin(ang) * r);
      ui.text.setText(data.chip);
      const color = Number.parseInt(data.color.replace("#", ""), 16);
      if (Number.isFinite(color)) ui.bg.setStrokeStyle(1, color, 0.9);
      ui.root.setVisible(true);
    }
  }

  private clearPortrait(slot: SlotUi) {
    slot.portrait?.destroy(true);
    slot.portrait = null;
  }

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
    this.hits.clear();
    this.clearPortrait(this.actor);
    this.clearPortrait(this.target);
    this.root.destroy(true);
  }
}
