import Phaser from "phaser";
import { BATTLE_ASSETS, WORLD_ASSETS, attachOptionalLoadPump, queueAssetPack } from "../game/assetPacks";
import { session, type Army, type City } from "../game/data";
import { mockMinimapGrid, seedPanelGallerySession } from "../game/uiFixtures";
import { ArmyInspectPanel } from "../ui/ArmyInspectPanel";
import { BattleActionBar } from "../ui/BattleActionBar";
import { CityPanel } from "../ui/CityPanel";
import { InventoryPanel } from "../ui/InventoryPanel";
import { UnitInspectPanel } from "../ui/UnitInspectPanel";
import { WorldHud } from "../ui/worldHud";
import {
  activeSidebarVariant,
  loadSidebarVariantPreference,
  SIDEBAR_VARIANT_LIST,
  type SidebarVariantId,
} from "../ui/worldHud/sidebarVariants";
import { PanelLayoutEditor, PANEL_LAYOUT_PIECE } from "../ui/panelStack/PanelLayoutEditor";
import { layoutIdForGalleryPanel, PANEL_LAYOUT_IDS } from "../ui/panelStack/panelLayoutStore";
import { onViewResize, viewSize, viewW } from "../ui/viewport";

const FONT = "Georgia, serif";
const INK = "#e8d5a3";
const MUTED = "#8a7a5a";
const ACTIVE = "#fff0c0";

type PanelId =
  | "sidebar"
  | "stack"
  | "world-hud"
  | "city"
  | "inventory"
  | "army"
  | "unit"
  | "settings"
  | "battle-bar";

type GalleryEntry = {
  id: PanelId;
  label: string;
  key: string;
};

const ENTRIES: GalleryEntry[] = [
  { id: "sidebar", label: "Панель игрока", key: "1" },
  { id: "stack", label: "Слои · конструктор", key: "2" },
  { id: "world-hud", label: "HUD карты", key: "3" },
  { id: "city", label: "Город", key: "4" },
  { id: "inventory", label: "Сумка", key: "5" },
  { id: "army", label: "ОТРЯД", key: "6" },
  { id: "unit", label: "Воин", key: "7" },
  { id: "settings", label: "Настройки", key: "8" },
  { id: "battle-bar", label: "Бой · кнопки", key: "9" },
];

/**
 * Switchable preview of in-game UI panels.
 * Boot menu or `#test/panels` / `#test/ui`.
 */
export class PanelGalleryTestScene extends Phaser.Scene {
  private fixtures!: { army: Army | undefined; city: City | undefined };
  private active: PanelId = "sidebar";
  private tabTexts: Phaser.GameObjects.Text[] = [];
  private hintText!: Phaser.GameObjects.Text;
  private stackLegend!: Phaser.GameObjects.Text;

  private worldHud!: WorldHud;
  private cityPanel!: CityPanel;
  private inventoryPanel!: InventoryPanel;
  private armyInspect!: ArmyInspectPanel;
  private unitInspect!: UnitInspectPanel;
  private battleBar!: BattleActionBar;
  private layoutEditor!: PanelLayoutEditor;
  private variantTabTexts: Phaser.GameObjects.Text[] = [];
  private variantHintText!: Phaser.GameObjects.Text;

  constructor() {
    super("PanelGalleryTest");
  }

  preload() {
    attachOptionalLoadPump(this);
    queueAssetPack(this, [...WORLD_ASSETS, ...BATTLE_ASSETS]);
  }

  create() {
    this.cameras.main.setBackgroundColor(0x14100c);
    this.fixtures = seedPanelGallerySession();

    this.add
      .text(viewW(this) / 2, 28, "ГАЛЕРЕЯ ПАНЕЛЕЙ", {
        fontFamily: FONT,
        fontSize: "26px",
        color: INK,
        stroke: "#0a0806",
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(100)
      .setScrollFactor(0);

    this.hintText = this.add
      .text(viewW(this) / 2, 56, "", {
        fontFamily: FONT,
        fontSize: "13px",
        color: MUTED,
      })
      .setOrigin(0.5)
      .setDepth(100)
      .setScrollFactor(0);

    this.stackLegend = this.add
      .text(520, 120, "", {
        fontFamily: "Consolas, monospace",
        fontSize: "13px",
        color: INK,
        lineSpacing: 6,
      })
      .setOrigin(0, 0)
      .setDepth(100)
      .setScrollFactor(0)
      .setVisible(false);

    this.buildTabs();
    this.variantHintText = this.add
      .text(24, 108, "", {
        fontFamily: FONT,
        fontSize: "13px",
        color: MUTED,
      })
      .setOrigin(0, 0.5)
      .setDepth(101)
      .setScrollFactor(0);
    this.buildVariantTabs();
    loadSidebarVariantPreference();
    this.buildPanels();
    this.showPanel(galleryPanelFromHash() ?? "sidebar");

    this.input.keyboard?.on("keydown-ESC", () => {
      if (this.worldHud.settingsOpen()) {
        this.worldHud.hideSettings();
        return;
      }
      if (this.layoutEditor.handleEscape()) return;
      window.location.hash = "";
      this.scene.start("Boot");
    });
    this.input.keyboard?.on("keydown-LEFT", () => this.stepPanel(-1));
    this.input.keyboard?.on("keydown-RIGHT", () => this.stepPanel(1));
    const digitKeys = [
      "ONE",
      "TWO",
      "THREE",
      "FOUR",
      "FIVE",
      "SIX",
      "SEVEN",
      "EIGHT",
      "NINE",
    ] as const;
    for (let i = 0; i < ENTRIES.length; i++) {
      const id = ENTRIES[i].id;
      this.input.keyboard?.on(`keydown-${digitKeys[i]}`, () => this.showPanel(id));
    }

    onViewResize(this, () => this.layoutAll());
    this.layoutAll();
  }

  private buildTabs() {
    this.tabTexts = [];
    const startX = 24;
    const y = 82;
    let x = startX;
    for (const entry of ENTRIES) {
      const tab = this.add
        .text(x, y, `[${entry.key}] ${entry.label}`, {
          fontFamily: FONT,
          fontSize: "14px",
          color: MUTED,
        })
        .setOrigin(0, 0.5)
        .setDepth(101)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      tab.setData("panelId", entry.id);
      tab.on("pointerover", () => {
        if (this.active !== entry.id) tab.setColor(INK);
      });
      tab.on("pointerout", () => this.paintTabs());
      tab.on("pointerdown", () => this.showPanel(entry.id));
      this.tabTexts.push(tab);
      x += tab.width + 18;
    }
  }

  private buildVariantTabs() {
    this.variantTabTexts = [];
    let x = 24;
    const y = 128;
    for (const variant of SIDEBAR_VARIANT_LIST) {
      const tab = this.add
        .text(x, y, variant.label, {
          fontFamily: FONT,
          fontSize: "13px",
          color: MUTED,
        })
        .setOrigin(0, 0.5)
        .setDepth(101)
        .setScrollFactor(0)
        .setInteractive({ useHandCursor: true });
      tab.setData("variantId", variant.id);
      tab.on("pointerover", () => {
        if (this.worldHud?.sidebar.activeVariantId !== variant.id) tab.setColor(INK);
      });
      tab.on("pointerout", () => this.paintVariantTabs());
      tab.on("pointerdown", () => this.pickSidebarVariant(variant.id));
      this.variantTabTexts.push(tab);
      x += tab.width + 16;
    }
  }

  private pickSidebarVariant(id: SidebarVariantId) {
    this.worldHud.sidebar.setVariant(id);
    this.paintVariantTabs();
    this.layoutAll();
  }

  private paintVariantTabs() {
    const show = ["sidebar", "stack", "world-hud"].includes(this.active);
    this.variantHintText.setVisible(show);
    for (const tab of this.variantTabTexts) {
      tab.setVisible(show);
      const id = tab.getData("variantId") as SidebarVariantId;
      const active = this.worldHud?.sidebar.activeVariantId === id;
      tab.setColor(active ? ACTIVE : MUTED);
    }
    if (show) {
      this.variantHintText.setText(
        `Макет панели: ${activeSidebarVariant().label} · выбор сохраняется в игре`,
      );
    }
  }

  private buildPanels() {
    const noop = () => {};

    this.worldHud = new WorldHud(this, {
      onSquad: noop,
      onMap: () => this.worldHud.toggleMap(),
      onSettings: () => this.worldHud.settings.toggle(),
      onGoMenu: () => this.scene.start("Boot"),
      onCity: noop,
      onInventory: noop,
      onEndTurn: noop,
      onPickMapTile: noop,
    });
    this.worldHud.build();

    this.cityPanel = new CityPanel(this, { onMessage: noop, onChanged: noop });
    this.inventoryPanel = new InventoryPanel(this, {
      onMessage: noop,
      onChanged: noop,
      onSelect: noop,
    });
    this.armyInspect = new ArmyInspectPanel(this);
    this.unitInspect = new UnitInspectPanel(this);
    this.battleBar = new BattleActionBar(this, {
      onSkip: noop,
      onDefend: noop,
      onFlee: noop,
      onQuick: noop,
    });
    this.battleBar.setState({ playerTurn: true, busy: false, canFlee: true });
    this.battleBar.setVisible(false);

    this.layoutEditor = new PanelLayoutEditor(this);
    this.layoutEditor.mount();
  }

  private hudModel() {
    const { army } = this.fixtures;
    const mm = mockMinimapGrid();
    return {
      army,
      turn: session.state.turn,
      gold: session.state.gold,
      mana: session.state.mana,
      people: session.state.people,
      coal: session.state.coal,
      steel: session.state.steel,
      lastMessage: session.state.lastMessage,
      mapTitle: "1914 · Цитадель Януса",
      objective: "Цель: удержать столицу",
      ...mm,
    };
  }

  private hideAll() {
    this.worldHud.setSidebarVisible(false);
    this.worldHud.setChromeVisible(false);
    this.worldHud.hideSettings();
    this.cityPanel.hide();
    this.inventoryPanel.hide();
    this.armyInspect.hide();
    this.unitInspect.hide();
    this.battleBar.setVisible(false);
    this.stackLegend.setVisible(false);
    this.layoutEditor.close();
  }

  private showPanel(id: PanelId) {
    this.hideAll();
    this.active = id;
    const { army, city } = this.fixtures;
    const model = this.hudModel();

    switch (id) {
      case "sidebar":
        this.worldHud.setSidebarVisible(true);
        this.worldHud.sidebar.refresh(army, session.state.turn);
        break;
      case "stack":
        this.worldHud.setSidebarVisible(true);
        this.worldHud.sidebar.refresh(army, session.state.turn);
        break;
      case "world-hud":
        this.worldHud.setSidebarVisible(true);
        this.worldHud.setChromeVisible(true);
        this.worldHud.refresh(model);
        break;
      case "city":
        if (army && city) this.cityPanel.show(army, city, galleryCityTab());
        break;
      case "inventory":
        this.inventoryPanel.show();
        break;
      case "army":
        if (army) this.armyInspect.showPinned(army);
        break;
      case "unit": {
        const unit = army?.units.find((u) => u.isHero) ?? army?.units[0];
        if (army && unit) this.unitInspect.show({ unit, army, side: "player" });
        break;
      }
      case "settings":
        this.worldHud.settings.show();
        break;
      case "battle-bar":
        this.battleBar.setVisible(true);
        this.battleBar.setState({ playerTurn: true, busy: false, canFlee: true });
        break;
    }

    this.paintTabs();
    this.paintVariantTabs();
    this.syncLayoutEditor();
    this.layoutAll();
  }

  private syncLayoutEditor() {
    const layoutId = layoutIdForGalleryPanel(this.active);
    if (!layoutId) {
      this.layoutEditor.close();
      return;
    }

    const sidebarTabs: PanelId[] = ["sidebar", "stack", "world-hud"];
    if (sidebarTabs.includes(this.active)) {
      this.layoutEditor.open({
        layoutId: PANEL_LAYOUT_IDS.playerSidebar,
        stack: this.worldHud.sidebar.panelStack,
        pieceCatalog: [...this.worldHud.sidebar.editorCatalog],
        pieceBounds: (id, w, h) => this.worldHud.sidebar.pieceBounds(id, w, h),
        pieceBaseMetrics: (id) => this.worldHud.sidebar.pieceBaseMetrics(id),
        layerNames: this.worldHud.sidebar.panelStack.layerNames(),
        relayout: () => this.layoutAll(),
      });
      return;
    }

    this.layoutEditor.open({
      layoutId,
      pieceCatalog: [{ id: PANEL_LAYOUT_PIECE, label: "Панель целиком" }],
      relayout: () => this.layoutAll(),
    });
  }

  private stepPanel(delta: number) {
    const idx = ENTRIES.findIndex((e) => e.id === this.active);
    const next = (idx + delta + ENTRIES.length) % ENTRIES.length;
    this.showPanel(ENTRIES[next].id);
  }

  private paintTabs() {
    for (let i = 0; i < ENTRIES.length; i++) {
      const active = ENTRIES[i].id === this.active;
      this.tabTexts[i]?.setColor(active ? ACTIVE : MUTED);
    }
    const entry = ENTRIES.find((e) => e.id === this.active)!;
    this.hintText.setText(
      `${entry.label} · ←/→ вкладки · Esc — снять выбор · Esc ещё раз — в меню`,
    );
  }

  private layoutAll() {
    const { w, h } = viewSize(this);
    this.worldHud.layout(w, h);
    this.worldHud.refresh(this.hudModel());
    this.cityPanel.layout();
    this.inventoryPanel.layout();
    this.armyInspect.layout();
    this.unitInspect.layout();
    this.battleBar.layout();
    this.layoutEditor.layout(w, h);
    this.hintText.setPosition(w / 2, 56);
    if (this.active === "stack") {
      this.stackLegend.setPosition(520, 120);
      this.stackLegend.setWordWrapWidth(Math.max(320, w - 540));
    }
  }
}

export function shouldOpenPanelGallery(): boolean {
  const hash = window.location.hash.replace(/^#/, "").toLowerCase();
  return hash === "test/panels" || hash.startsWith("test/panels/") || hash === "test/ui" || hash === "test/hud";
}

function galleryPanelFromHash(): PanelId | null {
  const hash = window.location.hash.replace(/^#/, "").toLowerCase();
  if (hash.includes("city")) return "city";
  const slash = hash.lastIndexOf("/");
  if (slash < 0) return null;
  const id = hash.slice(slash + 1);
  return ENTRIES.some((e) => e.id === id) ? (id as PanelId) : null;
}

function galleryCityTab(): "recruit" | "garrison" | "build" | undefined {
  const hash = window.location.hash.replace(/^#/, "").toLowerCase();
  if (hash.includes("build")) return "build";
  if (hash.includes("recruit")) return "recruit";
  if (hash.includes("garrison")) return "garrison";
  return undefined;
}
