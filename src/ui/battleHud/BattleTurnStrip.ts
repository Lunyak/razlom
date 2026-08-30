import Phaser from "phaser";
import { UNIT_DEFS } from "../../game/catalog";
import type { Army, UnitInstance } from "../../game/data";
import { glassStyleForFaction } from "../../game/factionVisual";
import { portraitTextureKey } from "../../game/portraits";
import { initiativeBonus, statusChips } from "../../game/status";
import { battleTurnStripRect } from "../battleLayout";
import { GlassPhotoFrame } from "../GlassPhotoFrame";
import {
  BATTLE_TURN_STRIP_GAP,
  BATTLE_TURN_STRIP_MIN,
  setBattleTurnStripCount,
} from "./battleWindowFrame";
import { viewSize } from "../viewport";

export type TurnStripEntry = {
  unit: UnitInstance;
  army: Army;
  side: "player" | "enemy";
};

type Slot = {
  frame: GlassPhotoFrame;
  badge: Phaser.GameObjects.Text;
  orderNo: Phaser.GameObjects.Text;
  unitId: string;
};

const RATIO = 146 / 160;

/**
 * Bottom band of unit frames in turn order, packed left.
 * Extra cells repeat the next rounds so the band stays full.
 */
export class BattleTurnStrip {
  private readonly root: Phaser.GameObjects.Container;
  private readonly plate: Phaser.GameObjects.Graphics;
  private readonly clipGfx: Phaser.GameObjects.Graphics;
  private readonly clipMask: Phaser.Display.Masks.GeometryMask;
  private slots: Slot[] = [];
  private entries: TurnStripEntry[] = [];
  private currentId: string | null = null;
  private rightInset = 0;
  private layoutKey = "";

  constructor(private scene: Phaser.Scene) {
    this.plate = scene.add.graphics().setScrollFactor(0);
    this.root = scene.add.container(0, 0).setDepth(24).setScrollFactor(0);
    this.root.add(this.plate);
    this.clipGfx = scene.add.graphics().setVisible(false);
    this.clipMask = this.clipGfx.createGeometryMask();
    this.root.setMask(this.clipMask);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  setRightInset(px: number): void {
    this.rightInset = Math.max(0, px);
  }

  setQueue(entries: TurnStripEntry[], currentId: string | null): void {
    this.entries = entries;
    this.currentId = currentId;
    this.relayout();
  }

  layout(): void {
    this.relayout();
  }

  destroy(): void {
    if (!this.root.active) return;
    this.root.clearMask(true);
    this.clearSlots();
    this.clipGfx.destroy();
    this.root.destroy(true);
  }

  private relayout(): void {
    if (!this.root.active) return;
    const { w, h } = viewSize(this.scene);
    const unique = rotateToCurrent(this.entries, this.currentId);
    setBattleTurnStripCount(unique.length);
    const rect = battleTurnStripRect(w, h, { rightInset: this.rightInset });
    const gap = BATTLE_TURN_STRIP_GAP;
    const { n, cell } = packTurns(rect.w, rect.h, gap);
    const queue = fillStrip(unique, n);
    const portrait = Math.max(48, Math.round(cell * RATIO));
    const key = `${queue.map((e) => e.unit.instanceId).join("|")}:${cell}:${rect.w}x${rect.h}`;

    this.drawPlate(rect, rect.h);
    this.clipTo(rect, rect.h);

    if (key !== this.layoutKey) {
      this.layoutKey = key;
      this.rebuildSlots(queue, cell, portrait);
    }

    let x = rect.x + cell / 2;
    const y = rect.y + rect.h / 2;

    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      const entry = queue[i];
      if (!entry) continue;
      const isCurrent = i === 0 && entry.unit.instanceId === this.currentId;
      const dead = !(entry.unit.hp > 0);
      slot.frame.setPosition(x, y);
      slot.frame.setScale(1);
      slot.frame.setAlpha(dead ? 1 : isCurrent ? 1 : 0.78);
      slot.badge.setPosition(x, y - cell / 2 + 8);
      slot.badge.setVisible(isCurrent && !dead);
      slot.orderNo.setPosition(x - cell / 2 + 12, y - cell / 2 + 12);
      slot.orderNo.setText(String(i + 1));
      this.paintSlot(slot, entry, isCurrent);
      x += cell + gap;
    }
  }

  private clipTo(rect: { x: number; y: number; w: number }, bandH: number): void {
    this.clipGfx.clear();
    this.clipGfx.fillStyle(0xffffff, 1);
    this.clipGfx.fillRect(rect.x, rect.y, rect.w, bandH);
  }

  private drawPlate(rect: { x: number; y: number; w: number }, bandH: number): void {
    const g = this.plate;
    g.clear();
    g.fillStyle(0x080706, 0.72);
    g.fillRect(rect.x, rect.y, rect.w, bandH);
    g.lineStyle(1, 0xc8c4bc, 0.28);
    g.lineBetween(rect.x + 12, rect.y + 1, rect.x + rect.w - 12, rect.y + 1);
    g.lineStyle(1, 0x2a2824, 0.8);
    g.lineBetween(rect.x, rect.y, rect.x + rect.w, rect.y);
  }

  private rebuildSlots(queue: TurnStripEntry[], frame: number, portrait: number): void {
    this.clearSlots();
    for (const entry of queue) {
      const def = UNIT_DEFS[entry.unit.defId];
      const tex = portraitTextureKey(entry.unit.defId);
      const photo = this.scene.textures.exists(tex) ? tex : undefined;
      const gf = new GlassPhotoFrame(this.scene, 0, 0, {
        portraitKey: photo,
        portraitSize: portrait,
        frameW: frame,
        frameH: frame,
        style: glassStyleForFaction(entry.army.faction),
        hpLabel: entry.unit.hp > 0 ? `${entry.unit.hp}/${def?.maxHp ?? 0}` : "†",
        hpColor: entry.unit.hp > 0 ? "#f5e6c8" : "#c08080",
        hero: entry.unit.isHero,
      });
      const badge = this.scene.add
        .text(0, 0, "ХОД", {
          fontFamily: "Georgia, serif",
          fontSize: "11px",
          color: "#e8d5a3",
          stroke: "#0a0806",
          strokeThickness: 3,
        })
        .setOrigin(0.5, 0)
        .setScrollFactor(0);
      const orderNo = this.scene.add
        .text(0, 0, "1", {
          fontFamily: "Georgia, serif",
          fontSize: "12px",
          color: "#efe6d2",
          stroke: "#0a0806",
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setScrollFactor(0);
      this.root.add([gf, badge, orderNo]);
      this.slots.push({ frame: gf, badge, orderNo, unitId: entry.unit.instanceId });
    }
  }

  private paintSlot(slot: Slot, entry: TurnStripEntry, isCurrent: boolean): void {
    const def = UNIT_DEFS[entry.unit.defId];
    const dead = !(entry.unit.hp > 0);
    if (dead) {
      if (!slot.frame.isFallen()) slot.frame.markDead();
      slot.frame.setTargetHighlight("none");
      return;
    }
    if (slot.frame.isFallen()) slot.frame.revive();
    if (def) {
      slot.frame.setWoundFromHp(entry.unit.hp, def.maxHp);
      slot.frame.setHp(
        `${entry.unit.hp}/${def.maxHp}`,
        entry.unit.hp <= def.maxHp * 0.35 ? "#e08080" : "#f5e6c8",
      );
    }
    slot.frame.setStatusChips(statusChips(entry.unit));
    slot.frame.setTargetHighlight(isCurrent ? "valid" : "none");
  }

  private clearSlots(): void {
    for (const slot of this.slots) {
      slot.frame.destroy(true);
      slot.badge.destroy();
      slot.orderNo.destroy();
    }
    this.slots = [];
  }
}

/** Both armies, including the fallen, sorted by initiative (high first). */
export function unitsInInitiativeOrder(
  player: Army,
  enemy: Army,
  extra?: { player?: number; enemy?: number },
): TurnStripEntry[] {
  const list: TurnStripEntry[] = [];
  for (const unit of player.units) list.push({ unit, army: player, side: "player" });
  for (const unit of enemy.units) list.push({ unit, army: enemy, side: "enemy" });
  list.sort((a, b) => {
    const extraA = a.side === "player" ? extra?.player ?? 0 : extra?.enemy ?? 0;
    const extraB = b.side === "player" ? extra?.player ?? 0 : extra?.enemy ?? 0;
    const ia = (UNIT_DEFS[a.unit.defId]?.initiative ?? 0) + initiativeBonus(a.unit) + extraA;
    const ib = (UNIT_DEFS[b.unit.defId]?.initiative ?? 0) + initiativeBonus(b.unit) + extraB;
    return ib - ia;
  });
  return list;
}

function rotateToCurrent(entries: TurnStripEntry[], currentId: string | null): TurnStripEntry[] {
  if (!currentId || entries.length === 0) return entries;
  const idx = entries.findIndex((e) => e.unit.instanceId === currentId);
  if (idx <= 0) return entries;
  return [...entries.slice(idx), ...entries.slice(0, idx)];
}

/** Repeat the initiative cycle until the band is full. */
function fillStrip(entries: TurnStripEntry[], maxVisible: number): TurnStripEntry[] {
  if (entries.length === 0 || maxVisible <= 0) return [];
  if (entries.length >= maxVisible) return entries.slice(0, maxVisible);
  const out: TurnStripEntry[] = [];
  while (out.length < maxVisible) out.push(...entries);
  return out.slice(0, maxVisible);
}

/** Pack left at preferred size; squeeze in extra turns if the right edge would stay empty. */
function packTurns(
  bandW: number,
  preferred: number,
  gap: number,
): { n: number; cell: number } {
  const cell0 = Math.max(BATTLE_TURN_STRIP_MIN, preferred);
  let n = Math.max(1, Math.floor((bandW + gap) / (cell0 + gap)));
  let cell = cell0;
  while (n < 32) {
    const leftover = bandW - n * cell - Math.max(0, n - 1) * gap;
    if (leftover < (cell + gap) * 0.35) break;
    const next = Math.floor((bandW - gap * n) / (n + 1));
    if (next < BATTLE_TURN_STRIP_MIN) break;
    n += 1;
    cell = next;
  }
  return { n, cell };
}
