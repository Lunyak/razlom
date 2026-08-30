import Phaser from "phaser";
import {
  getPanelLayout,
  patchPanelLayout,
  pieceTransform,
  resetPanelLayout,
  type PanelAnchor,
  type PanelLayoutConfig,
} from "./panelLayoutStore";
import { PanelLayoutFieldForm } from "./panelLayoutEditorDom";
import { PanelLayoutClipboard, PanelLayoutUndoStack } from "./panelLayoutUndo";
import type { PanelStack } from "./PanelStack";

const FONT = "Georgia, serif";
const MONO = "Consolas, monospace";
const HANDLE = 14;
const LIST_HIDDEN_KEY = "disciples-like.panelLayout.listHidden";
export const PANEL_LAYOUT_PIECE = "__panel__";

function loadListHidden(): boolean {
  try {
    return localStorage.getItem(LIST_HIDDEN_KEY) === "1";
  } catch {
    return false;
  }
}

function saveListHidden(hidden: boolean): void {
  try {
    localStorage.setItem(LIST_HIDDEN_KEY, hidden ? "1" : "0");
  } catch {
    /* ignore */
  }
}

export type PanelPieceCatalogEntry = { id: string; label: string };

export type PanelPieceBounds = {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: "rect" | "circle";
};

export type PanelLayoutEditorTarget = {
  layoutId: string;
  stack?: PanelStack;
  relayout: () => void;
  pieceCatalog?: PanelPieceCatalogEntry[];
  pieceBounds?: (pieceId: string, screenW: number, screenH: number) => PanelPieceBounds | null;
  pieceBaseMetrics?: (pieceId: string) => { w: number; h: number } | null;
  layerNames?: string[];
};

type DragMode = "move" | "resize";

/**
 * Interactive overlay: pick a piece from the list, nudge it, see highlight on canvas.
 */
export class PanelLayoutEditor {
  private ui!: Phaser.GameObjects.Container;
  private highlightLayer!: Phaser.GameObjects.Container;
  private highlightGfx!: Phaser.GameObjects.Graphics;
  private highlightLabel!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;
  private helpText!: Phaser.GameObjects.Text;
  private layerText!: Phaser.GameObjects.Text;
  private listRows = new Map<string, Phaser.GameObjects.Text>();
  private listContainer!: Phaser.GameObjects.Container;
  private readonly fieldForm = new PanelLayoutFieldForm();
  private readonly undoStack = new PanelLayoutUndoStack();
  private readonly clipboard = new PanelLayoutClipboard();
  private statusNote = "";

  private target: PanelLayoutEditorTarget | null = null;
  private selectedPiece: string | null = null;
  private selectedLayer = "plate";
  private dragPiece: string | null = null;
  private dragMode: DragMode = "move";
  private dragStart = { x: 0, y: 0 };
  private dragBase = { x: 0, y: 0, scaleX: 1, scaleY: 1 };
  private screenW = 1280;
  private screenH = 720;
  private panelX = 520;
  private fieldFormY = 0;
  private toolAnchorBtns: Phaser.GameObjects.Text[] = [];
  private toolResetBtn!: Phaser.GameObjects.Text;
  private toolJsonBtn!: Phaser.GameObjects.Text;
  private toolUndoBtn!: Phaser.GameObjects.Text;
  private toolCopyBtn!: Phaser.GameObjects.Text;
  private toolPasteBtn!: Phaser.GameObjects.Text;
  private toolListBtn!: Phaser.GameObjects.Text;
  private listHidden = loadListHidden();

  constructor(private readonly scene: Phaser.Scene) {
    this.fieldForm.setHandler((values) => this.applyFieldValues(values));
  }

  mount(): void {
    this.highlightLayer = this.scene.add
      .container(0, 0)
      .setDepth(199)
      .setScrollFactor(0)
      .setVisible(false);
    this.highlightGfx = this.scene.add.graphics();
    this.highlightLabel = this.scene.add
      .text(0, 0, "", {
        fontFamily: FONT,
        fontSize: "13px",
        color: "#fff0c0",
        backgroundColor: "#3a2810cc",
        padding: { x: 6, y: 3 },
      })
      .setOrigin(0, 1);
    this.highlightLayer.add([this.highlightGfx, this.highlightLabel]);

    this.ui = this.scene.add.container(0, 0).setDepth(200).setScrollFactor(0).setVisible(false);

    this.titleText = this.scene.add.text(0, 0, "РЕДАКТОР РАСКЛАДКИ", {
      fontFamily: FONT,
      fontSize: "15px",
      color: "#fff0c0",
    });

    this.listContainer = this.scene.add.container(0, 0);

    this.layerText = this.scene.add.text(0, 0, "", {
      fontFamily: MONO,
      fontSize: "11px",
      color: "#8a7a5a",
      lineSpacing: 4,
    });

    this.helpText = this.scene.add.text(0, 0, "", {
      fontFamily: MONO,
      fontSize: "11px",
      color: "#8a7a5a",
      lineSpacing: 4,
      wordWrap: { width: 400 },
    });

    this.ui.add([this.titleText, this.listContainer, this.layerText, this.helpText]);

    const mkToolBtn = (label: string, fn: () => void) => {
      const t = this.scene.add
        .text(0, 0, label, {
          fontFamily: FONT,
          fontSize: "13px",
          color: "#c9a227",
        })
        .setInteractive({ useHandCursor: true });
      t.on("pointerover", () => t.setColor("#fff0c0"));
      t.on("pointerout", () => t.setColor("#c9a227"));
      t.on("pointerdown", fn);
      this.ui.add(t);
      return t;
    };

    const anchors: PanelAnchor[] = ["left", "center", "right", "free"];
    this.toolAnchorBtns = anchors.map((a) => mkToolBtn(`[${a}]`, () => this.setAnchor(a)));
    this.toolResetBtn = mkToolBtn("[ Сброс ]", () => this.reset());
    this.toolJsonBtn = mkToolBtn("[ JSON ]", () => this.copyJson());
    this.toolUndoBtn = mkToolBtn("[ Отмена ]", () => this.undo());
    this.toolCopyBtn = mkToolBtn("[ Копир ]", () => this.copySelection());
    this.toolPasteBtn = mkToolBtn("[ Встав ]", () => this.pasteSelection());
    this.toolListBtn = mkToolBtn("[ Список ]", () => this.toggleList());
    this.toolListBtn.off("pointerout");
    this.toolListBtn.on("pointerout", () => this.refreshListBtn());
    this.refreshListBtn();

    this.scene.input.keyboard?.on("keydown", (ev: KeyboardEvent) => {
      if (!this.ui.visible || !this.target) return;
      if (!(ev.ctrlKey || ev.metaKey) || this.fieldForm.isFocused()) return;
      const key = ev.key.toLowerCase();
      if (key === "z") {
        ev.preventDefault();
        this.undo();
      } else if (key === "c") {
        ev.preventDefault();
        this.copySelection();
      } else if (key === "v") {
        ev.preventDefault();
        this.pasteSelection();
      }
    });

    this.scene.input.keyboard?.on("keydown-TAB", (ev: KeyboardEvent) => {
      if (!this.ui.visible || !this.target) return;
      ev.preventDefault();
      this.cyclePiece(ev.shiftKey ? -1 : 1);
    });

    const nudge = (dx: number, dy: number) => {
      if (!this.ui.visible || !this.target || this.selectedPiece === null) return;
      if (this.scene.input.keyboard?.addKey("SHIFT").isDown) {
        dx *= 10;
        dy *= 10;
      }
      if (this.selectedPiece === PANEL_LAYOUT_PIECE) {
        this.nudgePanel(dx, dy);
      } else {
        this.nudgePiece(this.selectedPiece, dx, dy);
      }
    };

    this.scene.input.keyboard?.on("keydown-UP", () => nudge(0, -1));
    this.scene.input.keyboard?.on("keydown-DOWN", () => nudge(0, 1));
    this.scene.input.keyboard?.on("keydown-LEFT", (ev: KeyboardEvent) => {
      if (!this.ui.visible) return;
      ev.stopPropagation();
      nudge(-1, 0);
    });
    this.scene.input.keyboard?.on("keydown-RIGHT", (ev: KeyboardEvent) => {
      if (!this.ui.visible) return;
      ev.stopPropagation();
      nudge(1, 0);
    });

    this.scene.input.keyboard?.on("keydown-Q", () => this.nudgeLayer(-1));
    this.scene.input.keyboard?.on("keydown-E", () => this.nudgeLayer(1));
    this.scene.input.keyboard?.on("keydown-L", (ev: KeyboardEvent) => {
      if (!this.ui.visible || this.fieldForm.isFocused()) return;
      ev.preventDefault();
      this.toggleList();
    });

    this.scene.input.keyboard?.on("keydown-OPEN_BRACKET", () => this.nudgeScale(-0.05, 0));
    this.scene.input.keyboard?.on("keydown-CLOSED_BRACKET", () => this.nudgeScale(0.05, 0));
    this.scene.input.keyboard?.on("keydown-SEMICOLON", () => this.nudgeScale(0, -0.05));
    this.scene.input.keyboard?.on("keydown-QUOTE", () => this.nudgeScale(0, 0.05));

    this.scene.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (!this.ui.visible || !this.target || p.x >= this.panelX - 8) return;
      const sel = this.selectedPiece;
      const bounds = sel ? this.boundsFor(sel) : null;
      if (sel && bounds && this.hitResizeHandle(p.x, p.y, bounds)) {
        this.recordUndo();
        this.dragPiece = sel;
        this.dragMode = "resize";
        this.dragStart = { x: p.x, y: p.y };
        const base = this.currentTransform(sel);
        this.dragBase = { ...base };
        return;
      }
      const hit = this.pickPieceAt(p.x, p.y);
      if (hit) {
        this.selectPiece(hit);
        this.recordUndo();
        this.dragPiece = hit;
        this.dragMode = "move";
        this.dragStart = { x: p.x, y: p.y };
        this.dragBase = { ...this.currentTransform(hit) };
      }
    });

    this.scene.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!this.dragPiece || !this.target || !p.isDown) return;
      const dx = Math.round(p.x - this.dragStart.x);
      const dy = Math.round(p.y - this.dragStart.y);
      if (this.dragMode === "resize") {
        this.applyResize(this.dragPiece, dx, dy);
      } else if (this.dragPiece === PANEL_LAYOUT_PIECE) {
        this.patchPanel(this.dragBase.x + dx, this.dragBase.y + dy);
      } else {
        this.patchPiece(this.dragPiece, {
          x: this.dragBase.x + dx,
          y: this.dragBase.y + dy,
          scaleX: this.dragBase.scaleX,
          scaleY: this.dragBase.scaleY,
        });
      }
      this.applyLive();
    });

    this.scene.input.on("pointerup", () => {
      this.dragPiece = null;
    });
  }

  open(target: PanelLayoutEditorTarget): void {
    this.target = target;
    this.selectedPiece = null;
    this.selectedLayer = target.layerNames?.[0] ?? target.stack?.layerNames()[0] ?? "plate";
    this.rebuildList();
    this.ui.setVisible(true);
    this.highlightLayer.setVisible(true);
    this.fieldForm.setVisible(false);
    this.paintList();
    this.afterLayout();
  }

  handleEscape(): boolean {
    if (!this.ui.visible) return false;
    if (this.selectedPiece !== null) {
      this.clearSelection();
      return true;
    }
    return false;
  }

  private toggleList(): void {
    this.listHidden = !this.listHidden;
    saveListHidden(this.listHidden);
    this.refreshListBtn();
    this.layout(this.screenW, this.screenH);
  }

  private refreshListBtn(): void {
    this.toolListBtn.setText(this.listHidden ? "[ Список ]" : "[ Скрыть список ]");
    this.toolListBtn.setColor(this.listHidden ? "#8a7a5a" : "#c9a227");
  }

  isOpen(): boolean {
    return this.ui.visible;
  }

  hasSelection(): boolean {
    return this.selectedPiece !== null;
  }

  clearSelection(): void {
    this.selectedPiece = null;
    this.dragPiece = null;
    this.highlightGfx.clear();
    this.highlightLabel.setText("");
    this.fieldForm.setVisible(false);
    this.paintList();
    this.refreshListHeader();
  }

  close(): void {
    this.ui.setVisible(false);
    this.highlightLayer.setVisible(false);
    this.fieldForm.setVisible(false);
    this.target = null;
    this.dragPiece = null;
    this.highlightGfx.clear();
  }

  destroy(): void {
    this.fieldForm.destroy();
  }

  layout(screenW: number, screenH: number): void {
    this.screenW = screenW;
    this.screenH = screenH;
    this.panelX = this.listHidden
      ? Math.max(240, screenW - 280)
      : Math.min(520, Math.max(500, screenW - 440));

    this.ui.setPosition(this.panelX, 100);
    this.titleText.setPosition(0, 0);
    this.toolListBtn.setPosition(Math.round(this.titleText.width + 16), 0);

    const listTop = 28;
    this.listContainer.setPosition(0, listTop);
    this.rebuildList();
    for (const row of this.listRows.values()) row.setVisible(!this.listHidden);

    const listH = this.listHidden ? 22 : this.listRows.size * 22 + 8;
    this.layerText.setPosition(0, listTop + listH + 4);
    this.helpText.setPosition(0, listTop + listH + 88);
    this.helpText.setWordWrapWidth(Math.max(220, screenW - this.panelX - 24));

    const toolsY = listTop + listH + 160;
    this.fieldFormY = listTop + listH + 36;
    this.toolAnchorBtns.forEach((btn, i) => btn.setPosition(i * 88, toolsY));
    this.toolResetBtn.setPosition(0, toolsY + 28);
    this.toolJsonBtn.setPosition(100, toolsY + 28);
    this.toolUndoBtn.setPosition(200, toolsY + 28);
    this.toolCopyBtn.setPosition(0, toolsY + 52);
    this.toolPasteBtn.setPosition(100, toolsY + 52);

    this.syncFieldFormPosition();
    this.refreshHelpText();
    this.paintList();
    this.drawHighlight();
    this.refreshLayerText();
    this.syncFieldFormValues();
  }

  afterLayout(): void {
    this.paintList();
    this.drawHighlight();
    this.refreshLayerText();
    this.refreshHelpText();
    this.syncFieldFormValues();
  }

  private syncFieldFormPosition(): void {
    const canvas = this.scene.game.canvas;
    this.fieldForm.syncPosition(canvas, this.panelX, 100 + this.fieldFormY, this.screenW, this.screenH);
  }

  private syncFieldFormValues(): void {
    if (this.selectedPiece === null || !this.target) {
      this.fieldForm.setVisible(false);
      return;
    }
    const showScale = this.canScale(this.selectedPiece);
    const t = this.currentTransform(this.selectedPiece);
    this.fieldForm.setVisible(true);
    this.fieldForm.setValues({ ...t, showScale });
    this.syncFieldFormPosition();
  }

  private applyFieldValues(values: ReturnType<PanelLayoutFieldForm["readValues"]>): void {
    if (!this.target || this.selectedPiece === null) return;
    this.commit(() => {
      if (this.selectedPiece === PANEL_LAYOUT_PIECE) {
        this.patchPanel(values.x, values.y);
      } else {
        this.patchPiece(this.selectedPiece!, values);
      }
    });
  }

  private recordUndo(): void {
    if (!this.target) return;
    this.undoStack.push(this.target.layoutId, this.cfg());
  }

  private commit(patchFn: () => void): void {
    if (!this.target) return;
    this.recordUndo();
    patchFn();
    this.applyLive();
  }

  private applyLive(): void {
    if (!this.target) return;
    this.target.relayout();
    this.afterLayout();
  }

  private undo(): void {
    if (!this.target) return;
    const restored = this.undoStack.undo(this.target.layoutId);
    if (!restored) {
      this.flashStatus("Нечего отменять");
      return;
    }
    if (this.target.stack) {
      for (const [name, depth] of Object.entries(restored.layerDepths)) {
        this.target.stack.setLayerDepth(name, depth);
      }
      for (const name of this.target.stack.layerNames()) {
        if (!(name in restored.layerDepths)) {
          /* relayout reapplies recipe defaults */
        }
      }
    }
    this.flashStatus("Отменено");
    this.applyLive();
  }

  private copySelection(): void {
    if (!this.target || this.selectedPiece === null) {
      this.flashStatus("Сначала выберите элемент");
      return;
    }
    const cfg = this.cfg();
    if (this.selectedPiece === PANEL_LAYOUT_PIECE) {
      this.clipboard.copy({
        kind: "panel",
        anchor: cfg.anchor,
        transform: { x: cfg.x, y: cfg.y, scaleX: 1, scaleY: 1 },
      });
    } else {
      this.clipboard.copy({
        kind: "piece",
        sourcePieceId: this.selectedPiece,
        transform: pieceTransform(cfg, this.selectedPiece),
      });
    }
    this.flashStatus("Скопировано");
  }

  private pasteSelection(): void {
    if (!this.target || this.selectedPiece === null) {
      this.flashStatus("Сначала выберите элемент");
      return;
    }
    const clip = this.clipboard.peek();
    if (!clip) {
      this.flashStatus("Буфер пуст — Копир");
      return;
    }
    this.commit(() => {
      if (this.selectedPiece === PANEL_LAYOUT_PIECE) {
        const patch: { x: number; y: number; anchor?: PanelAnchor } = {
          x: clip.transform.x,
          y: clip.transform.y,
        };
        if (clip.kind === "panel" && clip.anchor) patch.anchor = clip.anchor;
        patchPanelLayout(this.target!.layoutId, patch);
        return;
      }
      const t =
        clip.kind === "piece"
          ? clip.transform
          : { x: clip.transform.x, y: clip.transform.y, scaleX: 1, scaleY: 1 };
      this.patchPiece(this.selectedPiece!, t);
    });
    this.flashStatus("Вставлено");
  }

  private flashStatus(msg: string): void {
    this.statusNote = msg;
    this.refreshHelpText();
  }

  private canScale(pieceId: string): boolean {
    return pieceId !== PANEL_LAYOUT_PIECE && !!this.target?.pieceBaseMetrics?.(pieceId);
  }

  private currentTransform(pieceId: string) {
    const cfg = this.cfg();
    if (pieceId === PANEL_LAYOUT_PIECE) {
      return { x: cfg.x, y: cfg.y, scaleX: 1, scaleY: 1 };
    }
    return pieceTransform(cfg, pieceId);
  }

  private patchPanel(x: number, y: number): void {
    if (!this.target) return;
    patchPanelLayout(this.target.layoutId, { x, y });
  }

  private patchPiece(
    pieceId: string,
    t: { x: number; y: number; scaleX: number; scaleY: number },
  ): void {
    if (!this.target) return;
    patchPanelLayout(this.target.layoutId, {
      pieceOffsets: {
        [pieceId]: {
          x: t.x,
          y: t.y,
          scaleX: clampScale(t.scaleX),
          scaleY: clampScale(t.scaleY),
        },
      },
    });
  }

  private applyResize(pieceId: string, dx: number, dy: number): void {
    if (!this.target || pieceId === PANEL_LAYOUT_PIECE) return;
    const base = this.target.pieceBaseMetrics?.(pieceId);
    if (!base) return;
    const scaleX = clampScale((base.w * this.dragBase.scaleX + dx) / base.w);
    const scaleY = clampScale((base.h * this.dragBase.scaleY + dy) / base.h);
    this.patchPiece(pieceId, {
      x: this.dragBase.x,
      y: this.dragBase.y,
      scaleX,
      scaleY,
    });
  }

  private nudgeScale(dScaleX: number, dScaleY: number): void {
    if (!this.ui.visible || !this.target || this.selectedPiece === null) return;
    if (!this.canScale(this.selectedPiece)) return;
    const pieceId = this.selectedPiece;
    this.commit(() => {
      const cur = pieceTransform(this.cfg(), pieceId);
      this.patchPiece(pieceId, {
        x: cur.x,
        y: cur.y,
        scaleX: cur.scaleX + dScaleX,
        scaleY: cur.scaleY + dScaleY,
      });
    });
  }

  private refreshHelpText(): void {
    if (!this.target) return;
    const cfg = this.cfg();
    const undoHint = this.undoStack.canUndo(this.target.layoutId) ? " · Ctrl+Z — отмена" : "";
    const clipHint = this.clipboard.peek() ? " · Ctrl+V — вставить" : "";
    this.helpText.setText(
      [
        `якорь: ${cfg.anchor}  x:${cfg.x}  y:${cfg.y}`,
        this.statusNote ? `→ ${this.statusNote}` : "",
        "",
        "Ctrl+C копир · Ctrl+V встав · Ctrl+Z отмена",
        "L — список элементов · поля — X/Y и масштаб",
        "Tab выбор · Esc снять",
        "угол рамки — растянуть · стрелки сдвиг · Q/E слой",
        `${undoHint}${clipHint}`,
      ]
        .filter(Boolean)
        .join("\n"),
    );
    if (this.statusNote) {
      this.statusNote = "";
    }
  }

  private rebuildList(): void {
    for (const row of this.listRows.values()) row.destroy();
    this.listRows.clear();
    this.listContainer.removeAll(true);

    const catalog = this.catalog();
    let y = 0;
    const header = this.scene.add.text(0, y, this.selectionHeader(), {
      fontFamily: FONT,
      fontSize: "12px",
      color: "#8a7a5a",
    });
    this.listContainer.add(header);
    y += 22;

    for (const entry of catalog) {
      const row = this.scene.add
        .text(0, y, "", {
          fontFamily: MONO,
          fontSize: "12px",
          color: "#8a7a5a",
        })
        .setInteractive({ useHandCursor: true });
      row.setData("pieceId", entry.id);
      row.on("pointerdown", () => this.selectPiece(entry.id));
      row.on("pointerover", () => {
        if (this.selectedPiece !== entry.id) row.setColor("#c8b890");
      });
      row.on("pointerout", () => this.paintListRow(entry.id));
      this.listRows.set(entry.id, row);
      this.listContainer.add(row);
      y += 22;
    }
  }

  private catalog(): PanelPieceCatalogEntry[] {
    if (this.target?.pieceCatalog?.length) return this.target.pieceCatalog;
    return [{ id: PANEL_LAYOUT_PIECE, label: "Панель целиком" }];
  }

  private selectionHeader(): string {
    if (this.selectedPiece === null) {
      return "Элементы — ничего не выбрано (клик или Tab)";
    }
    const entry = this.catalog().find((e) => e.id === this.selectedPiece);
    return `Выбрано: ${entry?.label ?? this.selectedPiece}`;
  }

  private selectPiece(id: string): void {
    this.selectedPiece = id;
    this.paintList();
    this.drawHighlight();
    this.refreshListHeader();
    this.syncFieldFormValues();
  }

  private refreshListHeader(): void {
    const header = this.listContainer.list[0];
    if (header instanceof Phaser.GameObjects.Text) {
      header.setText(this.selectionHeader());
      header.setColor(this.selectedPiece === null ? "#8a7a5a" : "#fff0c0");
    }
  }

  private paintList(): void {
    for (const entry of this.catalog()) {
      this.paintListRow(entry.id);
    }
  }

  private paintListRow(id: string): void {
    const row = this.listRows.get(id);
    const entry = this.catalog().find((e) => e.id === id);
    if (!row || !entry) return;

    const selected = this.selectedPiece !== null && id === this.selectedPiece;
    const cfg = this.cfg();
    let meta: string;
    if (id === PANEL_LAYOUT_PIECE) {
      meta = `x:${cfg.x} y:${cfg.y}`;
    } else {
      const t = pieceTransform(cfg, id);
      meta = `Δ ${t.x},${t.y} · ×${fmtScale(t.scaleX)}×${fmtScale(t.scaleY)}`;
    }

    row.setColor(selected ? "#fff0c0" : "#8a7a5a");
    row.setText(`${selected ? "▸ " : "   "}${entry.label}  ·  ${meta}`);
  }

  private drawHighlight(): void {
    this.highlightGfx.clear();
    this.highlightLabel.setText("");
    if (!this.target || this.selectedPiece === null) return;

    const bounds = this.boundsFor(this.selectedPiece);
    if (!bounds) return;

    const entry = this.catalog().find((e) => e.id === this.selectedPiece);
    const label = entry?.label ?? this.selectedPiece;

    this.highlightGfx.lineStyle(3, 0xffcc44, 1);
    this.highlightGfx.fillStyle(0xffcc44, 0.12);

    if (bounds.kind === "circle") {
      const cx = bounds.x + bounds.w / 2;
      const cy = bounds.y + bounds.h / 2;
      const r = bounds.w / 2;
      this.highlightGfx.strokeCircle(cx, cy, r);
      this.highlightGfx.fillCircle(cx, cy, r);
      this.highlightLabel.setPosition(bounds.x, bounds.y - 4);
    } else {
      this.highlightGfx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
      this.highlightGfx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
      this.highlightLabel.setPosition(bounds.x, bounds.y - 4);
    }

    if (this.canScale(this.selectedPiece)) {
      this.highlightGfx.fillStyle(0xffcc44, 0.95);
      this.highlightGfx.fillRect(
        bounds.x + bounds.w - HANDLE,
        bounds.y + bounds.h - HANDLE,
        HANDLE,
        HANDLE,
      );
      this.highlightGfx.lineStyle(2, 0x3a2810, 1);
      this.highlightGfx.strokeRect(
        bounds.x + bounds.w - HANDLE,
        bounds.y + bounds.h - HANDLE,
        HANDLE,
        HANDLE,
      );
    }

    this.highlightLabel.setText(label);
  }

  private hitResizeHandle(x: number, y: number, b: PanelPieceBounds): boolean {
    return (
      x >= b.x + b.w - HANDLE &&
      x <= b.x + b.w + 4 &&
      y >= b.y + b.h - HANDLE &&
      y <= b.y + b.h + 4
    );
  }

  private boundsFor(pieceId: string): PanelPieceBounds | null {
    if (!this.target?.pieceBounds) return null;
    return this.target.pieceBounds(pieceId, this.screenW, this.screenH);
  }

  private pickPieceAt(x: number, y: number): string | undefined {
    if (!this.target?.pieceBounds) return undefined;
    const catalog = this.catalog();
    for (let i = catalog.length - 1; i >= 0; i--) {
      const id = catalog[i]!.id;
      const b = this.boundsFor(id);
      if (!b) continue;
      if (hitBounds(x, y, b)) return id;
    }
    return undefined;
  }

  private cfg(): PanelLayoutConfig {
    return getPanelLayout(this.target!.layoutId);
  }

  private setAnchor(anchor: PanelAnchor): void {
    if (!this.target) return;
    this.commit(() => patchPanelLayout(this.target!.layoutId, { anchor }));
  }

  private reset(): void {
    if (!this.target) return;
    this.commit(() => resetPanelLayout(this.target!.layoutId));
    this.flashStatus("Сброшено");
  }

  private copyJson(): void {
    if (!this.target) return;
    const json = JSON.stringify({ [this.target.layoutId]: this.cfg() }, null, 2);
    void navigator.clipboard?.writeText(json);
  }

  private cycleIds(): string[] {
    return this.catalog().map((e) => e.id);
  }

  private cyclePiece(delta: number): void {
    const ids = this.cycleIds();
    if (!ids.length) return;
    if (this.selectedPiece === null) {
      this.selectPiece(ids[delta > 0 ? 0 : ids.length - 1]!);
      return;
    }
    const i = ids.indexOf(this.selectedPiece);
    const next = (i + delta + ids.length) % ids.length;
    this.selectPiece(ids[next]!);
  }

  private nudgePanel(dx: number, dy: number): void {
    if (!this.target) return;
    this.commit(() => {
      const cur = this.cfg();
      this.patchPanel(cur.x + dx, cur.y + dy);
    });
  }

  private nudgePiece(pieceId: string, dx: number, dy: number): void {
    if (!this.target) return;
    this.commit(() => {
      const cur = pieceTransform(this.cfg(), pieceId);
      this.patchPiece(pieceId, {
        x: cur.x + dx,
        y: cur.y + dy,
        scaleX: cur.scaleX,
        scaleY: cur.scaleY,
      });
    });
  }

  private nudgeLayer(delta: number): void {
    if (!this.ui.visible || !this.target?.stack) return;
    const names = this.target.layerNames ?? this.target.stack.layerNames();
    const i = names.indexOf(this.selectedLayer);
    const name = names[Math.max(0, i)] ?? names[0];
    if (!name) return;
    this.commit(() => {
      const cur = this.target!.stack!.getLayerDepth(name) + delta;
      this.target!.stack!.setLayerDepth(name, cur);
      patchPanelLayout(this.target!.layoutId, { layerDepths: { [name]: cur } });
    });
    this.selectedLayer = name;
    this.refreshLayerText();
  }

  private refreshLayerText(): void {
    if (!this.target?.stack) {
      this.layerText.setText("");
      return;
    }
    this.layerText.setText(
      ["Слои (Q/E — глубина):", ...(this.target.stack.describeStack() ?? [])].join("\n"),
    );
  }
}

function fmtScale(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

function clampScale(n: number): number {
  return Math.max(0.1, Math.min(4, Math.round(n * 1000) / 1000));
}

function hitBounds(x: number, y: number, b: PanelPieceBounds): boolean {
  if (b.kind === "circle") {
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const r = b.w / 2;
    const dx = x - cx;
    const dy = y - cy;
    return dx * dx + dy * dy <= r * r;
  }
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}
