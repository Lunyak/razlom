/**
 * World map scene — iso map, armies, turns, plot.
 *
 * HUD is not here. Screen chrome lives in `src/ui/worldHud/`:
 *   WorldHud          facade (hits, layout, refresh)
 *   PlayerSidebar     left plate (steps, portrait, buttons)
 *   PlayChrome        resources / title / minimap
 *   SettingsOverlay   music, volume, город / сумка / ход
 *   WorldMapOverlay   full map
 *   GameOverOverlay   victory / defeat
 *   CityPanel         city window (tabs in src/ui/cityPanel/)
 *
 * Map tokens (cities / armies / sites / graves): `src/scenes/world/mapMarkers.ts`
 * Game model: `src/game/data.ts` (session barrel) → types / army; tables in `src/game/catalog/`.
 */
import Phaser from "phaser";
import {
  canWalkCaptureCity,
  captureCity,
  cityAt,
  collectIncome,
  maybeSpawnOrdoPatrol,
  passiveTempleHeal,
  walkCaptureBlockMessage,
} from "../game/city";
import {
  currentDiscovered,
  ensureDiscoveredGrid,
  livingUnits,
  session,
  armyMaxMoves,
  type Army,
} from "../game/data";
import { continueCampaign, resetGame } from "../game/session";
import {
  checkDefeat,
  collectPendingPlot,
  getMapDef,
  getScenario,
  isMapObjectiveComplete,
  markPlotFired,
  missionObjectiveText,
  resolveMapTerrain,
  resolveMissionOutcome,
  type PlotFireEvent,
  type PlotSequence,
} from "../game/scenario";
import { PlotPlayer } from "../ui/PlotPlayer";
import { applyLoadedState, loadGame, saveGame } from "../game/save";
import {
  formatRailPlan,
  harvestSiteOnNetwork,
  hasRailAt,
  issueRailDecree,
  planRailBranch,
  type RailPlan,
} from "../game/rails";
import { captureSite, isHarvestSite, siteAt, SITE_LABEL, visitSite } from "../game/sites";
import { canResurrectGrave, graveAt, resurrectGrave } from "../game/graves";
import {
  computeReachable,
  findPathAny,
  getPlayerArmyPositions,
  hodWord,
  isBlockedTerrain,
  resetVisibility,
  slicePathThisTurn,
  terrainMoveCost,
  turnsToReach,
  updateFog,
  type FoundPath,
  type GridPos,
  type Terrain,
} from "../game/world";
import {
  computeIsoOrigin,
  isoCenter as isoCenterAt,
  isoDiamondPoints,
  isoDrawOrder,
  isoTop as isoTopAt,
  pointInIsoDiamond,
  screenToGrid as screenToGridAt,
} from "../game/iso";
import { TerrainLayer, pointInTreeOverlay } from "../game/terrainLayer";
import { WORLD_ASSETS, attachOptionalLoadPump, queueAssetPack } from "../game/assetPacks";
import { ArmyInspectPanel } from "../ui/ArmyInspectPanel";
import { CityPanel } from "../ui/CityPanel";
import { InventoryPanel } from "../ui/InventoryPanel";
import { ScreenCharcoalFrame } from "../ui/screenCharcoalFrame";
import { createMapVoid, createMapVoidLid, layoutMapVoid, layoutMapVoidLid } from "../ui/mapVoid";
import { usePotionOnArmy } from "../game/items";
import { playerFactionOf } from "../game/playerFaction";
import { classLabel, canRespecClass, cycleHeroClass } from "../game/heroClasses";
import { onViewResize, viewSize } from "../ui/viewport";
import { showGameOverOverlay, worldGutterW, WorldHud } from "../ui/worldHud";
import { ArmyMapLayer } from "./world/armyMapLayer";
import { MapAtmosphere } from "./world/mapAtmosphere";
import { paintRails } from "./world/railLayer";
import { paintBloodStains, paintCityMarkers, paintGraveMarkers, paintSiteMarkers } from "./world/mapMarkers";
import { paintPathFlags, type ArmyPathGoal, type PendingPathOrder } from "./world/pathFlags";
import {
  applyDawnVeil,
  armyPresentNow,
  beginNight,
  bloodMovePenalty,
  canArmyAttack,
  canArmyMarch,
  canArmiesEngage,
  canLookRuins,
  canPray,
  canRequiem,
  collectBlood,
  consumePrayerAp,
  enemyNightCollectBlood,
  ensureNightHero,
  isDay,
  isNight,
  isVeilActor,
  lookRuins,
  requiem,
  sameVeilLayer,
  selectPhaseArmy,
} from "../game/dayNight";

function isOwnedCity(faction: string | null | undefined): boolean {
  return faction === playerFactionOf(session.state);
}

/** Active map geometry — set when loading a scenario map */
let COLS = 32;
let ROWS = 20;
let OX = 0;
let OY = 0;

function setMapGeometry(cols: number, rows: number, screenW: number, screenH: number) {
  COLS = cols;
  ROWS = rows;
  const origin = computeIsoOrigin(cols, rows, screenW, 56, screenH - 24, worldGutterW(screenW));
  OX = origin.ox;
  OY = origin.oy;
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function isoTop(x: number, y: number): { sx: number; sy: number } {
  return isoTopAt(x, y, OX, OY);
}

function isoCenter(x: number, y: number): { cx: number; cy: number } {
  return isoCenterAt(x, y, OX, OY);
}

function screenToGrid(px: number, py: number): { gx: number; gy: number } {
  return screenToGridAt(px, py, OX, OY);
}

export class WorldScene extends Phaser.Scene {
  private map: Terrain[][] = [];
  private terrainLayer!: TerrainLayer;

  private tileGfx!: Phaser.GameObjects.Graphics;
  private armyGfx!: Phaser.GameObjects.Graphics;
  private overlayGfx!: Phaser.GameObjects.Graphics;
  private hud!: WorldHud;
  private reachables = new Map<string, number>();
  private visible: boolean[][] = [];
  private cityUi!: CityPanel;
  private inventoryUi!: InventoryPanel;
  private armyInspect!: ArmyInspectPanel;
  private rightInspect = false;
  private isPanning = false;
  private panMoved = false;
  private panLastX = 0;
  private panLastY = 0;
  /** Ignore map pan/click until pointer is released (city UI / modal). */
  private suppressMapInput = false;
  private static readonly PAN_THRESHOLD = 5;
  private screenFrame?: ScreenCharcoalFrame;
  private mapVoid?: Phaser.GameObjects.TileSprite;
  private mapVoidLid?: Phaser.GameObjects.Image;
  private plotPlayer!: PlotPlayer;
  private plotBusy = false;
  private movementBusy = false;
  private armyLayer!: ArmyMapLayer;
  private atmosphere!: MapAtmosphere;
  private pathFlagsGfx!: Phaser.GameObjects.Graphics;
  private pathTurnsText!: Phaser.GameObjects.Text;
  private railGfx!: Phaser.GameObjects.Graphics;
  private railMode = false;
  private railPreview: RailPlan | null = null;
  private pendingOrder: PendingPathOrder | null = null;
  private armyGoals = new Map<string, ArmyPathGoal>();

  constructor() {
    super("World");
  }

  preload() {
    attachOptionalLoadPump(this);
    queueAssetPack(this, WORLD_ASSETS);
  }

  private fog(): boolean[][] {
    return currentDiscovered(session.state);
  }

  private loadActiveMap() {
    const scenario = getScenario(session.state.scenarioId);
    if (!scenario) throw new Error("No scenario loaded");
    const mapDef = getMapDef(scenario, session.state.currentMapId);
    if (!mapDef) throw new Error(`Map missing: ${session.state.currentMapId}`);
    const { w, h } = viewSize(this);
    setMapGeometry(mapDef.cols, mapDef.rows, w, h);
    this.map = resolveMapTerrain(mapDef);
    this.visible = resetVisibility(COLS, ROWS);
    session.state.discoveredByMap[mapDef.id] = ensureDiscoveredGrid(
      session.state.discoveredByMap[mapDef.id],
      COLS,
      ROWS,
      !!mapDef.startExplored,
    );

    ensureNightHero(session.state);
    const stillHere = session.state.armies.find(
      (a) =>
        a.id === session.state.selectedArmyId &&
        a.mapId === session.state.currentMapId &&
        livingUnits(a).length > 0,
    );
    if (!stillHere) selectPhaseArmy(session.state);
  }

  create() {
    // Phaser reuses the scene instance after Battle → World; reset flags so UI is rebuilt.
    this.suppressMapInput = false;
    this.isPanning = false;
    this.panMoved = false;
    this.rightInspect = false;
    this.plotBusy = false;
    this.movementBusy = false;
    this.pendingOrder = null;
    this.armyGoals.clear();
    this.railMode = false;
    this.railPreview = null;

    this.loadActiveMap();

    this.cameras.main.setBackgroundColor(0x0a0a0a);
    this.mapVoid = createMapVoid(this);
    this.mapVoidLid = createMapVoidLid(this);
    this.terrainLayer = new TerrainLayer(this);
    this.tileGfx = this.add.graphics().setDepth(3);
    this.railGfx = this.add.graphics().setDepth(2.8);
    this.armyGfx = this.add.graphics().setDepth(6.5);
    this.overlayGfx = this.add.graphics().setDepth(8).setScrollFactor(0);
    this.pathFlagsGfx = this.add.graphics().setDepth(7.85);
    this.pathTurnsText = this.add
      .text(0, 0, "", {
        fontFamily: "Georgia, serif",
        fontSize: "18px",
        color: "#f0d070",
        stroke: "#1a1008",
        strokeThickness: 5,
      })
      .setOrigin(0.5, 1)
      .setDepth(7.9)
      .setVisible(false);
    this.armyLayer = new ArmyMapLayer(this);
    this.atmosphere = new MapAtmosphere(this);

    this.hud = new WorldHud(this, {
      onSquad: () => this.toggleSquadPanel(),
      onMap: () => this.hud.toggleMap(),
      onSettings: () => this.toggleSettings(),
      onGoMenu: () => this.scene.start("Boot"),
      onCity: () => {
        this.hud.hideSettings();
        this.toggleCityPanel();
      },
      onInventory: () => {
        this.hud.hideSettings();
        this.toggleInventory();
      },
      onEndTurn: () => {
        this.hud.hideSettings();
        if (!this.modalOpen() && !this.movementBusy) this.endTurn();
      },
      onContinuePath: () => this.continueSelectedPath(),
      onToggleRail: () => this.toggleRailMode(),
      onPickMapTile: (gx, gy) => {
        this.centerCameraOnTile(gx, gy);
        session.state.lastMessage = "Камера на карте";
        this.refreshUi();
      },
    });
    this.hud.build();

    this.cityUi = new CityPanel(this, {
      onMessage: (msg) => {
        session.state.lastMessage = msg;
        this.refreshUi();
      },
      onChanged: () => {
        this.drawArmies();
        this.refreshUi();
      },
      onBlockMapInput: () => {
        this.suppressMapInput = true;
        this.isPanning = false;
        this.panMoved = false;
      },
    });

    this.inventoryUi = new InventoryPanel(this, {
      onMessage: (msg) => {
        session.state.lastMessage = msg;
        this.refreshUi();
      },
      onChanged: () => {
        this.drawArmies();
        this.refreshUi();
      },
      onBlockInput: () => {
        this.suppressMapInput = true;
        this.isPanning = false;
        this.panMoved = false;
      },
      onSelect: (id) => {
        const army = this.selectedPlayerArmy() ?? null;
        const result = usePotionOnArmy(session.state, id, army);
        session.state.lastMessage = result.ok ? result.message : result.reason;
        this.inventoryUi.refresh();
        this.drawArmies();
        this.refreshUi();
      },
    });

    this.armyInspect = new ArmyInspectPanel(this);
    this.screenFrame = new ScreenCharcoalFrame(this);
    this.plotPlayer = new PlotPlayer(this);
    this.game.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    this.refreshFog();
    this.refreshReachables();
    this.drawMap();
    this.setupCameraBounds();
    layoutMapVoid(this, this.mapVoid);
    layoutMapVoidLid(this, this.mapVoidLid, COLS, ROWS, OX, OY);
    this.atmosphere.layout(COLS, ROWS, OX, OY);
    this.drawArmies();
    this.refreshUi();
    onViewResize(this, () => this.layoutWorld());

    if (session.state.gameOver) {
      this.showGameOver(session.state.gameOver);
    } else {
      this.time.delayedCall(80, () => {
        this.playPlotEvents(
          [{ type: "map_start", mapId: session.state.currentMapId }],
          () => this.applyMissionCheck(),
        );
      });
    }

    this.bindWorldInput();
  }

  /** Pointer + hotkeys. Map tiles vs HUD/modals. */
  private bindWorldInput() {
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (session.state.gameOver) {
        this.suppressMapInput = true;
        this.isPanning = false;
        this.panMoved = false;
        return;
      }
      if (this.movementBusy) {
        this.suppressMapInput = true;
        this.isPanning = false;
        this.panMoved = false;
        return;
      }
      if (pointer.leftButtonDown() && this.hud.hits.dispatch(pointer)) {
        this.suppressMapInput = true;
        this.isPanning = false;
        this.panMoved = false;
        return;
      }
      if (this.modalOpen()) {
        this.suppressMapInput = true;
        this.isPanning = false;
        this.panMoved = false;
        return;
      }
      if (pointer.rightButtonDown()) {
        if (this.hud.blocksMapPointer(pointer.x, pointer.y)) return;
        this.rightInspect = true;
        this.isPanning = false;
        this.updateArmyInspect(pointer);
        return;
      }
      if (!pointer.leftButtonDown()) return;
      if (this.hud.blocksMapPointer(pointer.x, pointer.y)) return;
      this.suppressMapInput = false;
      this.isPanning = true;
      this.panMoved = false;
      this.panLastX = pointer.x;
      this.panLastY = pointer.y;
    });

    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      const { overHud } = this.hud.hover(pointer.x, pointer.y);
      if (overHud && !this.isPanning) this.input.setDefaultCursor("pointer");
      else if (!this.isPanning && !this.modalOpen()) this.input.setDefaultCursor("default");
      if (this.suppressMapInput || this.modalOpen()) return;
      if (this.rightInspect && pointer.rightButtonDown()) {
        this.updateArmyInspect(pointer);
        return;
      }
      if (!this.isPanning || !pointer.isDown) return;
      const dx = pointer.x - this.panLastX;
      const dy = pointer.y - this.panLastY;
      if (!this.panMoved && Math.abs(dx) + Math.abs(dy) >= WorldScene.PAN_THRESHOLD) {
        this.panMoved = true;
        this.input.setDefaultCursor("grabbing");
      }
      if (!this.panMoved) return;
      const cam = this.cameras.main;
      cam.scrollX -= dx;
      cam.scrollY -= dy;
      this.panLastX = pointer.x;
      this.panLastY = pointer.y;
    });

    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonReleased()) {
        this.rightInspect = false;
        this.armyInspect.hideIfUnpinned();
      }
      if (this.suppressMapInput || this.modalOpen()) {
        this.suppressMapInput = false;
        this.isPanning = false;
        this.panMoved = false;
        this.input.setDefaultCursor("default");
        return;
      }
      if (!this.isPanning) return;
      const didPan = this.panMoved;
      this.isPanning = false;
      this.panMoved = false;
      this.input.setDefaultCursor("default");
      if (didPan || session.state.gameOver) return;

      const picked = this.pickTileAt(pointer.worldX, pointer.worldY);
      if (!picked) return;
      this.onTileClick(picked.gx, picked.gy);
    });

    this.input.on("pointerupoutside", () => {
      this.rightInspect = false;
      this.armyInspect.hideIfUnpinned();
      this.suppressMapInput = false;
      this.isPanning = false;
      this.panMoved = false;
      this.input.setDefaultCursor("default");
    });

    this.input.keyboard?.on("keydown-E", () => {
      if (!this.modalOpen() && !this.movementBusy) {
        this.hud.flashEndTurnPress();
        this.endTurn();
      }
    });
    this.input.keyboard?.on("keydown-C", () => {
      if (!this.movementBusy) this.toggleCityPanel();
    });
    this.input.keyboard?.on("keydown-I", () => {
      if (!this.movementBusy) this.toggleInventory();
    });
    this.input.keyboard?.on("keydown-H", () => {
      if (this.modalOpen() || this.plotBusy || this.movementBusy) return;
      this.cycleSelectedHeroClass();
    });
    this.input.keyboard?.on("keydown-ESC", () => {
      if (this.plotPlayer.isPlaying()) {
        this.plotPlayer.skipAll();
        return;
      }
      if (this.hud.settingsOpen()) {
        this.hud.hideSettings();
        return;
      }
      if (this.hud.mapOpen()) {
        this.hud.hideMap();
        return;
      }
      this.inventoryUi.hide();
      this.cityUi.hide();
      this.armyInspect.hide();
      this.rightInspect = false;
      if (this.railMode) {
        this.exitRailMode();
        return;
      }
      if (this.clearSelectedGoal()) this.refreshUi();
    });

    this.input.keyboard?.on("keydown-SPACE", (ev: KeyboardEvent) => {
      ev.preventDefault();
      if (this.plotPlayer.isPlaying()) {
        this.plotPlayer.skipAll();
        return;
      }
      if (!this.modalOpen() && !this.movementBusy) this.continueSelectedPath();
    });

    this.input.keyboard?.on("keydown-TAB", (ev: KeyboardEvent) => {
      ev.preventDefault();
      if (!this.modalOpen() && !this.movementBusy) this.switchArmy();
    });

    this.input.keyboard?.on("keydown-R", () => {
      if (session.state.gameOver) {
        this.restartGame();
        return;
      }
      if (this.modalOpen() || this.plotBusy || this.movementBusy) return;
      this.raiseGraveAtSelected();
    });
    this.input.keyboard?.on("keydown-ENTER", () => {
      if (!session.state.gameOver) return;
      if (session.state.gameOver === "victory" && continueCampaign()) {
        this.scene.start("World");
      } else {
        this.scene.start("Boot");
      }
    });
    this.input.keyboard?.on("keydown-M", () => {
      if (session.state.gameOver) this.scene.start("Boot");
    });
    this.input.keyboard?.on("keydown-T", () => {
      if (this.modalOpen() || this.plotBusy || this.movementBusy || session.state.gameOver) return;
      this.toggleRailMode();
    });
    this.input.keyboard?.on("keydown-S", () => {
      if (this.modalOpen()) return;
      if (saveGame()) {
        session.state.lastMessage = "Игра сохранена";
        this.refreshUi();
      }
    });
    this.input.keyboard?.on("keydown-L", () => {
      if (this.modalOpen()) return;
      const loaded = loadGame();
      if (loaded) {
        applyLoadedState(loaded);
        this.scene.start("World");
      } else {
        session.state.lastMessage = "Нет сохранения";
        this.refreshUi();
      }
    });
  }

  private restartGame() {
    resetGame();
    this.scene.start("World");
  }

  private refreshFog() {
    this.visible = resetVisibility(COLS, ROWS);
    updateFog(session.state, COLS, ROWS, this.visible, getPlayerArmyPositions());
  }

  private redrawTerrain() {
    this.terrainLayer.redraw({
      map: this.map,
      ox: OX,
      oy: OY,
      discovered: this.fog(),
      visible: this.visible,
      reachables: this.reachables,
      night: isNight(session.state),
    });
  }

  private drawRails() {
    paintRails(this.railGfx, {
      state: session.state,
      ox: OX,
      oy: OY,
      fog: this.fog(),
      preview: this.railPreview?.tiles,
      previewDest: this.railPreview?.dest,
    });
  }

  private toggleRailMode() {
    if (this.railMode) {
      this.exitRailMode();
      return;
    }
    this.railMode = true;
    this.railPreview = null;
    this.clearSelectedGoal();
    session.state.lastMessage = isNight(session.state)
      ? "Рельс. Строить ветку — днём. Клик по шахте или клетке — трасса"
      : "Указ о колее. Клик по шахте или клетке — трасса от города. Ещё раз — кладут";
    this.drawRails();
    this.refreshUi();
  }

  private exitRailMode() {
    if (!this.railMode && !this.railPreview) return;
    this.railMode = false;
    this.railPreview = null;
    session.state.lastMessage = "Указ о колее снят";
    this.drawRails();
    this.refreshUi();
  }

  private onRailClick(x: number, y: number) {
    const faction = playerFactionOf(session.state);
    const same =
      this.railPreview && this.railPreview.dest.x === x && this.railPreview.dest.y === y;
    if (same) {
      const result = issueRailDecree(session.state, this.map, faction, x, y);
      if (result.ok) {
        this.railPreview = null;
        session.state.lastMessage = result.message;
        this.drawMap();
        this.refreshUi();
        return;
      }
      session.state.lastMessage = result.reason;
      this.refreshUi();
      return;
    }
    const planned = planRailBranch(session.state, this.map, faction, x, y);
    if (!planned.ok) {
      this.railPreview = null;
      session.state.lastMessage = planned.reason;
      this.drawRails();
      this.refreshUi();
      return;
    }
    this.railPreview = planned.plan;
    session.state.lastMessage = formatRailPlan(session.state, planned.plan);
    this.drawRails();
    this.refreshUi();
  }

  private drawMap() {
    this.redrawTerrain();
    this.drawRails();

    this.tileGfx.clear();
    this.children.getAll().forEach((obj) => {
      if (
        obj.getData?.("cityLabel") ||
        obj.getData?.("cityToken") ||
        obj.getData?.("siteLabel") ||
        obj.getData?.("siteToken") ||
        obj.getData?.("graveLabel")
      ) {
        obj.destroy();
      }
    });

    const mapId = session.state.currentMapId;
    const fog = this.fog();
    paintCityMarkers(
      this,
      this.tileGfx,
      session.state.cities,
      mapId,
      fog,
      this.visible,
      isoCenter,
      isOwnedCity,
    );
    paintSiteMarkers(this, this.tileGfx, session.state.sites, mapId, fog, this.visible, isoCenter);
    paintGraveMarkers(
      this,
      this.tileGfx,
      session.state.graves ?? [],
      mapId,
      fog,
      this.visible,
      isoCenter,
    );
    paintBloodStains(this, this.tileGfx, session.state, fog, this.visible, isoCenter);
    this.atmosphere.setNight(isNight(session.state));
  }

  private setupCameraBounds() {
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const { sx, sy } = isoTop(x, y);
        const points = isoDiamondPoints(sx, sy);
        for (const p of points) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
      }
    }

    const margin = 120 + worldGutterW(viewSize(this).w) / 2;
    this.cameras.main.setBounds(minX - margin, minY - margin, maxX - minX + margin * 2, maxY - minY + margin * 2);
  }

  private centerCameraOnSelectedHero() {
    if (this.movementBusy) return;
    const army = this.selectedPlayerArmy();
    if (!army) return;
    this.stopArmyFollow();
    const { cx, cy } = isoCenter(army.x, army.y);
    const look = this.cameraLookAt(cx, cy);
    this.cameras.main.centerOn(look.x, look.y);
  }

  /** Map-area center: shift left so the sidebar does not steal the frame. */
  private cameraLookAt(cx: number, cy: number): { x: number; y: number } {
    return { x: cx - worldGutterW(viewSize(this).w) / 2, y: cy - 30 };
  }

  private followArmyMarker(armyId: string): void {
    const target = this.armyLayer.followTarget(armyId);
    this.cameras.main.panEffect.reset();
    this.cameras.main.stopFollow();
    if (!target) return;
    this.cameras.main.startFollow(target, false, 1, 1, worldGutterW(viewSize(this).w) / 2, 30);
  }

  private stopArmyFollow(): void {
    this.cameras.main.panEffect.reset();
    this.cameras.main.stopFollow();
  }

  private syncCityUiWithHeroPosition() {
    if (!this.cityUi.isOpen()) return;

    const ctx = this.cityContext();
    if (!ctx?.city) {
      this.cityUi.hide();
      return;
    }

    this.cityUi.show(ctx.army, ctx.city);
  }

  private drawArmies() {
    this.armyGfx.clear();
    this.armyLayer.sync({
      armies: session.state.armies,
      mapId: session.state.currentMapId,
      cols: COLS,
      rows: ROWS,
      visible: this.visible,
      selectedArmyId: session.state.selectedArmyId,
      isoCenter,
      night: isNight(session.state),
    });
  }

  private refreshReachables() {
    this.reachables.clear();
    const army = this.selectedPlayerArmy();
    if (!army || army.movesLeft <= 0 || session.state.gameOver) return;
    if (!canArmyMarch(session.state, army)) return;

    const blocked = (x: number, y: number) => !!this.armyAt(x, y, army.id, army);
    const map = computeReachable(
      this.map,
      army.x,
      army.y,
      army.movesLeft,
      COLS,
      ROWS,
      blocked,
      this.tileStepCost,
    );
    for (const [k, v] of map) {
      this.reachables.set(k, v.cost);
    }
  }

  private armyAt(x: number, y: number, exceptId?: string, walker?: Army): Army | undefined {
    const list = session.state.armies.filter(
      (a) =>
        a.mapId === session.state.currentMapId &&
        a.x === x &&
        a.y === y &&
        a.id !== exceptId &&
        livingUnits(a).length > 0,
    );
    if (walker) {
      return list.find(
        (a) => armyPresentNow(session.state, a) && sameVeilLayer(walker, a),
      );
    }
    return list.find((a) => armyPresentNow(session.state, a)) ?? list.find((a) => a.isPlayer);
  }

  private selectedPlayerArmy(): Army | undefined {
    return session.state.armies.find(
      (a) =>
        a.id === session.state.selectedArmyId &&
        a.isPlayer &&
        a.mapId === session.state.currentMapId &&
        livingUnits(a).length > 0,
    );
  }

  private pickTileAt(wx: number, wy: number): { gx: number; gy: number } | undefined {
    const approx = screenToGrid(wx, wy);
    type Cand = { x: number; y: number; order: number; overlay: boolean };
    const cands: Cand[] = [];
    for (let y = approx.gy - 2; y <= approx.gy + 2; y++) {
      for (let x = approx.gx - 2; x <= approx.gx + 2; x++) {
        if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
        if (!this.fog()[y]?.[x]) continue;
        const { sx, sy } = isoTop(x, y);
        const inDiamond = pointInIsoDiamond(wx, wy, sx, sy);
        const inTree =
          this.map[y][x] === "forest" && pointInTreeOverlay(wx, wy, x, y, OX, OY);
        if (!inDiamond && !inTree) continue;
        cands.push({ x, y, order: x + y, overlay: inTree && !inDiamond });
      }
    }
    if (cands.length === 0) {
      if (
        approx.gx >= 0 &&
        approx.gy >= 0 &&
        approx.gx < COLS &&
        approx.gy < ROWS &&
        this.fog()[approx.gy]?.[approx.gx]
      ) {
        return { gx: approx.gx, gy: approx.gy };
      }
      return undefined;
    }
    cands.sort((a, b) => isoDrawOrder(b, a) || Number(b.overlay) - Number(a.overlay));
    return { gx: cands[0].x, gy: cands[0].y };
  }

  private armyAtScreen(pointer: Phaser.Input.Pointer): Army | undefined {
    if (this.hud.blocksMapPointer(pointer.x, pointer.y)) return undefined;
    const picked = this.pickTileAt(pointer.worldX, pointer.worldY);
    if (!picked) return undefined;
    const { gx, gy } = picked;
    const army = this.armyAt(gx, gy);
    if (!army) return undefined;
    if (!army.isPlayer && !this.visible[gy]?.[gx]) return undefined;
    return army;
  }

  private updateArmyInspect(pointer: Phaser.Input.Pointer) {
    if (this.armyInspect.isPinned()) return;
    const army = this.armyAtScreen(pointer);
    if (!army) {
      this.armyInspect.hideIfUnpinned();
      return;
    }
    this.armyInspect.show(army);
  }

  /** In-place night rites on the army's own tile. */
  private tryVeilAction(player: Army): boolean {
    if (!isNight(session.state)) return false;
    const grave = graveAt(session.state, player.x, player.y);
    if (grave && isVeilActor(player)) {
      const result = resurrectGrave(session.state, player, grave);
      session.state.lastMessage = result.ok ? "Воскрешён отряд: могила снята" : result.reason;
      this.redraw();
      this.applyMissionCheck();
      return true;
    }
    if (canRequiem(session.state, player).ok) {
      requiem(session.state, player);
      this.redraw(true);
      return true;
    }
    const steal = collectBlood(session.state, player);
    if (steal.ok) {
      this.redraw(true);
      return true;
    }
    if (canLookRuins(session.state, player).ok) {
      lookRuins(session.state, player);
      this.refreshUi();
      return true;
    }
    return false;
  }

  private onTileClick(x: number, y: number) {
    if (this.movementBusy || this.plotBusy) return;
    if (this.railMode) {
      this.onRailClick(x, y);
      return;
    }

    const player = this.selectedPlayerArmy();
    const foe = player ? this.armyAt(x, y, player.id, player) : undefined;
    const token = this.armyAt(x, y);
    const grave = graveAt(session.state, x, y);

    if (player && player.x === x && player.y === y && this.tryVeilAction(player)) {
      return;
    }

    if (grave && player && isVeilActor(player) && player.x === x && player.y === y) {
      const result = resurrectGrave(session.state, player, grave);
      session.state.lastMessage = result.ok
        ? `Воскрешён отряд: могила снята`
        : result.reason;
      this.redraw();
      this.applyMissionCheck();
      return;
    }

    if (grave && !player) {
      session.state.lastMessage = isNight(session.state)
        ? "Могила. Ночью её поднимает Арсений или миссионер."
        : "Могила отряда. Ночью Арсений или миссионер может поднять её.";
      this.refreshUi();
      return;
    }

    if (foe && !foe.isPlayer && player) {
      if (!canArmyAttack(session.state, player)) {
        session.state.lastMessage = player.isMissionary
          ? "Миссионер не вступает в бой"
          : "Этот отряд не вступает в бой";
        this.refreshUi();
        return;
      }
      if (!canArmiesEngage(session.state, player, foe)) {
        session.state.lastMessage = "Дневной и ночной отряд не сходятся";
        this.refreshUi();
        return;
      }
      const found = this.pathAny(player, x, y, true);
      if (!found) {
        session.state.lastMessage = "Не пройти к врагу";
        this.refreshUi();
        return;
      }
      if (!this.armOrConfirm(player, x, y, "attack", found, foe.id)) return;
      this.continueSelectedPath();
      return;
    }

    if (token?.isPlayer && token.id !== player?.id) {
      session.state.selectedArmyId = token.id;
      this.redraw();
      return;
    }

    if (!player) return;

    if (x === player.x && y === player.y) {
      const here = cityAt(session.state, x, y);
      if (here && isOwnedCity(here.faction)) {
        this.cityUi.show(player, here);
        return;
      }
      if (!here && !token) {
        session.state.lastMessage = "Здесь нет города — ищите круглый маркер с названием";
        this.refreshUi();
        return;
      }
    }

    if (!canArmyMarch(session.state, player)) {
      session.state.lastMessage = isNight(session.state)
        ? "Ночь. Живые в лагере. Ходит Арсений."
        : "Арсений ходит только ночью.";
      this.refreshUi();
      return;
    }

    if (isBlockedTerrain(this.map[y]?.[x])) {
      this.clearSelectedGoal();
      session.state.lastMessage = "Не пройти";
      this.refreshUi();
      return;
    }

    const found = this.pathAny(player, x, y, false);
    if (!found) {
      this.clearSelectedGoal();
      session.state.lastMessage = "Не пройти";
      this.refreshUi();
      return;
    }
    if (!this.armOrConfirm(player, x, y, "move", found)) return;
    this.continueSelectedPath();
  }

  /** First click sets a lasting waypoint; second click / button walks this turn. */
  private armOrConfirm(
    army: Army,
    x: number,
    y: number,
    kind: PendingPathOrder["kind"],
    found: FoundPath,
    enemyId?: string,
  ): boolean {
    const goal = this.armyGoals.get(army.id);
    const same = goal?.kind === kind && goal.dest.x === x && goal.dest.y === y;
    if (same) return true;
    this.armyGoals.set(army.id, { dest: { x, y }, kind, enemyId });
    this.pendingOrder = {
      armyId: army.id,
      dest: { x, y },
      kind,
      enemyId,
      path: found.path,
      costs: found.costs,
      movesLeft: army.movesLeft,
      maxMoves: armyMaxMoves(army),
    };
    this.drawPathFlags();
    const status = this.pathGoalMessage();
    session.state.lastMessage = status
      ? `${status} — Продолжить путь или клик по цели`
      : "Путь отмечен";
    this.refreshUi();
    return false;
  }

  private continueSelectedPath(): void {
    if (this.movementBusy || this.plotBusy || this.modalOpen()) return;
    const army = this.selectedPlayerArmy();
    if (!army) return;
    if (!canArmyMarch(session.state, army)) {
      session.state.lastMessage = "Ночь. Живые в лагере.";
      this.refreshUi();
      return;
    }
    this.syncSelectedGoal();
    const pending = this.pendingOrder;
    if (!pending || pending.armyId !== army.id) {
      if (this.armyGoals.has(army.id)) {
        session.state.lastMessage = "Путь перекрыт";
        this.refreshUi();
      }
      return;
    }
    if (army.movesLeft <= 0) {
      session.state.lastMessage = "Шаги кончились — завершите ход. Путь сохранится.";
      this.refreshUi();
      return;
    }
    const found: FoundPath = { path: pending.path, costs: pending.costs };
    const enemy =
      pending.kind === "attack" && pending.enemyId
        ? session.state.armies.find((a) => a.id === pending.enemyId)
        : this.armyAt(pending.dest.x, pending.dest.y, army.id, army);
    this.commitMarch(army, found, pending.kind === "attack", enemy);
  }

  private commitMarch(player: Army, found: FoundPath, attack: boolean, enemy: Army | undefined): void {
    const total = found.costs[found.costs.length - 1] ?? 0;
    const dest = found.path[found.path.length - 1];
    if (total <= player.movesLeft) {
      player.movesLeft -= total;
      this.beginMarch(player, found.path, () => {
        if (attack && enemy && canArmiesEngage(session.state, player, enemy)) {
          this.armyGoals.delete(player.id);
          this.startBattle(player.id, enemy.id);
        } else {
          this.finishPlayerArrival(player, dest.x, dest.y, enemy);
        }
      });
      return;
    }

    const walkPath = attack ? found.path.slice(0, -1) : found.path;
    const walkCosts = attack ? found.costs.slice(0, -1) : found.costs;
    const slice = slicePathThisTurn(walkPath, walkCosts, player.movesLeft);
    if (!slice) {
      session.state.lastMessage = "Не хватает шагов до следующей клетки. Путь сохранён.";
      this.refreshUi();
      return;
    }
    const spent = walkCosts[slice.length - 1] ?? 0;
    player.movesLeft -= spent;
    const stop = slice[slice.length - 1];
    this.beginMarch(player, slice, () => {
      this.finishPlayerArrival(player, stop.x, stop.y, this.armyAt(stop.x, stop.y, player.id, player));
    });
  }

  private syncSelectedGoal(): void {
    const army = this.selectedPlayerArmy();
    if (!army) {
      this.pendingOrder = null;
      return;
    }
    const goal = this.armyGoals.get(army.id);
    if (!goal) {
      this.pendingOrder = null;
      return;
    }
    if (army.x === goal.dest.x && army.y === goal.dest.y) {
      this.armyGoals.delete(army.id);
      this.pendingOrder = null;
      return;
    }
    let kind = goal.kind;
    let enemyId = goal.enemyId;
    if (kind === "attack") {
      const enemy = enemyId
        ? session.state.armies.find((a) => a.id === enemyId)
        : this.armyAt(goal.dest.x, goal.dest.y, army.id, army);
      if (
        !enemy ||
        enemy.isPlayer ||
        livingUnits(enemy).length === 0 ||
        !canArmiesEngage(session.state, army, enemy)
      ) {
        kind = "move";
        enemyId = undefined;
        this.armyGoals.set(army.id, { dest: goal.dest, kind, enemyId });
      }
    }
    const found = this.pathAny(army, goal.dest.x, goal.dest.y, kind === "attack");
    if (!found || found.path.length < 2) {
      this.pendingOrder = null;
      return;
    }
    this.pendingOrder = {
      armyId: army.id,
      dest: goal.dest,
      kind,
      enemyId,
      path: found.path,
      costs: found.costs,
      movesLeft: army.movesLeft,
      maxMoves: armyMaxMoves(army),
    };
  }

  private pathGoalMessage(): string {
    const pending = this.pendingOrder;
    if (!pending) return "";
    const total = pending.costs[pending.costs.length - 1] ?? 0;
    const turns = turnsToReach(total, pending.movesLeft, pending.maxMoves);
    const hod = `${turns} ${hodWord(turns)}`;
    return pending.kind === "attack" ? `Цель: ${hod}` : `Путь: ${hod}`;
  }

  private hasSelectedGoal(): boolean {
    const army = this.selectedPlayerArmy();
    return !!army && this.armyGoals.has(army.id);
  }

  private clearSelectedGoal(): boolean {
    const army = this.selectedPlayerArmy();
    const had = !!army && this.armyGoals.delete(army.id);
    this.pendingOrder = null;
    this.pathFlagsGfx?.clear();
    this.pathTurnsText?.setVisible(false);
    return had;
  }

  private hidePathFlags(): void {
    this.pathFlagsGfx?.clear();
    this.pathTurnsText?.setVisible(false);
  }

  private drawPathFlags(): void {
    if (!this.pathFlagsGfx) return;
    if (this.movementBusy) {
      this.hidePathFlags();
      return;
    }
    paintPathFlags(this.pathFlagsGfx, this.pathTurnsText, this.pendingOrder, isoTop, isoCenter);
  }

  private pathAny(army: Army, x: number, y: number, allowTargetArmy: boolean): FoundPath | null {
    const blocked = (px: number, py: number) =>
      !(allowTargetArmy && px === x && py === y) && !!this.armyAt(px, py, army.id, army);
    return findPathAny(this.map, army.x, army.y, x, y, COLS, ROWS, blocked, Number.POSITIVE_INFINITY, this.tileStepCost);
  }

  private tileStepCost = (x: number, y: number, terrain: Terrain): number => {
    const step = hasRailAt(session.state, x, y) ? 1 : terrainMoveCost(terrain);
    return step + bloodMovePenalty(session.state, x, y);
  };

  private stepDuration(cell: GridPos): number {
    const terrain = this.map[cell.y]?.[cell.x];
    return terrain === "forest" || terrain === "ditch" || terrain === "trench" ? 360 : 260;
  }

  private beginMarch(army: Army, path: GridPos[], then: () => void): void {
    const dest = path[path.length - 1];
    const finish = () => {
      if (dest) {
        army.x = dest.x;
        army.y = dest.y;
      }
      this.stopArmyFollow();
      this.movementBusy = false;
      then();
    };

    if (!dest || path.length <= 1 || !this.armyLayer.hasMarker(army.id)) {
      finish();
      return;
    }

    this.movementBusy = true;
    this.hidePathFlags();
    this.reachables.clear();
    this.redrawTerrain();
    this.drawArmies();
    const follow = army.isPlayer && army.id === session.state.selectedArmyId;
    if (follow) this.followArmyMarker(army.id);
    this.armyLayer.marchAlongPath({
      armyId: army.id,
      path,
      isoCenter,
      stepMs: (cell) => this.stepDuration(cell),
      onStepEnd: (cell) => {
        army.x = cell.x;
        army.y = cell.y;
        this.refreshFog();
        this.redrawTerrain();
        this.drawArmies();
        this.refreshUi();
      },
      onComplete: finish,
    });
  }

  private finishPlayerArrival(player: Army, x: number, y: number, enemy: Army | undefined): void {
    if (enemy && !enemy.isPlayer && canArmiesEngage(session.state, player, enemy)) {
      this.startBattle(player.id, enemy.id);
      return;
    }

    const grave = graveAt(session.state, x, y);
    if (isNight(session.state)) {
      if (grave && isVeilActor(player)) {
        const check = canResurrectGrave(session.state, player, grave);
        session.state.lastMessage = check.ok
          ? "Могила здесь — R, чтобы воскресить"
          : check.reason;
      } else if (canLookRuins(session.state, player).ok) {
        session.state.lastMessage = "Память руин — кликните, чтобы глядеть";
      } else if (canRequiem(session.state, player).ok) {
        session.state.lastMessage = "Кровь — кликните, чтобы отпеть";
      } else if (canPray(session.state, player).ok) {
        session.state.lastMessage = "Храм — C или клик по городу: ритуалы";
      }
      this.redraw(true);
      return;
    }

    if (grave && isVeilActor(player)) {
      const check = canResurrectGrave(session.state, player, grave);
      if (check.ok) {
        session.state.lastMessage = "Могила здесь — R, чтобы воскресить";
      } else {
        session.state.lastMessage = `${check.reason}. Подъём — ночью.`;
      }
    }

    const city = cityAt(session.state, x, y);
    let captured: typeof city | undefined;
    if (city && !isOwnedCity(city.faction) && !enemy) {
      if (canWalkCaptureCity(session.state, city)) {
        const wasNeutral = city.faction === null;
        const prev = city.faction;
        captureCity(city, playerFactionOf(session.state));
        captured = city;
        session.state.lastMessage = wasNeutral
          ? `Захвачен ${city.name}!`
          : prev === "cossack" || prev === "highlander"
            ? `Союз / захват: ${city.name} (${prev === "cossack" ? "казаки" : "горцы"})`
            : `Освобождён ${city.name} от Ordo Lumen!`;
      } else {
        session.state.lastMessage = walkCaptureBlockMessage(city);
      }
    }

    const site = siteAt(session.state, x, y);
    if (site) {
      const result = visitSite(session.state, site, player.hero, playerFactionOf(session.state));
      session.state.lastMessage = result.message;
      if (result.remove) {
        session.state.sites = session.state.sites.filter((s) => s.id !== site.id);
      } else if (
        isHarvestSite(site.kind) &&
        site.owner === playerFactionOf(session.state) &&
        !harvestSiteOnNetwork(session.state, site, playerFactionOf(session.state))
      ) {
        session.state.lastMessage = `${result.message} · ветка до города — полный доход`;
      }
    }

    this.redraw(true);
    const pathMsg = this.pathGoalMessage();
    if (pathMsg && !captured && !site) {
      session.state.lastMessage = `${pathMsg} — Продолжить путь`;
      this.refreshUi();
    }
    const events: PlotFireEvent[] = [
      { type: "tile", x, y, mapId: session.state.currentMapId },
    ];
    if (captured) {
      events.push({
        type: "city_captured",
        cityId: captured.id,
        mapId: session.state.currentMapId,
      });
    }
    this.playPlotEvents(events, () => {
      if (captured) {
        this.cityUi.show(player, captured);
      } else if (city && isOwnedCity(city.faction) && !enemy) {
        this.cityUi.show(player, city);
      }
      this.applyMissionCheck();
    });
  }

  /** Map objective met → plot (if any) → next mission map, or scenario victory / defeat. */
  private applyMissionCheck(): boolean {
    if (this.plotBusy) return false;
    if (session.state.gameOver === "victory" || session.state.gameOver === "defeat") {
      this.showGameOver(session.state.gameOver);
      return true;
    }
    if (checkDefeat(session.state)) {
      session.state.gameOver = "defeat";
      this.showGameOver("defeat");
      return true;
    }
    const scenario = getScenario(session.state.scenarioId);
    if (!scenario || !isMapObjectiveComplete(session.state, scenario)) return false;

    const winSeqs = collectPendingPlot(scenario, session.state, [
      { type: "map_win", mapId: session.state.currentMapId },
    ]);
    if (winSeqs.length) {
      this.playSequences(winSeqs, () => {
        this.finishMissionAdvance();
      });
      return true;
    }
    return this.finishMissionAdvance();
  }

  private finishMissionAdvance(): boolean {
    const outcome = resolveMissionOutcome(session.state);
    if (outcome === "next_map") {
      this.scene.start("World");
      return true;
    }
    if (outcome === "victory" || outcome === "defeat") {
      this.showGameOver(outcome);
      return true;
    }
    return false;
  }

  private playPlotEvents(events: PlotFireEvent[], then?: () => void): void {
    const scenario = getScenario(session.state.scenarioId);
    if (!scenario) {
      then?.();
      return;
    }
    this.playSequences(collectPendingPlot(scenario, session.state, events), then);
  }

  private playSequences(seqs: PlotSequence[], then?: () => void): void {
    if (!seqs.length) {
      then?.();
      return;
    }
    markPlotFired(session.state, seqs);
    this.plotBusy = true;
    this.plotPlayer.play(seqs, {
      applyWorldEffects: true,
      onCamera: (x, y) => this.centerCameraOnTile(x, y),
      onMessage: () => this.refreshUi(),
      onGrantApplied: () => this.refreshUi(),
      onComplete: () => {
        this.plotBusy = false;
        then?.();
      },
    });
  }

  private centerCameraOnTile(x: number, y: number): void {
    const { cx, cy } = isoCenter(x, y);
    const look = this.cameraLookAt(cx, cy);
    this.cameras.main.pan(look.x, look.y, 480, "Sine.easeInOut");
  }

  private startBattle(playerArmyId: string, enemyArmyId: string) {
    const player = session.state.armies.find((a) => a.id === playerArmyId);
    const enemy = session.state.armies.find((a) => a.id === enemyArmyId);
    if (!player || !enemy) return;
    if (!canArmiesEngage(session.state, player, enemy)) {
      session.state.lastMessage = "Дневной и ночной отряд не сходятся";
      this.refreshUi();
      return;
    }
    const city = cityAt(session.state, enemy.x, enemy.y);
    const siege = !enemy.isNeutral && !!city && city.faction === enemy.faction;
    this.scene.start("Battle", { playerArmyId, enemyArmyId, siege });
  }

  private endTurn() {
    if (session.state.gameOver || this.plotBusy || this.movementBusy) return;

    if (isDay(session.state)) {
      beginNight(session.state);
      this.atmosphere.setNight(true);
      this.redraw(false);
      return;
    }

    const bloodMsg = enemyNightCollectBlood(session.state);
    const dawnMsg = this.applyDawn(bloodMsg);
    this.movementBusy = true;
    this.moveEnemies(() => {
      this.movementBusy = false;
      this.refreshFog();
      this.refreshReachables();
      this.syncSelectedGoal();
      this.drawMap();
      this.drawArmies();
      this.drawPathFlags();
      const pathMsg = this.pathGoalMessage();
      if (pathMsg) session.state.lastMessage = `${dawnMsg} · ${pathMsg}`;
      this.refreshUi();

      if (session.state.gameOver === "defeat") {
        this.showGameOver("defeat");
        return;
      }

      this.playPlotEvents(
        [{ type: "turn", turn: session.state.turn, mapId: session.state.currentMapId }],
        () => {
          this.applyMissionCheck();
        },
      );
    });
  }

  private applyDawn(extraMsg = ""): string {
    session.state.turn += 1;
    const veil = applyDawnVeil(session.state, COLS, ROWS);
    const income = collectIncome(session.state);
    let msg = `Рассвет. Доход: +${income.gold}з, +${income.mana}м, +${income.people}л`;
    if (income.coal) msg += `, +${income.coal}у`;
    if (income.steel) msg += `, +${income.steel}ст`;
    if (veil) msg += ` · ${veil}`;
    if (extraMsg) msg += ` · ${extraMsg}`;

    for (const army of session.state.armies) {
      if (!army.isPlayer) continue;
      if (army.isNightHero) {
        army.movesLeft = 0;
        continue;
      }
      army.movesLeft = armyMaxMoves(army) + consumePrayerAp(session.state, army);
      const city = cityAt(session.state, army.x, army.y, army.mapId);
      if (city && isOwnedCity(city.faction)) {
        session.state.mana += 8;
        msg += ` · ${army.hero.name} +8 маны`;
        const healed = passiveTempleHeal(army, city);
        if (healed > 0) msg += ` · храм +${healed} HP`;
      }
    }
    session.state.prayedArmyIds = [];

    const spawnMsg = maybeSpawnOrdoPatrol(session.state);
    if (spawnMsg) msg = spawnMsg;

    session.state.lastMessage = msg;
    this.atmosphere.setNight(false);
    this.redraw(false);
    return msg;
  }

  private moveEnemies(then: () => void): void {
    const player = session.state.armies.find(
      (a) =>
        a.isPlayer &&
        a.mapId === session.state.currentMapId &&
        livingUnits(a).length > 0 &&
        armyPresentNow(session.state, a) &&
        !a.isNightHero,
    );
    if (!player) {
      then();
      return;
    }

    const enemies = session.state.armies.filter(
      (enemy) =>
        enemy.mapId === session.state.currentMapId &&
        !enemy.isPlayer &&
        !enemy.isNeutral &&
        livingUnits(enemy).length > 0 &&
        armyPresentNow(session.state, enemy),
    );

    const stepEnemy = (i: number): void => {
      if (i >= enemies.length) {
        then();
        return;
      }
      const enemy = enemies[i];
      if (livingUnits(enemy).length === 0) {
        stepEnemy(i + 1);
        return;
      }
      if (!this.visible[enemy.y]?.[enemy.x] && dist(enemy.x, enemy.y, player.x, player.y) > 5) {
        stepEnemy(i + 1);
        return;
      }

      enemy.movesLeft = 2;
      if (dist(enemy.x, enemy.y, player.x, player.y) <= 1) {
        if (canArmiesEngage(session.state, player, enemy)) {
          this.startBattle(player.id, enemy.id);
          return;
        }
        stepEnemy(i + 1);
        return;
      }

      const dx = Math.sign(player.x - enemy.x);
      const dy = Math.sign(player.y - enemy.y);
      const nx = enemy.x + (dx !== 0 ? dx : 0);
      const ny = enemy.y + (dx === 0 ? dy : 0);
      const canStep =
        nx >= 0 &&
        ny >= 0 &&
        nx < COLS &&
        ny < ROWS &&
        !isBlockedTerrain(this.map[ny][nx]) &&
        !this.armyAt(nx, ny, enemy.id, enemy);

      if (!canStep) {
        stepEnemy(i + 1);
        return;
      }

      const applyArrival = (): void => {
        enemy.x = nx;
        enemy.y = ny;

        const city = cityAt(session.state, enemy.x, enemy.y);
        if (city && isOwnedCity(city.faction)) {
          captureCity(city, "ordo");
          session.state.lastMessage = `${city.name} пал под Рейхом — мир на чужих условиях!`;
          if (city.isCapital) {
            session.state.gameOver = "defeat";
          }
        }

        const site = siteAt(session.state, enemy.x, enemy.y);
        if (site && captureSite(site, enemy.faction)) {
          session.state.lastMessage = `${SITE_LABEL[site.kind]} захвачена ${
            enemy.faction === "ordo" ? "Ordo Lumen" : "врагом"
          }!`;
        }

        if (enemy.x === player.x && enemy.y === player.y) {
          this.startBattle(player.id, enemy.id);
          return;
        }
        stepEnemy(i + 1);
      };

      const from = { x: enemy.x, y: enemy.y };
      const dest = { x: nx, y: ny };
      const inView = !!this.visible[from.y]?.[from.x] || !!this.visible[dest.y]?.[dest.x];
      if (!inView) {
        applyArrival();
        return;
      }

      this.armyLayer.ensureMarker(enemy, session.state.selectedArmyId, isoCenter);
      this.armyLayer.marchAlongPath({
        armyId: enemy.id,
        path: [from, { x: nx, y: ny }],
        isoCenter,
        stepMs: (cell) => this.stepDuration(cell),
        onStepEnd: (cell) => {
          enemy.x = cell.x;
          enemy.y = cell.y;
          this.refreshFog();
          this.redrawTerrain();
          this.drawArmies();
        },
        onComplete: applyArrival,
      });
    };

    stepEnemy(0);
  }

  private cityContext(): { army: Army | null; city: NonNullable<ReturnType<typeof cityAt>> } | null {
    const army = this.selectedPlayerArmy();
    if (army) {
      const underfoot = cityAt(session.state, army.x, army.y, army.mapId);
      if (underfoot && isOwnedCity(underfoot.faction)) {
        return { army, city: underfoot };
      }
      // On a foreign/neutral city — don't remote-open another town
      if (underfoot) return null;
    }

    const owned = session.state.cities.filter(
      (c) => isOwnedCity(c.faction) && c.mapId === session.state.currentMapId,
    );
    if (owned.length === 0) return null;

    const capital = owned.find((c) => c.isCapital);
    return { army: null, city: capital ?? owned[0] };
  }

  private modalOpen(): boolean {
    return (
      this.cityUi.isOpen() ||
      this.inventoryUi.isOpen() ||
      this.plotPlayer.isPlaying() ||
      this.hud.settingsOpen() ||
      this.hud.mapOpen()
    );
  }

  private toggleInventory() {
    this.hud.hideMap();
    this.hud.hideSettings();
    if (this.cityUi.isOpen()) this.cityUi.hide();
    this.inventoryUi.toggle();
  }

  private toggleCityPanel() {
    this.hud.hideMap();
    this.hud.hideSettings();
    if (this.inventoryUi.isOpen()) this.inventoryUi.hide();
    const ctx = this.cityContext();
    if (!ctx?.city) {
      const army = this.selectedPlayerArmy();
      const underfoot = army ? cityAt(session.state, army.x, army.y, army.mapId) : undefined;
      if (underfoot && !isOwnedCity(underfoot.faction)) {
        session.state.lastMessage = `${underfoot.name} ещё не ваш — зайдите на клетку города`;
      } else {
        session.state.lastMessage = "Нет своих городов";
      }
      this.refreshUi();
      return;
    }
    this.cityUi.toggle(ctx.army, ctx.city);
  }

  private switchArmy() {
    const players = session.state.armies.filter(
      (a) =>
        a.isPlayer &&
        !a.isNeutral &&
        a.mapId === session.state.currentMapId &&
        livingUnits(a).length > 0,
    );
    if (players.length <= 1) return;
    const idx = players.findIndex((a) => a.id === session.state.selectedArmyId);
    const next = players[(idx + 1) % players.length];
    session.state.selectedArmyId = next.id;
    session.state.lastMessage = `Выбран ${next.hero.name}`;
    this.redraw();
  }

  private showGameOver(result: "victory" | "defeat") {
    showGameOverOverlay(this, result, this.overlayGfx);
  }

  private redraw(keepCamera = false) {
    this.refreshFog();
    this.refreshReachables();
    this.syncSelectedGoal();
    this.drawMap();
    this.drawArmies();
    this.drawPathFlags();
    this.refreshUi();
    this.syncCityUiWithHeroPosition();
    if (!keepCamera) this.centerCameraOnSelectedHero();
  }

  private layoutWorld() {
    const { w, h } = viewSize(this);
    setMapGeometry(COLS, ROWS, w, h);
    this.hud.layout(w, h);
    this.cityUi.layout();
    this.inventoryUi.layout();
    this.armyInspect.layout();
    this.screenFrame?.setChrome(this.hud.charcoalChrome(w, h));
    this.screenFrame?.layout();
    this.setupCameraBounds();
    layoutMapVoid(this, this.mapVoid);
    layoutMapVoidLid(this, this.mapVoidLid, COLS, ROWS, OX, OY);
    this.atmosphere.layout(COLS, ROWS, OX, OY);
    this.syncSelectedGoal();
    this.drawMap();
    this.drawArmies();
    this.drawPathFlags();
    if (this.armyLayer.isMarching()) {
      this.armyLayer.relayout(isoCenter);
    } else {
      this.centerCameraOnSelectedHero();
    }
    this.refreshUi();
  }

  private toggleSquadPanel() {
    const army = this.selectedPlayerArmy();
    if (!army) {
      session.state.lastMessage = "Выберите отряд";
      this.refreshUi();
      return;
    }
    this.hud.hideSettings();
    this.armyInspect.togglePinned(army);
  }

  private toggleSettings() {
    if (this.hud.settingsOpen()) {
      this.hud.hideSettings();
      return;
    }
    this.hud.hideMap();
    this.armyInspect.hide();
    this.cityUi.hide();
    this.inventoryUi.hide();
    this.hud.settings.show();
  }

  /** Cycle hero class at level 1 (click name / hotkey H). */
  cycleSelectedHeroClass(): void {
    const army = this.selectedPlayerArmy();
    if (!army || army.isMissionary || army.isNightHero) return;
    if (!canRespecClass(army.hero)) {
      session.state.lastMessage = "Класс меняется только на 1 ур. без опыта";
      this.refreshUi();
      return;
    }
    const next = cycleHeroClass(army.hero);
    session.state.lastMessage = `Класс: ${classLabel(army.hero)} (${next})`;
    this.refreshUi();
  }

  /** Raise the grave under the selected veil actor (hotkey R). */
  private raiseGraveAtSelected(): void {
    const army = this.selectedPlayerArmy();
    if (!army) {
      session.state.lastMessage = "Выберите Арсения или миссионера";
      this.refreshUi();
      return;
    }
    const grave = graveAt(session.state, army.x, army.y, army.mapId);
    if (!grave) {
      session.state.lastMessage = "Здесь нет могилы";
      this.refreshUi();
      return;
    }
    const result = resurrectGrave(session.state, army, grave);
    session.state.lastMessage = result.ok ? "Воскрешён отряд: могила снята" : result.reason;
    this.redraw();
    if (result.ok) this.applyMissionCheck();
  }

  private refreshUi() {
    const army = this.selectedPlayerArmy();
    const scenario = getScenario(session.state.scenarioId);
    const mapDef = getMapDef(scenario!, session.state.currentMapId);
    const mapIdx = scenario ? scenario.maps.findIndex((m) => m.id === session.state.currentMapId) + 1 : 0;
    const mapTotal = scenario?.maps.length ?? 1;
    this.hud.refresh({
      army,
      turn: session.state.turn,
      gold: session.state.gold,
      mana: session.state.mana,
      people: session.state.people,
      coal: session.state.coal,
      steel: session.state.steel,
      lastMessage: session.state.lastMessage,
      canContinuePath: this.hasSelectedGoal() && !this.movementBusy,
      railMode: this.railMode,
      mapTitle: `${scenario?.name ?? ""} · ${mapDef?.name ?? session.state.currentMapId} (${mapIdx}/${mapTotal})`,
      objective: scenario && mapDef ? `Цель: ${missionObjectiveText(scenario, mapDef)}` : "",
      map: this.map,
      fog: this.fog(),
      visible: this.visible,
      cols: COLS,
      rows: ROWS,
    });
  }
}
