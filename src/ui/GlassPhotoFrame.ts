import Phaser from "phaser";
import { hurtPortraitTextureKey } from "../game/portraits";
import { GLASS_PHOTO_SIZE, vintageLookForKey } from "../game/vintagePortrait";
import { ensureBlackHollow } from "../game/chromaCutout";
import {
  buildRaceFrame,
  tintRaceFrameHighlight,
  type BuiltRaceFrame,
  type RaceFrameId,
} from "./raceFrameConstructor";

/** @deprecated prefer RaceFrameId — kept as alias for call sites. */
export type GlassFrameStyle = RaceFrameId;

export interface GlassPhotoFrameOptions {
  portraitKey?: string;
  portraitSize?: number;
  frameW?: number;
  frameH?: number;
  /** Race / faction frame constructor key. */
  style?: RaceFrameId;
  hpLabel?: string;
  hpColor?: string;
  hero?: boolean;
  veteran?: boolean;
  /** Skip race glass when the portrait sits in an iron plate niche. */
  chrome?: "race" | "none";
  /** Optional iron-cell overlay (turn strip / niches). */
  overlayKey?: string;
}

const HURT_FLASH_COLOR = 0xc01818;
const HURT_FLASH_MS = 420;
const FROST_WASH = 0x3060a0;
const FROST_FLASH = 0x58a0e0;
const POISON_WASH = 0x306018;
const BURN_WASH = 0xc04010;
/** Deep venous blood — not cartoon scarlet. */
const BLEED_WASH = 0x3a080a;

type BleedDropParts = {
  root: Phaser.GameObjects.Container;
  trail: Phaser.GameObjects.Graphics;
  body: Phaser.GameObjects.Graphics;
  scale: number;
  laneX: number;
};

export type StatusChipView = { chip: string; color: string };

/**
 * Portrait plate + per-race constructed frame.
 * Faction look = different avatar art + {@link buildRaceFrame}, not color washes.
 * Frost / poison / burn overlays are combat status only.
 */
export class GlassPhotoFrame extends Phaser.GameObjects.Container {
  private photoLayer!: Phaser.GameObjects.Container;
  private portrait!: Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
  private paper!: Phaser.GameObjects.Rectangle;
  private hurtFlash!: Phaser.GameObjects.Rectangle;
  private frostWash?: Phaser.GameObjects.Rectangle;
  private poisonWash?: Phaser.GameObjects.Rectangle;
  private burnWash?: Phaser.GameObjects.Rectangle;
  private bleedWash?: Phaser.GameObjects.Rectangle;
  /** Individual blood drops that fall down the plate. */
  private bleedLayer?: Phaser.GameObjects.Container;
  private bleedDrops: BleedDropParts[] = [];
  private frameBuilt?: BuiltRaceFrame;
  private frameRoot?: Phaser.GameObjects.Container;
  private overlay?: Phaser.GameObjects.Image;
  private highlightGfx?: Phaser.GameObjects.Graphics;
  private hpText?: Phaser.GameObjects.Text;
  private statusLabel?: Phaser.GameObjects.Text;
  private portraitKey?: string;
  private fallen = false;
  private woundAmount = 0;
  private frostAmount = 0;
  private poisonAmount = 0;
  private burnAmount = 0;
  private bleedAmount = 0;
  private bleedLayoutKey = "";
  private hurtTintTimer?: Phaser.Time.TimerEvent;
  private showingHurtFrame = false;

  readonly portraitSize: number;
  readonly frameW: number;
  readonly frameH: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private opts: GlassPhotoFrameOptions = {},
  ) {
    super(scene, x, y);
    this.portraitSize = opts.portraitSize ?? GLASS_PHOTO_SIZE.portraitSize;
    this.frameW = opts.frameW ?? GLASS_PHOTO_SIZE.frameW;
    this.frameH = opts.frameH ?? GLASS_PHOTO_SIZE.frameH;
    this.portraitKey = opts.portraitKey;

    scene.add.existing(this);
    this.build();
  }

  private race(): RaceFrameId {
    return this.opts.style ?? "ri";
  }

  private chrome(): "race" | "none" {
    return this.opts.chrome ?? "race";
  }

  private build() {
    const race = this.race();
    const look = vintageLookForKey(this.portraitKey);
    const s = this.portraitSize;
    const hasPortrait = !!(this.portraitKey && this.scene.textures.exists(this.portraitKey));
    const bare = this.chrome() === "none";

    if (!bare) {
      this.frameBuilt = buildRaceFrame(this.scene, race, {
        w: this.frameW,
        h: this.frameH,
        hero: this.opts.hero,
        rim: Math.max(10, Math.round(this.frameW * 0.085)),
      });
    }
    const paperColor = this.frameBuilt?.paperColor ?? look.paperColor;

    this.photoLayer = this.scene.add.container(0, 0);
    const paperPad = 4;
    this.paper = this.scene.add.rectangle(0, 0, s + paperPad, s + paperPad, paperColor, bare ? 0 : 1);
    this.photoLayer.add(this.paper);

    if (hasPortrait && this.portraitKey) {
      this.portrait = this.scene.add
        .image(0, 0, this.portraitKey)
        .setDisplaySize(s, s)
        .setTint(look.tint)
        .setAlpha(look.portraitAlpha);
    } else {
      this.portrait = this.scene.add.rectangle(0, 0, s, s, paperColor, 1);
    }
    this.portrait.setName("portrait");
    this.photoLayer.add(this.portrait);

    this.frostWash = this.scene.add.rectangle(0, 0, s, s, FROST_WASH, 0).setName("frostWash");
    this.photoLayer.add(this.frostWash);
    this.poisonWash = this.scene.add.rectangle(0, 0, s, s, POISON_WASH, 0).setName("poisonWash");
    this.photoLayer.add(this.poisonWash);
    this.burnWash = this.scene.add.rectangle(0, 0, s, s, BURN_WASH, 0).setName("burnWash");
    this.photoLayer.add(this.burnWash);
    this.bleedWash = this.scene.add.rectangle(0, 0, s, s, BLEED_WASH, 0).setName("bleedWash");
    this.photoLayer.add(this.bleedWash);

    this.bleedLayer = this.scene.add.container(0, 0).setName("bleedLayer");
    this.photoLayer.add(this.bleedLayer);

    this.hurtFlash = this.scene.add.rectangle(0, 0, s, s, HURT_FLASH_COLOR, 0);
    this.hurtFlash.setName("hurtFlash");
    this.photoLayer.add(this.hurtFlash);

    // Photo under frame
    this.add(this.photoLayer);
    if (this.frameBuilt) {
      this.frameRoot = this.frameBuilt.root;
      this.add(this.frameRoot);
    }

    if (this.opts.overlayKey) {
      const overlayTex =
        ensureBlackHollow(this.scene, this.opts.overlayKey) ?? this.opts.overlayKey;
      if (this.scene.textures.exists(overlayTex)) {
        this.overlay = this.scene.add
          .image(0, 0, overlayTex)
          .setDisplaySize(this.frameW, this.frameH)
          .setName("ironOverlay");
        this.add(this.overlay);
      }
    }

    this.highlightGfx = this.scene.add.graphics().setName("slotHighlight");
    this.add(this.highlightGfx);

    if (this.opts.veteran) {
      const starColor =
        race === "ri"
          ? "#ffd060"
          : race === "ordo"
            ? "#c8c0a8"
            : race === "folk"
              ? "#e6d5b8"
              : race === "thorn"
                ? "#c8c4bc"
                : race === "moderne"
                  ? "#c4a06a"
                  : race === "folio" || race === "folioPanel"
                    ? "#5a3c22"
                    : "#a8c090";
      this.add(
        this.scene.add
          .text(this.frameW / 2 - 18, -this.frameH / 2 + 16, "★", {
            fontFamily: "Georgia, serif",
            fontSize: "15px",
            color: starColor,
            stroke: "#1a1008",
            strokeThickness: 2,
          })
          .setOrigin(0.5),
      );
    }

    if (this.opts.hpLabel) {
      const hpY = s / 2 - 16;
      this.add(this.scene.add.rectangle(0, hpY, s - 8, 20, 0x0a0806, 0.58).setName("hpStrip"));
      this.hpText = this.scene.add
        .text(0, hpY, this.opts.hpLabel, {
          fontFamily: "Georgia, serif",
          fontSize: "13px",
          color: this.opts.hpColor ?? "#e8dcc8",
          stroke: "#1a1008",
          strokeThickness: 2,
        })
        .setOrigin(0.5)
        .setName("hp");
      this.add(this.hpText);
    }

    this.statusLabel = this.scene.add
      .text(0, -s / 2 + 10, "", {
        fontFamily: "Georgia, serif",
        fontSize: "10px",
        color: "#e8dcc8",
        stroke: "#1a1008",
        strokeThickness: 2,
        align: "center",
        wordWrap: { width: s - 6 },
      })
      .setOrigin(0.5, 0)
      .setName("statusChips")
      .setVisible(false);
    this.add(this.statusLabel);
  }

  private hurtKey(): string | undefined {
    if (!this.portraitKey) return undefined;
    const key = hurtPortraitTextureKey(this.portraitKey);
    return this.scene.textures.exists(key) ? key : undefined;
  }

  private showIdlePortrait() {
    if (!(this.portrait instanceof Phaser.GameObjects.Image) || !this.portraitKey) return;
    if (!this.scene.textures.exists(this.portraitKey)) return;
    this.portrait.setTexture(this.portraitKey);
    this.portrait.setDisplaySize(this.portraitSize, this.portraitSize);
    this.showingHurtFrame = false;
    this.applyPortraitTint();
  }

  private showHurtPortrait() {
    if (!(this.portrait instanceof Phaser.GameObjects.Image)) return;
    const hurt = this.hurtKey();
    if (!hurt) return;
    this.portrait.setTexture(hurt);
    this.portrait.setDisplaySize(this.portraitSize, this.portraitSize);
    this.showingHurtFrame = true;
    const look = vintageLookForKey(this.portraitKey);
    this.portrait.setTint(look.tint);
  }

  setPortraitKey(key: string) {
    this.portraitKey = key;
    this.hurtTintTimer?.remove(false);
    this.hurtTintTimer = undefined;
    this.showingHurtFrame = false;
    if (!(this.portrait instanceof Phaser.GameObjects.Image)) return;
    if (!this.scene.textures.exists(key)) return;
    const look = vintageLookForKey(key);
    this.portrait.setTexture(key);
    this.portrait.setDisplaySize(this.portraitSize, this.portraitSize);
    this.portrait.setAlpha(look.portraitAlpha);
    this.portrait.setVisible(true);
    this.applyPortraitTint();
  }

  setEmpty(empty: boolean) {
    this.portrait.setVisible(!empty);
    this.frostWash?.setVisible(!empty);
    this.poisonWash?.setVisible(!empty);
    this.burnWash?.setVisible(!empty);
    this.bleedWash?.setVisible(!empty);
    this.bleedLayer?.setVisible(!empty);
    this.statusLabel?.setVisible(!empty && !!this.statusLabel.text);
  }

  setHp(label: string, color?: string) {
    if (this.fallen && label !== "†") return;
    this.hpText?.setText(label);
    if (color) this.hpText?.setColor(color);
  }

  setWoundFromHp(hp: number, maxHp: number) {
    if (this.fallen || maxHp <= 0) return;
    const ratio = Phaser.Math.Clamp(hp / maxHp, 0, 1);
    this.woundAmount = 1 - ratio;
    if (!this.showingHurtFrame) this.applyPortraitTint();
  }

  setFrost(amount: number) {
    this.frostAmount = Phaser.Math.Clamp(amount, 0, 1);
    this.frostWash?.setAlpha(this.frostAmount * 0.45);
    if (!this.showingHurtFrame) this.applyPortraitTint();
  }

  setPoison(amount: number) {
    this.poisonAmount = Phaser.Math.Clamp(amount, 0, 1);
    this.poisonWash?.setAlpha(this.poisonAmount * 0.4);
    if (!this.showingHurtFrame) this.applyPortraitTint();
  }

  setBurn(amount: number) {
    this.burnAmount = Phaser.Math.Clamp(amount, 0, 1);
    this.burnWash?.setAlpha(this.burnAmount * 0.42);
    if (!this.showingHurtFrame) this.applyPortraitTint();
  }

  /** Blood droplets that fall down the plate (Phaser tweens — no extra lib). */
  setBleed(amount: number) {
    const next = Phaser.Math.Clamp(amount, 0, 1);
    const count = next < 0.05 ? 0 : Math.max(3, Math.round(3 + next * 5));
    const key = `${count}:${Math.round(next * 10)}`;
    this.bleedAmount = next;
    this.bleedWash?.setAlpha(next * 0.22);
    if (key !== this.bleedLayoutKey) {
      this.bleedLayoutKey = key;
      this.rebuildBleedDrops(count);
    }
    if (!this.showingHurtFrame) this.applyPortraitTint();
  }

  private clearBleedDrops() {
    for (const drop of this.bleedDrops) {
      this.scene.tweens.killTweensOf(drop.root);
      this.scene.tweens.killTweensOf(drop.trail);
      this.scene.tweens.killTweensOf(drop.body);
      drop.root.destroy(true);
    }
    this.bleedDrops = [];
    if (this.bleedLayer) this.bleedLayer.removeAll(true);
  }

  private rebuildBleedDrops(count: number) {
    this.clearBleedDrops();
    if (!this.bleedLayer || count <= 0 || this.fallen) return;

    const s = this.portraitSize;
    const half = s / 2;
    const top = -half + 8;
    const bottom = half - 12;
    const seed = Math.round(this.bleedAmount * 20);

    // Source smear near the top edge (wound origin)
    const smear = this.scene.add.graphics();
    this.drawBloodSmear(smear, 0, top + 6, 0.9 + this.bleedAmount);
    smear.setAlpha(0.35 + this.bleedAmount * 0.35);
    this.bleedLayer.add(smear);

    for (let i = 0; i < count; i++) {
      const laneX = -half + 14 + ((seed * 19 + i * 47) % Math.max(12, s - 28));
      const scale = 0.55 + (i % 4) * 0.18 + this.bleedAmount * 0.2;
      const isMicro = i % 3 === 2;
      const dropScale = isMicro ? scale * 0.45 : scale;
      const parts = this.createBleedDrop(dropScale, laneX);
      parts.root.setPosition(laneX, top + ((seed + i * 9) % 14));
      parts.root.setAlpha(0);
      this.bleedLayer.add(parts.root);
      this.bleedDrops.push(parts);
      this.startBleedFall(parts, top, bottom, i, isMicro);
    }
  }

  private createBleedDrop(scale: number, laneX: number): BleedDropParts {
    const root = this.scene.add.container(0, 0);
    const trail = this.scene.add.graphics();
    const body = this.scene.add.graphics();
    this.drawBloodTrail(trail, scale);
    this.drawRealisticBloodDrop(body, scale, 1);
    trail.setAlpha(0.35);
    trail.y = -2;
    root.add(trail);
    root.add(body);
    return { root, trail, body, scale, laneX };
  }

  private startBleedFall(
    drop: BleedDropParts,
    top: number,
    bottom: number,
    index: number,
    isMicro: boolean,
  ) {
    const fallOnce = () => {
      if (this.fallen || this.bleedAmount < 0.05 || !drop.root.active) return;

      const wobble = ((index * 5) % 7) - 3;
      const startY = top + (index % 4) * 3;
      drop.root.setPosition(drop.laneX + wobble, startY);
      drop.root.setScale(1, 1);
      drop.root.setAlpha(0);
      drop.trail.setAlpha(0.2);
      drop.body.clear();
      this.drawRealisticBloodDrop(drop.body, drop.scale, 1);

      const duration = (isMicro ? 700 : 1050) + index * 110 + Math.round(this.bleedAmount * 180);

      this.scene.tweens.add({
        targets: drop.root,
        alpha: isMicro ? 0.7 : 0.92,
        duration: 90,
        ease: "Sine.easeOut",
        onComplete: () => {
          if (this.fallen || this.bleedAmount < 0.05 || !drop.root.active) return;

          // Elongate while accelerating (raindrop physics feel)
          this.scene.tweens.add({
            targets: drop.root,
            scaleY: isMicro ? 1.35 : 1.75,
            scaleX: isMicro ? 0.92 : 0.82,
            duration: duration * 0.85,
            ease: "Quad.easeIn",
          });
          this.scene.tweens.add({
            targets: drop.trail,
            alpha: 0.55,
            scaleY: 1.8,
            duration: duration * 0.4,
            yoyo: true,
            ease: "Sine.easeInOut",
          });

          this.scene.tweens.add({
            targets: drop.root,
            y: bottom,
            x: drop.laneX + wobble * 0.4,
            alpha: 0.08,
            duration,
            ease: "Cubic.easeIn",
            onUpdate: () => {
              // Rebuild body slightly more elongated as it falls
              if (!drop.root.active) return;
              const elong = 1 + (drop.root.scaleY - 1) * 0.5;
              drop.body.clear();
              this.drawRealisticBloodDrop(drop.body, drop.scale, elong);
            },
            onComplete: () => {
              if (this.fallen || this.bleedAmount < 0.05 || !drop.root.active) return;
              // Tiny splash / settle
              drop.root.setScale(1.2, 0.45);
              drop.body.clear();
              this.drawBloodSplat(drop.body, drop.scale * 0.8);
              this.scene.tweens.add({
                targets: drop.root,
                alpha: 0,
                duration: 180,
                ease: "Quad.easeOut",
                onComplete: () => {
                  if (this.fallen || this.bleedAmount < 0.05 || !drop.root.active) return;
                  this.scene.time.delayedCall(60 + index * 35, fallOnce);
                },
              });
            },
          });
        },
      });
    };
    this.scene.time.delayedCall(index * 190, fallOnce);
  }

  /** Wet trail above the drop (motion smear). */
  private drawBloodTrail(g: Phaser.GameObjects.Graphics, scale: number) {
    g.clear();
    const w = 1.6 * scale;
    const h = 7 * scale;
    g.fillStyle(0x4a0a0c, 0.35);
    g.fillEllipse(0, -h * 0.35, w, h);
    g.fillStyle(0x6b1014, 0.2);
    g.fillEllipse(0, -h * 0.55, w * 0.6, h * 0.7);
  }

  /**
   * Realistic falling drop: bulbous top, pointed bottom (direction of fall),
   deep venous red + wet specular.
   */
  private drawRealisticBloodDrop(g: Phaser.GameObjects.Graphics, scale: number, elongate: number) {
    const w = 2.9 * scale;
    const h = 4.8 * scale * elongate;
    const tip = 3.8 * scale * Math.min(1.4, elongate);

    // Soft contact shadow
    g.fillStyle(0x1a0406, 0.25);
    g.fillEllipse(0.6, h * 0.15, w * 1.15, h * 0.95);

    // Dark rim
    g.fillStyle(0x2a0608, 0.9);
    g.fillEllipse(0, 0, w * 1.12, h * 1.05);
    g.fillTriangle(0, tip + h * 0.35, -w * 0.95, h * 0.15, w * 0.95, h * 0.15);

    // Main venous body
    g.fillStyle(0x5a0e12, 0.95);
    g.fillEllipse(0, 0, w, h);
    g.fillTriangle(0, tip + h * 0.28, -w * 0.78, h * 0.08, w * 0.78, h * 0.08);

    // Inner volume
    g.fillStyle(0x7a1418, 0.75);
    g.fillEllipse(-w * 0.08, -h * 0.08, w * 0.7, h * 0.72);

    // Wet highlight (small, cool-ish edge — glass plate reflection)
    g.fillStyle(0xc85860, 0.28);
    g.fillEllipse(-w * 0.28, -h * 0.22, w * 0.28, h * 0.32);
    g.fillStyle(0xfff0f0, 0.12);
    g.fillEllipse(-w * 0.32, -h * 0.28, w * 0.12, h * 0.14);
  }

  /** Settling splash at the bottom of a drip. */
  private drawBloodSplat(g: Phaser.GameObjects.Graphics, scale: number) {
    g.clear();
    g.fillStyle(0x4a0a0c, 0.75);
    g.fillEllipse(0, 0, 5.5 * scale, 2.2 * scale);
    g.fillStyle(0x6b1014, 0.55);
    g.fillEllipse(-2 * scale, -0.5 * scale, 2.2 * scale, 1.2 * scale);
    g.fillEllipse(2.2 * scale, 0.3 * scale, 1.8 * scale, 1 * scale);
  }

  /** Static wound smear near the top of the plate. */
  private drawBloodSmear(g: Phaser.GameObjects.Graphics, x: number, y: number, scale: number) {
    g.clear();
    g.fillStyle(0x3a080a, 0.55);
    g.fillEllipse(x, y, 18 * scale, 5 * scale);
    g.fillStyle(0x5a1014, 0.4);
    g.fillEllipse(x - 4, y + 2, 10 * scale, 3.5 * scale);
    g.fillEllipse(x + 6, y + 1, 7 * scale, 2.8 * scale);
    // Hanging beads from smear
    for (const ox of [-8, -2, 5, 11]) {
      const bead = 0.35 + (Math.abs(ox) % 5) * 0.08;
      g.fillStyle(0x6b1014, 0.65);
      g.fillCircle(x + ox * scale * 0.7, y + 5 + bead * 4, 1.4 * bead * scale);
    }
  }

  /** Compact curse / DoT chips above the portrait plate. */
  setStatusChips(chips: StatusChipView[]) {
    if (!this.statusLabel || this.fallen) return;
    if (!chips.length) {
      this.statusLabel.setText("");
      this.statusLabel.setVisible(false);
      return;
    }
    const shown = chips.slice(0, 4);
    this.statusLabel.setText(shown.map((c) => c.chip).join(" "));
    this.statusLabel.setColor(shown[0]?.color ?? "#e8dcc8");
    this.statusLabel.setVisible(true);
  }

  flashFrost() {
    if (this.fallen) return;
    this.scene.tweens.killTweensOf(this.hurtFlash);
    this.hurtFlash.setFillStyle(FROST_FLASH, 1);
    this.hurtFlash.setAlpha(0.55);
    this.scene.tweens.add({
      targets: this.hurtFlash,
      alpha: 0,
      duration: 480,
      ease: "Sine.easeOut",
    });
    if (this.portrait instanceof Phaser.GameObjects.Image && !this.showingHurtFrame) {
      this.portrait.setTint(0x80b0e8);
      this.hurtTintTimer?.remove(false);
      this.hurtTintTimer = this.scene.time.delayedCall(280, () => {
        if (!this.fallen) this.applyPortraitTint();
      });
    }
  }

  flashPoison() {
    if (this.fallen) return;
    this.scene.tweens.killTweensOf(this.hurtFlash);
    this.hurtFlash.setFillStyle(0x60a030, 1);
    this.hurtFlash.setAlpha(0.5);
    this.scene.tweens.add({
      targets: this.hurtFlash,
      alpha: 0,
      duration: 480,
      ease: "Sine.easeOut",
    });
  }

  flashBurn() {
    if (this.fallen) return;
    this.scene.tweens.killTweensOf(this.hurtFlash);
    this.hurtFlash.setFillStyle(0xff6020, 1);
    this.hurtFlash.setAlpha(0.55);
    this.scene.tweens.add({
      targets: this.hurtFlash,
      alpha: 0,
      duration: 480,
      ease: "Sine.easeOut",
    });
  }

  flashBleed() {
    if (this.fallen) return;
    this.scene.tweens.killTweensOf(this.hurtFlash);
    this.hurtFlash.setFillStyle(0xa01018, 1);
    this.hurtFlash.setAlpha(0.48);
    this.scene.tweens.add({
      targets: this.hurtFlash,
      alpha: 0,
      duration: 480,
      ease: "Sine.easeOut",
    });
  }

  isFallen(): boolean {
    return this.fallen;
  }

  flashDamage() {
    if (this.fallen) return;
    this.scene.tweens.killTweensOf(this.hurtFlash);
    this.hurtFlash.setFillStyle(HURT_FLASH_COLOR, 1);
    this.hurtFlash.setAlpha(0.42);
    this.scene.tweens.add({
      targets: this.hurtFlash,
      alpha: 0,
      duration: HURT_FLASH_MS + 100,
      ease: "Sine.easeOut",
    });

    if (!(this.portrait instanceof Phaser.GameObjects.Image)) return;

    this.hurtTintTimer?.remove(false);
    this.showHurtPortrait();
    if (!this.showingHurtFrame) {
      this.portrait.setTint(0xff3030);
    }
    this.hurtTintTimer = this.scene.time.delayedCall(HURT_FLASH_MS, () => {
      if (this.fallen) return;
      this.showIdlePortrait();
    });
  }

  private applyPortraitTint() {
    if (!(this.portrait instanceof Phaser.GameObjects.Image) || this.fallen) return;
    if (this.showingHurtFrame) return;
    const look = vintageLookForKey(this.portraitKey);
    let r = Phaser.Display.Color.IntegerToColor(look.tint).red;
    let g = Phaser.Display.Color.IntegerToColor(look.tint).green;
    let b = Phaser.Display.Color.IntegerToColor(look.tint).blue;

    if (this.woundAmount > 0.02) {
      const t = Math.min(0.65, this.woundAmount * 0.7);
      r = Math.round(Phaser.Math.Linear(r, 255, t));
      g = Math.round(Phaser.Math.Linear(g, 72, t));
      b = Math.round(Phaser.Math.Linear(b, 72, t));
    }

    if (this.frostAmount > 0.02) {
      const t = this.frostAmount * 0.55;
      r = Math.round(Phaser.Math.Linear(r, 120, t));
      g = Math.round(Phaser.Math.Linear(g, 170, t));
      b = Math.round(Phaser.Math.Linear(b, 230, t));
    }

    if (this.poisonAmount > 0.02) {
      const t = this.poisonAmount * 0.5;
      r = Math.round(Phaser.Math.Linear(r, 90, t));
      g = Math.round(Phaser.Math.Linear(g, 180, t));
      b = Math.round(Phaser.Math.Linear(b, 70, t));
    }

    if (this.burnAmount > 0.02) {
      const t = this.burnAmount * 0.55;
      r = Math.round(Phaser.Math.Linear(r, 255, t));
      g = Math.round(Phaser.Math.Linear(g, 90, t));
      b = Math.round(Phaser.Math.Linear(b, 40, t));
    }

    if (this.bleedAmount > 0.02) {
      const t = this.bleedAmount * 0.35;
      r = Math.round(Phaser.Math.Linear(r, 200, t));
      g = Math.round(Phaser.Math.Linear(g, 40, t));
      b = Math.round(Phaser.Math.Linear(b, 40, t));
    }

    this.portrait.setTint(Phaser.Display.Color.GetColor(r, g, b));
  }

  markDead() {
    this.fallen = true;
    this.disableInteractive();
    this.setTargetHighlight("none");
    this.hurtTintTimer?.remove(false);
    this.hurtTintTimer = undefined;
    this.scene.tweens.killTweensOf(this.hurtFlash);
    this.hurtFlash.setAlpha(0);
    this.frostWash?.setAlpha(0);
    this.poisonWash?.setAlpha(0);
    this.burnWash?.setAlpha(0);
    this.bleedWash?.setAlpha(0);
    this.bleedAmount = 0;
    this.bleedLayoutKey = "";
    this.clearBleedDrops();
    this.statusLabel?.setVisible(false);
    if (this.portrait instanceof Phaser.GameObjects.Image) {
      const hurt = this.hurtKey();
      if (hurt) {
        this.portrait.setTexture(hurt);
        this.portrait.setDisplaySize(this.portraitSize, this.portraitSize);
        this.showingHurtFrame = true;
      }
      this.portrait.setTint(0x555555);
      this.portrait.setAlpha(0.45);
    } else {
      this.portrait.setAlpha(0.45);
    }
    this.hpText?.setText("†");
    this.hpText?.setColor("#c08080");
    this.setAlpha(1);
  }

  /** Undo {@link markDead} after a resurrection potion. */
  revive() {
    this.fallen = false;
    this.showingHurtFrame = false;
    if (this.portrait instanceof Phaser.GameObjects.Image && this.portraitKey) {
      if (this.scene.textures.exists(this.portraitKey)) {
        this.portrait.setTexture(this.portraitKey);
        this.portrait.setDisplaySize(this.portraitSize, this.portraitSize);
      }
      this.portrait.clearTint();
    }
    this.portrait.setAlpha(1);
    this.setInteractive(this.getHitRect(), Phaser.Geom.Rectangle.Contains);
    this.applyPortraitTint();
  }

  /** Rebuild frame geometry for another race. */
  setFrameStyle(style: RaceFrameId, hero = this.opts.hero) {
    this.opts.style = style;
    this.opts.hero = hero;
    if (this.chrome() === "none") return;
    this.frameRoot?.destroy(true);
    this.frameBuilt = buildRaceFrame(this.scene, style, {
      w: this.frameW,
      h: this.frameH,
      hero,
      rim: Math.max(10, Math.round(this.frameW * 0.085)),
    });
    this.frameRoot = this.frameBuilt.root;
    this.add(this.frameRoot);
    this.paper?.setFillStyle(this.frameBuilt.paperColor, 1);
    if (!this.fallen && !this.showingHurtFrame) this.applyPortraitTint();
  }

  setTargetHighlight(mode: "valid" | "front" | "back" | "none") {
    if (this.frameBuilt) {
      tintRaceFrameHighlight(this.frameBuilt.highlightTarget, this.frameBuilt.baseTint, mode);
    }
    const g = this.highlightGfx;
    if (!g) return;
    g.clear();
    if (mode === "none" || this.chrome() !== "none") return;
    const color = mode === "valid" ? 0xc9a227 : 0xa89060;
    g.lineStyle(2, color, 0.95);
    g.strokeRect(-this.frameW / 2 + 2, -this.frameH / 2 + 2, this.frameW - 4, this.frameH - 4);
  }

  getHitRect(): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(-this.frameW / 2, -this.frameH / 2, this.frameW, this.frameH);
  }
}
