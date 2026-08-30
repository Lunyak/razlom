import Phaser from "phaser";
import { FACTION_VISUAL } from "../game/factionVisual";
import {
  attachOptionalLoadPump,
  queueAssetPack,
  type AssetEntry,
} from "../game/assetPacks";
import {
  GLASS_PHOTO_ASSETS,
  hurtPortraitPath,
  hurtPortraitTextureKey,
  portraitPath,
  portraitTextureKey,
} from "../game/portraits";
import { GLASS_PHOTO_SIZE } from "../game/vintagePortrait";
import { GlassPhotoFrame, type GlassFrameStyle } from "../ui/GlassPhotoFrame";
import { ScreenRaceFrame } from "../ui/screenRaceFrame";
import { ScreenRaceSwitcher } from "../ui/screenRaceSwitcher";
import { onViewResize, viewW } from "../ui/viewport";
import { RACE_FRAME_ASSETS, SCREEN_FRAME_ASSETS } from "../ui/raceFrameConstructor";
import { FOLIO_FRAME_ASSETS } from "../ui/screenFolioFrame";

const { portraitSize, frameW, frameH } = GLASS_PHOTO_SIZE;
const ROWS = 4;
const START_Y = 118;
const ROW_OVERLAP = 3;
const ROW_STEP = frameH - ROW_OVERLAP;

type SlotDef = {
  key?: string;
  hp: number;
  max: number;
  hero?: boolean;
  vet?: boolean;
  empty?: boolean;
};

interface DemoSlot {
  frame: GlassPhotoFrame;
  style: GlassFrameStyle;
  portraitKey?: string;
  empty: boolean;
  hp: number;
  maxHp: number;
  frost?: number;
}

/** RI roster — locked daguerreotype + gold glass. */
const RI_DEMO_IDS = [
  "hero_ri",
  "hero_ri_eliana",
  "hero_ri_arseniy",
  "knight",
  "archer",
  "squire",
  "acolyte",
  "incorrupt",
  "witch",
  "missionary",
] as const;

/** Ordo — silver glass placeholder until own look. */
const ORDO_DEMO_IDS = [
  "hero_ordo",
  "initiate",
  "skeleton",
  "zombie",
  "ghost",
  "banshee",
] as const;

/** Neutrals under RI frame for now. */
const NEUTRAL_DEMO_IDS = ["wolf", "bandit", "ogre", "dragon"] as const;

const DEMO_PORTRAIT_IDS = [...RI_DEMO_IDS, ...ORDO_DEMO_IDS, ...NEUTRAL_DEMO_IDS] as const;

/**
 * Style gallery: faction glass portraits + hurt flash.
 * Boot menu or URL hash `#test/glass`.
 */
export class GlassFrameTestScene extends Phaser.Scene {
  private slots: DemoSlot[] = [];

  constructor() {
    super("GlassFrameTest");
  }

  preload() {
    attachOptionalLoadPump(this);
    const portraits: AssetEntry[] = DEMO_PORTRAIT_IDS.flatMap((defId) => [
      [portraitTextureKey(defId), portraitPath(defId)],
      [hurtPortraitTextureKey(defId), hurtPortraitPath(defId)],
    ]);
    queueAssetPack(this, [
      ...GLASS_PHOTO_ASSETS,
      ...RACE_FRAME_ASSETS,
      ...SCREEN_FRAME_ASSETS,
      ...FOLIO_FRAME_ASSETS,
      ...portraits,
    ]);
  }

  create() {
    this.cameras.main.setBackgroundColor(0x14100c);
    this.slots = [];

    const cx = viewW(this) / 2;
    this.add
      .text(cx, 22, "СТИЛИСТИКА · РАМКИ ПО РАСАМ", {
        fontFamily: "Georgia, serif",
        fontSize: "26px",
        color: "#e8d5a3",
        stroke: "#1a1008",
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, 52, "ЛКМ — урон · ПКМ — пусто · C — холод · R — сброс · ESC — меню", {
        fontFamily: "Georgia, serif",
        fontSize: "13px",
        color: "#8a7a5a",
      })
      .setOrigin(0.5);

    this.add
      .text(280, 82, "RI · эталон", {
        fontFamily: "Georgia, serif",
        fontSize: "15px",
        color: "#c9a227",
      })
      .setOrigin(0.5);

    this.add
      .text(280, 100, FACTION_VISUAL.ri.note, {
        fontFamily: "Georgia, serif",
        fontSize: "11px",
        color: "#6a6050",
        wordWrap: { width: 340 },
        align: "center",
      })
      .setOrigin(0.5, 0);

    this.add
      .text(1000, 82, "Ordo · occult iron", {
        fontFamily: "Georgia, serif",
        fontSize: "15px",
        color: "#b0a890",
      })
      .setOrigin(0.5);

    this.add
      .text(1000, 100, FACTION_VISUAL.ordo.note, {
        fontFamily: "Georgia, serif",
        fontSize: "11px",
        color: "#6a6858",
        wordWrap: { width: 340 },
        align: "center",
      })
      .setOrigin(0.5, 0);

    const playerDefs: SlotDef[] = [
      { key: "hero_ri", hp: 55, max: 55, hero: true },
      { key: "hero_ri_eliana", hp: 55, max: 55, hero: true },
      { key: "hero_ri_arseniy", hp: 48, max: 48, hero: true },
      { key: "unit_knight", hp: 48, max: 48, vet: true },
      { key: "unit_archer", hp: 32, max: 32 },
      { key: "unit_squire", hp: 40, max: 40 },
      { key: "unit_acolyte", hp: 36, max: 36 },
      { key: "unit_incorrupt", hp: 42, max: 42 },
      { key: "unit_witch", hp: 38, max: 38 },
      { key: "unit_missionary", hp: 42, max: 42 },
    ];

    const enemyDefs: SlotDef[] = [
      { key: "hero_ordo", hp: 50, max: 50, hero: true },
      { key: "unit_initiate", hp: 28, max: 28 },
      { key: "unit_skeleton", hp: 22, max: 40 },
      { key: "unit_zombie", hp: 45, max: 45 },
      { key: "unit_ghost", hp: 30, max: 30 },
      { key: "unit_banshee", hp: 34, max: 34 },
      { key: "unit_wolf", hp: 26, max: 26 },
      { key: "unit_dragon", hp: 80, max: 80, vet: true },
    ];

    this.buildGrid("ri", 280, playerDefs);
    this.buildGrid("ordo", 1000, enemyDefs);

    const screenFrame = new ScreenRaceFrame(this, "folio");
    new ScreenRaceSwitcher(this, screenFrame);
    onViewResize(this, () => screenFrame.layout());

    this.game.canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      const slot = this.slotAt(p);
      if (!slot) return;
      if (p.rightButtonDown()) {
        slot.empty = !slot.empty;
        slot.frame.setEmpty(slot.empty);
        return;
      }
      if (!p.leftButtonDown() || slot.empty) return;
      if (slot.hp <= 0) return;

      slot.hp = Math.max(0, slot.hp - 8);
      const ratio = slot.hp / slot.maxHp;
      slot.frame.setWoundFromHp(slot.hp, slot.maxHp);
      slot.frame.flashDamage();
      if (slot.hp <= 0) {
        slot.frame.markDead();
      } else {
        slot.frame.setHp(`${slot.hp}/${slot.maxHp}`, ratio <= 0.35 ? "#e08080" : "#f5e6c8");
      }
    });

    this.input.keyboard?.on("keydown-C", () => {
      const pointer = this.input.activePointer;
      const slot = this.slotAt(pointer) ?? this.slots.find((s) => !s.empty && s.hp > 0);
      if (!slot || slot.empty || slot.hp <= 0) return;
      slot.frost = Math.min(1, (slot.frost ?? 0) + 0.35);
      slot.frame.setFrost(slot.frost);
      slot.frame.flashFrost();
    });

    this.input.keyboard?.on("keydown-R", () => this.resetAll());
    this.input.keyboard?.on("keydown-ESC", () => {
      window.location.hash = "";
      this.scene.start("Boot");
    });
  }

  private resetAll() {
    for (const slot of this.slots) {
      if (slot.empty || !slot.portraitKey) continue;
      slot.hp = slot.maxHp;
      slot.frost = 0;
      const { x, y } = slot.frame;
      const wasHero = !!slot.portraitKey.startsWith("hero_");
      slot.frame.destroy();
      const frame = new GlassPhotoFrame(this, x, y, {
        portraitKey: slot.portraitKey,
        portraitSize,
        frameW,
        frameH,
        style: slot.style,
        hpLabel: `${slot.maxHp}/${slot.maxHp}`,
        hpColor: "#f5e6c8",
        hero: wasHero,
      });
      frame.setInteractive(frame.getHitRect(), Phaser.Geom.Rectangle.Contains);
      slot.frame = frame;
    }
  }

  private buildGrid(style: GlassFrameStyle, centerX: number, defs: SlotDef[]) {
    const frontX = centerX - frameW / 2;
    const backX = centerX + frameW / 2;

    for (let slot = 0; slot < ROWS * 2; slot++) {
      const row = slot % ROWS;
      const isFront = slot < ROWS;
      const x = isFront ? frontX : backX;
      const y = START_Y + row * ROW_STEP;
      const def = defs[slot] ?? { hp: 0, max: 40, empty: true };
      const empty = !!def.empty || !def.key;

      const frame = new GlassPhotoFrame(this, x, y, {
        portraitKey: empty ? undefined : def.key,
        portraitSize,
        frameW,
        frameH,
        style,
        hpLabel: empty ? undefined : `${def.hp}/${def.max}`,
        hpColor: def.hp <= def.max * 0.35 ? "#e08080" : "#f5e6c8",
        hero: def.hero,
        veteran: def.vet,
      });

      frame.setInteractive(frame.getHitRect(), Phaser.Geom.Rectangle.Contains);
      if (!empty && def.hp < def.max) {
        frame.setWoundFromHp(def.hp, def.max);
      }

      this.slots.push({
        frame,
        style,
        portraitKey: def.key,
        empty,
        hp: def.hp,
        maxHp: def.max,
      });
    }
  }

  private slotAt(pointer: Phaser.Input.Pointer): DemoSlot | undefined {
    for (const slot of this.slots) {
      if (slot.frame.getBounds().contains(pointer.worldX, pointer.worldY)) return slot;
    }
    return undefined;
  }
}

/** BootScene can auto-open the glass frame experiment. */
export function shouldOpenGlassFrameTest(): boolean {
  const hash = window.location.hash.replace(/^#/, "").toLowerCase();
  return hash === "test/glass" || hash === "test/glass-frame" || hash === "test/style";
}
