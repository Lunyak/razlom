import Phaser from "phaser";
import { FACTION_LABEL, UNIT_DEFS, UNIT_SKILLS } from "../game/catalog";
import { type Army, type FactionId, type UnitInstance } from "../game/data";
import type { SupplyStatus } from "../game/rails";
import { portraitTextureKey, unitInfoCardTextureKey } from "../game/portraits";
import { formatStatusLines } from "../game/status";
import { upgradeFor } from "../game/upgrades";
import { GlassPhotoFrame } from "./GlassPhotoFrame";
import {
  DOSSIER,
  buildDossierChrome,
  dossierStatText,
  glassStyleForFaction,
} from "./vintageDossier";
import { viewH, viewW } from "./viewport";

const PANEL_W = 340;
const PANEL_H = 420;
const PORTRAIT = 132;
const CARD_ASPECT = 0.75;
const INK = {
  family: "Georgia, 'Palatino Linotype', 'Times New Roman', serif",
  body: "#2a1f14",
  faded: "#5c4a36",
  wound: "#6b2a22",
};
/** Ledger box on the manuscript plate (fractions of the displayed card). */
const LEDGER = { left: 0.1, right: 0.9, top: 0.625, bottom: 0.93 };

export interface UnitInspectContext {
  unit: UnitInstance;
  army: Army;
  side: "player" | "enemy";
  supply?: SupplyStatus;
}

function displayName(ctx: UnitInspectContext): string {
  const def = UNIT_DEFS[ctx.unit.defId];
  if (ctx.unit.isHero) return ctx.army.hero.name || def?.name || "Командир";
  return def?.name ?? "???";
}

function battleRow(unit: UnitInstance): string {
  if (unit.slot === undefined) return "—";
  const row = unit.slot < 3 ? "передний ряд" : "задний ряд";
  const pos = (unit.slot % 3) + 1;
  return `${row}, позиция ${pos}`;
}

function damageBreakdown(unit: UnitInstance, supply?: SupplyStatus): { total: number; notes: string[] } {
  const def = UNIT_DEFS[unit.defId];
  if (!def) return { total: 0, notes: [] };
  const notes: string[] = [`база ${def.damage}`];
  let total = def.damage;
  if (unit.veteran) {
    total += 3;
    notes.push("+3 ветеран");
  }
  if (unit.isHero) {
    total += 2;
    notes.push("+2 командир");
  }
  if (supply?.damage) {
    total += supply.damage;
    notes.push(`${supply.damage > 0 ? "+" : ""}${supply.damage} снабжение`);
  }
  return { total, notes };
}

function resolvePortraitKey(scene: Phaser.Scene, defId: string): string | undefined {
  const key = portraitTextureKey(defId);
  if (scene.textures.exists(key)) return key;
  if (scene.textures.exists("unit_squire")) return "unit_squire";
  return undefined;
}

function cardTextureKey(scene: Phaser.Scene, defId: string): string | undefined {
  const key = unitInfoCardTextureKey(defId);
  if (key && scene.textures.exists(key)) return key;
  return undefined;
}

function allegianceLine(ctx: UnitInspectContext): string {
  const faction = FACTION_LABEL[ctx.army.faction] ?? ctx.army.faction;
  const allegiance =
    ctx.side === "player"
      ? ctx.army.isPlayer
        ? "ваш отряд"
        : "союзник"
      : ctx.army.isNeutral
        ? "нейтрал"
        : "противник";
  return `${faction} · ${allegiance}`;
}

function cardSize(scene: Phaser.Scene): { w: number; h: number } {
  const h = Math.min(viewH(scene) - 24, Math.round(viewH(scene) * 0.9), 660);
  return { w: Math.round(h * CARD_ASPECT), h };
}

/**
 * Battle unit dossier — manuscript info card when art exists, else glass-plate stats (RMB hold).
 */
export class UnitInspectPanel {
  private dossierRoot: Phaser.GameObjects.Container;
  private bodyHost: Phaser.GameObjects.Container;
  private setFaction: (faction: FactionId) => void;
  private portraitFrame: GlassPhotoFrame | null = null;
  private bodyText!: Phaser.GameObjects.Text;
  private nameText!: Phaser.GameObjects.Text;

  private cardRoot: Phaser.GameObjects.Container;
  private cardImage: Phaser.GameObjects.Image;
  private cardName!: Phaser.GameObjects.Text;
  private cardHp!: Phaser.GameObjects.Text;
  private cardBody!: Phaser.GameObjects.Text;
  private cardHint!: Phaser.GameObjects.Text;

  private open = false;
  private shownId: string | null = null;
  private lastSide: "player" | "enemy" = "player";
  private usingCard = false;

  constructor(private scene: Phaser.Scene) {
    const chrome = buildDossierChrome(scene, PANEL_W, PANEL_H, { title: "ВОИН" });
    this.dossierRoot = chrome.root;
    this.bodyHost = chrome.bodyHost;
    this.setFaction = chrome.setFaction;
    this.dossierRoot
      .setPosition(viewW(scene) - PANEL_W / 2 - 40, viewH(scene) / 2)
      .setDepth(35)
      .setScrollFactor(0)
      .setVisible(false);

    this.nameText = scene.add
      .text(0, -PANEL_H / 2 + 78, "", {
        fontFamily: "Georgia, serif",
        fontSize: "16px",
        color: DOSSIER.gold,
        stroke: "#1a1008",
        strokeThickness: 2,
        align: "center",
        wordWrap: { width: PANEL_W - 40 },
      })
      .setOrigin(0.5, 0);

    this.bodyText = dossierStatText(
      scene,
      -PANEL_W / 2 + 28,
      -PANEL_H / 2 + 250,
      "",
      PANEL_W - 56,
      "13px",
    );

    this.bodyHost.add([this.nameText, this.bodyText]);

    const { w, h } = cardSize(scene);
    this.cardRoot = scene.add.container(0, 0).setDepth(36).setScrollFactor(0).setVisible(false);
    const shadow = scene.add.rectangle(6, 8, w, h, 0x0a0806, 0.45).setName("cardShadow");
    this.cardImage = scene.add.image(0, 0, "__DEFAULT").setOrigin(0.5).setName("cardPlate");
    this.cardName = scene.add
      .text(0, 0, "", {
        fontFamily: INK.family,
        fontSize: "18px",
        fontStyle: "italic",
        color: INK.body,
      })
      .setOrigin(0, 0);
    this.cardHp = scene.add
      .text(0, 0, "", {
        fontFamily: INK.family,
        fontSize: "15px",
        fontStyle: "italic",
        color: INK.body,
        align: "right",
      })
      .setOrigin(1, 0);
    this.cardBody = scene.add
      .text(0, 0, "", {
        fontFamily: INK.family,
        fontSize: "13px",
        fontStyle: "italic",
        color: INK.body,
        lineSpacing: 3,
      })
      .setOrigin(0, 0);
    this.cardHint = scene.add
      .text(0, 0, "отпустите ПКМ, чтобы закрыть", {
        fontFamily: INK.family,
        fontSize: "11px",
        fontStyle: "italic",
        color: INK.faded,
      })
      .setOrigin(0.5, 1);
    this.cardRoot.add([shadow, this.cardImage, this.cardName, this.cardHp, this.cardBody, this.cardHint]);
  }

  isOpen(): boolean {
    return this.open;
  }

  layout(): void {
    this.dossierRoot.setPosition(viewW(this.scene) - PANEL_W / 2 - 40, viewH(this.scene) / 2);
    if (this.usingCard) this.layoutCard();
  }

  show(ctx: UnitInspectContext): void {
    this.open = true;
    this.lastSide = ctx.side;
    const plate = cardTextureKey(this.scene, ctx.unit.defId);
    if (plate) {
      this.dossierRoot.setVisible(false);
      this.showCard(ctx, plate);
      return;
    }
    this.cardRoot.setVisible(false);
    this.usingCard = false;
    this.showDossier(ctx);
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.usingCard = false;
    this.dossierRoot.setVisible(false);
    this.cardRoot.setVisible(false);
  }

  private showCard(ctx: UnitInspectContext, plate: string): void {
    this.usingCard = true;
    this.cardRoot.setVisible(true);
    if (this.cardImage.texture.key !== plate) this.cardImage.setTexture(plate);
    this.layoutCard();

    const def = UNIT_DEFS[ctx.unit.defId];
    const dead = !(ctx.unit.hp > 0);
    const wounded = !dead && ctx.unit.hp <= (def?.maxHp ?? 1) * 0.35;
    this.cardName.setText(displayName(ctx));
    this.cardHp.setText(dead ? "†" : `${ctx.unit.hp} / ${def?.maxHp ?? "?"}`);
    this.cardHp.setColor(dead || wounded ? INK.wound : INK.body);
    this.cardBody.setText(this.formatLedger(ctx));
    this.shownId = ctx.unit.instanceId;
  }

  private layoutCard(): void {
    const { w, h } = cardSize(this.scene);
    const pad = 18;
    const x = this.lastSide === "enemy" ? pad + w / 2 : viewW(this.scene) - pad - w / 2;
    this.cardRoot.setPosition(x, viewH(this.scene) / 2);
    this.cardImage.setDisplaySize(w, h);
    const shadow = this.cardRoot.getByName("cardShadow") as Phaser.GameObjects.Rectangle | null;
    shadow?.setSize(w, h);

    const left = -w / 2 + w * LEDGER.left;
    const right = -w / 2 + w * LEDGER.right;
    const top = -h / 2 + h * LEDGER.top;
    const bottom = -h / 2 + h * LEDGER.bottom;
    const wrap = right - left;
    const nameSize = Math.max(15, Math.round(h * 0.028));
    const bodySize = Math.max(12, Math.round(h * 0.021));

    this.cardName.setFontSize(nameSize).setPosition(left, top);
    this.cardHp.setFontSize(Math.max(13, nameSize - 2)).setPosition(right, top + 2);
    this.cardBody
      .setFontSize(bodySize)
      .setWordWrapWidth(wrap)
      .setPosition(left, top + nameSize + 6);
    this.cardHint.setFontSize(Math.max(10, Math.round(h * 0.016))).setPosition(0, bottom);
  }

  private showDossier(ctx: UnitInspectContext): void {
    this.dossierRoot.setVisible(true);
    this.setFaction(ctx.army.faction);

    const def = UNIT_DEFS[ctx.unit.defId];
    const dead = !(ctx.unit.hp > 0);
    const hpColor = dead
      ? DOSSIER.danger
      : ctx.unit.hp <= (def?.maxHp ?? 1) * 0.35
        ? DOSSIER.danger
        : DOSSIER.ink;

    this.nameText.setText(displayName(ctx).toUpperCase());
    this.bodyText.setText(this.formatUnit(ctx));

    const needRebuild =
      !this.portraitFrame ||
      this.shownId !== ctx.unit.instanceId ||
      this.portraitFrame.isFallen() !== dead;

    if (needRebuild) {
      this.portraitFrame?.destroy();
      const texKey = resolvePortraitKey(this.scene, ctx.unit.defId);
      this.portraitFrame = new GlassPhotoFrame(this.scene, 0, -PANEL_H / 2 + 168, {
        portraitKey: texKey,
        portraitSize: PORTRAIT - 14,
        frameW: PORTRAIT,
        frameH: PORTRAIT,
        style: glassStyleForFaction(ctx.army.faction),
        hpLabel: dead ? "†" : `${ctx.unit.hp}/${def?.maxHp ?? "?"}`,
        hpColor,
        hero: ctx.unit.isHero,
        veteran: ctx.unit.veteran,
      });
      this.portraitFrame.setScrollFactor(0);
      if (dead) this.portraitFrame.markDead();
      this.bodyHost.add(this.portraitFrame);
      this.shownId = ctx.unit.instanceId;
    } else if (this.portraitFrame) {
      this.portraitFrame.setHp(dead ? "†" : `${ctx.unit.hp}/${def?.maxHp ?? "?"}`, hpColor);
    }
  }

  private formatLedger(ctx: UnitInspectContext): string {
    const { unit } = ctx;
    const def = UNIT_DEFS[unit.defId];
    if (!def) return "неизвестный воин";

    const lines: string[] = [];
    lines.push(allegianceLine(ctx));
    const marks: string[] = [];
    if (unit.isHero) marks.push("командир отряда");
    if (unit.veteran) marks.push("ветеран");
    if (marks.length) lines.push(marks.join(" · "));
    lines.push("");

    const { total, notes } = damageBreakdown(unit, ctx.supply);
    const dmg = notes.length > 1 ? `${total} (${notes.join(", ")})` : `${total}`;
    const heal = def.heal ? `   лечение ${def.heal}` : "";
    const init = def.initiative + (ctx.supply?.initiative ?? 0);
    const armor = ctx.supply?.armor ? `   броня ${ctx.supply.armor}` : "";
    lines.push(`урон ${dmg}   инициатива ${init}${heal}${armor}`);
    lines.push(`${def.ranged ? "дальний бой" : "ближний бой"}   ${battleRow(unit)}`);

    const statusLines = formatStatusLines(unit);
    if (statusLines.length) {
      lines.push("");
      lines.push("статусы");
      for (const line of statusLines) lines.push(`· ${line}`);
    }

    lines.push("");
    if (def.ranged) lines.push("бьёт с любой дистанции");
    else if (unit.slot !== undefined && unit.slot < 3) lines.push("контратака в ближнем");
    else if (unit.slot !== undefined) lines.push("из тыла −15% к урону");
    lines.push(def.preferredRow === 0 ? "держит передний ряд" : "держит тыл");

    const next = upgradeFor(unit.defId);
    if (next) {
      const to = UNIT_DEFS[next.to];
      lines.push(`повышение — ${to?.name ?? next.to}`);
    }

    return lines.join("\n");
  }

  private formatUnit(ctx: UnitInspectContext): string {
    const { unit } = ctx;
    const def = UNIT_DEFS[unit.defId];
    if (!def) return "Неизвестный юнит";

    const lines: string[] = [];
    lines.push(allegianceLine(ctx));
    if (unit.isHero) lines.push("Командир отряда");
    if (unit.veteran) lines.push("Ветеран ★");
    lines.push("");

    const { total, notes } = damageBreakdown(unit, ctx.supply);
    lines.push(`Урон ${total}${notes.length > 1 ? ` (${notes.join(", ")})` : ""}`);
    if (def.heal) lines.push(`Лечение ${def.heal} (клик по союзнику)`);
    if (def.skills?.length) {
      lines.push(`Умение: ${def.skills.map((id) => UNIT_SKILLS[id].name).join(", ")}`);
    }
    const init = def.initiative + (ctx.supply?.initiative ?? 0);
    lines.push(`Инициатива ${init}${ctx.supply?.initiative ? ` (снабжение +${ctx.supply.initiative})` : ""}`);
    if (ctx.supply?.armor) lines.push(`Броня ${ctx.supply.armor} (снабжение)`);
    lines.push(def.ranged ? "Дальний бой" : "Ближний бой");
    lines.push(battleRow(unit));
    lines.push("");

    const statusLines = formatStatusLines(unit);
    if (statusLines.length) {
      lines.push("Статусы:");
      for (const line of statusLines) lines.push(`• ${line}`);
      lines.push("");
    }

    if (def.heal) lines.push("• Слабый удар · сильное лечение");
    if (def.ranged) lines.push("• Бьёт с любой дистанции");
    else if (unit.slot !== undefined && unit.slot < 3) lines.push("• Контратака в ближнем");
    else lines.push("• Из тыла −15% к урону");

    if (def.preferredRow === 0) lines.push("• Предпочитает передний ряд");
    else lines.push("• Предпочитает тыл");

    const next = upgradeFor(unit.defId);
    if (next) {
      const to = UNIT_DEFS[next.to];
      lines.push("");
      lines.push(`Повышение: ${to?.name ?? next.to}`);
    }

    return lines.join("\n");
  }
}
