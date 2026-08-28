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
import { currentDiscovered, livingUnits, session, armyMaxMoves, type Army } from "../game/data";
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
import { captureSite, siteAt, SITE_LABEL, visitSite } from "../game/sites";
import { canResurrectGrave, graveAt, resurrectGrave } from "../game/graves";
import {
  computeReachable,
  findPath,
  getPlayerArmyPositions,
  isBlockedTerrain,
  resetVisibility,
  updateFog,
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
import { createMapVoid, layoutMapVoid } from "../ui/mapVoid";
import { usePotionOnArmy } from "../game/items";
import { playerFactionOf } from "../game/playerFaction";
import { classLabel, canRespecClass, cycleHeroClass } from "../game/heroClasses";
import { onViewResize, viewSize } from "../ui/viewport";
import { showGameOverOverlay, worldGutterW, WorldHud } from "../ui/worldHud";
import { ArmyMapLayer } from "./world/armyMapLayer";
import { MapAtmosphere } from "./world/mapAtmosphere";
import { paintCityMarkers, paintGraveMarkers, paintSiteMarkers } from "./world/mapMarkers";
import { paintPathFlags, type PendingPathOrder } from "./world/pathFlags";

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
  private plotPlayer!: PlotPlayer;
  private plotBusy = false;
  private movementBusy = false;
  private armyLayer!: ArmyMapLayer;
  private atmosphere!: MapAtmosphere;
  private pathFlagsGfx!: Phaser.GameObjects.Graphics;
  private pendingOrder: PendingPathOrder | null = null;

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
    if (!session.state.discoveredByMap[mapDef.id]) {
      session.state.discoveredByMap[mapDef.id] = Array.from({ length: ROWS }, () =>
        Array.from({ length: COLS }, () => false),
      );
    }

    // Keep selection on a living player army on this map
    const local = session.state.armies.find(
      (a) => a.isPlayer && a.mapId === session.state.currentMapId && livingUnits(a).length > 0,
    );
    if (local) session.state.selectedArmyId = local.id;
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

    this.loadActiveMap();

    this.cameras.main.setBackgroundColor(0x0a0a0a);
    this.mapVoid = createMapVoid(this);
    this.terrainLayer = new TerrainLayer(this);
    this.tileGfx = this.add.graphics().setDepth(3);
    this.armyGfx = this.add.graphics().setDepth(6.5);
    this.overlayGfx = this.add.graphics().setDepth(8).setScrollFactor(0);
    this.pathFlagsGfx = this.add.graphics().setDepth(7.85);
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
      if (!this.modalOpen() && !this.movementBusy) this.endTurn();
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
      if (this.pendingOrder) {
        this.clearPendingOrder();
        this.refreshUi();
      }
    });

    this.input.keyboard?.on("keydown-TAB", (ev: KeyboardEvent) => {
      ev.preventDefault();
      if (!this.modalOpen() && !this.movementBusy) this.switchArmy();
    });

    this.input.keyboard?.on("keydown-R", () => {
      if (session.state.gameOver) this.restartGame();
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

  private key(x: number, y: number) {
    return `${x},${y}`;
  }

  private redrawTerrain() {
    this.terrainLayer.redraw({
      map: this.map,
      ox: OX,
      oy: OY,
      discovered: this.fog(),
      visible: this.visible,
      reachables: this.reachables,
    });
  }

  private drawMap() {
    this.redrawTerrain();

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
      isoCenter,
    });
  }

  private refreshReachables() {
    this.reachables.clear();
    const army = this.selectedPlayerArmy();
    if (!army || army.movesLeft <= 0 || session.state.gameOver) return;

    const blocked = (x: number, y: number) => !!this.armyAt(x, y, army.id);
    const map = computeReachable(
      this.map,
      army.x,
      army.y,
      army.movesLeft,
      COLS,
      ROWS,
      blocked,
    );
    for (const [k, v] of map) {
      this.reachables.set(k, v.cost);
    }
  }

  private armyAt(x: number, y: number, exceptId?: string): Army | undefined {
    return session.state.armies.find(
      (a) =>
        a.mapId === session.state.currentMapId &&
        a.x === x &&
        a.y === y &&
        a.id !== exceptId &&
        livingUnits(a).length > 0,
    );
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

  private attackCostTo(army: Army, targetX: number, targetY: number): number | undefined {
    const blocked = (x: number, y: number) =>
      !(x === targetX && y === targetY) && !!this.armyAt(x, y, army.id);
    const map = computeReachable(
      this.map,
      army.x,
      army.y,
      army.movesLeft,
      COLS,
      ROWS,
      blocked,
    );
    return map.get(this.key(targetX, targetY))?.cost;
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
    const actionable = (c: Cand) => {
      if (this.armyAt(c.x, c.y)) return true;
      if (this.reachables.has(this.key(c.x, c.y))) return true;
      const player = this.selectedPlayerArmy();
      return !!player && c.x === player.x && c.y === player.y;
    };
    const front = cands[0];
    if (actionable(front)) return { gx: front.x, gy: front.y };
    const act = cands.find(actionable);
    if (act) return { gx: act.x, gy: act.y };
    return { gx: front.x, gy: front.y };
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

  private onTileClick(x: number, y: number) {
    if (this.movementBusy || this.plotBusy) return;

    const enemy = this.armyAt(x, y);
    const player = this.selectedPlayerArmy();
    const grave = graveAt(session.state, x, y);

    if (grave && player?.isMissionary) {
      const result = resurrectGrave(session.state, player, grave);
      session.state.lastMessage = result.ok
        ? `Воскрешён отряд: могила снята`
        : result.reason;
      this.redraw();
      this.applyMissionCheck();
      return;
    }

    if (grave && !player) {
      session.state.lastMessage = "Могила отряда. Наймите миссионера в городе.";
      this.refreshUi();
      return;
    }

    if (enemy && !enemy.isPlayer && player) {
      if (player.isMissionary) {
        session.state.lastMessage = "Миссионер не вступает в бой";
        this.refreshUi();
        return;
      }
      const cost = this.attackCostTo(player, x, y);
      if (cost !== undefined && cost > 0) {
        const path = this.pathFor(player, x, y, true);
        if (!path) return;
        if (!this.armOrConfirm(player, x, y, "attack", path)) return;
        player.movesLeft -= cost;
        this.beginMarch(player, path, () => {
          this.startBattle(player.id, enemy.id);
        });
        return;
      }
    }

    if (enemy?.isPlayer) {
      this.clearPendingOrder();
      session.state.selectedArmyId = enemy.id;
      this.redraw();
      return;
    }

    if (!player) return;

    // Enter own city while standing on it (works even with 0 moves left)
    if (x === player.x && y === player.y) {
      this.clearPendingOrder();
      const here = cityAt(session.state, x, y);
      if (here && isOwnedCity(here.faction)) {
        this.cityUi.show(player, here);
        return;
      }
      if (!here && !enemy) {
        session.state.lastMessage = "Здесь нет города — ищите круглый маркер с названием";
        this.refreshUi();
        return;
      }
    }

    const moveCost = this.reachables.get(this.key(x, y));
    if (moveCost === undefined) {
      this.clearPendingOrder();
      this.refreshUi();
      return;
    }

    const path = this.pathFor(player, x, y, false);
    if (!path) return;
    if (!this.armOrConfirm(player, x, y, "move", path)) return;
    player.movesLeft -= moveCost;
    this.beginMarch(player, path, () => {
      this.finishPlayerArrival(player, x, y, enemy);
    });
  }

  /** First click plants flags; second click on the same dest commits. */
  private armOrConfirm(
    army: Army,
    x: number,
    y: number,
    kind: PendingPathOrder["kind"],
    path: GridPos[],
  ): boolean {
    const same =
      this.pendingOrder?.armyId === army.id &&
      this.pendingOrder.kind === kind &&
      this.pendingOrder.dest.x === x &&
      this.pendingOrder.dest.y === y;
    if (same) {
      this.clearPendingOrder();
      return true;
    }
    this.pendingOrder = { armyId: army.id, dest: { x, y }, kind, path };
    this.drawPathFlags();
    session.state.lastMessage =
      kind === "attack"
        ? "Цель отмечена — кликните ещё раз, чтобы атаковать"
        : "Путь отмечен — кликните ещё раз, чтобы идти";
    this.refreshUi();
    return false;
  }

  private clearPendingOrder(): void {
    this.pendingOrder = null;
    this.pathFlagsGfx?.clear();
  }

  private drawPathFlags(): void {
    if (!this.pathFlagsGfx) return;
    if (this.pendingOrder && this.pendingOrder.armyId !== session.state.selectedArmyId) {
      this.clearPendingOrder();
      return;
    }
    paintPathFlags(this.pathFlagsGfx, this.pendingOrder, isoTop, isoCenter);
  }

  private pathFor(army: Army, x: number, y: number, allowTargetArmy: boolean): GridPos[] | null {
    const blocked = (px: number, py: number) =>
      !(allowTargetArmy && px === x && py === y) && !!this.armyAt(px, py, army.id);
    return findPath(this.map, army.x, army.y, x, y, army.movesLeft, COLS, ROWS, blocked);
  }

  private stepDuration(cell: GridPos): number {
    return this.map[cell.y]?.[cell.x] === "forest" ? 360 : 260;
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
    this.clearPendingOrder();
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
    const grave = graveAt(session.state, x, y);
    if (grave && player.isMissionary) {
      const check = canResurrectGrave(session.state, player, grave);
      if (check.ok) {
        session.state.lastMessage = "Могила здесь — кликните ещё раз, чтобы воскресить";
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
      }
    }

    this.redraw(true);
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
    const enemy = session.state.armies.find((a) => a.id === enemyArmyId)!;
    const city = cityAt(session.state, enemy.x, enemy.y);
    const siege = !enemy.isNeutral && !!city && city.faction === enemy.faction;
    this.scene.start("Battle", { playerArmyId, enemyArmyId, siege });
  }

  private endTurn() {
    if (session.state.gameOver || this.plotBusy || this.movementBusy) return;
    this.clearPendingOrder();

    session.state.turn += 1;
    const income = collectIncome(session.state);
    let msg = `Доход: +${income.gold}з, +${income.mana}м, +${income.people}л`;
    if (income.coal) msg += `, +${income.coal}у`;
    if (income.steel) msg += `, +${income.steel}ст`;

    for (const army of session.state.armies) {
      if (!army.isPlayer) continue;
      army.movesLeft = armyMaxMoves(army);
      const city = cityAt(session.state, army.x, army.y, army.mapId);
      if (city && isOwnedCity(city.faction)) {
        session.state.mana += 8;
        msg += ` · ${army.hero.name} +8 маны`;
        const healed = passiveTempleHeal(army, city);
        if (healed > 0) msg += ` · храм +${healed} HP`;
      }
    }

    const spawnMsg = maybeSpawnOrdoPatrol(session.state);
    if (spawnMsg) msg = spawnMsg;

    session.state.lastMessage = msg;
    this.refreshUi();

    this.movementBusy = true;
    this.moveEnemies(() => {
      this.movementBusy = false;
      this.refreshFog();
      this.refreshReachables();
      this.drawMap();
      this.drawArmies();
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

  private moveEnemies(then: () => void): void {
    const player = session.state.armies.find(
      (a) => a.isPlayer && a.mapId === session.state.currentMapId && livingUnits(a).length > 0,
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
        livingUnits(enemy).length > 0,
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
        this.startBattle(player.id, enemy.id);
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
        !this.armyAt(nx, ny, enemy.id);

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
          session.state.lastMessage = `${city.name} пал под Pax — мир на чужих условиях!`;
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
      const animate =
        !!this.visible[enemy.y]?.[enemy.x] && this.armyLayer.hasMarker(enemy.id);
      if (!animate) {
        applyArrival();
        return;
      }

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
    this.clearPendingOrder();
    this.redraw();
  }

  private showGameOver(result: "victory" | "defeat") {
    showGameOverOverlay(this, result, this.overlayGfx);
  }

  private redraw(keepCamera = false) {
    this.refreshFog();
    this.refreshReachables();
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
    this.atmosphere.layout(COLS, ROWS, OX, OY);
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
    if (!army || army.isMissionary) return;
    if (!canRespecClass(army.hero)) {
      session.state.lastMessage = "Класс меняется только на 1 ур. без опыта";
      this.refreshUi();
      return;
    }
    const next = cycleHeroClass(army.hero);
    session.state.lastMessage = `Класс: ${classLabel(army.hero)} (${next})`;
    this.refreshUi();
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
