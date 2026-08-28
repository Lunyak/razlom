import {
  clonePanelLayoutConfig,
  getPanelLayout,
  replacePanelLayout,
  type PanelAnchor,
  type PanelLayoutConfig,
  type PanelPieceTransform,
} from "./panelLayoutStore";

const MAX_UNDO = 48;

/** Per-panel undo stack (in-memory; localStorage keeps latest only). */
export class PanelLayoutUndoStack {
  private stacks = new Map<string, PanelLayoutConfig[]>();

  push(layoutId: string, snapshot: PanelLayoutConfig): void {
    const stack = this.stacks.get(layoutId) ?? [];
    stack.push(clonePanelLayoutConfig(snapshot));
    if (stack.length > MAX_UNDO) stack.shift();
    this.stacks.set(layoutId, stack);
  }

  undo(layoutId: string): PanelLayoutConfig | null {
    const stack = this.stacks.get(layoutId);
    const prev = stack?.pop();
    if (!prev) return null;
    replacePanelLayout(layoutId, prev);
    return prev;
  }

  canUndo(layoutId: string): boolean {
    return (this.stacks.get(layoutId)?.length ?? 0) > 0;
  }

  clear(layoutId: string): void {
    this.stacks.delete(layoutId);
  }
}

export type LayoutPieceClipboard = {
  kind: "panel" | "piece";
  anchor?: PanelAnchor;
  transform: PanelPieceTransform;
  sourcePieceId?: string;
};

export class PanelLayoutClipboard {
  private clip: LayoutPieceClipboard | null = null;

  copy(data: LayoutPieceClipboard): void {
    this.clip = {
      ...data,
      transform: { ...data.transform },
    };
  }

  peek(): LayoutPieceClipboard | null {
    return this.clip ? { ...this.clip, transform: { ...this.clip.transform } } : null;
  }

  clear(): void {
    this.clip = null;
  }
}
