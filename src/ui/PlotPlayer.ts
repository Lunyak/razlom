import Phaser from "phaser";
import type { FactionId } from "../game/data";
import {
  applyPlotGrant,
  resolvePlotPortraitKey,
  type PlotSequence,
  type PlotStep,
} from "../game/scenario/plot";
import { session } from "../game/data";
import { glassStyleForFaction } from "../game/factionVisual";
import { GlassPhotoFrame } from "./GlassPhotoFrame";
import { DOSSIER, dossierAccent } from "./vintageDossier";
import { viewH, viewW, onViewResize } from "./viewport";

export interface PlotPlayerCallbacks {
  onCamera?: (x: number, y: number) => void;
  onMessage?: (text: string) => void;
  onGrantApplied?: () => void;
  onComplete?: () => void;
  /** If false, grant/message still display but do not mutate GameState. */
  applyWorldEffects?: boolean;
}

const DEPTH = 240;
const CAMERA_HOLD_MS = 560;

/**
 * Full-screen storyboard player: title / narration / dialogue frames,
 * plus instant camera / message / grant steps.
 */
export class PlotPlayer {
  private root: Phaser.GameObjects.Container;
  private backdrop: Phaser.GameObjects.Rectangle;
  private plate: Phaser.GameObjects.Rectangle;
  private header: Phaser.GameObjects.Rectangle;
  private titleText: Phaser.GameObjects.Text;
  private bodyText: Phaser.GameObjects.Text;
  private speakerText: Phaser.GameObjects.Text;
  private hintText: Phaser.GameObjects.Text;
  private counterText: Phaser.GameObjects.Text;
  private portrait: GlassPhotoFrame;
  private queue: { seqName: string; step: PlotStep; index: number; total: number }[] = [];
  private playing = false;
  private awaitingClick = false;
  private holdTimer?: Phaser.Time.TimerEvent;
  private callbacks: PlotPlayerCallbacks = {};
  private keyHandler?: (e: KeyboardEvent) => void;
  private boundAdvance: () => void;

  constructor(private scene: Phaser.Scene) {
    this.boundAdvance = () => this.advanceFromInput();
    this.root = scene.add.container(0, 0).setDepth(DEPTH).setScrollFactor(0).setVisible(false);
    this.backdrop = scene.add
      .rectangle(0, 0, 8, 8, 0x050403, 0.72)
      .setOrigin(0, 0);
    this.backdrop.on("pointerup", this.boundAdvance);

    this.plate = scene.add.rectangle(0, 0, 720, 280, DOSSIER.plate, 0.97).setStrokeStyle(2, dossierAccent("ri"), 0.85);
    this.header = scene.add.rectangle(0, 0, 692, 44, 0x3a2018, 0.95).setStrokeStyle(1, dossierAccent("ri"), 0.55);
    this.titleText = scene.add
      .text(0, 0, "", {
        fontFamily: "Georgia, serif",
        fontSize: "20px",
        color: DOSSIER.title,
        stroke: "#1a1008",
        strokeThickness: 2,
      })
      .setOrigin(0.5, 0.5);
    this.speakerText = scene.add
      .text(0, 0, "", {
        fontFamily: "Georgia, serif",
        fontSize: "15px",
        color: DOSSIER.gold,
      })
      .setOrigin(0, 0);
    this.bodyText = scene.add
      .text(0, 0, "", {
        fontFamily: "Georgia, serif",
        fontSize: "16px",
        color: DOSSIER.ink,
        lineSpacing: 6,
        wordWrap: { width: 480 },
        stroke: "#120e0a",
        strokeThickness: 1,
      })
      .setOrigin(0, 0);
    this.hintText = scene.add
      .text(0, 0, "Клик / Пробел / Enter — дальше   ·   Esc — пропустить", {
        fontFamily: "Georgia, serif",
        fontSize: "12px",
        color: DOSSIER.inkDim,
      })
      .setOrigin(0.5, 0.5);
    this.counterText = scene.add
      .text(0, 0, "", {
        fontFamily: "Georgia, serif",
        fontSize: "12px",
        color: DOSSIER.inkMuted,
      })
      .setOrigin(1, 0.5);

    this.portrait = new GlassPhotoFrame(scene, 0, 0, {
      portraitKey: "hero_ri",
      portraitSize: 118,
      frameW: 138,
      frameH: 138,
      style: "ri",
      hero: true,
    });
    this.portrait.setVisible(false);

    this.root.add([
      this.backdrop,
      this.plate,
      this.header,
      this.titleText,
      this.speakerText,
      this.bodyText,
      this.hintText,
      this.counterText,
      this.portrait,
    ]);
    this.root.setVisible(false);

    onViewResize(scene, () => {
      if (this.playing) this.layout();
    });
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  isPlaying(): boolean {
    return this.playing;
  }

  play(sequences: PlotSequence[], callbacks: PlotPlayerCallbacks = {}): void {
    this.stopHold();
    this.callbacks = callbacks;
    this.queue = [];
    let n = 0;
    const total = sequences.reduce((s, seq) => s + seq.steps.length, 0);
    for (const seq of sequences) {
      for (const step of seq.steps) {
        n += 1;
        this.queue.push({ seqName: seq.name, step, index: n, total });
      }
    }
    if (!this.queue.length) {
      this.finish();
      return;
    }
    this.playing = true;
    this.layout();
    this.backdrop.setInteractive({ useHandCursor: true });
    this.bindKeys();
    this.next();
  }

  skipAll(): void {
    if (!this.playing) return;
    this.queue = [];
    this.finish();
  }

  destroy(): void {
    this.unbindKeys();
    this.stopHold();
    this.playing = false;
    this.root.destroy(true);
  }

  private bindKeys(): void {
    this.unbindKeys();
    this.keyHandler = (e: KeyboardEvent) => {
      if (!this.playing) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        this.advanceFromInput();
      }
    };
    this.scene.input.keyboard?.on("keydown", this.keyHandler);
  }

  private unbindKeys(): void {
    if (this.keyHandler) {
      this.scene.input.keyboard?.off("keydown", this.keyHandler);
      this.keyHandler = undefined;
    }
  }

  private layout(): void {
    const w = viewW(this.scene);
    const h = viewH(this.scene);
    this.backdrop.setSize(w, h);
    const cardW = Math.min(760, Math.max(520, w * 0.62));
    const cardH = Math.min(300, Math.max(220, h * 0.34));
    const cx = w / 2;
    const cy = h - cardH / 2 - 36;
    this.plate.setPosition(cx, cy).setSize(cardW, cardH);
    this.header.setPosition(cx, cy - cardH / 2 + 28).setSize(cardW - 28, 44);
    this.titleText.setPosition(cx, cy - cardH / 2 + 28);
    this.counterText.setPosition(cx + cardW / 2 - 22, cy - cardH / 2 + 28);
    this.hintText.setPosition(cx, cy + cardH / 2 - 18);
    this.portrait.setPosition(cx - cardW / 2 + 92, cy + 10);
    this.speakerText.setPosition(cx - cardW / 2 + 178, cy - 48);
    this.bodyText.setPosition(cx - cardW / 2 + 178, cy - 24);
    this.bodyText.setWordWrapWidth(cardW - 210);
  }

  private next(): void {
    this.stopHold();
    const item = this.queue.shift();
    if (!item) {
      this.finish();
      return;
    }
    this.showStep(item);
  }

  private showStep(item: { seqName: string; step: PlotStep; index: number; total: number }): void {
    const { step } = item;
    this.layout();
    this.root.setVisible(true);
    this.awaitingClick = false;
    this.counterText.setText(`${item.index}/${item.total}`);

    if (step.type === "camera") {
      this.root.setVisible(false);
      this.callbacks.onCamera?.(step.x, step.y);
      this.holdTimer = this.scene.time.delayedCall(CAMERA_HOLD_MS, () => this.next());
      return;
    }

    if (step.type === "message") {
      if (this.callbacks.applyWorldEffects !== false) {
        session.state.lastMessage = step.text;
      }
      this.callbacks.onMessage?.(step.text);
      this.holdTimer = this.scene.time.delayedCall(80, () => this.next());
      return;
    }

    if (step.type === "grant") {
      if (this.callbacks.applyWorldEffects !== false) {
        applyPlotGrant(session.state, step);
      }
      this.callbacks.onGrantApplied?.();
      this.holdTimer = this.scene.time.delayedCall(80, () => this.next());
      return;
    }

    this.root.setVisible(true);
    this.awaitingClick = true;
    const faction: FactionId =
      step.type === "dialogue" ? (step.faction ?? "ri") : "ri";
    this.plate.setStrokeStyle(2, dossierAccent(faction), 0.85);
    this.header.setStrokeStyle(1, dossierAccent(faction), 0.55);

    if (step.type === "title") {
      this.portrait.setVisible(false);
      this.speakerText.setVisible(false);
      this.titleText.setText(step.title);
      this.bodyText.setText(step.text?.trim() || item.seqName);
      this.bodyText.setPosition(this.titleText.x - this.plate.width / 2 + 36, this.plate.y - 20);
      this.bodyText.setWordWrapWidth(this.plate.width - 72);
      this.bodyText.setOrigin(0, 0);
    } else if (step.type === "narration") {
      this.portrait.setVisible(false);
      this.speakerText.setVisible(false);
      this.titleText.setText(item.seqName || "Хроника");
      this.bodyText.setText(step.text);
      this.bodyText.setPosition(this.plate.x - this.plate.width / 2 + 36, this.plate.y - 20);
      this.bodyText.setWordWrapWidth(this.plate.width - 72);
    } else if (step.type === "dialogue") {
      const key = resolvePlotPortraitKey(step.portrait);
      this.portrait.setVisible(!!key);
      if (key) {
        this.portrait.setFrameStyle(glassStyleForFaction(faction), true);
        this.portrait.setPortraitKey(key);
        this.portrait.setEmpty(false);
      }
      this.speakerText.setVisible(true).setText(step.speaker);
      this.titleText.setText(item.seqName || "Реплика");
      this.bodyText.setText(step.text);
      const left = this.portrait.visible ? this.plate.x - this.plate.width / 2 + 178 : this.plate.x - this.plate.width / 2 + 36;
      this.speakerText.setPosition(left, this.plate.y - 48);
      this.bodyText.setPosition(left, this.plate.y - 22);
      this.bodyText.setWordWrapWidth(this.plate.x + this.plate.width / 2 - left - 28);
    }
  }

  private advanceFromInput(): void {
    if (!this.playing || !this.awaitingClick) return;
    this.next();
  }

  private stopHold(): void {
    this.holdTimer?.remove(false);
    this.holdTimer = undefined;
  }

  private finish(): void {
    this.stopHold();
    this.unbindKeys();
    this.playing = false;
    this.awaitingClick = false;
    this.backdrop.disableInteractive();
    this.root.setVisible(false);
    const done = this.callbacks.onComplete;
    this.callbacks = {};
    done?.();
  }
}
