import Phaser from "phaser";
import type { FactionId } from "../game/data";
import { RI_FIELD_KHAKI } from "../game/factionVisual";
import {
  computeIsoOrigin,
  isoCenter,
  screenToGrid,
  TERRAIN_LABEL,
} from "../game/iso";
import { TerrainLayer } from "../game/terrainLayer";
import { WORLD_ASSETS, attachOptionalLoadPump, queueAssetPack } from "../game/assetPacks";
import {
  createEmptyMap,
  createEmptyScenario,
  downloadScenarioJson,
  getScenario,
  isBuiltinScenario,
  materializeScenario,
  pickScenarioJsonFile,
  registerScenario,
  resolveMapTerrain,
  resizeMapTerrain,
  type MapDef,
  type PlotSequence,
  type ScenarioDef,
} from "../game/scenario";
import { playScenario } from "../game/session";
import { SITE_COLOR, SITE_KINDS, SITE_LABEL, type SiteKind } from "../game/sites";
import type { Terrain } from "../game/world";
import type { ArmySpawn, CitySpawn } from "../game/scenario/types";
import { onViewResize, viewH, viewW } from "../ui/viewport";
import { ScreenCharcoalFrame, type CharcoalChrome } from "../ui/screenCharcoalFrame";
import { createMapVoid, layoutMapVoid } from "../ui/mapVoid";
import { PlotConstructor, PLOT_PANEL_W } from "../ui/PlotConstructor";
import { PlotPlayer } from "../ui/PlotPlayer";
import { stampMapToken } from "./world/mapMarkers";
import {
  MAP_ARMY_HEIGHT,
  MAP_SITE_HEIGHT,
  armyMapTokenKey,
  cityMapTokenHeight,
  cityMapTokenKey,
  siteMapTokenKey,
} from "../game/mapTokens";

type Tool = "terrain" | "city" | "site" | "army" | "erase" | "select";

const TERRAINS: Terrain[] = ["grass", "forest", "road", "water", "mountain", "mountain_foot"];
const FACTIONS: (FactionId | null)[] = [
  "ri",
  "ordo",
  "risen",
  "cossack",
  "highlander",
  "neutral",
  null,
];

const FACTION_COLOR: Record<string, number> = {
  ri: RI_FIELD_KHAKI,
  ordo: 0x3a4a5c,
  risen: 0x7a4a8a,
  cossack: 0x6a5a30,
  highlander: 0x4a3a28,
  neutral: 0x888888,
  null: 0xaaaaaa,
};

export class EditorScene extends Phaser.Scene {
  private scenario!: ScenarioDef;
  private mapIndex = 0;
  private tool: Tool = "terrain";
  private brush: Terrain = "grass";
  private siteKind: SiteKind = "ruins";
  private armyMode: "player" | "ordo" | "neutral" = "player";
  private cityFaction: FactionId | null = "ri";
  private ox = 0;
  private oy = 0;
  private painting = false;
  private uid = 0;

  private overlayGfx!: Phaser.GameObjects.Graphics;
  private hudGfx!: Phaser.GameObjects.Graphics;
  private statusText!: Phaser.GameObjects.Text;
  private helpText!: Phaser.GameObjects.Text;
  private titleText!: Phaser.GameObjects.Text;
  private toolButtons: Phaser.GameObjects.Text[] = [];
  private screenFrame?: ScreenCharcoalFrame;
  private mapVoid?: Phaser.GameObjects.TileSprite;
  private terrainLayer!: TerrainLayer;
  private plotUi!: PlotConstructor;
  private plotPlayer!: PlotPlayer;

  constructor() {
    super("Editor");
  }

  preload() {
    attachOptionalLoadPump(this);
    queueAssetPack(this, WORLD_ASSETS);
  }

  init(data?: { scenarioId?: string }) {
    if (data?.scenarioId) {
      const existing = getScenario(data.scenarioId);
      this.scenario = existing
        ? materializeScenario(existing)
        : createEmptyScenario();
    } else {
      this.scenario = createEmptyScenario();
    }
    this.mapIndex = 0;
    this.uid = Date.now() % 100000;
  }

  create() {
    this.cameras.main.setBackgroundColor(0x0a0a0a);
    this.mapVoid = createMapVoid(this);
    this.terrainLayer = new TerrainLayer(this);
    this.overlayGfx = this.add.graphics().setDepth(8);
    this.hudGfx = this.add.graphics().setDepth(20).setScrollFactor(0);

    this.titleText = this.add
      .text(viewW(this) / 2, 18, "", {
        fontFamily: "Georgia, serif",
        fontSize: "18px",
        color: "#e8d5a3",
      })
      .setOrigin(0.5, 0)
      .setDepth(21)
      .setScrollFactor(0);

    this.statusText = this.add
      .text(280, viewH(this) - 30, "", {
        fontFamily: "Georgia, serif",
        fontSize: "14px",
        color: "#c9a227",
      })
      .setDepth(21)
      .setScrollFactor(0);

    this.helpText = this.add
      .text(16, 48, "", {
        fontFamily: "Georgia, serif",
        fontSize: "13px",
        color: "#a09070",
        lineSpacing: 4,
      })
      .setDepth(21)
      .setScrollFactor(0);

    this.buildToolbar();
    this.plotUi = new PlotConstructor(this, {
      getScenario: () => this.scenario,
      getMapId: () => this.activeMap().id,
      onChanged: () => this.redrawAll(),
      onPreview: (seqs) => this.previewPlot(seqs),
    });
    this.plotPlayer = new PlotPlayer(this);
    this.screenFrame = new ScreenCharcoalFrame(this);
    this.redrawAll();
    if (/plot/.test(window.location.hash.toLowerCase())) {
      this.plotUi.open();
      this.redrawAll();
    }
    onViewResize(this, () => this.redrawAll());

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (this.plotPlayer.isPlaying()) return;
      if (this.plotUi.isOpen() && p.x > viewW(this) - PLOT_PANEL_W) return;
      if (p.x < 250) return;
      this.painting = true;
      this.handlePaint(p.worldX, p.worldY, true);
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!this.painting || p.x < 250) return;
      if (this.plotUi.isOpen() && p.x > viewW(this) - PLOT_PANEL_W) return;
      this.handlePaint(p.worldX, p.worldY, false);
    });
    this.input.on("pointerup", () => {
      this.painting = false;
    });

    this.input.keyboard?.on("keydown", (e: KeyboardEvent) => this.onKey(e));
  }

  private activeMap(): MapDef {
    return this.scenario.maps[this.mapIndex];
  }

  private nextId(prefix: string): string {
    this.uid += 1;
    return `${prefix}_${this.uid}`;
  }

  private buildToolbar() {
    for (const b of this.toolButtons) b.destroy();
    this.toolButtons = [];

    const addBtn = (y: number, label: string, fn: () => void, color = "#c9a227") => {
      const t = this.add
        .text(16, y, label, {
          fontFamily: "Georgia, serif",
          fontSize: "14px",
          color,
        })
        .setDepth(22)
        .setScrollFactor(0)
        .setInteractive({
          useHandCursor: true,
          hitArea: new Phaser.Geom.Rectangle(-4, -4, 228, 22),
          hitAreaCallback: Phaser.Geom.Rectangle.Contains,
        });
      t.on("pointerover", () => t.setColor("#fff0c0"));
      t.on("pointerout", () => t.setColor(color));
      t.on("pointerdown", (p: Phaser.Input.Pointer) => {
        p.event.stopPropagation();
        fn();
      });
      this.toolButtons.push(t);
      return t;
    };

    let y = 300;
    addBtn(y, "[ Террайн ]", () => {
      this.tool = "terrain";
      this.setStatus(`Кисть: ${TERRAIN_LABEL[this.brush]}`);
    });
    y += 22;
    addBtn(y, "[ Город ]", () => {
      this.tool = "city";
      this.setStatus("Клик — город (C цикл фракции)");
    });
    y += 22;
    addBtn(y, "[ Объект ]", () => {
      this.tool = "site";
      this.setStatus(`Объект: ${SITE_LABEL[this.siteKind]}`);
    });
    y += 22;
    addBtn(y, "[ Армия ]", () => {
      this.tool = "army";
      this.setStatus(`Армия: ${this.armyMode}`);
    });
    y += 22;
    addBtn(y, "[ Ластик ]", () => {
      this.tool = "erase";
      this.setStatus("Стереть объект на клетке");
    });
    y += 30;
    addBtn(y, "+ Карта (след. миссия)", () => this.addMap());
    y += 22;
    addBtn(y, "← / → миссия", () => this.cycleMap(1));
    y += 22;
    addBtn(y, "Старт = эта карта", () => {
      this.scenario.startMapId = this.activeMap().id;
      // Keep start as first in sequence for play order
      const cur = this.activeMap();
      this.scenario.maps = [cur, ...this.scenario.maps.filter((m) => m.id !== cur.id)];
      this.mapIndex = 0;
      this.setStatus(`Старт / миссия 1: ${this.scenario.startMapId}`);
      this.refreshHud();
    });
    y += 22;
    addBtn(y, "Размер ±", () => this.promptResize());
    y += 22;
    addBtn(y, "Цель миссии", () => this.cycleMapWin());
    y += 22;
    addBtn(y, "Бриф / вход", () => this.editBriefAndEntry());
    y += 22;
    addBtn(y, "Сюжет", () => {
      this.plotUi.toggle();
      this.redrawAll();
    }, "#e8d5a3");
    y += 30;
    addBtn(y, "Сохранить", () => this.saveLocal(), "#8fdf8f");
    y += 22;
    addBtn(y, "Экспорт JSON", () => {
      downloadScenarioJson(this.scenario);
      this.setStatus("JSON скачан");
    });
    y += 22;
    addBtn(y, "Импорт JSON", () => {
      void pickScenarioJsonFile()
        .then((s) => {
          this.scenario = materializeScenario(s);
          this.mapIndex = 0;
          this.redrawAll();
          this.setStatus(`Импорт: ${s.name}`);
        })
        .catch((err) => this.setStatus(String(err)));
    });
    y += 22;
    addBtn(
      y,
      "Играть",
      () => {
        const playable = materializeScenario(this.scenario);
        // Temp id so playtest of a builtin edit does not clobber canon
        if (isBuiltinScenario(playable.id)) {
          playable.id = `play-${Date.now()}`;
        }
        registerScenario(playable, false);
        playScenario(playable.id, null);
        this.scene.start("World");
      },
      "#8fdf8f",
    );
    y += 22;
    addBtn(y, "В меню", () => this.scene.start("Boot"), "#a08080");
  }

  private onKey(e: KeyboardEvent) {
    const k = e.key.toLowerCase();
    if (k >= "1" && k <= "6") {
      this.brush = TERRAINS[Number(k) - 1];
      this.tool = "terrain";
      this.setStatus(`Кисть: ${TERRAIN_LABEL[this.brush]}`);
      this.refreshHud();
      return;
    }
    if (k === "t") {
      this.tool = "terrain";
      this.refreshHud();
    }
    if (k === "c") {
      if (this.tool === "city") {
        const i = FACTIONS.indexOf(this.cityFaction);
        this.cityFaction = FACTIONS[(i + 1) % FACTIONS.length];
        this.setStatus(`Фракция города: ${this.cityFaction ?? "нейтр."}`);
      } else {
        this.tool = "city";
      }
      this.refreshHud();
    }
    if (k === "o") {
      const i = SITE_KINDS.indexOf(this.siteKind);
      this.siteKind = SITE_KINDS[(i + 1) % SITE_KINDS.length];
      this.tool = "site";
      this.setStatus(`Объект: ${SITE_LABEL[this.siteKind]}`);
      this.refreshHud();
    }
    if (k === "a") {
      this.armyMode =
        this.armyMode === "player" ? "ordo" : this.armyMode === "ordo" ? "neutral" : "player";
      this.tool = "army";
      this.setStatus(`Армия: ${this.armyMode}`);
      this.refreshHud();
    }
    if (k === "e") {
      this.tool = "erase";
      this.refreshHud();
    }
    if (k === "[") this.cycleMap(-1);
    if (k === "]") this.cycleMap(1);
    if (k === "n") this.addMap();
    if (k === "s" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      this.saveLocal();
    }
    if (k === "p" && !e.ctrlKey && !e.metaKey) {
      this.plotUi.toggle();
      this.redrawAll();
    }
    if (k === "escape") {
      if (this.plotPlayer.isPlaying()) {
        this.plotPlayer.skipAll();
        return;
      }
      if (this.plotUi.isOpen()) {
        this.plotUi.close();
        this.redrawAll();
      }
    }
  }

  private cycleMap(dir: number) {
    this.mapIndex = (this.mapIndex + dir + this.scenario.maps.length) % this.scenario.maps.length;
    this.redrawAll();
    this.setStatus(`Миссия ${this.mapIndex + 1}: ${this.activeMap().name}`);
  }

  private addMap() {
    const n = this.scenario.maps.length + 1;
    const map = createEmptyMap(`map${n}`, `Карта ${n}`, 16, 12);
    map.win = { type: "eliminate_enemies" };
    map.brief = `Миссия ${n}`;
    this.scenario.maps.push(map);
    this.mapIndex = this.scenario.maps.length - 1;
    this.redrawAll();
    this.setStatus(`Добавлена миссия ${n}: ${map.name}`);
  }

  private promptResize() {
    const map = this.activeMap();
    const raw = window.prompt("Размер cols,rows", `${map.cols},${map.rows}`);
    if (!raw) return;
    const [cs, rs] = raw.split(",").map((s) => Number(s.trim()));
    if (!Number.isFinite(cs) || !Number.isFinite(rs) || cs < 4 || rs < 4 || cs > 64 || rs > 48) {
      this.setStatus("Размер: 4–64 × 4–48");
      return;
    }
    this.scenario.maps[this.mapIndex] = resizeMapTerrain(map, cs, rs);
    this.redrawAll();
    this.setStatus(`Размер ${cs}×${rs}`);
  }

  private cycleMapWin() {
    const map = this.activeMap();
    const kinds = ["capture_capital", "eliminate_enemies", "survive_turns"] as const;
    const cur = map.win?.type ?? this.scenario.win.type;
    const i = kinds.indexOf(cur as (typeof kinds)[number]);
    const next = kinds[(i + 1) % kinds.length];
    if (next === "capture_capital") {
      map.win = { type: "capture_capital", faction: "ordo" };
    } else if (next === "eliminate_enemies") {
      map.win = { type: "eliminate_enemies" };
    } else {
      map.win = { type: "survive_turns", turns: 20 };
    }
    this.setStatus(`Цель: ${map.win.type}`);
    this.refreshHud();
  }

  private editBriefAndEntry() {
    const map = this.activeMap();
    const brief = window.prompt("Бриф миссии", map.brief ?? "");
    if (brief !== null) map.brief = brief;
    const entry = window.prompt(
      "Точка входа x,y (для следующей миссии)",
      map.entry ? `${map.entry.x},${map.entry.y}` : "2,2",
    );
    if (entry) {
      const [x, y] = entry.split(",").map((s) => Number(s.trim()));
      if (Number.isFinite(x) && Number.isFinite(y)) {
        map.entry = { x, y };
      }
    }
    const name = window.prompt("Имя карты", map.name);
    if (name) map.name = name;
    this.setStatus("Бриф / вход / имя обновлены");
    this.refreshHud();
  }

  private saveLocal() {
    const name = window.prompt("Имя сценария", this.scenario.name);
    if (name) this.scenario.name = name;
    let id = window.prompt("ID сценария (латиница)", this.scenario.id);
    if (id) this.scenario.id = id.trim().replace(/\s+/g, "-");
    if (isBuiltinScenario(this.scenario.id)) {
      const suggested = `custom-${this.scenario.id}`;
      const alt = window.prompt(
        "Этот ID встроенный. Сохранить как новый id?",
        suggested,
      );
      if (!alt || isBuiltinScenario(alt.trim())) {
        this.setStatus("Не сохранено: нужен свой id");
        return;
      }
      this.scenario.id = alt.trim().replace(/\s+/g, "-");
    }
    registerScenario(materializeScenario(this.scenario), true);
    this.setStatus(`Сохранено: ${this.scenario.id}`);
    this.refreshHud();
  }

  private setStatus(msg: string) {
    this.statusText.setText(msg);
  }

  private handlePaint(wx: number, wy: number, isDown: boolean) {
    if (this.plotPlayer.isPlaying()) return;
    const map = this.activeMap();
    const { gx, gy } = screenToGrid(wx, wy, this.ox, this.oy);
    if (gx < 0 || gy < 0 || gx >= map.cols || gy >= map.rows) return;

    if (this.plotUi.isPickingTile()) {
      if (!isDown) return;
      this.plotUi.applyPickedTile(gx, gy);
      this.setStatus(`Клетка сюжета: ${gx},${gy}`);
      this.redrawAll();
      return;
    }

    if (this.tool === "terrain") {
      const terrain = resolveMapTerrain(map);
      terrain[gy][gx] = this.brush;
      map.terrain = terrain;
      map.buildTerrain = () => terrain.map((r) => [...r]);
      this.redrawMap();
      return;
    }

    if (!isDown) return;

    if (this.tool === "erase") {
      this.eraseAt(gx, gy);
      this.redrawMap();
      return;
    }
    if (this.tool === "city") {
      this.placeCity(gx, gy);
      this.redrawMap();
      return;
    }
    if (this.tool === "site") {
      this.placeSite(gx, gy);
      this.redrawMap();
      return;
    }
    if (this.tool === "army") {
      this.placeArmy(gx, gy);
      this.redrawMap();
    }
  }

  private eraseAt(x: number, y: number) {
    const map = this.activeMap();
    map.cities = map.cities.filter((c) => !(c.x === x && c.y === y));
    map.sites = (map.sites ?? []).filter((s) => !(s.x === x && s.y === y));
    map.armies = (map.armies ?? []).filter((a) => !(a.x === x && a.y === y));
    this.setStatus(`Стерто @ ${x},${y}`);
  }

  private placeCity(x: number, y: number) {
    const map = this.activeMap();
    this.eraseAt(x, y);
    const city: CitySpawn = {
      id: this.nextId("city"),
      name: this.cityFaction === "ordo" ? "Цитадель" : "Город",
      x,
      y,
      faction: this.cityFaction,
      isCapital: this.cityFaction === "ri" || this.cityFaction === "ordo",
      income: { gold: 18, mana: 4, people: 3 },
    };
    map.cities.push(city);
    this.setStatus(`Город ${city.name} @ ${x},${y}`);
  }

  private placeSite(x: number, y: number) {
    const map = this.activeMap();
    map.sites = map.sites ?? [];
    map.sites = map.sites.filter((s) => !(s.x === x && s.y === y));
    map.sites.push({ id: this.nextId("site"), kind: this.siteKind, x, y });
    this.setStatus(`${SITE_LABEL[this.siteKind]} @ ${x},${y}`);
  }

  private placeArmy(x: number, y: number) {
    const map = this.activeMap();
    map.armies = map.armies ?? [];
    map.armies = map.armies.filter((a) => !(a.x === x && a.y === y));

    let army: ArmySpawn;
    if (this.armyMode === "player") {
      army = {
        id: this.nextId("player"),
        faction: "ri",
        name: "Отряд героя",
        x,
        y,
        isPlayer: true,
        movesLeft: 3,
        hero: { name: "Герой", level: 1, xp: 0, xpToNext: 100 },
        unitDefIds: ["squire", "archer", "acolyte"],
      };
    } else if (this.armyMode === "ordo") {
      army = {
        id: this.nextId("ordo"),
        faction: "ordo",
        name: "Колонна Ordo",
        x,
        y,
        isPlayer: false,
        movesLeft: 2,
        hero: { name: "Офицер", level: 1, xp: 0, xpToNext: 100 },
        unitDefIds: ["zombie", "ghost"],
      };
    } else {
      army = {
        id: this.nextId("neut"),
        faction: "neutral",
        name: "Нейтралы",
        x,
        y,
        isPlayer: false,
        isNeutral: true,
        movesLeft: 0,
        hero: { name: "", level: 1, xp: 0, xpToNext: 100 },
        unitDefIds: ["wolf", "wolf"],
      };
    }
    map.armies.push(army);
    this.setStatus(`${army.name} @ ${x},${y}`);
  }

  private redrawAll() {
    this.refreshHud();
    this.redrawMap();
    this.plotUi?.layout();
    layoutMapVoid(this, this.mapVoid);
    this.screenFrame?.setChrome(this.charcoalChrome());
    this.screenFrame?.layout();
  }

  private charcoalChrome(): CharcoalChrome {
    const w = viewW(this);
    const h = viewH(this);
    return { box: { x: 250, y: 0, w: Math.max(80, w - 250), h } };
  }

  private refreshHud() {
    const map = this.activeMap();
    const h = viewH(this);
    this.hudGfx.clear();
    this.hudGfx.fillStyle(0x120e0a, 0.92);
    this.hudGfx.fillRect(0, 0, 250, h);
    this.hudGfx.lineStyle(1, 0x5a4a30, 1);
    this.hudGfx.strokeRect(0, 0, 250, h);
    this.titleText.setX(viewW(this) / 2);
    this.statusText.setY(h - 30);

    this.titleText.setText(
      `Редактор · ${this.scenario.name} · ${map.name} (${map.cols}×${map.rows})`,
    );

    const startMark = this.scenario.startMapId === map.id ? " ★старт" : "";
    this.helpText.setText(
      [
        "Порядок карт = цепочка миссий",
        `Инструмент: ${this.tool}`,
        `Кисть: ${TERRAIN_LABEL[this.brush]} (1–6)`,
        `Город фракция: ${this.cityFaction ?? "—"} (C)`,
        `Объект: ${SITE_LABEL[this.siteKind]} (O)`,
        `Армия: ${this.armyMode} (A)`,
        `Миссия: ${this.mapIndex + 1}/${this.scenario.maps.length}${startMark}`,
        `Цель: ${map.win?.type ?? this.scenario.win.type}`,
        "",
        "1–6 террайн  T/C/O/A/E",
        "[ ] миссии  N новая",
        "P сюжет  Ctrl+S сохранить",
      ].join("\n"),
    );
  }

  private redrawMap() {
    const map = this.activeMap();
    const plotW = this.plotUi?.isOpen() ? PLOT_PANEL_W : 0;
    const origin = computeIsoOrigin(map.cols, map.rows, viewW(this) - plotW, 56, viewH(this) - 40, 250);
    this.ox = origin.ox;
    this.oy = origin.oy;
    const terrain = resolveMapTerrain(map);

    this.terrainLayer.redraw({
      map: terrain,
      ox: this.ox,
      oy: this.oy,
    });
    this.overlayGfx.clear();
    this.children.getAll().forEach((obj) => {
      if (obj.getData?.("editorToken")) obj.destroy();
    });

    for (const city of map.cities) {
      const { cx, cy } = isoCenter(city.x, city.y, this.ox, this.oy);
      const stamped = stampMapToken(
        this,
        cityMapTokenKey(city),
        cx,
        cy,
        cityMapTokenHeight(city) * 0.85,
        "editorToken",
        4,
      );
      if (!stamped) {
        const col = FACTION_COLOR[String(city.faction)] ?? 0xaaaaaa;
        this.overlayGfx.fillStyle(col, 1);
        this.overlayGfx.fillCircle(cx, cy, city.isCapital ? 10 : 7);
        this.overlayGfx.lineStyle(2, 0x1a1510, 0.8);
        this.overlayGfx.strokeCircle(cx, cy, city.isCapital ? 10 : 7);
      }
    }

    for (const site of map.sites ?? []) {
      const { cx, cy } = isoCenter(site.x, site.y, this.ox, this.oy);
      const stamped = stampMapToken(
        this,
        siteMapTokenKey(site.kind),
        cx,
        cy,
        MAP_SITE_HEIGHT * 0.85,
        "editorToken",
        4,
      );
      if (!stamped) {
        this.overlayGfx.fillStyle(SITE_COLOR[site.kind] ?? 0x888888, 1);
        this.overlayGfx.fillCircle(cx, cy, 5);
      }
    }

    for (const army of map.armies ?? []) {
      const { cx, cy } = isoCenter(army.x, army.y, this.ox, this.oy);
      const stamped = stampMapToken(
        this,
        armyMapTokenKey(army),
        cx,
        cy,
        MAP_ARMY_HEIGHT * 0.85,
        "editorToken",
        6,
      );
      if (!stamped) {
        const col = army.isPlayer ? 0xe8d5a3 : FACTION_COLOR[army.faction] ?? 0x888888;
        this.overlayGfx.fillStyle(col, 1);
        this.overlayGfx.fillTriangle(cx, cy - 10, cx - 8, cy + 6, cx + 8, cy + 6);
      }
    }

    if (this.plotUi?.isOpen()) {
      for (const mark of this.plotUi.markers()) {
        const { cx, cy } = isoCenter(mark.x, mark.y, this.ox, this.oy);
        if (mark.kind === "tile") {
          this.overlayGfx.lineStyle(2, 0xe8d5a3, 0.95);
          this.overlayGfx.strokeCircle(cx, cy, 11);
        } else {
          this.overlayGfx.fillStyle(0xc9a227, 0.85);
          this.overlayGfx.fillRect(cx - 4, cy - 4, 8, 8);
        }
      }
    }
  }

  private previewPlot(seqs: PlotSequence[]): void {
    this.plotPlayer.play(seqs, {
      applyWorldEffects: false,
      onCamera: (x, y) => this.setStatus(`Камера → ${x},${y}`),
      onComplete: () => this.setStatus("Превью сцены закончено"),
    });
  }
}
