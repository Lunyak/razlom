import Phaser from "phaser";
import type { FactionId } from "../game/data";
import { PORTRAIT_DEF_IDS } from "../game/portraits";
import {
  PLOT_STEP_TYPES,
  cloneSequence,
  createEmptySequence,
  createEmptyStep,
  cycleTrigger,
  stepSummary,
  stepTypeLabel,
  triggerLabel,
  type PlotSequence,
  type PlotStep,
  type PlotStepType,
} from "../game/scenario/plot";
import type { ScenarioDef } from "../game/scenario/types";
import { viewH, viewW } from "./viewport";

export const PLOT_PANEL_W = 348;

export interface PlotConstructorHost {
  getScenario: () => ScenarioDef;
  getMapId: () => string;
  onChanged: () => void;
  onPreview: (sequences: PlotSequence[]) => void;
}

type PickKind = "camera" | "tile" | null;

/**
 * Right-dock storyboard constructor: sequences (when they fire) + ordered frames/steps.
 */
export class PlotConstructor {
  private root: Phaser.GameObjects.Container;
  private hit: Phaser.GameObjects.Rectangle;
  private gfx: Phaser.GameObjects.Graphics;
  private widgets: Phaser.GameObjects.GameObject[] = [];
  private open_ = false;
  private seqIndex = 0;
  private stepIndex = 0;
  private pickKind: PickKind = null;
  private addMenu = false;

  constructor(
    private scene: Phaser.Scene,
    private host: PlotConstructorHost,
  ) {
    this.root = scene.add.container(0, 0).setDepth(85).setScrollFactor(0).setVisible(false);
    this.hit = scene.add
      .rectangle(0, 0, PLOT_PANEL_W, 8, 0x120e0a, 0.001)
      .setOrigin(0, 0);
    this.gfx = scene.add.graphics();
    this.root.add([this.hit, this.gfx]);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  isOpen(): boolean {
    return this.open_;
  }

  isPickingTile(): boolean {
    return this.open_ && this.pickKind !== null;
  }

  pickHint(): string {
    if (this.pickKind === "camera") return "Клик по карте — точка камеры";
    if (this.pickKind === "tile") return "Клик по карте — клетка-триггер";
    return "";
  }

  toggle(): void {
    if (this.open_) this.close();
    else this.open();
  }

  open(): void {
    this.ensurePlot();
    this.open_ = true;
    this.addMenu = false;
    this.pickKind = null;
    this.root.setVisible(true);
    this.rebuild();
  }

  close(): void {
    this.open_ = false;
    this.pickKind = null;
    this.addMenu = false;
    this.root.setVisible(false);
    this.clearWidgets();
  }

  applyPickedTile(x: number, y: number): void {
    const seq = this.selectedSeq();
    if (!seq || !this.pickKind) return;
    if (this.pickKind === "tile") {
      seq.trigger = { type: "tile", x, y };
    } else {
      const step = seq.steps[this.stepIndex];
      if (step?.type === "camera") {
        step.x = x;
        step.y = y;
      } else {
        const cam = createEmptyStep("camera") as Extract<PlotStep, { type: "camera" }>;
        cam.x = x;
        cam.y = y;
        seq.steps.push(cam);
        this.stepIndex = seq.steps.length - 1;
      }
    }
    this.pickKind = null;
    this.host.onChanged();
    this.rebuild();
  }

  markers(): { x: number; y: number; kind: "tile" | "camera" }[] {
    const mapId = this.host.getMapId();
    const out: { x: number; y: number; kind: "tile" | "camera" }[] = [];
    for (const seq of this.host.getScenario().plot ?? []) {
      if (seq.mapId && seq.mapId !== mapId) continue;
      if (seq.trigger.type === "tile") out.push({ x: seq.trigger.x, y: seq.trigger.y, kind: "tile" });
      for (const step of seq.steps) {
        if (step.type === "camera") out.push({ x: step.x, y: step.y, kind: "camera" });
      }
    }
    return out;
  }

  layout(): void {
    if (!this.open_) return;
    this.rebuild();
  }

  destroy(): void {
    this.clearWidgets();
    this.root.destroy(true);
  }

  private ensurePlot(): PlotSequence[] {
    const sc = this.host.getScenario();
    if (!sc.plot) sc.plot = [];
    return sc.plot;
  }

  private selectedSeq(): PlotSequence | undefined {
    return this.ensurePlot()[this.seqIndex];
  }

  private rebuild(): void {
    this.clearWidgets();
    const w = viewW(this.scene);
    const h = viewH(this.scene);
    const x0 = w - PLOT_PANEL_W;
    this.root.setPosition(x0, 0);
    this.hit.setSize(PLOT_PANEL_W, h);
    this.gfx.clear();
    this.gfx.fillStyle(0x16120e, 0.97);
    this.gfx.fillRect(0, 0, PLOT_PANEL_W, h);
    this.gfx.lineStyle(2, 0xc9a227, 0.55);
    this.gfx.strokeRect(1, 1, PLOT_PANEL_W - 2, h - 2);

    const plot = this.ensurePlot();
    if (this.seqIndex >= plot.length) this.seqIndex = Math.max(0, plot.length - 1);
    const seq = this.selectedSeq();
    if (seq && this.stepIndex >= seq.steps.length) this.stepIndex = Math.max(0, seq.steps.length - 1);

    let y = 14;
    this.label(16, y, "СЮЖЕТ", "#e8d5a3", "16px");
    y += 26;
    this.btn(16, y, "+ сцена", () => this.addSequence(), "#8fdf8f");
    this.btn(110, y, "превью", () => this.preview(), "#c9a227");
    this.btn(210, y, "закрыть", () => this.close(), "#a08080");
    y += 28;

    const mapId = this.host.getMapId();
    if (!plot.length) {
      this.label(16, y, "Нет сцен. «+ сцена» — кадры по шагам.", "#8a8070", "13px");
      y += 36;
    } else {
      this.label(16, y, "Сцены (когда играют)", "#9a8a70", "12px");
      y += 18;
      const maxList = 7;
      const start = Math.max(0, this.seqIndex - maxList + 1);
      for (let i = start; i < Math.min(plot.length, start + maxList); i++) {
        const s = plot[i];
        const onMap = !s.mapId || s.mapId === mapId;
        const mark = i === this.seqIndex ? "▸ " : "  ";
        const color = i === this.seqIndex ? "#fff0c0" : onMap ? "#c9a227" : "#6a6050";
        const title = `${mark}${s.name}`;
        this.btn(16, y, clip(title, 28), () => {
          this.seqIndex = i;
          this.stepIndex = 0;
          this.addMenu = false;
          this.rebuild();
        }, color);
        y += 18;
      }
      y += 8;
    }

    if (!seq) return;

    this.gfx.lineStyle(1, 0x3a2e22, 1);
    this.gfx.lineBetween(16, y, PLOT_PANEL_W - 16, y);
    y += 10;

    this.btn(16, y, "имя", () => this.renameSeq(seq), "#a09070");
    this.btn(70, y, "× сцена", () => this.removeSeq(), "#c08080");
    y += 22;
    this.btn(16, y, `триггер: ${clip(triggerLabel(seq.trigger), 22)}`, () => this.editTrigger(seq), "#c9a227");
    y += 20;
    const scope = seq.mapId === mapId ? "эта карта" : seq.mapId ? `карта ${seq.mapId}` : "все / старт";
    this.btn(16, y, `где: ${scope}`, () => this.cycleScope(seq), "#a09070");
    y += 26;

    this.label(16, y, "Кадры / шаги", "#9a8a70", "12px");
    y += 18;

    if (!seq.steps.length) {
      this.label(16, y, "Пусто. Добавьте кадр.", "#6a6050", "13px");
      y += 22;
    } else {
      const maxSteps = Math.max(4, Math.floor((h - y - 120) / 20));
      const start = Math.max(0, this.stepIndex - maxSteps + 1);
      for (let i = start; i < Math.min(seq.steps.length, start + maxSteps); i++) {
        const step = seq.steps[i];
        const mark = i === this.stepIndex ? "▸" : `${i + 1}.`;
        const color = i === this.stepIndex ? "#fff0c0" : "#c8b890";
        this.btn(
          16,
          y,
          `${mark} ${stepTypeLabel(step.type)} · ${clip(stepSummary(step), 20)}`,
          () => {
            this.stepIndex = i;
            this.addMenu = false;
            if (this.pickKind === "camera" && step.type !== "camera") this.pickKind = null;
            this.rebuild();
          },
          color,
        );
        y += 18;
      }
    }

    y += 10;
    this.btn(16, y, "+ кадр", () => {
      this.addMenu = !this.addMenu;
      this.rebuild();
    }, "#8fdf8f");
    this.btn(100, y, "править", () => this.editSelected(), "#c9a227");
    this.btn(190, y, "↑", () => this.moveStep(-1), "#a09070");
    this.btn(222, y, "↓", () => this.moveStep(1), "#a09070");
    this.btn(256, y, "×", () => this.removeStep(), "#c08080");
    y += 24;

    if (this.addMenu) {
      this.label(16, y, "Тип кадра:", "#9a8a70", "12px");
      y += 18;
      let x = 16;
      for (const type of PLOT_STEP_TYPES) {
        this.btn(x, y, stepTypeLabel(type), () => this.addStep(type), "#e8d5a3");
        x += 54;
        if (x > PLOT_PANEL_W - 70) {
          x = 16;
          y += 20;
        }
      }
      y += 22;
    }

    const step = seq.steps[this.stepIndex];
    if (step?.type === "camera") {
      this.btn(16, y, "клетка камеры на карте", () => {
        this.pickKind = "camera";
        this.host.onChanged();
      }, "#8fdf8f");
      y += 20;
    }
    if (seq.trigger.type === "tile") {
      this.btn(16, y, "клетка-триггер на карте", () => {
        this.pickKind = "tile";
        this.host.onChanged();
      }, "#8fdf8f");
      y += 20;
    }
    if (step?.type === "dialogue") {
      this.btn(16, y, "портрет", () => this.cyclePortrait(step), "#a09070");
      this.btn(100, y, "фракция", () => this.cycleFaction(step), "#a09070");
      y += 20;
    }

    if (this.pickKind) {
      this.label(16, h - 28, this.pickHint(), "#8fdf8f", "13px");
    } else {
      this.label(16, h - 42, "Клик по кадру — выбрать.\nПравить — текст. Превью — прогон.", "#6a6050", "12px");
    }
  }

  private addSequence(): void {
    const plot = this.ensurePlot();
    const seq = createEmptySequence(`plot_${Date.now()}`, this.host.getMapId());
    plot.push(seq);
    this.seqIndex = plot.length - 1;
    this.stepIndex = 0;
    this.host.onChanged();
    this.rebuild();
  }

  private removeSeq(): void {
    const plot = this.ensurePlot();
    if (!plot.length) return;
    plot.splice(this.seqIndex, 1);
    this.seqIndex = Math.max(0, this.seqIndex - 1);
    this.stepIndex = 0;
    this.host.onChanged();
    this.rebuild();
  }

  private renameSeq(seq: PlotSequence): void {
    const name = window.prompt("Имя сцены", seq.name);
    if (name) seq.name = name;
    this.host.onChanged();
    this.rebuild();
  }

  private cycleScope(seq: PlotSequence): void {
    const mapId = this.host.getMapId();
    seq.mapId = seq.mapId === mapId ? undefined : mapId;
    this.host.onChanged();
    this.rebuild();
  }

  private editTrigger(seq: PlotSequence): void {
    const next = cycleTrigger(seq.trigger);
    if (next.type === "turn") {
      const raw = window.prompt("Сработать на ходе №", String(next.turn));
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 1) next.turn = Math.floor(n);
    }
    if (next.type === "city_captured") {
      const raw = window.prompt("ID города (пусто = любой)", seq.trigger.type === "city_captured" ? seq.trigger.cityId ?? "" : "");
      if (raw !== null) next.cityId = raw.trim() || undefined;
    }
    if (next.type === "tile") {
      this.pickKind = "tile";
    }
    seq.trigger = next;
    this.host.onChanged();
    this.rebuild();
  }

  private addStep(type: PlotStepType): void {
    const seq = this.selectedSeq();
    if (!seq) return;
    const step = createEmptyStep(type);
    const at = Math.min(seq.steps.length, this.stepIndex + 1);
    seq.steps.splice(at, 0, step);
    this.stepIndex = at;
    this.addMenu = false;
    if (type === "camera") this.pickKind = "camera";
    this.host.onChanged();
    this.rebuild();
  }

  private removeStep(): void {
    const seq = this.selectedSeq();
    if (!seq?.steps.length) return;
    seq.steps.splice(this.stepIndex, 1);
    this.stepIndex = Math.max(0, this.stepIndex - 1);
    this.host.onChanged();
    this.rebuild();
  }

  private moveStep(dir: number): void {
    const seq = this.selectedSeq();
    if (!seq) return;
    const j = this.stepIndex + dir;
    if (j < 0 || j >= seq.steps.length) return;
    const [item] = seq.steps.splice(this.stepIndex, 1);
    seq.steps.splice(j, 0, item);
    this.stepIndex = j;
    this.host.onChanged();
    this.rebuild();
  }

  private editSelected(): void {
    const seq = this.selectedSeq();
    const step = seq?.steps[this.stepIndex];
    if (!step) return;
    switch (step.type) {
      case "title": {
        const title = window.prompt("Заголовок кадра", step.title);
        if (title !== null) step.title = title;
        const text = window.prompt("Текст под заголовком", step.text ?? "");
        if (text !== null) step.text = text;
        break;
      }
      case "narration": {
        const text = window.prompt("Речь / хроника", step.text);
        if (text !== null) step.text = text;
        break;
      }
      case "dialogue": {
        const speaker = window.prompt("Говорящий", step.speaker);
        if (speaker !== null) step.speaker = speaker;
        const text = window.prompt("Реплика", step.text);
        if (text !== null) step.text = text;
        break;
      }
      case "camera":
        this.pickKind = "camera";
        break;
      case "message": {
        const text = window.prompt("Весть в ленте", step.text);
        if (text !== null) step.text = text;
        break;
      }
      case "grant": {
        const raw = window.prompt("золото,мана,люди", `${step.gold ?? 0},${step.mana ?? 0},${step.people ?? 0}`);
        if (raw) {
          const [g, m, p] = raw.split(",").map((s) => Number(s.trim()));
          step.gold = Number.isFinite(g) ? g : 0;
          step.mana = Number.isFinite(m) ? m : 0;
          step.people = Number.isFinite(p) ? p : 0;
        }
        break;
      }
      default:
        break;
    }
    this.host.onChanged();
    this.rebuild();
  }

  private cyclePortrait(step: Extract<PlotStep, { type: "dialogue" }>): void {
    const ids = ["", ...PORTRAIT_DEF_IDS];
    const i = ids.indexOf((step.portrait ?? "") as (typeof ids)[number]);
    const next = ids[(i + 1) % ids.length];
    step.portrait = next || undefined;
    this.host.onChanged();
    this.rebuild();
  }

  private cycleFaction(step: Extract<PlotStep, { type: "dialogue" }>): void {
    const ids: FactionId[] = ["ri", "ordo", "risen", "neutral", "cossack", "highlander"];
    const i = Math.max(0, ids.indexOf(step.faction ?? "ri"));
    step.faction = ids[(i + 1) % ids.length];
    this.host.onChanged();
    this.rebuild();
  }

  private preview(): void {
    const seq = this.selectedSeq();
    if (!seq?.steps.length) return;
    this.host.onPreview([cloneSequence(seq)]);
  }

  private label(x: number, y: number, text: string, color: string, fontSize: string): void {
    const t = this.scene.add
      .text(this.root.x + x, y, text, { fontFamily: "Georgia, serif", fontSize, color, lineSpacing: 3 })
      .setDepth(86)
      .setScrollFactor(0);
    this.widgets.push(t);
  }

  private btn(x: number, y: number, text: string, fn: () => void, color: string): Phaser.GameObjects.Text {
    const t = this.scene.add
      .text(this.root.x + x, y, text, { fontFamily: "Georgia, serif", fontSize: "13px", color })
      .setDepth(86)
      .setScrollFactor(0)
      .setInteractive({
        useHandCursor: true,
        hitArea: new Phaser.Geom.Rectangle(-6, -4, Math.max(96, text.length * 10 + 16), 24),
        hitAreaCallback: Phaser.Geom.Rectangle.Contains,
      });
    t.on("pointerover", () => t.setColor("#ffffff"));
    t.on("pointerout", () => t.setColor(color));
    t.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      fn();
    });
    this.widgets.push(t);
    return t;
  }

  private clearWidgets(): void {
    for (const w of this.widgets) w.destroy();
    this.widgets = [];
  }
}

function clip(text: string, n: number): string {
  return text.length <= n ? text : `${text.slice(0, n - 1)}…`;
}
