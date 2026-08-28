import Phaser from "phaser";

/** One z-band in the panel — lower depth = further under. */
export type PanelLayerDef = {
  name: string;
  depth: number;
  /** Who sits directly under this layer (documentation + validation). */
  under?: string | null;
  note?: string;
};

export type PanelLayoutCtx = {
  screenW: number;
  screenH: number;
};

export type PanelPieceMount = {
  /** Game objects owned by this piece — depth is applied from the layer slot. */
  objects: Phaser.GameObjects.GameObject[];
  layout?: (ctx: PanelLayoutCtx) => void;
  setVisible?: (visible: boolean) => void;
};

export type PanelPieceDef = {
  id: string;
  layer: string;
  mount: () => PanelPieceMount;
};

/**
 * Declarative panel constructor: register layer bands, mount pieces, apply depths.
 * Edit the recipe file to change who lies under whom.
 */
export class PanelStack {
  private layers = new Map<string, PanelLayerDef>();
  private layerOrder: string[] = [];
  private pieces: PanelPieceDef[] = [];
  private mounts = new Map<string, PanelPieceMount>();
  private built = false;

  /** Declare a layer band (call bottom → top). */
  layer(def: PanelLayerDef): this {
    if (this.built) throw new Error("PanelStack: layers frozen after build()");
    if (this.layers.has(def.name)) throw new Error(`PanelStack: duplicate layer "${def.name}"`);
    this.layers.set(def.name, def);
    this.layerOrder.push(def.name);
    return this;
  }

  /** Attach a piece to a named layer. */
  piece(def: PanelPieceDef): this {
    if (this.built) throw new Error("PanelStack: pieces frozen after build()");
    if (!this.layers.has(def.layer)) {
      throw new Error(`PanelStack: piece "${def.id}" references unknown layer "${def.layer}"`);
    }
    this.pieces.push(def);
    return this;
  }

  build(): void {
    if (this.built) return;
    this.validateLayerOrder();
    for (const def of this.pieces) {
      const mount = def.mount();
      const layer = this.layers.get(def.layer)!;
      for (const obj of mount.objects) {
        (obj as unknown as { setDepth: (d: number) => void }).setDepth(layer.depth);
      }
      this.mounts.set(def.id, mount);
    }
    this.built = true;
  }

  layout(ctx: PanelLayoutCtx): void {
    for (const mount of this.mounts.values()) mount.layout?.(ctx);
  }

  setVisible(visible: boolean): void {
    for (const mount of this.mounts.values()) {
      if (mount.setVisible) mount.setVisible(visible);
      else {
        for (const obj of mount.objects) {
          (obj as unknown as { setVisible: (v: boolean) => void }).setVisible(visible);
        }
      }
    }
  }

  getMount(id: string): PanelPieceMount | undefined {
    return this.mounts.get(id);
  }

  getLayerDepth(name: string): number {
    return this.layers.get(name)?.depth ?? 0;
  }

  setLayerDepth(name: string, depth: number): void {
    const layer = this.layers.get(name);
    if (!layer) return;
    layer.depth = depth;
    this.reapplyDepths();
  }

  applyLayerDepths(overrides: Record<string, number>): void {
    for (const [name, depth] of Object.entries(overrides)) {
      const layer = this.layers.get(name);
      if (layer) layer.depth = depth;
    }
    this.reapplyDepths();
  }

  pieceIds(): string[] {
    return this.pieces.map((p) => p.id);
  }

  layerNames(): string[] {
    return [...this.layerOrder];
  }

  private reapplyDepths(): void {
    for (const def of this.pieces) {
      const mount = this.mounts.get(def.id);
      const layer = this.layers.get(def.layer);
      if (!mount || !layer) continue;
      for (const obj of mount.objects) {
        (obj as unknown as { setDepth: (d: number) => void }).setDepth(layer.depth);
      }
    }
  }

  /** Bottom → top stack for debug / gallery. */
  describeStack(): string[] {
    const lines: string[] = [];
    for (const name of this.sortedLayerNames()) {
      const layer = this.layers.get(name)!;
      const under =
        layer.under === null || layer.under === undefined
          ? "пол"
          : layer.under
            ? `под «${layer.under}»`
            : "пол";
      const pieceIds = this.pieces.filter((p) => p.layer === name).map((p) => p.id);
      const pieces = pieceIds.length ? pieceIds.join(", ") : "—";
      lines.push(
        `z${String(layer.depth).padStart(2, " ")} · ${name} (${under}) · ${pieces}${layer.note ? ` — ${layer.note}` : ""}`,
      );
    }
    return lines;
  }

  sortedLayerNames(): string[] {
    return [...this.layerOrder].sort(
      (a, b) => (this.layers.get(a)?.depth ?? 0) - (this.layers.get(b)?.depth ?? 0),
    );
  }

  private validateLayerOrder(): void {
    for (const name of this.layerOrder) {
      const layer = this.layers.get(name)!;
      if (layer.under === null || layer.under === undefined) continue;
      const under = this.layers.get(layer.under);
      if (!under) throw new Error(`PanelStack: layer "${name}" under unknown "${layer.under}"`);
      if (under.depth >= layer.depth) {
        throw new Error(
          `PanelStack: layer "${name}" (z=${layer.depth}) must be above "${layer.under}" (z=${under.depth})`,
        );
      }
    }
  }
}

/** Screen-fixed HUD helper. */
export function hudObject<T extends Phaser.GameObjects.GameObject>(obj: T, scrollFactor = 0): T {
  (obj as unknown as { setScrollFactor: (v: number) => void }).setScrollFactor(scrollFactor);
  return obj;
}
