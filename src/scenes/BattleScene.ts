/**
 * Battle scene — combat loop, formations, spells.
 * HUD chrome: src/ui/battleHud/BattleHud.ts
 * Action bar: src/ui/BattleActionBar.ts
 * Focus portraits: src/ui/BattleFocusWindows.ts
 */
import Phaser from "phaser";
import {
  applyDefendReduction,
  applyDamage,
  applyUnitHeal,
  calcDamage,
  canRetaliate,
  grantBattleXp,
  isValidTarget,
  pickAiTarget,
  pickHealTarget,
  resolveStrike,
  unitHealPower,
} from "../game/battle";
import { captureCity, cityAt } from "../game/city";
import { createGraveFromArmy } from "../game/graves";
import { resolveMissionOutcome } from "../game/scenario";
import { grantArtifact, randomLootArtifact } from "../game/artifacts";
import { POTIONS, SPELLS, UNIT_DEFS, type PotionId, type SpellId } from "../game/catalog";
import { rollHeroLoot } from "../game/heroPower";
import { playerFactionOf } from "../game/playerFaction";
import {
  castBattleCry,
  castFocus,
  castMeteor,
  castSpellDamage,
  castSpellHeal,
  formatSpellLine,
  neutralLoot,
  spellForKey,
  spellsForHero,
} from "../game/magic";
import {
  armyMaxMoves,
  assignBattleSlots,
  awardVeteran,
  ensureHeroInArmy,
  isHeroAlive,
  livingUnits,
  session,
  type Army,
  type UnitInstance,
} from "../game/data";
import {
  applyOnHitStatuses,
  bleedIntensity,
  burnIntensity,
  clearVolatileStatuses,
  frostIntensity,
  initiativeBonus,
  isSilenced,
  poisonIntensity,
  rollAttackMiss,
  statusChips,
  tickUnitStatuses,
} from "../game/status";
import { FORMATION_FRAME_KEYS, portraitTextureKey } from "../game/portraits";
import { BATTLE_ASSETS, attachOptionalLoadPump, queueAssetPack } from "../game/assetPacks";
import { glassStyleForFaction } from "../game/factionVisual";
import { GLASS_PHOTO_SIZE } from "../game/vintagePortrait";
import { BattleActionBar } from "../ui/BattleActionBar";
import { BattleHud } from "../ui/battleHud";
import { BattleFocusWindows } from "../ui/BattleFocusWindows";
import { GlassPhotoFrame } from "../ui/GlassPhotoFrame";
import { InventoryPanel } from "../ui/InventoryPanel";
import { UnitInspectPanel, type UnitInspectContext } from "../ui/UnitInspectPanel";
import {
  spawnFloatingCombatText,
  type FloatingCombatKind,
} from "../ui/floatingCombatText";
import { usePotionOnUnit } from "../game/items";
import { onViewResize, viewSize } from "../ui/viewport";
import { ScreenCharcoalFrame, charcoalInnerBottom } from "../ui/screenCharcoalFrame";
import {
  FORMATION_START_Y,
  battleFormationBounds,
  battleFormationCenter,
} from "../ui/battleFormationLayout";
import {
  battleArenaLayoutRect,
  battleUnitLayoutPos,
  resolveFormationAnchor,
} from "../ui/battleLayout";

interface BattleData {
  playerArmyId: string;
  enemyArmyId: string;
  siege?: boolean;
}

interface Combatant {
  unit: UnitInstance;
  armyId: string;
  side: "player" | "enemy";
}

/** Arena center x — front rows meet here; back rows are further out. */
const { frameW: UNIT_FRAME_W, frameH: UNIT_FRAME_H, portraitSize: UNIT_PORTRAIT } = GLASS_PHOTO_SIZE;

export class BattleScene extends Phaser.Scene {
  private playerArmy!: Army;
  private enemyArmy!: Army;
  private order: Combatant[] = [];
  private turnIndex = 0;
  private busy = false;
  private leaving = false;
  private transitionDone = false;
  /** Bumped to cancel stale window/Phaser delayed callbacks from prior actions. */
  private actionEpoch = 0;
  private pendingTimers: number[] = [];
  private exitKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  private spellMode: SpellId | null = null;
  private potionMode: PotionId | null = null;
  private inventoryUi!: InventoryPanel;
  private siege = false;
  private battleRound = 1;
  private hud!: BattleHud;
  private unitViews = new Map<string, GlassPhotoFrame>();
  private emptySlotViews: GlassPhotoFrame[] = [];
  private endWatch: ReturnType<typeof setInterval> | null = null;
  private unitInspect!: UnitInspectPanel;
  private actionBar!: BattleActionBar;
  private focusWindows!: BattleFocusWindows;
  /** Target shown in the right focus window (hover or locked during strike). */
  private focusTargetId: string | null = null;
  private focusTargetLocked = false;
  private rightInspect = false;
  private contextMenuBlock: ((e: Event) => void) | null = null;
  /** Units that chose Defend — take half damage until their next turn. */
  private defending = new Set<string>();
  private battleCx = 640;
  private formationStartY = FORMATION_START_Y;
  private arenaGfx?: Phaser.GameObjects.Graphics;
  private formationDecor: Phaser.GameObjects.GameObject[] = [];
  private screenFrame?: ScreenCharcoalFrame;

  constructor() {
    super("Battle");
  }

  preload() {
    attachOptionalLoadPump(this);
    queueAssetPack(this, BATTLE_ASSETS);
  }

  init(data: BattleData) {
    this.clearEndWatch();
    this.playerArmy = session.state.armies.find((a) => a.id === data.playerArmyId)!;
    this.enemyArmy = session.state.armies.find((a) => a.id === data.enemyArmyId)!;
    this.siege = !!data.siege;
    this.battleRound = 1;
    this.turnIndex = 0;
    this.busy = false;
    this.leaving = false;
    this.transitionDone = false;
    this.actionEpoch = 0;
    this.clearPendingTimers();
    this.exitKeyHandler = null;
    this.spellMode = null;
    this.unitViews.clear();
    this.emptySlotViews = [];
    this.formationDecor = [];
    this.rightInspect = false;
    this.defending.clear();
  }

  shutdown() {
    this.clearEndWatch();
    this.clearPendingTimers();
    this.actionEpoch++;
    this.actionBar?.destroy();
    this.focusWindows?.destroy();
    this.unitInspect?.hide();
    if (this.contextMenuBlock) {
      this.game.canvas.removeEventListener("contextmenu", this.contextMenuBlock);
      this.contextMenuBlock = null;
    }
    if (this.exitKeyHandler) {
      window.removeEventListener("keydown", this.exitKeyHandler);
      this.exitKeyHandler = null;
    }
  }

  create() {
    if (!this.playerArmy || !this.enemyArmy) {
      this.leaveToWorld();
      return;
    }

    ensureHeroInArmy(this.playerArmy);
    ensureHeroInArmy(this.enemyArmy);

    for (const army of [this.playerArmy, this.enemyArmy]) {
      for (const u of army.units) clearVolatileStatuses(u);
    }

    this.cameras.main.setBackgroundColor(0x1c1814);
    this.drawArena();

    if (this.siege) {
      for (const unit of livingUnits(this.enemyArmy)) {
        unit.hp += 12;
      }
    }

    assignBattleSlots(this.playerArmy, "player");
    assignBattleSlots(this.enemyArmy, "enemy");

    const title = this.enemyArmy.isNeutral ? "СТЫЧКА" : this.siege ? "ОСАДА" : "БОЙ";
    this.hud = new BattleHud(this, { onBag: () => this.toggleInventory() });
    this.hud.build(title);
    this.refreshSpellUi();
    this.spawnSide(this.playerArmy, "player");
    this.spawnSide(this.enemyArmy, "enemy");
    this.drawEmptySlotPlates("player");
    this.drawEmptySlotPlates("enemy");
    this.buildOrder();
    this.setStatus("Атака по цели или кнопки внизу");
    this.refreshTargetHighlights();

    this.actionBar = new BattleActionBar(this, {
      onSkip: () => this.skipTurn(),
      onDefend: () => this.defendTurn(),
      onFlee: () => this.fleeBattle(),
      onQuick: () => this.quickBattle(),
    });

    this.focusWindows = new BattleFocusWindows(this);

    this.inventoryUi = new InventoryPanel(this, {
      onMessage: (msg) => this.setStatus(msg),
      onChanged: () => this.refreshSpellUi(),
      onSelect: (id) => this.onInventorySelect(id),
    });

    this.highlightActive();
    this.startEndWatch();

    this.unitInspect = new UnitInspectPanel(this);
    this.screenFrame = new ScreenCharcoalFrame(this);
    this.contextMenuBlock = (e) => e.preventDefault();
    this.game.canvas.addEventListener("contextmenu", this.contextMenuBlock);

    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (pointer.leftButtonDown() && this.hud.bagHits.dispatch(pointer)) return;
      if (this.inventoryUi?.isOpen()) return;
      if (pointer.leftButtonDown() && this.actionBar.handlePointer(pointer)) return;
      if (pointer.rightButtonDown()) {
        this.rightInspect = true;
        this.updateBattleInspect(pointer);
      }
    });
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      const overBag = !!this.hud.bagHits.pick(pointer.x, pointer.y);
      this.hud.setBagHover(overBag);
      this.input.setDefaultCursor(overBag ? "pointer" : "default");
      if (this.rightInspect && pointer.rightButtonDown()) {
        this.updateBattleInspect(pointer);
      }
      this.updateFocusTargetFromPointer(pointer);
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

    this.input.keyboard?.on("keydown-Q", () => this.armSpellKey("Q"));
    this.input.keyboard?.on("keydown-W", () => this.armSpellKey("W"));
    this.input.keyboard?.on("keydown-E", () => this.armSpellKey("E"));
    this.input.keyboard?.on("keydown-R", () => this.armSpellKey("R"));
    this.input.keyboard?.on("keydown-I", () => this.toggleInventory());
    this.input.keyboard?.on("keydown-SPACE", () => this.skipTurn());
    this.input.keyboard?.on("keydown-D", () => this.defendTurn());
    this.input.keyboard?.on("keydown-B", () => this.quickBattle());
    this.input.keyboard?.on("keydown-ESC", () => {
      if (this.inventoryUi?.isOpen()) {
        this.inventoryUi.hide();
        return;
      }
      if (this.potionMode) {
        this.cancelPotionMode();
        return;
      }
      if (this.unitInspect?.isOpen()) {
        this.unitInspect.hide();
        this.rightInspect = false;
        return;
      }
      if (this.leaving) {
        this.leaveToWorld();
        return;
      }
      this.spellMode = null;
      this.refreshSpellUi();
      this.setStatus("Атака по цели");
    });
    this.input.keyboard?.on("keydown-F", () => this.fleeBattle());
    onViewResize(this, () => this.layoutBattle());
  }

  private unitPos(side: "player" | "enemy", slot: number) {
    const { w, h } = viewSize(this);
    return battleUnitLayoutPos(side, slot, w, h);
  }

  private layoutBattle() {
    const { w, h } = viewSize(this);
    const anchor = resolveFormationAnchor(w, h);
    this.battleCx = anchor.battleCx;
    this.formationStartY = anchor.formationStartY;
    this.drawArena();
    this.hud.layout(w, h);
    this.actionBar?.layout();
    const chrome = this.hud.charcoalChrome(w, h);
    this.focusWindows?.layout({ restBottom: charcoalInnerBottom(chrome.box) });
    this.inventoryUi?.layout();
    this.unitInspect?.layout();
    this.screenFrame?.setChrome(chrome);
    this.screenFrame?.layout();

    for (const [id, view] of this.unitViews) {
      const side = view.getData("side") as "player" | "enemy" | undefined;
      const army = side === "enemy" ? this.enemyArmy : this.playerArmy;
      const unit = army.units.find((u) => u.instanceId === id);
      if (!unit || unit.slot === undefined) continue;
      const pos = this.unitPos(side ?? "player", unit.slot);
      view.setPosition(pos.x, pos.y);
    }
    for (const view of this.emptySlotViews) {
      const side = view.getData("side") as "player" | "enemy" | undefined;
      const slot = view.getData("slot") as number | undefined;
      if (!side || slot === undefined) continue;
      const pos = this.unitPos(side, slot);
      view.setPosition(pos.x, pos.y);
    }
  }

  private fleeBattle() {
    if (this.leaving || this.busy || this.enemyArmy.isNeutral) return;
    if (session.state.gold < 25) {
      this.setStatus("Нужно 25 золота для отступления");
      return;
    }
    session.state.gold -= 25;
    session.state.lastMessage = "Отступление из боя (−25 золота)";
    this.leaveToWorld();
  }

  private skipTurn() {
    if (this.leaving || this.busy) return;
    const cur = this.current();
    if (!cur || cur.side !== "player" || !(cur.unit.hp > 0)) return;
    this.potionMode = null;
    this.setDeadAlliesClickable(false);
    this.spellMode = null;
    this.refreshSpellUi();
    this.busy = true;
    this.refreshActionBar();
    const name = UNIT_DEFS[cur.unit.defId]?.name ?? "Воин";
    this.setStatus(`${name} пропускает ход`);
    this.later(200, () => this.afterAction());
  }

  private defendTurn() {
    if (this.leaving || this.busy) return;
    const cur = this.current();
    if (!cur || cur.side !== "player" || !(cur.unit.hp > 0)) return;
    this.potionMode = null;
    this.setDeadAlliesClickable(false);
    this.spellMode = null;
    this.refreshSpellUi();
    this.defending.add(cur.unit.instanceId);
    this.busy = true;
    this.refreshActionBar();
    const name = UNIT_DEFS[cur.unit.defId]?.name ?? "Воин";
    this.setStatus(`${name} встаёт в защиту (−50% урона)`);
    const view = this.unitViews.get(cur.unit.instanceId);
    view?.setTargetHighlight("front");
    this.later(280, () => this.afterAction());
  }

  /** Auto-resolve the rest of the battle without animations. */
  private quickBattle() {
    if (this.leaving || this.busy) return;
    const cur = this.current();
    if (!cur || cur.side !== "player") return;

    this.actionEpoch++;
    this.clearPendingTimers();
    this.busy = true;
    this.refreshActionBar();
    this.spellMode = null;
    this.defending.clear();
    this.refreshSpellUi();
    this.setStatus("Быстрый бой…");

    let guard = 0;
    while (guard++ < 400) {
      if (livingUnits(this.playerArmy).length === 0) {
        this.refreshAllHp();
        this.finishBattle(false);
        return;
      }
      if (livingUnits(this.enemyArmy).length === 0) {
        this.refreshAllHp();
        this.finishBattle(true);
        return;
      }

      this.ensureLivingTurn();
      const actor = this.current();
      if (!actor || !(actor.unit.hp > 0)) break;

      const tick = tickUnitStatuses(actor.unit);
      if (!(actor.unit.hp > 0) || tick.skipped) {
        const prevSkip = this.turnIndex;
        this.turnIndex = (this.turnIndex + 1) % this.order.length;
        if (this.turnIndex <= prevSkip) this.battleRound += 1;
        continue;
      }

      const foes = actor.side === "player" ? this.enemyArmy : this.playerArmy;
      const target = pickAiTarget(actor.unit, foes);
      if (!target) {
        this.turnIndex = (this.turnIndex + 1) % this.order.length;
        continue;
      }

      const strike = resolveStrike(actor.unit, target, { allowRetaliate: true });
      if (!strike.missed && target.hp > 0) applyOnHitStatuses(actor.unit, target);

      const prev = this.turnIndex;
      this.turnIndex = (this.turnIndex + 1) % this.order.length;
      if (this.turnIndex <= prev) this.battleRound += 1;
    }

    this.refreshAllHp();
    const playerAlive = livingUnits(this.playerArmy).length > 0;
    const enemyAlive = livingUnits(this.enemyArmy).length > 0;
    if (!enemyAlive && playerAlive) this.finishBattle(true);
    else if (!playerAlive) this.finishBattle(false);
    else {
      this.busy = false;
      this.ensureLivingTurn();
      this.setStatus("Быстрый бой прерван — продолжайте вручную");
      this.highlightActive();
    }
  }

  private refreshAllHp() {
    for (const army of [this.playerArmy, this.enemyArmy]) {
      for (const u of army.units) this.refreshHp(u);
    }
  }

  private refreshActionBar() {
    const cur = this.current();
    this.actionBar?.setState({
      playerTurn: !!cur && cur.side === "player" && cur.unit.hp > 0,
      busy: this.busy,
      canFlee: !this.enemyArmy.isNeutral,
    });
  }

  private refreshSpellUi() {
    const lines = spellsForHero(this.playerArmy.hero)
      .map((id) => formatSpellLine(id))
      .join("   ");
    const potion = this.potionMode ? ` · ЗЕЛЬЕ: ${POTIONS[this.potionMode].name}` : "";
    const mode = this.spellMode ? ` · АКТИВНО: ${SPELLS[this.spellMode].name}` : "";
    this.hud.setSpellLine(`${lines}${potion}${mode}   [I] сумка`);
  }

  private toggleInventory() {
    if (this.leaving) return;
    this.spellMode = null;
    this.inventoryUi.toggle();
    if (this.inventoryUi.isOpen()) this.refreshSpellUi();
  }

  private onInventorySelect(id: PotionId) {
    const def = POTIONS[id];
    const cur = this.current();
    if (this.busy || !cur || cur.side !== "player") {
      this.setStatus("Сумка — в свой ход");
      return;
    }

    if (def.target === "none") {
      const result = usePotionOnUnit(session.state, id, cur.unit);
      this.setStatus(result.ok ? result.message : result.reason);
      this.inventoryUi.refresh();
      this.refreshSpellUi();
      return;
    }

    this.potionMode = id;
    this.spellMode = null;
    this.inventoryUi.hide();
    this.setDeadAlliesClickable(id === "life");
    this.refreshSpellUi();
    this.setStatus(def.battleHint);
  }

  private cancelPotionMode() {
    this.setDeadAlliesClickable(false);
    this.potionMode = null;
    this.refreshSpellUi();
    this.setStatus("Атака по цели");
  }

  private setDeadAlliesClickable(on: boolean) {
    for (const u of this.playerArmy.units) {
      if (u.hp > 0) continue;
      const view = this.unitViews.get(u.instanceId);
      if (!view) continue;
      if (on) view.setInteractive(view.getHitRect(), Phaser.Geom.Rectangle.Contains);
      else view.disableInteractive();
    }
  }

  private applyPotionToUnit(unit: UnitInstance, enemy: boolean) {
    if (!this.potionMode) return;
    const id = this.potionMode;
    const result = usePotionOnUnit(session.state, id, unit, { enemy });
    if (!result.ok) {
      this.setStatus(result.reason);
      return;
    }
    this.setDeadAlliesClickable(false);
    this.potionMode = null;
    this.refreshHp(unit);
    this.syncStatusVisuals(unit);
    if (unit.hp > 0 && this.unitViews.get(unit.instanceId)?.isFallen()) {
      this.unitViews.get(unit.instanceId)?.revive();
      this.refreshHp(unit);
    }
    this.refreshSpellUi();
    this.setStatus(result.message);
  }

  private armSpellKey(key: string) {
    const id = spellForKey(this.playerArmy.hero, key);
    if (!id) return;
    this.armSpell(id);
  }

  private armSpell(spellId: SpellId) {
    if (this.busy) return;
    this.inventoryUi?.hide();
    this.potionMode = null;
    this.setDeadAlliesClickable(false);
    if (!isHeroAlive(this.playerArmy)) {
      this.setStatus("Герой пал — магия недоступна");
      return;
    }
    const cur = this.current();
    if (!cur || cur.side !== "player") return;
    if (isSilenced(cur.unit)) {
      this.setStatus("Немота — заклинания недоступны");
      return;
    }

    if (!spellsForHero(this.playerArmy.hero).includes(spellId)) {
      this.setStatus("Нет заклинания");
      return;
    }

    const spell = SPELLS[spellId];
    if (!(cur.unit.hp > 0)) return;
    if (this.playerArmy.hero.level < spell.minHeroLevel) {
      this.setStatus(`Нужен ${spell.minHeroLevel} ур. героя`);
      return;
    }
    if (session.state.mana < spell.manaCost) {
      this.setStatus("Мало маны");
      return;
    }

    if (spellId === "battle_cry") {
      const result = castBattleCry(session.state, this.playerArmy.hero, this.playerArmy.units);
      if (!result.ok) {
        this.setStatus(result.reason);
        return;
      }
      this.busy = true;
      this.refreshActionBar();
      for (const u of livingUnits(this.playerArmy)) {
        this.syncStatusVisuals(u);
        this.floatOnUnit(u, "СИЛ", "block");
      }
      this.setStatus(`Боевой клич → Сила (${result.buffed})`);
      this.later(400, () => this.afterAction(true));
      return;
    }

    if (spellId === "focus") {
      const heroUnit = this.playerArmy.units.find((u) => u.isHero);
      const result = castFocus(session.state, this.playerArmy.hero, heroUnit);
      if (!result.ok) {
        this.setStatus(result.reason);
        return;
      }
      this.busy = true;
      this.refreshActionBar();
      if (heroUnit) {
        this.syncStatusVisuals(heroUnit);
        this.floatOnUnit(heroUnit, "БСТ", "block");
      }
      this.setStatus("Засада → Расторопность");
      this.later(400, () => this.afterAction(true));
      return;
    }

    if (spell.aoe) {
      const targets = livingUnits(this.enemyArmy);
      const result = castMeteor(session.state, this.playerArmy.hero, targets);
      if (!result.ok) {
        this.setStatus(result.reason);
        return;
      }
      this.busy = true;
      this.refreshActionBar();
      for (const t of targets) {
        this.flashDamage(t);
        this.floatOnUnit(t, SPELLS.meteor.damage ?? 16, "damage");
        this.syncStatusVisuals(t);
        this.refreshHp(t);
        this.killIfDead(t);
      }
      this.setStatus(`Метеор → ${result.total} урона по всем · Огонь`);
      this.later(500, () => this.afterAction(true));
      return;
    }

    this.spellMode = spellId;
    this.refreshSpellUi();
    this.setStatus(
      spell.heal ? "Клик по союзнику для лечения" : "Клик по врагу для заклинания",
    );
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

    this.drawFormationFrame("player");
    this.drawFormationFrame("enemy");
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

  /** Cover the art's tiny inner windows with empty glass niches. */
  private drawEmptySlotPlates(side: "player" | "enemy") {
    const occupied = new Set(
      (side === "player" ? this.playerArmy : this.enemyArmy).units
        .filter((u) => u.hp > 0 && u.slot !== undefined)
        .map((u) => u.slot as number),
    );
    for (let slot = 0; slot < 6; slot++) {
      if (!occupied.has(slot)) this.paintEmptySlot(side, slot);
    }
  }

  private paintEmptySlot(side: "player" | "enemy", slot: number) {
    const { x, y } = this.unitPos(side, slot);
    const army = side === "player" ? this.playerArmy : this.enemyArmy;
    const frame = new GlassPhotoFrame(this, x, y, {
      portraitSize: UNIT_PORTRAIT,
      frameW: UNIT_FRAME_W,
      frameH: UNIT_FRAME_H,
      style: glassStyleForFaction(army.faction),
    });
    frame.setDepth(1.5);
    frame.setEmpty(true);
    frame.setData("side", side);
    frame.setData("slot", slot);
    this.emptySlotViews.push(frame);
  }

  private portraitKey(defId: string): string {
    const key = portraitTextureKey(defId);
    if (this.textures.exists(key)) return key;
    if (this.textures.exists("unit_squire")) return "unit_squire";
    return key;
  }

  private spawnSide(army: Army, side: "player" | "enemy") {
    const style = glassStyleForFaction(army.faction);
    for (const unit of livingUnits(army)) {
      if (unit.slot === undefined) continue;
      const def = UNIT_DEFS[unit.defId];
      const pos = this.unitPos(side, unit.slot);
      const texKey = this.portraitKey(unit.defId);
      const hpColor = unit.hp <= def.maxHp * 0.35 ? "#e08080" : "#f5e6c8";

      const frame = new GlassPhotoFrame(this, pos.x, pos.y, {
        portraitKey: this.textures.exists(texKey) ? texKey : undefined,
        portraitSize: UNIT_PORTRAIT,
        frameW: UNIT_FRAME_W,
        frameH: UNIT_FRAME_H,
        style,
        hpLabel: `${unit.hp}/${def.maxHp}`,
        hpColor,
        hero: unit.isHero,
        veteran: unit.veteran,
      });
      frame.setWoundFromHp(unit.hp, def.maxHp);
      frame.setDepth(2);
      frame.setInteractive(frame.getHitRect(), Phaser.Geom.Rectangle.Contains);
      frame.setData("unitId", unit.instanceId);
      frame.setData("side", side);
      frame.setData("slot", unit.slot);

      if (side === "enemy") {
        frame.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
          if (!pointer.leftButtonDown()) return;
          this.onEnemyClick(unit.instanceId);
        });
      } else {
        frame.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
          if (!pointer.leftButtonDown()) return;
          this.onAllyClick(unit.instanceId);
        });
      }

      this.unitViews.set(unit.instanceId, frame);
    }
  }

  private unitAtPointer(pointer: Phaser.Input.Pointer): UnitInspectContext | undefined {
    for (const obj of this.input.hitTestPointer(pointer)) {
      const container = this.findUnitContainer(obj);
      if (container) {
        const ctx = this.contextFromContainer(container);
        if (ctx) return ctx;
      }
    }

    const wx = pointer.worldX;
    const wy = pointer.worldY;
    let hit: { ctx: UnitInspectContext; depth: number } | undefined;
    for (const view of this.unitViews.values()) {
      const bounds = view.getBounds();
      if (!bounds.contains(wx, wy)) continue;
      const ctx = this.contextFromContainer(view);
      if (!ctx) continue;
      if (!hit || view.depth > hit.depth) hit = { ctx, depth: view.depth };
    }
    return hit?.ctx;
  }

  private findUnitContainer(obj: Phaser.GameObjects.GameObject): GlassPhotoFrame | null {
    let cur: Phaser.GameObjects.GameObject | null = obj;
    while (cur) {
      if (cur instanceof GlassPhotoFrame && cur.getData("unitId")) {
        return cur;
      }
      cur = (cur as Phaser.GameObjects.Container).parentContainer ?? null;
    }
    return null;
  }

  private contextFromContainer(container: GlassPhotoFrame): UnitInspectContext | undefined {
    const unitId = container.getData("unitId") as string;
    const side = container.getData("side") as "player" | "enemy";
    const army = side === "player" ? this.playerArmy : this.enemyArmy;
    const unit = army.units.find((u) => u.instanceId === unitId);
    if (!unit || unit.hp <= 0) return undefined;
    return { unit, army, side };
  }

  private updateBattleInspect(pointer: Phaser.Input.Pointer) {
    const ctx = this.unitAtPointer(pointer);
    if (!ctx) {
      this.unitInspect.hide();
      return;
    }
    this.unitInspect.show(ctx);
  }

  private updateFocusTargetFromPointer(pointer: Phaser.Input.Pointer) {
    if (this.focusTargetLocked || this.leaving) return;
    const ctx = this.unitAtPointer(pointer);
    if (!ctx || !(ctx.unit.hp > 0)) {
      if (this.focusTargetId) {
        this.focusTargetId = null;
        this.refreshFocusWindows();
      }
      return;
    }
    if (this.focusTargetId === ctx.unit.instanceId) return;
    this.focusTargetId = ctx.unit.instanceId;
    this.refreshFocusWindows();
  }

  private lockFocusTarget(unit: UnitInstance, _side: "player" | "enemy") {
    this.focusTargetId = unit.instanceId;
    this.focusTargetLocked = true;
    this.refreshFocusWindows();
  }

  private refreshFocusWindows() {
    if (!this.focusWindows) return;
    const cur = this.current();
    if (cur && cur.unit.hp > 0) {
      const army = cur.side === "player" ? this.playerArmy : this.enemyArmy;
      this.focusWindows.setActor({ unit: cur.unit, army, side: cur.side });
    } else {
      this.focusWindows.clearActor();
    }

    if (!this.focusTargetId) {
      this.focusWindows.clearTarget();
      return;
    }
    const fromPlayer = this.playerArmy.units.find((u) => u.instanceId === this.focusTargetId);
    if (fromPlayer && fromPlayer.hp > 0) {
      this.focusWindows.setTarget({ unit: fromPlayer, army: this.playerArmy, side: "player" });
      return;
    }
    const fromEnemy = this.enemyArmy.units.find((u) => u.instanceId === this.focusTargetId);
    if (fromEnemy && fromEnemy.hp > 0) {
      this.focusWindows.setTarget({ unit: fromEnemy, army: this.enemyArmy, side: "enemy" });
      return;
    }
    this.focusWindows.clearTarget();
  }

  private onAllyClick(targetId: string) {
    if (this.busy) return;
    const cur = this.current();
    if (!cur || cur.side !== "player") return;
    const target = this.playerArmy.units.find((u) => u.instanceId === targetId);
    if (!target) return;

    if (this.potionMode) {
      this.applyPotionToUnit(target, false);
      return;
    }

    if (this.spellMode === "heal") {
      if (!(target.hp > 0)) return;
      const result = castSpellHeal(session.state, this.playerArmy.hero, "heal", target);
      if (!result.ok) {
        this.setStatus(result.reason);
        return;
      }

      this.busy = true;
      this.refreshActionBar();
      this.lockFocusTarget(target, "player");
      this.spellMode = null;
      this.refreshSpellUi();
      this.refreshHp(target);
      this.syncStatusVisuals(target);
      this.floatOnUnit(target, result.amount, "heal");
      const extras: string[] = [];
      if (result.cleansed.length) extras.push(`очищ. ${result.cleansed.join(", ")}`);
      if (result.warded) extras.push("Оберег");
      this.setStatus(
        extras.length
          ? `Исцеление +${result.amount} HP · ${extras.join(" · ")}`
          : `Исцеление +${result.amount} HP`,
      );
      this.later(400, () => this.afterAction(true));
      return;
    }

    // Support unit heal (e.g. Послушник) — click ally on their turn
    if (unitHealPower(cur.unit) <= 0 || !(target.hp > 0)) return;
    if (isSilenced(cur.unit)) {
      this.setStatus("Немота — лечение недоступно");
      return;
    }
    const result = applyUnitHeal(cur.unit, target);
    if (!result.ok) {
      this.setStatus(result.reason);
      return;
    }
    this.busy = true;
    this.refreshActionBar();
    this.lockFocusTarget(target, "player");
    this.refreshHp(target);
    this.syncStatusVisuals(target);
    this.floatOnUnit(target, result.amount, "heal");
    this.setStatus(`${UNIT_DEFS[cur.unit.defId].name} лечит +${result.amount} HP`);
    this.later(400, () => this.afterAction());
  }

  private onEnemyClick(targetId: string) {
    if (this.busy) return;
    const cur = this.current();
    if (!cur || cur.side !== "player" || !(cur.unit.hp > 0)) return;
    const target = this.enemyArmy.units.find((u) => u.instanceId === targetId);
    if (!target || !(target.hp > 0)) return;

    if (this.potionMode) {
      this.applyPotionToUnit(target, true);
      return;
    }

    if (this.spellMode === "holy_strike" || this.spellMode === "lightning") {
      if (isSilenced(cur.unit)) {
        this.setStatus("Немота — заклинания недоступны");
        this.spellMode = null;
        this.refreshSpellUi();
        return;
      }
      const spellId = this.spellMode;
      const result = castSpellDamage(session.state, this.playerArmy.hero, spellId, target);
      if (!result.ok) {
        this.setStatus(result.reason);
        return;
      }
      this.busy = true;
      this.refreshActionBar();
      this.lockFocusTarget(target, "enemy");
      this.spellMode = null;
      this.refreshSpellUi();
      this.flashSpell(target);
      this.refreshHp(target);
      this.syncStatusVisuals(target);
      this.floatOnUnit(target, result.amount, "damage");
      this.killIfDead(target);
      this.setStatus(`${SPELLS[spellId].name} → ${result.amount}`);
      this.later(450, () => this.afterAction(true));
      return;
    }

    if (this.spellMode === "heal") return;

    if (!isValidTarget(cur.unit, target, this.enemyArmy)) {
      this.setStatus("Сначала бейте передний ряд!");
      return;
    }
    this.resolveAttack(cur, target);
  }

  private flashDamage(unit: UnitInstance) {
    const view = this.unitViews.get(unit.instanceId);
    if (!view) return;
    view.flashDamage();
  }

  private floatOnUnit(
    unit: UnitInstance,
    value: string | number,
    kind: FloatingCombatKind = "damage",
    delay = 0,
  ) {
    const view = this.unitViews.get(unit.instanceId);
    if (!view) return;
    spawnFloatingCombatText(this, view.x, view.y - view.frameH * 0.28, value, kind, {
      delay,
      depth: 40,
    });
  }

  private flashSpell(target: UnitInstance) {
    this.flashDamage(target);
  }

  private killIfDead(target: UnitInstance) {
    if (target.hp > 0) return;
    target.hp = 0;
    const tgtView = this.unitViews.get(target.instanceId);
    if (!tgtView) return;
    this.tweens.killTweensOf(tgtView);
    tgtView.markDead();
  }

  private refreshTargetHighlights() {
    const cur = this.current();
    for (const unit of livingUnits(this.enemyArmy)) {
      const view = this.unitViews.get(unit.instanceId);
      if (!view || view.isFallen()) continue;
      const spellReady = this.spellMode === "holy_strike" || this.spellMode === "lightning";
      const valid =
        spellReady || (cur?.side === "player" && isValidTarget(cur.unit, unit, this.enemyArmy));
      const isFront = unit.slot !== undefined && unit.slot < 3;
      if (valid) view.setTargetHighlight("valid");
      else if (isFront) view.setTargetHighlight("front");
      else view.setTargetHighlight("back");
      view.setAlpha(valid || cur?.side === "enemy" ? 1 : 0.55);
    }
  }

  private buildOrder() {
    const list: Combatant[] = [];
    for (const u of livingUnits(this.playerArmy)) {
      list.push({ unit: u, armyId: this.playerArmy.id, side: "player" });
    }
    for (const u of livingUnits(this.enemyArmy)) {
      list.push({ unit: u, armyId: this.enemyArmy.id, side: "enemy" });
    }
    list.sort(
      (a, b) =>
        UNIT_DEFS[b.unit.defId].initiative +
        initiativeBonus(b.unit) -
        (UNIT_DEFS[a.unit.defId].initiative + initiativeBonus(a.unit)),
    );
    this.order = list;
    this.turnIndex = 0;
    this.ensureLivingTurn();
  }

  private ensureLivingTurn() {
    if (this.order.length === 0) return;
    let guard = 0;
    while (guard++ < this.order.length + 2) {
      const c = this.order[this.turnIndex];
      if (c && c.unit.hp > 0) return;
      this.turnIndex = (this.turnIndex + 1) % this.order.length;
    }
  }

  private current(): Combatant | undefined {
    return this.order[this.turnIndex];
  }

  private highlightActive() {
    if (this.leaving) return;
    if (livingUnits(this.playerArmy).length === 0 || livingUnits(this.enemyArmy).length === 0) {
      this.finishBattle(livingUnits(this.enemyArmy).length === 0);
      return;
    }

    this.ensureLivingTurn();
    const cur = this.current();
    if (!cur || !(cur.unit.hp > 0)) {
      this.finishBattle(livingUnits(this.enemyArmy).length === 0);
      return;
    }

    // Defend lasts until this unit's next turn begins
    if (this.defending.has(cur.unit.instanceId)) {
      this.defending.delete(cur.unit.instanceId);
      this.unitViews.get(cur.unit.instanceId)?.setTargetHighlight("none");
    }

    // Turn-start DoTs / stun
    const tick = tickUnitStatuses(cur.unit);
    if (tick.damage > 0 || tick.messages.length > 0) {
      this.refreshHp(cur.unit);
      this.syncStatusVisuals(cur.unit);
      if (tick.damage > 0) {
        this.flashDamage(cur.unit);
        this.floatOnUnit(cur.unit, tick.damage, "dot");
      }
      this.killIfDead(cur.unit);
      if (tick.messages.length) this.setStatus(tick.messages.join(" · "));
    } else {
      this.syncStatusVisuals(cur.unit);
    }

    if (!(cur.unit.hp > 0)) {
      this.later(280, () => this.afterAction());
      return;
    }

    if (tick.skipped) {
      this.busy = true;
      this.refreshActionBar();
      this.setStatus(`${UNIT_DEFS[cur.unit.defId].name} оглушён — пропуск`);
      this.later(500, () => this.afterAction());
      return;
    }

    this.spellMode = null;
    this.refreshSpellUi();
    this.refreshActionBar();

    if (cur.side === "enemy" && !this.busy) {
      const expectedId = cur.unit.instanceId;
      this.later(450, () => {
        if (this.busy || this.leaving) return;
        const now = this.current();
        if (!now || now.unit.instanceId !== expectedId || !(now.unit.hp > 0)) return;
        this.aiAct();
      });
    }
    this.refreshTargetHighlights();
    this.refreshFocusWindows();
  }

  private setStatus(msg: string) {
    const cur = this.current();
    const who = cur && cur.unit.hp > 0 ? UNIT_DEFS[cur.unit.defId].name : "—";
    this.hud.setStatus(
      `${msg}  ·  R${this.battleRound}  ·  ${who}  ·  Мана ${session.state.mana}`,
    );
  }

  private aiAct() {
    if (this.busy || this.leaving) return;
    if (livingUnits(this.playerArmy).length === 0) {
      this.finishBattle(false);
      return;
    }
    const cur = this.current();
    if (!cur || cur.side !== "enemy" || !(cur.unit.hp > 0)) {
      this.afterAction();
      return;
    }

    // Healers prefer wounded allies when they can heal
    if (unitHealPower(cur.unit) > 0 && !isSilenced(cur.unit)) {
      const ally = pickHealTarget(this.enemyArmy);
      if (ally) {
        const result = applyUnitHeal(cur.unit, ally);
        if (result.ok) {
          this.busy = true;
          this.refreshActionBar();
          this.lockFocusTarget(ally, "enemy");
          this.refreshHp(ally);
          this.syncStatusVisuals(ally);
          this.floatOnUnit(ally, result.amount, "heal");
          this.setStatus(`${UNIT_DEFS[cur.unit.defId].name} лечит +${result.amount} HP`);
          this.later(400, () => this.afterAction());
          return;
        }
      }
    }

    const target = pickAiTarget(cur.unit, this.playerArmy);
    if (!target) {
      // No legal targets usually means the player side is gone
      this.finishBattle(livingUnits(this.playerArmy).length === 0 ? false : true);
      return;
    }
    this.resolveAttack(cur, target);
  }

  private resolveAttack(attacker: Combatant, target: UnitInstance) {
    if (this.leaving || !(attacker.unit.hp > 0) || !(target.hp > 0)) return;
    this.busy = true;
    this.refreshActionBar();
    this.lockFocusTarget(target, attacker.side === "player" ? "enemy" : "player");
    const aDef = UNIT_DEFS[attacker.unit.defId];

    if (rollAttackMiss(attacker.unit)) {
      this.setStatus(`${aDef.name} промах (слепота)`);
      this.floatOnUnit(target, "промах", "miss");
      this.later(400, () => this.afterAction());
      return;
    }

    const atkHero = attacker.side === "player" ? this.playerArmy.hero : this.enemyArmy.hero;
    const defHero = attacker.side === "player" ? this.enemyArmy.hero : this.playerArmy.hero;
    let dmg = calcDamage(attacker.unit, target, 1, atkHero, defHero);
    const wasDefending = this.defending.has(target.instanceId);
    dmg = applyDefendReduction(dmg, wasDefending);
    applyDamage(target, dmg);
    const inflicted = applyOnHitStatuses(attacker.unit, target);
    this.flashDamage(target);
    this.floatOnUnit(target, dmg, "damage");
    if (wasDefending) this.floatOnUnit(target, "защита", "block", 90);
    this.refreshHp(target);
    this.syncStatusVisuals(target);

    let settled = false;
    const finish = () => {
      if (settled || this.leaving) return;
      settled = true;
      this.killIfDead(target);

      let msg = `${aDef.name} → ${dmg} урона`;
      if (wasDefending) msg += " (защита)";
      if (inflicted.length) msg += ` · ${inflicted.join(", ")}`;
      if (target.hp > 0 && canRetaliate(target, attacker.unit) && attacker.unit.hp > 0) {
        if (rollAttackMiss(target)) {
          msg += " · ответ: промах";
          this.floatOnUnit(attacker.unit, "промах", "miss", 120);
        } else {
          let counter = calcDamage(target, attacker.unit, 0.5, defHero, atkHero);
          counter = applyDefendReduction(counter, this.defending.has(attacker.unit.instanceId));
          applyDamage(attacker.unit, counter);
          const retalStatuses = applyOnHitStatuses(target, attacker.unit);
          this.flashDamage(attacker.unit);
          this.floatOnUnit(attacker.unit, counter, "damage", 120);
          this.refreshHp(attacker.unit);
          this.syncStatusVisuals(attacker.unit);
          msg += ` · ответ ${counter}`;
          if (retalStatuses.length) msg += ` (${retalStatuses.join(", ")})`;
          this.killIfDead(attacker.unit);
        }
      }

      this.setStatus(msg);
      this.later(400, () => this.afterAction());
    };

    const atkView = this.unitViews.get(attacker.unit.instanceId);
    if (!atkView || atkView.isFallen()) {
      this.later(200, finish);
      return;
    }

    const dir = attacker.side === "player" ? 1 : -1;
    this.tweens.add({
      targets: atkView,
      x: atkView.x + 28 * dir,
      duration: 120,
      yoyo: true,
      onComplete: finish,
    });
    // Fallback if the lunge tween is killed mid-flight
    this.later(400, finish);
  }

  private syncStatusVisuals(unit: UnitInstance) {
    const view = this.unitViews.get(unit.instanceId);
    if (!view || view.isFallen()) return;
    const frost = frostIntensity(unit);
    const poison = poisonIntensity(unit);
    const burn = burnIntensity(unit);
    view.setFrost(frost);
    view.setPoison(poison);
    view.setBurn(burn);
    view.setBleed(bleedIntensity(unit));
    view.setStatusChips(statusChips(unit));
  }

  private refreshHp(unit: UnitInstance) {
    const view = this.unitViews.get(unit.instanceId);
    if (!view) return;
    const def = UNIT_DEFS[unit.defId];
    if (!def) return;
    if (!(unit.hp > 0)) {
      unit.hp = 0;
      view.markDead();
      return;
    }
    if (view.isFallen()) view.revive();
    view.setWoundFromHp(unit.hp, def.maxHp);
    view.setHp(
      `${unit.hp}/${def.maxHp}`,
      unit.hp <= def.maxHp * 0.35 ? "#e08080" : "#f5e6c8",
    );
    this.syncStatusVisuals(unit);
    this.refreshFocusWindows();
  }

  private afterAction(fromSpell = false) {
    if (this.leaving) return;

    // Drop any other pending afterAction / aiAct from overlapping actions
    this.actionEpoch++;

    const playerWon = livingUnits(this.enemyArmy).length === 0;
    const playerLost = livingUnits(this.playerArmy).length === 0;

    if (playerWon || playerLost) {
      this.finishBattle(playerWon);
      return;
    }

    const prevIndex = this.turnIndex;
    this.turnIndex = (this.turnIndex + 1) % this.order.length;
    if (this.turnIndex <= prevIndex) this.battleRound += 1;
    this.ensureLivingTurn();
    this.busy = false;
    this.focusTargetLocked = false;
    const curNow = this.current();
    const healHint =
      curNow && curNow.side === "player" && unitHealPower(curNow.unit) > 0
        ? " · клик по союзнику — лечение"
        : "";
    this.setStatus(
      fromSpell
        ? "Заклинание выполнено"
        : `Атака · Пропуск · Защита · магия Q/W/E/R${healHint}`,
    );
    this.refreshActionBar();
    this.highlightActive();
  }

  private later(ms: number, fn: () => void) {
    const epoch = this.actionEpoch;
    let done = false;
    const run = () => {
      if (done || this.transitionDone || this.leaving) return;
      if (epoch !== this.actionEpoch) return;
      done = true;
      fn();
    };
    try {
      this.time.delayedCall(ms, run);
    } catch {
      /* scene timers may already be dead */
    }
    const tid = window.setTimeout(run, ms + 80);
    this.pendingTimers.push(tid);
  }

  private clearPendingTimers() {
    for (const tid of this.pendingTimers) window.clearTimeout(tid);
    this.pendingTimers = [];
  }

  private clearEndWatch() {
    if (this.endWatch != null) {
      window.clearInterval(this.endWatch);
      this.endWatch = null;
    }
  }

  private startEndWatch() {
    this.clearEndWatch();
    this.endWatch = window.setInterval(() => {
      if (this.transitionDone) {
        this.clearEndWatch();
        return;
      }
      if (!this.playerArmy || !this.enemyArmy) {
        this.leaveToWorld();
        return;
      }
      if (this.leaving) {
        this.leaveToWorld();
        return;
      }
      const playerDead = livingUnits(this.playerArmy).length === 0;
      const enemyDead = livingUnits(this.enemyArmy).length === 0;
      if (playerDead || enemyDead) this.finishBattle(enemyDead && !playerDead);
    }, 700);
  }

  private swapToWorld() {
    // Prefer ScenePlugin.start — it stops the current scene first.
    // game.scene.start("World") alone would leave Battle running on top.
    try {
      this.scene.start("World");
      return;
    } catch {
      /* fall through */
    }
    const mgr = this.game.scene;
    try {
      mgr.stop("Battle");
    } catch {
      /* ignore */
    }
    try {
      mgr.stop("World");
    } catch {
      /* ignore */
    }
    mgr.start("World");
  }

  private leaveToWorld() {
    // Allow retry if Battle is still stuck on screen after a failed swap.
    if (this.transitionDone) {
      try {
        if (this.game.scene.isActive("Battle")) this.transitionDone = false;
        else return;
      } catch {
        return;
      }
    }
    this.transitionDone = true;
    this.leaving = true;
    this.busy = true;
    this.actionEpoch++;
    this.clearEndWatch();
    this.clearPendingTimers();

    if (this.exitKeyHandler) {
      window.removeEventListener("keydown", this.exitKeyHandler);
      this.exitKeyHandler = null;
    }

    try {
      this.tweens.killAll();
      this.time.removeAllEvents();
    } catch {
      /* ignore */
    }

    window.setTimeout(() => {
      try {
        this.swapToWorld();
      } catch (err) {
        console.error("leaveToWorld failed", err);
        this.transitionDone = false;
        window.setTimeout(() => {
          try {
            this.game.scene.stop("Battle");
            this.game.scene.start("World");
          } catch (err2) {
            console.error("leaveToWorld fallback failed", err2);
          }
        }, 50);
      }
    }, 0);
  }

  private finishBattle(playerWon: boolean) {
    if (this.leaving || this.transitionDone) return;
    this.leaving = true;
    this.busy = true;
    this.actionEpoch++;
    this.clearPendingTimers();

    try {
      const isNeutral = !!this.enemyArmy.isNeutral;

      if (playerWon) {
        let bonusXp = 0;
        if (isNeutral) {
          const loot = neutralLoot(this.enemyArmy);
          session.state.gold += loot.gold;
          bonusXp = loot.xp;
          session.state.lastMessage = `Трофеи: +${loot.gold} золота, +${loot.xp} опыта`;
        }

        let artMsg = "";
        if (rollHeroLoot(this.playerArmy.hero) || (!isNeutral && Math.random() < 0.18)) {
          const art = grantArtifact(session.state, this.playerArmy.hero, randomLootArtifact());
          artMsg = ` · ${art.message}`;
        }

        const xp = grantBattleXp(this.playerArmy.hero, this.enemyArmy, true, bonusXp);
        const veteran = awardVeteran(this.playerArmy);
        this.enemyArmy.units.forEach((u) => {
          u.hp = 0;
        });
        session.state.armies = session.state.armies.filter((a) => a.id !== this.enemyArmy.id);

        if (!isNeutral) {
          const city = cityAt(session.state, this.enemyArmy.x, this.enemyArmy.y);
          const pf = playerFactionOf(session.state);
          if (city && city.faction && city.faction !== pf) {
            captureCity(city, pf);
            session.state.lastMessage = `Захвачен ${city.name}!${artMsg}`;
          }
        }

        resolveMissionOutcome(session.state);

        this.playerArmy.movesLeft = Math.min(
          this.playerArmy.movesLeft,
          armyMaxMoves(this.playerArmy),
        );

        const vet = veteran ? ` · ${veteran} — ветеран!` : "";
        const lvl = xp.leveled ? ` · ур.${this.playerArmy.hero.level}!` : "";
        const heroDown = !isHeroAlive(this.playerArmy) ? " · герой пал (1 ОД)" : "";
        this.setStatus(`Победа! +${xp.gained} XP${lvl}${vet}${heroDown}${artMsg}`);
      } else {
        // Full wipe → grave on the map; corpses stay with the fallen party
        if (livingUnits(this.playerArmy).length === 0) {
          const grave = createGraveFromArmy(session.state, this.playerArmy);
          session.state.armies = session.state.armies.filter((a) => a.id !== this.playerArmy.id);
          const stillFighting = session.state.armies.some(
            (a) => a.isPlayer && livingUnits(a).length > 0,
          );
          if (!stillFighting) {
            session.state.selectedArmyId = null;
            this.setStatus(
              `Отряд пал… могила на карте. Наймите миссионера в городе и поднимите её.`,
            );
            session.state.lastMessage = `Могила: ${grave.name}. Нужен миссионер.`;
          } else {
            this.setStatus(`Отряд разбит… могила (${grave.name}) на карте`);
          }
          resolveMissionOutcome(session.state);
        } else {
          this.setStatus(
            isHeroAlive(this.playerArmy)
              ? "Бой проигран…"
              : "Герой пал… отряд еле двигается (1 ОД)",
          );
        }
      }
    } catch (err) {
      console.error("finishBattle", err);
      this.setStatus("Бой завершён");
    }

    // Full-screen hit target (Text hit-areas are unreliable in Phaser)
    const { w, h } = viewSize(this);
    const cx = w / 2;
    const cy = h / 2;
    const zone = this.add
      .zone(cx, cy, w, h)
      .setInteractive()
      .setDepth(40);
    zone.on("pointerdown", () => this.leaveToWorld());

    this.add
      .text(cx, cy, "Клик / Enter — на карту", {
        fontFamily: "Georgia, serif",
        fontSize: "24px",
        color: "#e8d5a3",
        backgroundColor: "#1a1510ee",
        padding: { x: 20, y: 12 },
      })
      .setOrigin(0.5)
      .setDepth(41);

    this.exitKeyHandler = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Escape" || e.key === " ") {
        e.preventDefault();
        this.leaveToWorld();
      }
    };
    window.addEventListener("keydown", this.exitKeyHandler);

    // Auto-return even if Phaser timers/input are stuck
    window.setTimeout(() => this.leaveToWorld(), 700);
  }
}
