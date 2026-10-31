import Phaser from "phaser";
import { leadershipLimit } from "../game/battle";
import { FACTION_LABEL, UNIT_DEFS } from "../game/catalog";
import {
  armyMaxMoves,
  armyUnitCount,
  findHeroUnit,
  isHeroAlive,
  livingUnits,
  nightHeroUnitDefId,
  partyUnits,
  session,
  type Army,
  type FactionId,
  type UnitInstance,
} from "../game/data";
import { armyInfoCardTextureKey, portraitTextureKey } from "../game/portraits";
import { classLabel } from "../game/heroClasses";
import { marchPointsLabel, veilPresenceLabel } from "../game/dayNight";
import { armySupply, formatSupplyStatus } from "../game/rails";
import { GlassPhotoFrame } from "./GlassPhotoFrame";
import {
  DOSSIER,
  buildDossierChrome,
  dossierStatText,
  glassStyleForFaction,
} from "./vintageDossier";
import { viewH, viewW } from "./viewport";

const PANEL_W = 380;
const PANEL_H = 560;
const HERO_SIZE = 108;
const UNIT_SIZE = 72;
const COLS = 3;
const HERO_X = -PANEL_W / 2 + 28 + HERO_SIZE / 2;
const HERO_Y = -PANEL_H / 2 + 130;
const TEXT_X = HERO_X + HERO_SIZE / 2 + 14;
const CARD_ASPECT = 0.75;
const INK = {
  family: "Georgia, 'Palatino Linotype', 'Times New Roman', serif",
  body: "#2a1f14",
  faded: "#5c4a36",
  wound: "#6b2a22",
};
const LEDGER = { left: 0.1, right: 0.9, top: 0.62, bottom: 0.93 };

function resolvePortraitKey(scene: Phaser.Scene, defId: string): string | undefined {
  const key = portraitTextureKey(defId);
  if (scene.textures.exists(key)) return key;
  if (scene.textures.exists("unit_squire")) return "unit_squire";
  return undefined;
}

function unitCaption(unit: UnitInstance): string {
  const def = UNIT_DEFS[unit.defId];
  if (!def) return "???";
  const dead = !(unit.hp > 0);
  const hp = dead ? "†" : `${unit.hp}`;
  const marks = `${unit.veteran ? "★" : ""}${unit.isHero ? "◆" : ""}${def.ranged ? "↗" : ""}`;
  return `${def.name}\n${hp}${marks ? ` ${marks}` : ""}`;
}

function cardSize(scene: Phaser.Scene): { w: number; h: number } {
  const h = Math.min(viewH(scene) - 24, Math.round(viewH(scene) * 0.9), 660);
  return { w: Math.round(h * CARD_ASPECT), h };
}

function armyTitle(army: Army): string {
  return army.isNeutral ? army.name : army.name || army.hero.name;
}

function rosterLine(unit: UnitInstance, army: Army): string {
  const def = UNIT_DEFS[unit.defId];
  const name = unit.isHero ? army.hero.name || def?.name || "командир" : def?.name ?? "???";
  const dead = !(unit.hp > 0);
  const hp = dead ? "†" : `${unit.hp}/${def?.maxHp ?? "?"}`;
  const marks = `${unit.veteran ? " ★" : ""}${unit.isHero ? " ◆" : ""}`;
  return `${name}  ${hp}${marks}`;
}

/**
 * Floating army dossier — manuscript order-of-battle plate when art exists,
 * else glass portraits while RMB is held over a map stack.
 */
export class ArmyInspectPanel {
  private dossierRoot: Phaser.GameObjects.Container;
  private bodyHost: Phaser.GameObjects.Container;
  private setFaction: (faction: FactionId) => void;
  private headerText!: Phaser.GameObjects.Text;
  private metaText!: Phaser.GameObjects.Text;
  private rosterLabel!: Phaser.GameObjects.Text;
  private heroFrame: GlassPhotoFrame | null = null;
  private rosterFrames: GlassPhotoFrame[] = [];
  private rosterCaptions: Phaser.GameObjects.Text[] = [];

  private cardRoot: Phaser.GameObjects.Container;
  private cardImage: Phaser.GameObjects.Image;
  private cardName!: Phaser.GameObjects.Text;
  private cardMeta!: Phaser.GameObjects.Text;
  private cardBody!: Phaser.GameObjects.Text;
  private cardHint!: Phaser.GameObjects.Text;

  private open = false;
  /** Stays open after RMB release — toggled from left HUD «ОТРЯД». */
  private pinned = false;
  private shownArmyId: string | null = null;
  private usingCard = false;

  constructor(private scene: Phaser.Scene) {
    const chrome = buildDossierChrome(scene, PANEL_W, PANEL_H, { title: "ОТРЯД" });
    this.dossierRoot = chrome.root;
    this.bodyHost = chrome.bodyHost;
    this.setFaction = chrome.setFaction;
    this.dossierRoot
      .setPosition(viewW(scene) - PANEL_W / 2 - 40, viewH(scene) / 2)
      .setDepth(35)
      .setScrollFactor(0)
      .setVisible(false);

    this.headerText = scene.add
      .text(TEXT_X, -PANEL_H / 2 + 86, "", {
        fontFamily: "Georgia, serif",
        fontSize: "17px",
        color: DOSSIER.gold,
        stroke: "#1a1008",
        strokeThickness: 2,
        wordWrap: { width: PANEL_W / 2 - 24 },
      })
      .setOrigin(0, 0);

    this.metaText = dossierStatText(
      scene,
      TEXT_X,
      -PANEL_H / 2 + 118,
      "",
      PANEL_W / 2 - 24,
      "12px",
    );
    this.metaText.setColor(DOSSIER.inkMuted);

    this.rosterLabel = scene.add
      .text(0, -PANEL_H / 2 + 210, "СОСТАВ", {
        fontFamily: "Georgia, serif",
        fontSize: "13px",
        color: DOSSIER.gold,
        stroke: "#1a1008",
        strokeThickness: 1,
      })
      .setOrigin(0.5, 0);

    this.bodyHost.add([this.headerText, this.metaText, this.rosterLabel]);

    this.cardRoot = scene.add.container(0, 0).setDepth(36).setScrollFactor(0).setVisible(false);
    const { w, h } = cardSize(scene);
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
    this.cardMeta = scene.add
      .text(0, 0, "", {
        fontFamily: INK.family,
        fontSize: "13px",
        fontStyle: "italic",
        color: INK.faded,
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
    this.cardRoot.add([shadow, this.cardImage, this.cardName, this.cardMeta, this.cardBody, this.cardHint]);
  }

  isOpen(): boolean {
    return this.open;
  }

  isPinned(): boolean {
    return this.pinned;
  }

  layout(): void {
    this.dossierRoot.setPosition(viewW(this.scene) - PANEL_W / 2 - 40, viewH(this.scene) / 2);
    if (this.usingCard) this.layoutCard();
  }

  show(army: Army): void {
    this.open = true;
    const plate = this.cardTexture(army.faction);
    if (plate) {
      this.dossierRoot.setVisible(false);
      this.showCard(army, plate);
      return;
    }
    this.cardRoot.setVisible(false);
    this.usingCard = false;
    this.showDossier(army);
  }

  /** Open and keep open until hide / toggle off (left HUD). */
  showPinned(army: Army): void {
    this.pinned = true;
    this.show(army);
  }

  togglePinned(army: Army): void {
    if (this.pinned && this.open && this.shownArmyId === army.id) {
      this.hide();
      return;
    }
    this.showPinned(army);
  }

  hide(): void {
    if (!this.open && !this.pinned) return;
    this.open = false;
    this.pinned = false;
    this.usingCard = false;
    this.dossierRoot.setVisible(false);
    this.cardRoot.setVisible(false);
  }

  /** RMB peek — does not close a pinned dossier. */
  hideIfUnpinned(): void {
    if (this.pinned) return;
    this.hide();
  }

  private cardTexture(faction: FactionId): string | undefined {
    const key = armyInfoCardTextureKey(faction);
    if (this.scene.textures.exists(key)) return key;
    const fallback = armyInfoCardTextureKey("ri");
    if (this.scene.textures.exists(fallback)) return fallback;
    return undefined;
  }

  private showCard(army: Army, plate: string): void {
    this.usingCard = true;
    this.cardRoot.setVisible(true);
    if (this.cardImage.texture.key !== plate) this.cardImage.setTexture(plate);
    this.layoutCard();
    this.cardName.setText(armyTitle(army));
    this.cardMeta.setText(FACTION_LABEL[army.faction] ?? army.faction);
    this.cardBody.setText(this.formatLedger(army));
    this.cardHint.setText(
      this.pinned ? "ещё раз «отряд», чтобы закрыть" : "отпустите ПКМ, чтобы закрыть",
    );
    this.shownArmyId = army.id;
  }

  private layoutCard(): void {
    const { w, h } = cardSize(this.scene);
    const pad = 18;
    const x = viewW(this.scene) - pad - w / 2;
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
    const bodySize = Math.max(11, Math.round(h * 0.02));

    this.cardName.setFontSize(nameSize).setPosition(left, top);
    this.cardMeta.setFontSize(Math.max(11, nameSize - 4)).setPosition(right, top + 3);
    this.cardBody
      .setFontSize(bodySize)
      .setWordWrapWidth(wrap)
      .setPosition(left, top + nameSize + 4);
    this.cardHint.setFontSize(Math.max(10, Math.round(h * 0.016))).setPosition(0, bottom);
  }

  private showDossier(army: Army): void {
    this.dossierRoot.setVisible(true);
    this.setFaction(army.faction);
    this.headerText.setText(armyTitle(army));
    this.metaText.setText(this.formatMeta(army));

    if (this.shownArmyId !== army.id) {
      this.rebuildRoster(army);
      this.shownArmyId = army.id;
    } else {
      this.refreshRosterHp(army);
    }
  }

  private formatLedger(army: Army): string {
    const lines: string[] = [];
    const units = partyUnits(army);

    if (army.isMissionary) {
      lines.push(`миссионер`);
      lines.push(`ОД ${marchPointsLabel(army.movesLeft)}`);
      lines.push("поднимает могилы на карте");
      return lines.join("\n");
    }

    if (army.isNightHero) {
      lines.push(`ночной герой`);
      lines.push(`${army.hero.name} · ${classLabel(army.hero)}`);
      lines.push(`ОД ${marchPointsLabel(army.movesLeft)}`);
      lines.push("ходит ночью · бьётся только с ночным и общим");
      return lines.join("\n");
    }

    if (army.isNeutral) {
      lines.push("нейтральный отряд");
      lines.push(veilPresenceLabel(army));
    } else {
      lines.push(`${army.hero.name} · ${classLabel(army.hero)} · ур.${army.hero.level}`);
      const maxMoves = armyMaxMoves(army);
      lines.push(`ОД ${marchPointsLabel(army.movesLeft, maxMoves)}   XP ${army.hero.xp}/${army.hero.xpToNext}`);
      if (army.isPlayer) {
        const limit = leadershipLimit(army.hero);
        const alive = livingUnits(army).length;
        const roster = armyUnitCount(army);
        lines.push(`${alive} живых / ${roster} слотов (лимит ${limit})`);
        if (!isHeroAlive(army) && alive > 0) lines.push("командир пал — 1 ОД");
      }
      lines.push(formatSupplyStatus(armySupply(session.state, army)));
    }

    if (units.length === 0) {
      lines.push("");
      lines.push("пустой отряд");
      return lines.join("\n");
    }

    lines.push("");
    lines.push("состав");
    for (const unit of units) lines.push(rosterLine(unit, army));
    return lines.join("\n");
  }

  private formatMeta(army: Army): string {
    const faction = FACTION_LABEL[army.faction] ?? army.faction;
    const lines: string[] = [];

    if (army.isMissionary) {
      lines.push(`Миссионер · ${faction}`);
      lines.push(`ОД ${marchPointsLabel(army.movesLeft)}`);
      lines.push("Поднимает могилы на карте.");
      return lines.join("\n");
    }

    if (army.isNightHero) {
      lines.push(`Ночной герой · ${faction}`);
      lines.push(`${army.hero.name} · ${classLabel(army.hero)}`);
      lines.push(`ОД ${marchPointsLabel(army.movesLeft)}`);
      lines.push("Ходит ночью. Бьётся с ночными и общими отрядами, не с дневными.");
      return lines.join("\n");
    }

    if (army.isNeutral) {
      lines.push(`Нейтральный отряд`);
      lines.push(faction);
      lines.push(veilPresenceLabel(army));
      return lines.join("\n");
    }

    lines.push(faction);
    if (!army.isPlayer) lines.push(veilPresenceLabel(army));
    lines.push(`${army.hero.name} · ${classLabel(army.hero)} · ур.${army.hero.level}`);
    const maxMoves = armyMaxMoves(army);
    lines.push(`ОД ${marchPointsLabel(army.movesLeft, maxMoves)}`);
    lines.push(`XP ${army.hero.xp}/${army.hero.xpToNext}`);
    if (army.isPlayer) {
      const limit = leadershipLimit(army.hero);
      const alive = livingUnits(army).length;
      const roster = armyUnitCount(army);
      lines.push(`${alive} живых / ${roster} слотов (лимит ${limit})`);
      if (!isHeroAlive(army) && alive > 0) lines.push("Командир пал — 1 ОД");
    }
    lines.push(formatSupplyStatus(armySupply(session.state, army)));
    return lines.join("\n");
  }

  private clearRoster() {
    this.heroFrame?.destroy();
    this.heroFrame = null;
    for (const f of this.rosterFrames) f.destroy();
    this.rosterFrames = [];
    for (const t of this.rosterCaptions) t.destroy();
    this.rosterCaptions = [];
  }

  private rebuildRoster(army: Army) {
    this.clearRoster();
    const style = glassStyleForFaction(army.faction);
    const hero = findHeroUnit(army);
    const heroDefId =
      hero?.defId ??
      (army.isNightHero
        ? nightHeroUnitDefId(army.faction)
        : army.faction === "ordo"
          ? "hero_ordo"
          : "hero_ri");
    const heroKey = resolvePortraitKey(this.scene, heroDefId);
    const heroDead = hero ? !(hero.hp > 0) : false;
    const heroHp = hero
      ? heroDead
        ? "†"
        : `${hero.hp}/${UNIT_DEFS[hero.defId]?.maxHp ?? "?"}`
      : undefined;

    this.heroFrame = new GlassPhotoFrame(this.scene, HERO_X, HERO_Y, {
      portraitKey: heroKey,
      portraitSize: HERO_SIZE - 12,
      frameW: HERO_SIZE,
      frameH: HERO_SIZE,
      style,
      hpLabel: heroHp,
      hpColor: heroDead ? DOSSIER.danger : DOSSIER.ink,
      hero: true,
    });
    this.heroFrame.setScrollFactor(0);
    if (heroDead) this.heroFrame.markDead();
    this.bodyHost.add(this.heroFrame);

    const units = partyUnits(army);
    if (units.length === 0) {
      this.rosterLabel.setText("ПУСТОЙ ОТРЯД");
      return;
    }
    this.rosterLabel.setText("СОСТАВ");

    const gapX = UNIT_SIZE + 28;
    const gapY = UNIT_SIZE + 36;
    const startX = -((Math.min(COLS, units.length) - 1) * gapX) / 2;
    const startY = -PANEL_H / 2 + 280;

    units.forEach((unit, i) => {
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      const x = startX + col * gapX;
      const y = startY + row * gapY;
      const def = UNIT_DEFS[unit.defId];
      const dead = !(unit.hp > 0);
      const frame = new GlassPhotoFrame(this.scene, x, y, {
        portraitKey: resolvePortraitKey(this.scene, unit.defId),
        portraitSize: UNIT_SIZE - 10,
        frameW: UNIT_SIZE,
        frameH: UNIT_SIZE,
        style,
        hpLabel: dead ? "†" : `${unit.hp}/${def?.maxHp ?? "?"}`,
        hpColor: dead ? DOSSIER.danger : unit.hp <= (def?.maxHp ?? 1) * 0.35 ? DOSSIER.danger : DOSSIER.ink,
        hero: unit.isHero,
        veteran: unit.veteran,
      });
      frame.setScrollFactor(0);
      if (dead) frame.markDead();
      this.bodyHost.add(frame);
      this.rosterFrames.push(frame);

      const caption = this.scene.add
        .text(x, y + UNIT_SIZE / 2 + 4, unitCaption(unit), {
          fontFamily: "Georgia, serif",
          fontSize: "10px",
          color: dead ? DOSSIER.danger : DOSSIER.inkMuted,
          align: "center",
          stroke: "#120e0a",
          strokeThickness: 1,
        })
        .setOrigin(0.5, 0);
      this.bodyHost.add(caption);
      this.rosterCaptions.push(caption);
    });
  }

  private refreshRosterHp(army: Army) {
    const hero = findHeroUnit(army);
    if (this.heroFrame && hero) {
      if (!(hero.hp > 0)) this.heroFrame.markDead();
      else {
        const def = UNIT_DEFS[hero.defId];
        this.heroFrame.setHp(
          `${hero.hp}/${def?.maxHp ?? "?"}`,
          hero.hp <= (def?.maxHp ?? 1) * 0.35 ? DOSSIER.danger : DOSSIER.ink,
        );
      }
    }

    const units = partyUnits(army);
    if (units.length !== this.rosterFrames.length) {
      this.rebuildRoster(army);
      return;
    }
    units.forEach((unit, i) => {
      const frame = this.rosterFrames[i];
      const caption = this.rosterCaptions[i];
      if (!frame) return;
      const def = UNIT_DEFS[unit.defId];
      const dead = !(unit.hp > 0);
      if (dead) frame.markDead();
      else {
        frame.setHp(
          `${unit.hp}/${def?.maxHp ?? "?"}`,
          unit.hp <= (def?.maxHp ?? 1) * 0.35 ? DOSSIER.danger : DOSSIER.ink,
        );
      }
      caption?.setText(unitCaption(unit));
      caption?.setColor(dead ? DOSSIER.danger : DOSSIER.inkMuted);
    });
  }
}
