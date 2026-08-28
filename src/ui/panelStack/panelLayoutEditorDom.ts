export type LayoutFieldValues = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  showScale: boolean;
};

type FieldChangeHandler = (values: LayoutFieldValues) => void;

/** HTML inputs for exact x/y/scale entry (over the Phaser canvas). */
export class PanelLayoutFieldForm {
  private readonly root: HTMLDivElement;
  private readonly inputX: HTMLInputElement;
  private readonly inputY: HTMLInputElement;
  private readonly inputSx: HTMLInputElement;
  private readonly inputSy: HTMLInputElement;
  private readonly scaleRow: HTMLDivElement;
  private onChange: FieldChangeHandler | null = null;
  private syncing = false;

  constructor() {
    this.root = document.createElement("div");
    this.root.id = "panel-layout-editor-form";
    Object.assign(this.root.style, {
      position: "fixed",
      display: "none",
      zIndex: "10000",
      fontFamily: "Consolas, monospace",
      fontSize: "12px",
      color: "#e8d5a3",
      background: "rgba(20, 16, 12, 0.92)",
      border: "1px solid #5a4a2a",
      borderRadius: "4px",
      padding: "8px 10px",
      minWidth: "220px",
      pointerEvents: "auto",
    });

    const title = document.createElement("div");
    title.textContent = "Координаты";
    Object.assign(title.style, { color: "#fff0c0", marginBottom: "6px", fontFamily: "Georgia, serif" });
    this.root.appendChild(title);

    const posRow = this.mkRow("X", "Y");
    this.inputX = posRow.inputs[0]!;
    this.inputY = posRow.inputs[1]!;
    this.root.appendChild(posRow.row);

    this.scaleRow = document.createElement("div");
    const scaleInner = this.mkRow("Шир×", "Выс×");
    this.inputSx = scaleInner.inputs[0]!;
    this.inputSy = scaleInner.inputs[1]!;
    this.scaleRow.appendChild(scaleInner.row);
    this.root.appendChild(this.scaleRow);

    const hint = document.createElement("div");
    hint.textContent = "Enter — применить · drag угол — растянуть";
    Object.assign(hint.style, { marginTop: "6px", fontSize: "10px", color: "#8a7a5a" });
    this.root.appendChild(hint);

    for (const input of [this.inputX, this.inputY, this.inputSx, this.inputSy]) {
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          this.emitChange();
        }
      });
      input.addEventListener("change", () => this.emitChange());
    }

    document.body.appendChild(this.root);
  }

  setHandler(fn: FieldChangeHandler | null): void {
    this.onChange = fn;
  }

  setVisible(visible: boolean): void {
    this.root.style.display = visible ? "block" : "none";
  }

  setValues(values: LayoutFieldValues): void {
    this.syncing = true;
    this.inputX.value = String(values.x);
    this.inputY.value = String(values.y);
    this.inputSx.value = fmtScale(values.scaleX);
    this.inputSy.value = fmtScale(values.scaleY);
    this.scaleRow.style.display = values.showScale ? "block" : "none";
    this.syncing = false;
  }

  readValues(showScale: boolean): LayoutFieldValues {
    return {
      x: parseNum(this.inputX.value, 0),
      y: parseNum(this.inputY.value, 0),
      scaleX: showScale ? parseNum(this.inputSx.value, 1) : 1,
      scaleY: showScale ? parseNum(this.inputSy.value, 1) : 1,
      showScale,
    };
  }

  syncPosition(canvas: HTMLCanvasElement, panelX: number, panelY: number, gameW: number, gameH: number): void {
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width / gameW;
    const sy = rect.height / gameH;
    this.root.style.left = `${rect.left + panelX * sx}px`;
    this.root.style.top = `${rect.top + panelY * sy}px`;
  }

  destroy(): void {
    this.root.remove();
  }

  isFocused(): boolean {
    const el = document.activeElement;
    return (
      el instanceof HTMLInputElement &&
      (el === this.inputX || el === this.inputY || el === this.inputSx || el === this.inputSy)
    );
  }

  private emitChange(): void {
    if (this.syncing || !this.onChange) return;
    const showScale = this.scaleRow.style.display !== "none";
    this.onChange(this.readValues(showScale));
  }

  private mkRow(labelA: string, labelB: string) {
    const row = document.createElement("div");
    Object.assign(row.style, { display: "flex", gap: "8px", marginBottom: "4px" });
    const inputs: HTMLInputElement[] = [];
    for (const label of [labelA, labelB]) {
      const wrap = document.createElement("label");
      Object.assign(wrap.style, { display: "flex", alignItems: "center", gap: "4px", flex: "1" });
      const cap = document.createElement("span");
      cap.textContent = label;
      cap.style.width = "42px";
      const input = document.createElement("input");
      input.type = "text";
      input.inputMode = "decimal";
      Object.assign(input.style, {
        width: "100%",
        background: "#0e0c0a",
        color: "#f5e6c8",
        border: "1px solid #4a3a22",
        borderRadius: "2px",
        padding: "2px 4px",
      });
      wrap.append(cap, input);
      row.appendChild(wrap);
      inputs.push(input);
    }
    return { row, inputs };
  }
}

function parseNum(raw: string, fallback: number): number {
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : fallback;
}

function fmtScale(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}
