import Phaser from "phaser";
import {
  applyDefendReduction,
  applyDamage,
  calcDamage,
  canRetaliate,
} from "../game/battle";
import { STATUS_DEFS, STATUS_IDS, UNIT_DEFS, type StatusId } from "../game/catalog";
import type { Army, UnitInstance } from "../game/data";
import { glassStyleForFaction } from "../game/factionVisual";
import {
  BATTLE_ASSETS,
  attachOptionalLoadPump,
  queueAssetPack,
  type AssetEntry,
} from "../game/assetPacks";
import { FORMATION_FRAME_KEYS, hurtPortraitPath, hurtPortraitTextureKey, portraitPath, portraitTextureKey } from "../game/portraits";
import {
  applyOnHitStatuses,
  applyStatus,
  bleedIntensity,
  burnIntensity,
  clearAllStatuses,
  cleanseOnHeal,
  frostIntensity,
  modifyHealing,
  poisonIntensity,
  rollAttackMiss,
  statusChips,
  tickUnitStatuses,
} from "../game/status";
import { GLASS_PHOTO_SIZE } from "../game/vintagePortrait";
import { BattleActionBar } from "../ui/BattleActionBar";
import { BattleFocusWindows } from "../ui/BattleFocusWindows";
import {
  battleArenaLayoutRect,
  battleUnitLayoutPos,
  resolveFormationAnchor,
} from "../ui/battleLayout";
import {
  FORMATION_START_Y,
  battleFormationBounds,
  battleFormationCenter,
} from "../ui/battleFormationLayout";
import { GlassPhotoFrame } from "../ui/GlassPhotoFrame";
import { UnitInspectPanel } from "../ui/UnitInspectPanel";
import { spawnFloatingCombatText } from "../ui/floatingCombatText";
import { onViewResize, viewH, viewSize, viewW } from "../ui/viewport";

const { portraitSize, frameW, frameH } = GLASS_PHOTO_SIZE;
const SIDEBAR_W = 300;

const PORTRAIT_POOL = [
  "hero_ri",
  "knight",
  "archer",
  "witch",
  "acolyte",
  "hero_ordo",
  "initiate",
  "skeleton",
  "zombie",
  "ghost",
  "banshee",
  "wolf",
  "bandit",
  "ogre",
  "dragon",
] as const;

type TestRoster = { defId: string; slot: number }[];

const DEFAULT_PLAYER: TestRoster = [
  { defId: "knight", slot: 0 },
  { defId: "squire", slot: 1 },
  { defId: "archer", slot: 3 },
  { defId: "acolyte", slot: 4 },
];

const DEFAULT_ENEMY: TestRoster = [
  { defId: "initiate", slot: 0 },
  { defId: "skeleton", slot: 1 },
  { defId: "ghost", slot: 3 },
  { defId: "zombie", slot: 4 },
];

/**
 * Battle mechanics sandbox with a real 6-slot formation layout.
 * Boot menu or URL hash `#test/battle`.
 */
export class BattleMechanicsTestScene extends Phaser.Scene {
  private playerArmy!: Army;
  private enemyArmy!: Army;
  /** Primary attacker (player side) for strike preview. */
  private attackerId!: string;
  /** Primary target (enemy side) for strike preview. */
  private targetId!: string;
  /** UI focus — statuses, heal, roster swap. */
  private focusUnitId!: string;
  /** Whose turn in the sandbox queue (attacker ↔ target primaries). */
  private activeUnitId!: string;
  private turnNo = 1;
  private autoBusy = false;
  private logLines: string[] = [];
  private logText!: Phaser.GameObjects.Text;
  private statsText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private unitInspect!: UnitInspectPanel;
  private focusWindows!: BattleFocusWindows;
  private actionBar!: BattleActionBar;
  private rightInspect = false;
  private contextMenuBlock = (e: Event) => e.preventDefault();
  private nextId = 1;
  private unitViews = new Map<string, GlassPhotoFrame>();
  private emptySlotViews: GlassPhotoFrame[] = [];
  private formationDecor: Phaser.GameObjects.GameObject[] = [];
  private arenaGfx?: Phaser.GameObjects.Graphics;
  private sidebarGfx?: Phaser.GameObjects.Graphics;
  private battleCx = 480;
  private formationStartY = FORMATION_START_Y;
  private defending = new Set<string>();
  private focusTargetId: string | null = null;

  constructor() {
    super("BattleMechanicsTest");
  }

  preload() {
    attachOptionalLoadPump(this);
    const portraits: AssetEntry[] = PORTRAIT_POOL.flatMap((defId) => [
      [portraitTextureKey(defId), portraitPath(defId)],
      [hurtPortraitTextureKey(defId), hurtPortraitPath(defId)],
    ]);
    queueAssetPack(this, [...BATTLE_ASSETS, ...portraits]);
  }

  private sidebarTitle?: Phaser.GameObjects.Text;
  private sidebarHint?: Phaser.GameObjects.Text;

  private titleText?: Phaser.GameObjects.Text;

  create() {
    this.cameras.main.setBackgroundColor(0x12100e);
    this.logLines = [];
    this.unitViews.clear();
    this.emptySlotViews = [];
    this.formationDecor = [];
    this.defending.clear();

    this.playerArmy = this.makeArmy("ri", "Испытание", DEFAULT_PLAYER, true);
    this.enemyArmy = this.makeArmy("ordo", "Противник", DEFAULT_ENEMY, false);
    this.attackerId = this.playerArmy.units[0].instanceId;
    this.targetId = this.enemyArmy.units[0].instanceId;
    this.focusUnitId = this.attackerId;
    this.activeUnitId = this.attackerId;

    this.titleText = this.add
      .text(480, 28, "ТЕСТ БОЯ", {
        fontFamily: "Georgia, serif",
        fontSize: "32px",
        color: "#e8d5a3",
      })
      .setOrigin(0.5, 0)
      .setDepth(5);

    this.hintText = this.add
      .text(480, 88, "", {
        fontFamily: "Georgia, serif",
        fontSize: "14px",
        color: "#c9a227",
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setDepth(5);

    this.layoutBattleField();
    this.buildSidebar();

    this.focusWindows = new BattleFocusWindows(this);
    this.actionBar = new BattleActionBar(this, {
      onSkip: () => this.passTurn(),
      onDefend: () => this.toggleDefend(this.targetId),
      onFlee: () => this.pushLog("Бегство отключено в песочнице"),
      onQuick: () => this.autoPassTurns(4),
    });
    this.actionBar.setState({ playerTurn: true, busy: false, canFlee: false });
    this.layoutChrome();

    this.unitInspect = new UnitInspectPanel(this);
    this.game.canvas.addEventListener("contextmenu", this.contextMenuBlock);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.game.canvas.removeEventListener("contextmenu", this.contextMenuBlock);
      this.actionBar?.destroy();
      this.focusWindows?.destroy();
    });

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) {
        this.rightInspect = true;
        this.updateInspect(pointer);
        return;
      }
      if (pointer.x >= viewW(this) - SIDEBAR_W) return;
      const hit = this.unitAtPointer(pointer);
      if (hit) this.selectUnit(hit.unit.instanceId, hit.side);
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (pointer.x >= viewW(this) - SIDEBAR_W) return;
      if (this.rightInspect && pointer.rightButtonDown()) {
        this.updateInspect(pointer);
        return;
      }
      this.updateHoverTarget(pointer);
    });
    this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonReleased()) {
        this.rightInspect = false;
        this.unitInspect.hide();
      }
    });
    this.input.on("pointerupoutside", () => {
      this.rightInspect = false;
      this.unitInspect.hide();
    });

    onViewResize(this, () => {
      this.layoutBattleField();
      this.layoutSidebar();
      this.layoutChrome();
      this.unitInspect.layout();
    });

    this.input.keyboard?.on("keydown-ESC", () => {
      window.location.hash = "";
      this.scene.start("Boot");
    });
    this.input.keyboard?.on("keydown-SPACE", () => {
      if (!this.autoBusy) this.passTurn();
    });

    this.input.keyboard?.on("keydown-L", () => {
      window.location.hash = "test/battle-layout";
      this.scene.start("BattleLayoutTest");
    });

    this.refreshUi();
    this.pushLog("L — конструктор раскладки · клик по юниту — фокус");
  }

  private battleAreaW(): number {
    return Math.max(640, viewW(this) - SIDEBAR_W);
  }

  private layoutChrome() {
    this.titleText?.setPosition(this.battleCx, 28);
    this.hintText?.setPosition(this.battleCx, 88);
    this.focusWindows?.layout();
    this.actionBar?.layout();
  }

  private makeArmy(
    faction: Army["faction"],
    name: string,
    roster: TestRoster,
    isPlayer: boolean,
  ): Army {
    const units = roster.map(({ defId, slot }) => {
      const def = UNIT_DEFS[defId];
      return {
        instanceId: `test_${this.nextId++}`,
        defId,
        hp: def.maxHp,
        slot,
        statuses: [],
        isHero: defId.startsWith("hero_"),
      } satisfies UnitInstance;
    });
    return {
      id: `test-${faction}`,
      faction,
      name,
      x: 0,
      y: 0,
      mapId: "test",
      units,
      isPlayer,
      movesLeft: 0,
      hero: { name: "Песочница", level: 1, xp: 0, xpToNext: 100 },
    };
  }

  private layoutBattleField() {
    const { w, h } = viewSize(this);
    const areaW = this.battleAreaW();
    const anchor = resolveFormationAnchor(w, h);
    this.battleCx = anchor.battleCx;
    this.formationStartY = anchor.formationStartY;
    void areaW;

    this.drawArena();
    this.rebuildFormations();
    this.layoutChrome();
  }

  private drawArena() {
    const { w, h } = viewSize(this);
    const arena = battleArenaLayoutRect(w, h);

    this.arenaGfx?.destroy();
    for (const obj of this.formationDecor) obj.destroy();
    this.formationDecor = [];

    const g = this.add.graphics().setDepth(0);
    this.arenaGfx = g;
    g.fillStyle(0x2a241c, 1);
    g.fillRect(arena.x, arena.y, arena.w, arena.h);
    g.lineStyle(2, 0x6b5a3e, 1);
    g.strokeRect(arena.x, arena.y, arena.w, arena.h);
    g.lineStyle(2, 0x8a7050, 0.85);
    g.lineBetween(this.battleCx, arena.y + 16, this.battleCx, arena.y + arena.h - 16);

    for (const side of ["player", "enemy"] as const) {
      this.drawFormationFrame(side);
    }
  }

  private drawFormationFrame(side: "player" | "enemy") {
    const texKey = side === "player" ? FORMATION_FRAME_KEYS.player : FORMATION_FRAME_KEYS.enemy;
    const { x, y, w, h } = battleFormationCenter(side, this.battleCx, this.formationStartY);
    if (this.textures.exists(texKey)) {
      this.formationDecor.push(this.add.image(x, y, texKey).setDisplaySize(w, h).setDepth(1));
      return;
    }
    const b = battleFormationBounds(side, this.battleCx, this.formationStartY);
    const g = this.add.graphics().setDepth(1);
    g.fillStyle(0x14100e, 0.82);
    g.fillRect(b.x, b.y, b.w, b.h);
    g.lineStyle(2, side === "player" ? 0xc9a227 : 0x98a8c0, 0.9);
    g.strokeRect(b.x, b.y, b.w, b.h);
    this.formationDecor.push(g);
  }

  private rebuildFormations() {
    for (const view of this.unitViews.values()) view.destroy(true);
    for (const view of this.emptySlotViews) view.destroy(true);
    this.unitViews.clear();
    this.emptySlotViews = [];

    this.spawnSide(this.playerArmy, "player");
    this.spawnSide(this.enemyArmy, "enemy");
    this.drawEmptySlotPlates("player");
    this.drawEmptySlotPlates("enemy");
  }

  private unitPos(side: "player" | "enemy", slot: number) {
    const { w, h } = viewSize(this);
    return battleUnitLayoutPos(side, slot, w, h);
  }

  private portraitKey(defId: string): string {
    const key = portraitTextureKey(defId);
    if (this.textures.exists(key)) return key;
    return key;
  }

  private spawnSide(army: Army, side: "player" | "enemy") {
    const style = glassStyleForFaction(army.faction);
    for (const unit of army.units) {
      if (!(unit.hp > 0) || unit.slot === undefined) continue;
      const def = UNIT_DEFS[unit.defId];
      const pos = this.unitPos(side, unit.slot);
      const texKey = this.portraitKey(unit.defId);
      const hpColor = unit.hp <= def.maxHp * 0.35 ? "#e08080" : "#f5e6c8";

      const frame = new GlassPhotoFrame(this, pos.x, pos.y, {
        portraitKey: this.textures.exists(texKey) ? texKey : undefined,
        portraitSize,
        frameW: frameW,
        frameH: frameH,
        style,
        hpLabel: `${unit.hp}/${def.maxHp}${this.defending.has(unit.instanceId) ? " З" : ""}`,
        hpColor,
        hero: unit.isHero,
        veteran: unit.veteran,
      });
      frame.setWoundFromHp(unit.hp, def.maxHp);
      frame.setDepth(2);
      frame.setInteractive(frame.getHitRect(), Phaser.Geom.Rectangle.Contains);
      frame.setData("unitId", unit.instanceId);
      frame.setData("side", side);
      this.unitViews.set(unit.instanceId, frame);
    }
  }

  private drawEmptySlotPlates(side: "player" | "enemy") {
    const army = side === "player" ? this.playerArmy : this.enemyArmy;
    const occupied = new Set(
      army.units.filter((u) => u.hp > 0 && u.slot !== undefined).map((u) => u.slot as number),
    );
    for (let slot = 0; slot < 6; slot++) {
      if (occupied.has(slot)) continue;
      const { x, y } = this.unitPos(side, slot);
      const frame = new GlassPhotoFrame(this, x, y, {
        portraitSize,
        frameW: frameW,
        frameH: frameH,
        style: glassStyleForFaction(army.faction),
      });
      frame.setDepth(1.5);
      frame.setEmpty(true);
      this.emptySlotViews.push(frame);
    }
  }

  private unitAtPointer(pointer: Phaser.Input.Pointer):
    | { unit: UnitInstance; army: Army; side: "player" | "enemy" }
    | undefined {
    for (const [unitId, view] of this.unitViews) {
      if (!view.getBounds().contains(pointer.worldX, pointer.worldY)) continue;
      const side = view.getData("side") as "player" | "enemy";
      const army = side === "player" ? this.playerArmy : this.enemyArmy;
      const unit = army.units.find((u) => u.instanceId === unitId);
      if (unit && unit.hp > 0) return { unit, army, side };
    }
    return undefined;
  }

  private selectUnit(unitId: string, side: "player" | "enemy") {
    this.focusUnitId = unitId;
    if (side === "player") this.attackerId = unitId;
    else this.targetId = unitId;
    this.refreshUi();
    const def = UNIT_DEFS[this.unitById(unitId)?.defId ?? ""];
    this.pushLog(`Фокус → ${def?.name ?? unitId}`);
  }

  private updateHoverTarget(pointer: Phaser.Input.Pointer) {
    const hit = this.unitAtPointer(pointer);
    this.focusTargetId = hit?.unit.instanceId ?? null;
    this.refreshFocusWindows();
  }

  private unitById(id: string): UnitInstance | undefined {
    return (
      this.playerArmy.units.find((u) => u.instanceId === id) ??
      this.enemyArmy.units.find((u) => u.instanceId === id)
    );
  }

  private ctxFor(unitId: string): { unit: UnitInstance; army: Army; side: "player" | "enemy" } | undefined {
    const p = this.playerArmy.units.find((u) => u.instanceId === unitId);
    if (p) return { unit: p, army: this.playerArmy, side: "player" };
    const e = this.enemyArmy.units.find((u) => u.instanceId === unitId);
    if (e) return { unit: e, army: this.enemyArmy, side: "enemy" };
    return undefined;
  }

  private updateInspect(pointer: Phaser.Input.Pointer) {
    const hit = this.unitAtPointer(pointer);
    if (!hit) {
      this.unitInspect.hide();
      return;
    }
    this.unitInspect.show(hit);
  }

  private refreshFocusWindows() {
    const active = this.ctxFor(this.activeUnitId);
    if (active && active.unit.hp > 0) {
      this.focusWindows.setActor(active);
    } else {
      this.focusWindows.clearActor();
    }

    if (!this.focusTargetId) {
      this.focusWindows.clearTarget();
      return;
    }
    const tgt = this.ctxFor(this.focusTargetId);
    if (tgt && tgt.unit.hp > 0) {
      this.focusWindows.setTarget(tgt);
      return;
    }
    this.focusWindows.clearTarget();
  }

  private buildSidebar() {
    const x = this.sidebarX();
    this.sidebarTitle = this.add
      .text(x + SIDEBAR_W / 2, 16, "ПЕСОЧНИЦА", {
        fontFamily: "Georgia, serif",
        fontSize: "16px",
        color: "#e8d5a3",
      })
      .setOrigin(0.5, 0)
      .setDepth(21)
      .setScrollFactor(0);

    this.sidebarHint = this.add
      .text(x + SIDEBAR_W / 2, 38, "Esc — меню · ПКМ — карточка", {
        fontFamily: "Georgia, serif",
        fontSize: "11px",
        color: "#6a6050",
      })
      .setOrigin(0.5, 0)
      .setDepth(21)
      .setScrollFactor(0);

    this.statsText = this.add
      .text(x + 14, viewH(this) - 168, "", {
        fontFamily: "Georgia, serif",
        fontSize: "11px",
        color: "#b8a888",
        wordWrap: { width: SIDEBAR_W - 28 },
        lineSpacing: 3,
      })
      .setOrigin(0, 0)
      .setDepth(21)
      .setScrollFactor(0);

    this.logText = this.add
      .text(x + 14, viewH(this) - 92, "", {
        fontFamily: "Consolas, monospace",
        fontSize: "10px",
        color: "#9a8a70",
        wordWrap: { width: SIDEBAR_W - 28 },
        lineSpacing: 3,
      })
      .setOrigin(0, 0)
      .setDepth(21)
      .setScrollFactor(0);

    this.layoutSidebarPlate();
    this.buildActionButtons();
    this.buildStatusButtons();
    this.buildRosterButtons();
  }

  private layoutSidebarPlate() {
    const w = viewW(this);
    const h = viewH(this);
    const x = w - SIDEBAR_W;

    this.sidebarGfx?.destroy();
    this.sidebarGfx = this.add.graphics().setDepth(20).setScrollFactor(0);
    this.sidebarGfx.fillStyle(0x181410, 0.96);
    this.sidebarGfx.fillRect(x, 0, SIDEBAR_W, h);
    this.sidebarGfx.lineStyle(2, 0x6b5a3e, 0.9);
    this.sidebarGfx.lineBetween(x, 0, x, h);

    this.sidebarTitle?.setX(x + SIDEBAR_W / 2);
    this.sidebarHint?.setX(x + SIDEBAR_W / 2);
    this.statsText?.setPosition(x + 14, h - 168);
    this.logText?.setPosition(x + 14, h - 92);
  }

  private layoutSidebar() {
    this.layoutSidebarPlate();
  }

  private sidebarX(): number {
    return viewW(this) - SIDEBAR_W;
  }

  private btn(x: number, y: number, label: string, onClick: () => void, w = 128) {
    const bg = this.add
      .rectangle(x, y, w, 26, 0x2a2218, 0.95)
      .setStrokeStyle(1, 0x8a7050)
      .setInteractive({ useHandCursor: true })
      .setDepth(22)
      .setScrollFactor(0);
    const text = this.add
      .text(x, y, label, {
        fontFamily: "Georgia, serif",
        fontSize: "11px",
        color: "#e8d5a3",
      })
      .setOrigin(0.5)
      .setDepth(23)
      .setScrollFactor(0);
    bg.on("pointerover", () => bg.setFillStyle(0x3a3020, 1));
    bg.on("pointerout", () => bg.setFillStyle(0x2a2218, 0.95));
    bg.on("pointerdown", onClick);
    return { bg, text };
  }

  private buildActionButtons() {
    const x = this.sidebarX() + SIDEBAR_W / 2;
    const actions: [string, () => void][] = [
      ["Удар →", () => this.doAttack()],
      ["Пропуск хода", () => this.passTurn()],
      ["Авто ×4 хода", () => this.autoPassTurns(4)],
      ["Защита цели", () => this.toggleDefend(this.targetId)],
      ["Лечение фокуса", () => this.doHeal()],
      ["Сброс", () => this.resetArmies()],
      ["Снять статусы", () => this.clearFocusStatuses()],
    ];
    actions.forEach(([label, fn], i) => {
      this.btn(x, 68 + i * 30, label, fn, SIDEBAR_W - 36);
    });
  }

  private buildStatusButtons() {
    const baseX = this.sidebarX() + 14;
    this.add
      .text(baseX, 288, "Статус на фокус:", {
        fontFamily: "Georgia, serif",
        fontSize: "11px",
        color: "#6a6050",
      })
      .setOrigin(0, 0)
      .setDepth(21)
      .setScrollFactor(0);

    STATUS_IDS.forEach((id, i) => {
      const def = STATUS_DEFS[id];
      const col = i % 2;
      const row = Math.floor(i / 2);
      this.btn(baseX + 68 + col * 132, 312 + row * 28, def.label, () => this.applyToFocus(id), 124);
    });
  }

  private buildRosterButtons() {
    const x = this.sidebarX() + SIDEBAR_W / 2;
    this.add
      .text(x, 430, "Сменить юнит фокуса", {
        fontFamily: "Georgia, serif",
        fontSize: "11px",
        color: "#6a6050",
      })
      .setOrigin(0.5, 0)
      .setDepth(21)
      .setScrollFactor(0);

    PORTRAIT_POOL.forEach((defId, i) => {
      const name = UNIT_DEFS[defId]?.name ?? defId;
      this.btn(x, 452 + i * 24, name.slice(0, 16), () => this.swapFocusUnit(defId), SIDEBAR_W - 36);
    });
  }

  private focusedUnit(): UnitInstance {
    return this.unitById(this.focusUnitId)!;
  }

  private attackerUnit(): UnitInstance {
    return this.unitById(this.attackerId)!;
  }

  private targetUnit(): UnitInstance {
    return this.unitById(this.targetId)!;
  }

  private frameFor(unitId: string): GlassPhotoFrame | undefined {
    return this.unitViews.get(unitId);
  }

  private applyToFocus(id: StatusId) {
    const unit = this.focusedUnit();
    const frame = this.frameFor(unit.instanceId);
    if (!(unit.hp > 0) || !frame || frame.isFallen()) {
      this.pushLog("Мёртв — сначала Сброс");
      return;
    }
    applyStatus(unit, id, 2);
    this.flashStatus(frame, id);
    this.refreshUi();
    this.pushLog(`+ ${STATUS_DEFS[id].label} → ${UNIT_DEFS[unit.defId].name}`);
  }

  private flashStatus(frame: GlassPhotoFrame, id: StatusId) {
    if (id === "frost") frame.flashFrost();
    else if (id === "poison") frame.flashPoison();
    else if (id === "burn") frame.flashBurn();
    else if (id === "bleed") frame.flashBleed();
    else frame.flashDamage();
  }

  private clearFocusStatuses() {
    const unit = this.focusedUnit();
    const frame = this.frameFor(unit.instanceId);
    if (!frame || frame.isFallen()) {
      this.pushLog("Мёртв — сначала Сброс");
      return;
    }
    clearAllStatuses(unit);
    this.refreshUi();
    this.pushLog(`Статусы сняты: ${UNIT_DEFS[unit.defId].name}`);
  }

  private toggleDefend(unitId: string) {
    const unit = this.unitById(unitId);
    const frame = this.frameFor(unitId);
    if (!unit || !frame || frame.isFallen()) {
      this.pushLog("Цель мертва");
      return;
    }
    if (this.defending.has(unitId)) this.defending.delete(unitId);
    else this.defending.add(unitId);
    this.refreshUi();
    this.pushLog(
      this.defending.has(unitId)
        ? `${UNIT_DEFS[unit.defId].name} в защите (−50%)`
        : `${UNIT_DEFS[unit.defId].name} вышел из защиты`,
    );
  }

  private doAttack() {
    const atk = this.attackerUnit();
    const tgt = this.targetUnit();
    const atkFrame = this.frameFor(atk.instanceId);
    const tgtFrame = this.frameFor(tgt.instanceId);
    if (!(atk.hp > 0) || !atkFrame || atkFrame.isFallen()) {
      this.pushLog("Атакующий мёртв — Сброс");
      return;
    }
    if (!(tgt.hp > 0) || !tgtFrame || tgtFrame.isFallen()) {
      this.pushLog("Цель мертва — Сброс");
      return;
    }

    if (rollAttackMiss(atk)) {
      this.pushLog(`${UNIT_DEFS[atk.defId].name} промах (слепота)`);
      spawnFloatingCombatText(this, tgtFrame.x, tgtFrame.y - 40, "промах", "miss");
      this.refreshUi();
      return;
    }

    let dmg = calcDamage(atk, tgt);
    dmg = applyDefendReduction(dmg, this.defending.has(tgt.instanceId));
    applyDamage(tgt, dmg);
    const inflicted = applyOnHitStatuses(atk, tgt);
    tgtFrame.flashDamage();
    spawnFloatingCombatText(this, tgtFrame.x, tgtFrame.y - 40, dmg, "damage");
    if (this.defending.has(tgt.instanceId)) {
      spawnFloatingCombatText(this, tgtFrame.x, tgtFrame.y - 40, "защита", "block", { delay: 90 });
    }

    let msg = `${UNIT_DEFS[atk.defId].name} → ${dmg}`;
    if (this.defending.has(tgt.instanceId)) msg += " (защита)";
    if (inflicted.length) msg += ` · ${inflicted.join(", ")}`;

    if (tgt.hp > 0 && canRetaliate(tgt, atk) && atk.hp > 0) {
      const atkDefending = this.defending.has(atk.instanceId);
      if (rollAttackMiss(tgt)) {
        msg += " · ответ: промах";
        spawnFloatingCombatText(this, atkFrame.x, atkFrame.y - 40, "промах", "miss", { delay: 120 });
      } else {
        let counter = calcDamage(tgt, atk, 0.5);
        counter = applyDefendReduction(counter, atkDefending);
        applyDamage(atk, counter);
        applyOnHitStatuses(tgt, atk);
        atkFrame.flashDamage();
        spawnFloatingCombatText(this, atkFrame.x, atkFrame.y - 40, counter, "damage", { delay: 120 });
        msg += ` · ответ ${counter}`;
      }
    }

    this.refreshUi();
    this.pushLog(msg);
  }

  private passTurn() {
    if (this.autoBusy) return;
    this.executePassTurn();
  }

  private executePassTurn() {
    const actor = this.unitById(this.activeUnitId);
    const frame = actor ? this.frameFor(actor.instanceId) : undefined;
    const name = actor ? UNIT_DEFS[actor.defId].name : "?";

    if (!actor || !(actor.hp > 0) || !frame || frame.isFallen()) {
      this.pushLog(`Ход ${this.turnNo} · ${name} мёртв — передаём ход`);
      this.advanceActiveUnit();
      this.refreshUi();
      return;
    }

    if (this.defending.has(actor.instanceId)) {
      this.defending.delete(actor.instanceId);
      this.pushLog(`${name} выходит из защиты`);
    }

    const tick = tickUnitStatuses(actor);
    if (tick.damage > 0) {
      frame.flashDamage();
      spawnFloatingCombatText(this, frame.x, frame.y - 40, tick.damage, "dot");
      if (poisonIntensity(actor) > 0) frame.flashPoison();
      else if (burnIntensity(actor) > 0) frame.flashBurn();
      else if (bleedIntensity(actor) > 0) frame.flashBleed();
      else if (frostIntensity(actor) > 0) frame.flashFrost();
    }

    if (tick.messages.length) {
      this.pushLog(`Ход ${this.turnNo} · ${name}: ${tick.messages.join(" · ")}`);
    } else {
      this.pushLog(`Ход ${this.turnNo} · ${name}: без DoT · пропуск`);
    }

    if (!(actor.hp > 0)) {
      this.refreshUi();
      this.pushLog(`${name} пал от статуса`);
      this.advanceActiveUnit();
      this.refreshUi();
      return;
    }

    if (tick.skipped) this.pushLog(`${name} оглушён — ход пропущен`);

    this.advanceActiveUnit();
    this.refreshUi();
  }

  private advanceActiveUnit() {
    if (this.activeUnitId === this.attackerId) {
      this.activeUnitId = this.targetId;
    } else {
      this.activeUnitId = this.attackerId;
      this.turnNo += 1;
    }
  }

  private autoPassTurns(count: number) {
    if (this.autoBusy) return;
    this.autoBusy = true;
    this.actionBar.setState({ playerTurn: true, busy: true, canFlee: false });
    this.pushLog(`Авто: ${count} пропусков хода…`);
    let done = 0;
    const step = () => {
      if (!this.sys?.isActive?.() && !this.scene.isActive()) {
        this.autoBusy = false;
        return;
      }
      if (done >= count) {
        this.autoBusy = false;
        this.actionBar.setState({ playerTurn: true, busy: false, canFlee: false });
        this.pushLog("Авто закончен");
        this.refreshUi();
        return;
      }
      done += 1;
      this.executePassTurn();
      this.time.delayedCall(550, step);
    };
    step();
  }

  private doHeal() {
    const unit = this.focusedUnit();
    const frame = this.frameFor(unit.instanceId);
    if (!(unit.hp > 0) || !frame || frame.isFallen()) {
      this.pushLog("Лечение: юнит мёртв — Сброс");
      return;
    }
    const def = UNIT_DEFS[unit.defId];
    const raw = 28;
    const healed = modifyHealing(unit, raw);
    const before = unit.hp;
    unit.hp = Math.min(def.maxHp, unit.hp + healed);
    const cleared = cleanseOnHeal(unit);
    this.refreshUi();
    let msg = `Исцеление ${def.name} +${unit.hp - before}`;
    if (healed < raw) msg += " (проклятие)";
    if (cleared.length) msg += ` · снято: ${cleared.join(", ")}`;
    if (unit.hp - before > 0) {
      spawnFloatingCombatText(this, frame.x, frame.y - 40, unit.hp - before, "heal");
    }
    this.pushLog(msg);
  }

  private resetArmies() {
    this.playerArmy = this.makeArmy("ri", "Испытание", DEFAULT_PLAYER, true);
    this.enemyArmy = this.makeArmy("ordo", "Противник", DEFAULT_ENEMY, false);
    this.attackerId = this.playerArmy.units[0].instanceId;
    this.targetId = this.enemyArmy.units[0].instanceId;
    this.focusUnitId = this.attackerId;
    this.activeUnitId = this.attackerId;
    this.turnNo = 1;
    this.autoBusy = false;
    this.defending.clear();
    this.rebuildFormations();
    this.actionBar.setState({ playerTurn: true, busy: false, canFlee: false });
    this.refreshUi();
    this.pushLog("Сброс: полное HP, ход 1 · атакующий");
  }

  private swapFocusUnit(defId: string) {
    if (!UNIT_DEFS[defId]) return;
    const ctx = this.ctxFor(this.focusUnitId);
    if (!ctx) return;

    const def = UNIT_DEFS[defId];
    ctx.unit.defId = defId;
    ctx.unit.hp = def.maxHp;
    clearAllStatuses(ctx.unit);

    const frame = this.frameFor(ctx.unit.instanceId);
    if (frame) {
      frame.destroy(true);
      this.unitViews.delete(ctx.unit.instanceId);
    }
    const side = ctx.side;
    const slot = ctx.unit.slot ?? 0;
    const pos = this.unitPos(side, slot);
    const texKey = this.portraitKey(defId);
    const style = glassStyleForFaction(ctx.army.faction);
    const newFrame = new GlassPhotoFrame(this, pos.x, pos.y, {
      portraitKey: this.textures.exists(texKey) ? texKey : undefined,
      portraitSize,
      frameW: frameW,
      frameH: frameH,
      style,
      hpLabel: `${ctx.unit.hp}/${def.maxHp}`,
      hero: defId.startsWith("hero_"),
    });
    newFrame.setDepth(2);
    newFrame.setInteractive(newFrame.getHitRect(), Phaser.Geom.Rectangle.Contains);
    newFrame.setData("unitId", ctx.unit.instanceId);
    newFrame.setData("side", side);
    this.unitViews.set(ctx.unit.instanceId, newFrame);

    this.refreshUi();
    this.pushLog(`Фокус → ${def.name}`);
  }

  private syncFrame(unit: UnitInstance) {
    const def = UNIT_DEFS[unit.defId];
    const frame = this.frameFor(unit.instanceId);
    if (!frame) return;

    if (!(unit.hp > 0)) {
      unit.hp = 0;
      if (!frame.isFallen()) frame.markDead();
      return;
    }

    frame.setWoundFromHp(unit.hp, def.maxHp);
    frame.setHp(
      `${unit.hp}/${def.maxHp}${this.defending.has(unit.instanceId) ? " З" : ""}`,
      unit.hp <= def.maxHp * 0.35 ? "#e08080" : "#f5e6c8",
    );
    frame.setFrost(frostIntensity(unit));
    frame.setPoison(poisonIntensity(unit));
    frame.setBurn(burnIntensity(unit));
    frame.setBleed(bleedIntensity(unit));
    frame.setStatusChips(statusChips(unit));

    const isActive = unit.instanceId === this.activeUnitId;
    const isFocus = unit.instanceId === this.focusUnitId;
    const isAttacker = unit.instanceId === this.attackerId;
    const isTarget = unit.instanceId === this.targetId;

    if (isActive) frame.setTargetHighlight("front");
    else if (isFocus || isAttacker || isTarget) frame.setTargetHighlight("valid");
    else frame.setTargetHighlight("none");
  }

  private refreshUi() {
    for (const unit of [...this.playerArmy.units, ...this.enemyArmy.units]) {
      this.syncFrame(unit);
    }

    const atk = this.attackerUnit();
    const tgt = this.targetUnit();
    const focus = this.focusedUnit();
    const active = this.unitById(this.activeUnitId);
    const aDef = UNIT_DEFS[atk.defId];
    const tDef = UNIT_DEFS[tgt.defId];

    this.hintText?.setText(
      `Ход ${this.turnNo} · ходит: ${active ? UNIT_DEFS[active.defId].name : "—"}  ·  фокус: ${UNIT_DEFS[focus.defId].name}`,
    );

    const preview = atk.hp > 0 && tgt.hp > 0 ? calcDamage(atk, tgt) : 0;
    const withDef = applyDefendReduction(preview, this.defending.has(tgt.instanceId));
    this.statsText?.setText(
      [
        `${aDef.name} → ${tDef.name}`,
        `Превью: ${preview}${this.defending.has(tgt.instanceId) ? ` → ${withDef} (защита)` : ""}`,
        `Атак.: ${(atk.statuses ?? []).map((s) => `${STATUS_DEFS[s.id].chip}${s.turns}`).join(" ") || "—"}`,
        `Цель: ${(tgt.statuses ?? []).map((s) => `${STATUS_DEFS[s.id].chip}${s.turns}`).join(" ") || "—"}`,
        "Space / Пропуск — DoT активного",
      ].join("\n"),
    );

    this.refreshFocusWindows();
  }

  private pushLog(line: string) {
    this.logLines.unshift(line);
    this.logLines = this.logLines.slice(0, 7);
    this.logText?.setText(this.logLines.join("\n"));
  }
}

export function shouldOpenBattleMechanicsTest(): boolean {
  const hash = (window.location.hash || "").replace(/^#/, "");
  return hash === "test/battle" || hash === "test/combat" || hash === "test/status";
}
