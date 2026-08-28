import Phaser from "phaser";
import type { Army, UnitInstance } from "../game/data";
import { UNIT_DEFS } from "../game/catalog";
import { glassStyleForFaction } from "../game/factionVisual";
import { BATTLE_ASSETS, attachOptionalLoadPump, queueAssetPack } from "../game/assetPacks";
import { FORMATION_FRAME_KEYS, portraitPath, portraitTextureKey } from "../game/portraits";
import { GLASS_PHOTO_SIZE } from "../game/vintagePortrait";
import { BattleActionBar } from "../ui/BattleActionBar";
import { BattleFocusWindows } from "../ui/BattleFocusWindows";
import { BattleHud } from "../ui/battleHud";
import {
  BATTLE_LAYOUT_ID,
  BATTLE_PIECE_CATALOG,
  battleArenaLayoutRect,
  battlePieceBaseMetrics,
  battlePieceBounds,
  battleUnitLayoutPos,
  resolveFormationAnchor,
} from "../ui/battleLayout";
import {
  battleFormationBounds,
  battleFormationCenter,
} from "../ui/battleFormationLayout";
import { GlassPhotoFrame } from "../ui/GlassPhotoFrame";
import { PanelLayoutEditor } from "../ui/panelStack/PanelLayoutEditor";
import { charcoalInnerBottom, ScreenCharcoalFrame } from "../ui/screenCharcoalFrame";
import { onViewResize, viewSize } from "../ui/viewport";

const { portraitSize, frameW, frameH } = GLASS_PHOTO_SIZE;

const MOCK_PLAYER = ["knight", "squire", "archer", "acolyte", "witch", "marksman"] as const;
const MOCK_ENEMY = ["initiate", "skeleton", "ghost", "zombie", "banshee", "hero_ordo"] as const;

/**
 * Drag-and-drop battle screen layout — same editor as the map sidebar.
 * Boot menu or `#test/battle-layout`. Saves to localStorage.
 */
export class BattleLayoutTestScene extends Phaser.Scene {
  private playerArmy!: Army;
  private enemyArmy!: Army;
  private unitViews: GlassPhotoFrame[] = [];
  private formationDecor: Phaser.GameObjects.GameObject[] = [];
  private arenaGfx?: Phaser.GameObjects.Graphics;
  private hud!: BattleHud;
  private actionBar!: BattleActionBar;
  private focusWindows!: BattleFocusWindows;
  private screenFrame!: ScreenCharcoalFrame;
  private layoutEditor!: PanelLayoutEditor;
  private battleCx = 640;
  private formationStartY = 200;
  private nextId = 1;

  constructor() {
    super("BattleLayoutTest");
  }

  preload() {
    attachOptionalLoadPump(this);
    const portraits: [string, string][] = [...MOCK_PLAYER, ...MOCK_ENEMY].map((defId) => [
      portraitTextureKey(defId),
      portraitPath(defId),
    ]);
    queueAssetPack(this, [...BATTLE_ASSETS, ...portraits]);
  }

  create() {
    this.cameras.main.setBackgroundColor(0x1c1814);
    this.playerArmy = this.makeArmy("ri", MOCK_PLAYER);
    this.enemyArmy = this.makeArmy("ordo", MOCK_ENEMY);

    this.hud = new BattleHud(this, { onBag: () => this.hud.setStatus("Сумка (макет)") });
    this.hud.build("БОЙ");
    this.hud.setStatus("Список справа · drag — двигать · угол — масштаб · S — сохранено в браузере");
    this.hud.setSpellLine("[Q] Святой удар  [W] Исцеление  [I] сумка");

    this.actionBar = new BattleActionBar(this, {
      onSkip: () => this.hud.setStatus("Пропуск (макет)"),
      onDefend: () => this.hud.setStatus("Защита (макет)"),
      onFlee: () => this.hud.setStatus("Бегство (макет)"),
      onQuick: () => this.hud.setStatus("Быстрый бой (макет)"),
    });
    this.actionBar.setState({ playerTurn: true, busy: false, canFlee: true });

    this.focusWindows = new BattleFocusWindows(this);
    this.focusWindows.setActor({
      unit: this.playerArmy.units[0],
      army: this.playerArmy,
      side: "player",
    });
    this.focusWindows.setTarget({
      unit: this.enemyArmy.units[0],
      army: this.enemyArmy,
      side: "enemy",
    });

    this.screenFrame = new ScreenCharcoalFrame(this);

    this.layoutEditor = new PanelLayoutEditor(this);
    this.layoutEditor.mount();
    this.layoutEditor.open({
      layoutId: BATTLE_LAYOUT_ID,
      pieceCatalog: BATTLE_PIECE_CATALOG,
      pieceBounds: (id, w, h) => battlePieceBounds(id, w, h),
      pieceBaseMetrics: (id) => battlePieceBaseMetrics(id),
      relayout: () => this.layoutAll(),
    });

    this.spawnFormations();

    onViewResize(this, () => this.layoutAll());

    this.input.keyboard?.on("keydown-ESC", () => {
      if (this.layoutEditor.handleEscape()) return;
      window.location.hash = "";
      this.scene.start("Boot");
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.layoutEditor?.close();
      this.actionBar?.destroy();
      this.focusWindows?.destroy();
    });

    this.layoutAll();
  }

  private makeArmy(faction: Army["faction"], roster: readonly string[]): Army {
    const units: UnitInstance[] = roster.map((defId, slot) => ({
      instanceId: `layout_${this.nextId++}`,
      defId,
      hp: UNIT_DEFS[defId].maxHp,
      slot,
      statuses: [],
      isHero: defId.startsWith("hero_"),
    }));
    return {
      id: `layout-${faction}`,
      faction,
      name: faction === "ri" ? "Испытание" : "Противник",
      x: 0,
      y: 0,
      mapId: "test",
      units,
      isPlayer: faction === "ri",
      movesLeft: 0,
      hero: { name: "Макет", level: 1, xp: 0, xpToNext: 100 },
    };
  }

  private layoutAll() {
    const { w, h } = viewSize(this);
    const anchor = resolveFormationAnchor(w, h);
    this.battleCx = anchor.battleCx;
    this.formationStartY = anchor.formationStartY;

    this.rebuildArena();
    this.repositionUnits();

    this.hud.layout(w, h);
    this.actionBar.layout();
    const chrome = this.hud.charcoalChrome(w, h);
    this.screenFrame.setChrome(chrome);
    this.screenFrame.layout();
    this.focusWindows.layout({ restBottom: charcoalInnerBottom(chrome.box) });
    this.layoutEditor.layout(w, h);
  }

  private rebuildArena() {
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
    const gr = this.add.graphics().setDepth(1);
    gr.fillStyle(0x14100e, 0.82);
    gr.fillRect(b.x, b.y, b.w, b.h);
    gr.lineStyle(2, side === "player" ? 0xc9a227 : 0x98a8c0, 0.9);
    gr.strokeRect(b.x, b.y, b.w, b.h);
    this.formationDecor.push(gr);
  }

  private spawnFormations() {
    for (const view of this.unitViews) view.destroy(true);
    this.unitViews = [];

    for (const side of ["player", "enemy"] as const) {
      const army = side === "player" ? this.playerArmy : this.enemyArmy;
      const style = glassStyleForFaction(army.faction);
      for (const unit of army.units) {
        if (unit.slot === undefined) continue;
        const def = UNIT_DEFS[unit.defId];
        const { w, h } = viewSize(this);
        const pos = battleUnitLayoutPos(side, unit.slot, w, h);
        const tex = portraitTextureKey(unit.defId);
        const frame = new GlassPhotoFrame(this, pos.x, pos.y, {
          portraitKey: this.textures.exists(tex) ? tex : undefined,
          portraitSize,
          frameW,
          frameH,
          style,
          hpLabel: `${unit.hp}/${def.maxHp}`,
          hero: unit.isHero,
        });
        frame.setDepth(2);
        frame.setData("side", side);
        frame.setData("slot", unit.slot);
        this.unitViews.push(frame);
      }
    }
  }

  private repositionUnits() {
    const { w, h } = viewSize(this);
    for (const view of this.unitViews) {
      const side = view.getData("side") as "player" | "enemy";
      const slot = view.getData("slot") as number;
      const pos = battleUnitLayoutPos(side, slot, w, h);
      view.setPosition(pos.x, pos.y);
    }
  }
}

export function shouldOpenBattleLayoutTest(): boolean {
  const hash = (window.location.hash || "").replace(/^#/, "").toLowerCase();
  return hash === "test/battle-layout" || hash === "test/battle/editor";
}
