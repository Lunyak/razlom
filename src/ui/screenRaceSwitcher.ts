import Phaser from "phaser";
import type { RaceFrameId } from "./raceFrameConstructor";
import type { ScreenRaceFrame } from "./screenRaceFrame";
import { onViewResize, viewSize } from "./viewport";

const CHOICES: { id: RaceFrameId; label: string; idle: string }[] = [
  { id: "ri", label: "RI", idle: "#c9a227" },
  { id: "ordo", label: "Ordo", idle: "#b0a890" },
  { id: "risen", label: "Восставшие", idle: "#8aaa80" },
  { id: "neutral", label: "Нейтралы", idle: "#b89860" },
  { id: "folk", label: "Фолк", idle: "#e6d5b8" },
  { id: "thorn", label: "Терн", idle: "#c8c4bc" },
  { id: "moderne", label: "Модерн", idle: "#c4a06a" },
  { id: "folio", label: "Фолио", idle: "#5a3c22" },
  { id: "folioPanel", label: "Фолио · панель", idle: "#6a4e32" },
];

/**
 * Clickable bar to pick the live screen chrome. Keys 1–9.
 */
export class ScreenRaceSwitcher {
  private readonly root: Phaser.GameObjects.Container;
  private readonly caption: Phaser.GameObjects.Text;
  private readonly buttons: Phaser.GameObjects.Text[] = [];
  private current: RaceFrameId;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly frame: ScreenRaceFrame,
  ) {
    this.current = frame.getRace();
    this.root = scene.add.container(0, 0).setDepth(80).setScrollFactor(0);

    this.caption = scene.add
      .text(0, -22, "Рамка экрана — нажми стиль", {
        fontFamily: "Georgia, serif",
        fontSize: "14px",
        color: "#8a7a5a",
      })
      .setOrigin(0.5);
    this.root.add(this.caption);

    for (const choice of CHOICES) {
      const btn = scene.add
        .text(0, 0, `[ ${choice.label} ]`, {
          fontFamily: "Georgia, serif",
          fontSize: "16px",
          color: choice.idle,
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      btn.on("pointerover", () => btn.setColor("#fff0c0"));
      btn.on("pointerout", () => this.paintButton(btn, choice));
      btn.on("pointerdown", () => this.select(choice.id));
      this.buttons.push(btn);
      this.root.add(btn);
    }

    this.paintAll();
    this.placeButtons();
    onViewResize(scene, () => this.layout());

    scene.input.keyboard?.on("keydown-ONE", () => this.select("ri"));
    scene.input.keyboard?.on("keydown-TWO", () => this.select("ordo"));
    scene.input.keyboard?.on("keydown-THREE", () => this.select("risen"));
    scene.input.keyboard?.on("keydown-FOUR", () => this.select("neutral"));
    scene.input.keyboard?.on("keydown-FIVE", () => this.select("folk"));
    scene.input.keyboard?.on("keydown-SIX", () => this.select("thorn"));
    scene.input.keyboard?.on("keydown-SEVEN", () => this.select("moderne"));
    scene.input.keyboard?.on("keydown-EIGHT", () => this.select("folio"));
    scene.input.keyboard?.on("keydown-NINE", () => this.select("folioPanel"));
    scene.input.keyboard?.on("keydown", (ev: KeyboardEvent) => {
      if (ev.key === "8") this.select("folio");
      if (ev.key === "9") this.select("folioPanel");
    });
  }

  private select(id: RaceFrameId): void {
    this.current = id;
    this.frame.setRace(id);
    this.paintAll();
  }

  private paintButton(btn: Phaser.GameObjects.Text, choice: (typeof CHOICES)[number]): void {
    const on = this.current === choice.id;
    btn.setColor(on ? "#fff8e0" : choice.idle);
    btn.setStroke("#1a1008", on ? 3 : 0);
  }

  private paintAll(): void {
    this.buttons.forEach((btn, i) => this.paintButton(btn, CHOICES[i]));
  }

  private placeRow(from: number, to: number, y: number): void {
    const gap = 8;
    const slice = this.buttons.slice(from, to);
    const widths = slice.map((b) => b.width);
    const total = widths.reduce((a, b) => a + b, 0) + gap * (slice.length - 1);
    let x = -total / 2;
    slice.forEach((btn, i) => {
      btn.setPosition(x + widths[i] / 2, y);
      x += widths[i] + gap;
    });
  }

  private placeButtons(): void {
    const { w } = viewSize(this.scene);
    const gap = 8;
    const widths = this.buttons.map((b) => b.width);
    const total = widths.reduce((a, b) => a + b, 0) + gap * (this.buttons.length - 1);
    if (total <= w - 80) {
      this.caption.setY(-22);
      this.placeRow(0, this.buttons.length, 0);
      return;
    }
    const mid = Math.ceil(this.buttons.length / 2);
    this.caption.setY(-40);
    this.placeRow(0, mid, -10);
    this.placeRow(mid, this.buttons.length, 16);
  }

  layout(): void {
    const { w, h } = viewSize(this.scene);
    const twoRow = this.buttons.reduce((a, b) => a + b.width, 0) + 8 * (this.buttons.length - 1) > w - 80;
    this.root.setPosition(w / 2, h - (twoRow ? 72 : 56));
    this.placeButtons();
  }
}
