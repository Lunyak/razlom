/** Where the panel sits on screen. */
export type PanelAnchor = "left" | "center" | "right" | "free";

export type PanelPieceOffset = {
  x: number;
  y: number;
  /** 1 = recipe default width. */
  scaleX?: number;
  /** 1 = recipe default height. */
  scaleY?: number;
};

export type PanelPieceTransform = {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
};

export type PanelLayoutConfig = {
  anchor: PanelAnchor;
  /** Fine position — for `free` this is absolute; for others added to anchor origin. */
  x: number;
  y: number;
  /** Layer name → depth override (empty = use recipe defaults). */
  layerDepths: Record<string, number>;
  /** Piece id → offset from recipe layout. */
  pieceOffsets: Record<string, PanelPieceOffset>;
};

export type PanelLayoutRegistry = Record<string, PanelLayoutConfig>;

const STORAGE_KEY = "disciples-like.panelLayouts.v1";

export const PANEL_LAYOUT_IDS = {
  playerSidebar: "player-sidebar",
  city: "city",
  inventory: "inventory",
  army: "army-inspect",
  unit: "unit-inspect",
  settings: "settings",
  battleBar: "battle-bar",
  battleScene: "battle-scene",
} as const;

function emptyConfig(anchor: PanelAnchor = "left"): PanelLayoutConfig {
  return { anchor, x: 0, y: 0, layerDepths: {}, pieceOffsets: {} };
}

let cache: PanelLayoutRegistry | null = null;

export function loadPanelLayouts(): PanelLayoutRegistry {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      cache = JSON.parse(raw) as PanelLayoutRegistry;
      return cache!;
    }
  } catch {
    /* ignore corrupt storage */
  }
  cache = {};
  return cache;
}

export function savePanelLayouts(registry: PanelLayoutRegistry): void {
  cache = { ...registry };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
}

export function getPanelLayout(panelId: string): PanelLayoutConfig {
  const reg = loadPanelLayouts();
  if (reg[panelId]) return clonePanelLayoutConfig(reg[panelId]);
  const defaults: Record<string, PanelLayoutConfig> = {
    [PANEL_LAYOUT_IDS.playerSidebar]: emptyConfig("left"),
    [PANEL_LAYOUT_IDS.city]: emptyConfig("center"),
    [PANEL_LAYOUT_IDS.inventory]: emptyConfig("center"),
    [PANEL_LAYOUT_IDS.army]: emptyConfig("center"),
    [PANEL_LAYOUT_IDS.unit]: emptyConfig("center"),
    [PANEL_LAYOUT_IDS.settings]: emptyConfig("center"),
    [PANEL_LAYOUT_IDS.battleBar]: emptyConfig("free"),
    [PANEL_LAYOUT_IDS.battleScene]: emptyConfig("free"),
  };
  return defaults[panelId] ? clonePanelLayoutConfig(defaults[panelId]) : emptyConfig();
}

export function clonePanelLayoutConfig(cfg: PanelLayoutConfig): PanelLayoutConfig {
  return {
    anchor: cfg.anchor,
    x: cfg.x,
    y: cfg.y,
    layerDepths: { ...cfg.layerDepths },
    pieceOffsets: Object.fromEntries(
      Object.entries(cfg.pieceOffsets).map(([id, off]) => [
        id,
        { x: off.x, y: off.y, scaleX: off.scaleX, scaleY: off.scaleY },
      ]),
    ),
  };
}

export function replacePanelLayout(panelId: string, config: PanelLayoutConfig): PanelLayoutConfig {
  const next = clonePanelLayoutConfig(config);
  const reg = loadPanelLayouts();
  reg[panelId] = next;
  savePanelLayouts(reg);
  return next;
}

export function patchPanelLayout(panelId: string, patch: Partial<PanelLayoutConfig>): PanelLayoutConfig {
  const cur = getPanelLayout(panelId);
  const next: PanelLayoutConfig = {
    anchor: patch.anchor ?? cur.anchor,
    x: patch.x ?? cur.x,
    y: patch.y ?? cur.y,
    layerDepths: { ...cur.layerDepths, ...(patch.layerDepths ?? {}) },
    pieceOffsets: { ...cur.pieceOffsets, ...(patch.pieceOffsets ?? {}) },
  };
  const reg = loadPanelLayouts();
  reg[panelId] = next;
  savePanelLayouts(reg);
  return next;
}

export function resetPanelLayout(panelId: string): void {
  const reg = loadPanelLayouts();
  delete reg[panelId];
  savePanelLayouts(reg);
}

export function pieceOffset(cfg: PanelLayoutConfig, pieceId: string): PanelPieceOffset {
  return pieceTransform(cfg, pieceId);
}

export function pieceTransform(cfg: PanelLayoutConfig, pieceId: string): PanelPieceTransform {
  const t = cfg.pieceOffsets[pieceId];
  return {
    x: t?.x ?? 0,
    y: t?.y ?? 0,
    scaleX: t?.scaleX ?? 1,
    scaleY: t?.scaleY ?? 1,
  };
}

export function resolvePanelOrigin(
  cfg: PanelLayoutConfig,
  screenW: number,
  screenH: number,
  panelW: number,
  panelH: number,
): { x: number; y: number } {
  switch (cfg.anchor) {
    case "center":
      return { x: (screenW - panelW) / 2 + cfg.x, y: (screenH - panelH) / 2 + cfg.y };
    case "right":
      return { x: screenW - panelW + cfg.x, y: cfg.y };
    case "free":
      return { x: cfg.x, y: cfg.y };
    case "left":
    default:
      return { x: cfg.x, y: cfg.y };
  }
}

export function layoutIdForGalleryPanel(
  panelId: string,
): string | undefined {
  const map: Record<string, string> = {
    sidebar: PANEL_LAYOUT_IDS.playerSidebar,
    stack: PANEL_LAYOUT_IDS.playerSidebar,
    "world-hud": PANEL_LAYOUT_IDS.playerSidebar,
    city: PANEL_LAYOUT_IDS.city,
    inventory: PANEL_LAYOUT_IDS.inventory,
    army: PANEL_LAYOUT_IDS.army,
    unit: PANEL_LAYOUT_IDS.unit,
    settings: PANEL_LAYOUT_IDS.settings,
    "battle-bar": PANEL_LAYOUT_IDS.battleBar,
  };
  return map[panelId];
}
