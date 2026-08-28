import Phaser from "phaser";
import { leadershipLimit } from "../game/battle";
import { FACTION_LABEL, GARRISON_LIMIT, UNIT_DEFS } from "../game/catalog";
import {
  formatRecruitLine,
  garrisonUnits,
  healInCity,
  leaveUnitInCity,
  recruitSmart,
  resurrectCostPerUnit,
  takeUnitFromCity,
  tryBuildByIndex,
} from "../game/city";
import { upgradeUnit } from "../game/upgrades";
import { healCostPerUnit, type BuildingId } from "../game/buildings";
import {
  armyUnitCount,
  cityCulture,
  livingUnits,
  moveUnitToSlot,
  session,
  type Army,
  type City,
  type FactionId,
  type UnitInstance,
} from "../game/data";
import { playerFactionOf } from "../game/playerFaction";
import { hireMissionary } from "../game/graves";
import { ScreenHitRouter, isLeftHudClick, rectFromCenter, type ScreenHit } from "./ScreenHitRouter";
import { viewH, viewSize, viewW } from "./viewport";
import {
  CITY_ARMY_TEXT,
  CITY_CLOSE,
  CITY_H,
  CITY_HEADER_H,
  CITY_HEAL,
  CITY_PLATE_HALF_H,
  CITY_PLATE_HALF_W,
  CITY_TAB_H,
  CITY_TAB_W,
  CITY_TAB_XS,
  CITY_TAB_Y,
  CITY_W,
} from "./cityPanel/layout";
import { renderRecruitTab } from "./cityPanel/recruitTab";
import { renderGarrisonTab } from "./cityPanel/garrisonTab";
import { renderBuildTab } from "./cityPanel/buildTab";
import type {
  BuildSlot,
  CityTabHost,
  GarrisonSlot,
  RecruitSlot,
  UpgradeSlot,
} from "./cityPanel/types";
import { DOSSIER, buildDossierChrome, dossierAccent } from "./vintageDossier";
import { CITY_INK, resolveCityPortraitKey } from "./cityPanel/photoPlate";

type TabId = "recruit" | "garrison" | "build";

export interface CityPanelCallbacks {
  onMessage: (msg: string) => void;
  onChanged: () => void;
  /** Call when modal closes so World ignores the rest of this click gesture. */
  onBlockMapInput?: () => void;
}

/**
 * City window — chrome, tabs, hits.
 * Tab paints: src/ui/cityPanel/recruitTab.ts, garrisonTab.ts, buildTab.ts
 * Rules: src/game/city.ts
 */
export class CityPanel {
  private backdrop: Phaser.GameObjects.Rectangle;
  private window: Phaser.GameObjects.Container;
  private content!: Phaser.GameObjects.Container;
  private titleText!: Phaser.GameObjects.Text;
  private subtitleText!: Phaser.GameObjects.Text;
  private resText!: Phaser.GameObjects.Text;
  private armyText!: Phaser.GameObjects.Text;
  private healBtn!: Phaser.GameObjects.Container;
  private closeBtn!: Phaser.GameObjects.Container;
  private setFaction!: (faction: FactionId) => void;

  private tab: TabId = "recruit";
  private army: Army | null = null;
  private city: City | null = null;
  private open = false;
  private unitDrag: {
    unitId: string;
    from: "army" | "garrison";
    formationSlot?: number;
    startX: number;
    startY: number;
    moved: boolean;
    ghost: Phaser.GameObjects.Container;
  } | null = null;
  /** Screen-space garrison / formation targets */
  private garrisonLayer: Phaser.GameObjects.GameObject[] = [];
  private garrisonSlots: GarrisonSlot[] = [];
  private selectedFormationUnitId: string | null = null;
  /** Screen-space tab buttons (outside nested containers). */
  private tabLayer: Phaser.GameObjects.GameObject[] = [];
  private tabSlots: {
    id: TabId;
    left: number;
    top: number;
    right: number;
    bottom: number;
  }[] = [];
  private recruitSlots: RecruitSlot[] = [];
  private recruitLayer: Phaser.GameObjects.GameObject[] = [];
  private buildSlots: BuildSlot[] = [];
  private buildLayer: Phaser.GameObjects.GameObject[] = [];
  private upgradeSlots: UpgradeSlot[] = [];
  private upgradeLayer: Phaser.GameObjects.GameObject[] = [];
  /** Buildings present last time the build tab painted — for appear tween. */
  private lastShownBuildings: BuildingId[] = [];
  /** Flat screen hits — sole input path while the panel is open. */
  private readonly hits = new ScreenHitRouter();
  private get cx(): number {
    return viewW(this.scene) / 2;
  }
  private get cy(): number {
    return viewH(this.scene) / 2;
  }

  constructor(
    private scene: Phaser.Scene,
    private callbacks: CityPanelCallbacks,
  ) {
    this.backdrop = scene.add
      .rectangle(this.cx, this.cy, viewW(scene), viewH(scene), 0x120e0a, 0.62)
      .setVisible(false)
      .setDepth(40)
      .setScrollFactor(0);

    this.window = scene.add
      .container(this.cx, this.cy)
      .setVisible(false)
      .setDepth(41)
      .setScrollFactor(0);
    this.buildChrome();

    scene.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.onPanelPointerDown(p), this);
    scene.input.on("pointermove", (p: Phaser.Input.Pointer) => this.onUnitDragMove(p), this);
    scene.input.on("pointerup", (p: Phaser.Input.Pointer) => this.onUnitDragEnd(p), this);
  }

  isOpen(): boolean {
    return this.open;
  }

  layout(): void {
    const { w, h } = viewSize(this.scene);
    this.backdrop.setPosition(this.cx, this.cy).setSize(w, h);
    this.window.setPosition(this.cx, this.cy);
    if (this.open) this.refresh();
  }

  show(army: Army | null, city: City, tab?: TabId): void {
    this.army = army;
    this.city = city;
    if (!city.garrison) city.garrison = [];
    this.tab = tab ?? (army ? "garrison" : "recruit");
    this.lastShownBuildings = [...city.buildings];
    this.open = true;
    this.backdrop.setVisible(true);
    this.window.setVisible(true);
    this.refresh();
  }

  hide(): void {
    if (!this.open) return;
    this.clearUnitDrag();
    this.clearGarrisonLayer();
    this.clearTabLayer();
    this.clearRecruitLayer();
    this.clearBuildLayer();
    this.clearUpgradeLayer();
    this.hits.clear();
    this.open = false;
    this.backdrop.setVisible(false);
    this.window.setVisible(false);
    this.callbacks.onBlockMapInput?.();
  }

  toggle(army: Army | null, city: City | null): void {
    if (this.open) {
      this.hide();
      return;
    }
    if (!city) {
      this.callbacks.onMessage("Нет своих городов");
      return;
    }
    this.show(army, city);
  }

  private buildChrome(): void {
    const W = CITY_W;
    const H = CITY_H;

    const chrome = buildDossierChrome(this.scene, W, H, {
      title: "ГОРОД",
      headerH: CITY_HEADER_H,
    });
    this.setFaction = chrome.setFaction;
    this.titleText = chrome.titleText;
    this.titleText.setFontSize(22);
    chrome.hintText.setVisible(false);

    this.subtitleText = this.scene.add
      .text(0, -H / 2 + 46, "", {
        fontFamily: CITY_INK.family,
        fontSize: "13px",
        color: DOSSIER.gold,
      })
      .setOrigin(0.5, 0);

    this.resText = this.scene.add
      .text(0, -H / 2 + 68, "", {
        fontFamily: CITY_INK.family,
        fontSize: "13px",
        color: DOSSIER.inkMuted,
      })
      .setOrigin(0.5, 0);

    this.closeBtn = this.scene.add.container(CITY_CLOSE.dx, CITY_CLOSE.dy);
    const closeLabel = this.scene.add
      .text(0, 0, "✕", {
        fontFamily: CITY_INK.family,
        fontSize: "20px",
        color: DOSSIER.gold,
      })
      .setOrigin(0.5);
    this.closeBtn.add(closeLabel);
    this.closeBtn.setSize(CITY_CLOSE.w, CITY_CLOSE.h);
    this.closeBtn.setData("label", closeLabel);

    const footer = this.scene.add
      .rectangle(0, H / 2 - 36, W - 40, 52, DOSSIER.plate, 0.92)
      .setStrokeStyle(1, DOSSIER.plateEdge, 0.55);

    this.content = this.scene.add.container(0, 16);

    this.armyText = this.scene.add
      .text(CITY_ARMY_TEXT.dx, CITY_ARMY_TEXT.dy, "", {
        fontFamily: CITY_INK.family,
        fontSize: "14px",
        color: DOSSIER.ink,
        wordWrap: { width: W - 280 },
      })
      .setOrigin(0, 0.5);

    this.healBtn = this.makeButton(CITY_HEAL.dx, CITY_HEAL.dy, CITY_HEAL.w, CITY_HEAL.h, "Лазарет");

    chrome.root.add([
      this.subtitleText,
      this.resText,
      this.closeBtn,
      footer,
      this.content,
      this.armyText,
      this.healBtn,
    ]);
    this.window.add(chrome.root);
  }

  private makeButton(
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    opts?: { fontSize?: string },
  ): Phaser.GameObjects.Container {
    const bg = this.scene.add
      .rectangle(0, 0, w, h, DOSSIER.paper, 0.96)
      .setStrokeStyle(1, 0xc9a227, 0.75);
    const text = this.scene.add
      .text(0, 0, label, {
        fontFamily: CITY_INK.family,
        fontSize: opts?.fontSize ?? "14px",
        color: DOSSIER.title,
        stroke: "#1a1008",
        strokeThickness: 1,
      })
      .setOrigin(0.5);
    const c = this.scene.add.container(x, y, [bg, text]).setSize(w, h);
    c.setData("bg", bg);
    c.setData("label", text);
    return c;
  }

  private refresh(): void {
    if (!this.city) return;
    this.syncArmyRef();

    const city = this.city;
    const army = this.army;
    const culture = cityCulture(city);
    const garN = garrisonUnits(city).length;
    this.setFaction(culture);

    const kind = city.isCapital ? "Столица" : "Город";
    const factionName = FACTION_LABEL[culture] ?? culture;

    this.titleText.setText(city.name.toUpperCase());
    this.subtitleText.setText(
      `${kind} · ${factionName} · доход ${city.income.gold}з / ${city.income.mana}м / ${city.income.people ?? 0}л`,
    );
    this.resText.setText(
      `${session.state.gold}з  ·  ${session.state.mana}м  ·  ${session.state.people}л  ·  ${session.state.coal}у  ·  ${session.state.steel}ст`,
    );

    if (army) {
      const alive = livingUnits(army).length;
      const total = armyUnitCount(army);
      const limit = leadershipLimit(army.hero);
      const dead = total - alive;
      this.armyText.setText(
        `${army.hero.name} · ур.${army.hero.level} · отряд ${alive}/${limit}` +
          (dead > 0 ? ` (${dead} пали)` : "") +
          ` · гарнизон ${garN}/${GARRISON_LIMIT}`,
      );
      const healCost = healCostPerUnit(city);
      const resCost = resurrectCostPerUnit(city);
      const healLabel = this.healBtn.getData("label") as Phaser.GameObjects.Text;
      healLabel.setText(`Лазарет ${healCost}з · воскр. ${resCost}з`);
      this.healBtn.setAlpha(1);
    } else {
      this.armyText.setText(`Гарнизон ${garN}/${GARRISON_LIMIT} · рекруты идут в город`);
      const healCost = healCostPerUnit(city);
      const resCost = resurrectCostPerUnit(city);
      const healLabel = this.healBtn.getData("label") as Phaser.GameObjects.Text;
      healLabel.setText(`Лазарет ${healCost}з · воскр. ${resCost}з`);
      this.healBtn.setAlpha(1);
    }

    this.clearGarrisonLayer();
    this.clearTabLayer();
    this.clearRecruitLayer();
    this.clearBuildLayer();
    this.clearUpgradeLayer();
    this.content.removeAll(true);
    this.buildScreenTabs();

    if (this.tab === "recruit") this.renderRecruit();
    else if (this.tab === "garrison") this.renderGarrison();
    else this.renderBuild();

    this.rebuildHitMap();
  }

  private tabHost(): CityTabHost {
    return {
      scene: this.scene,
      cx: this.cx,
      cy: this.cy,
      city: this.city!,
      army: this.army,
      content: this.content,
      recruitLayer: this.recruitLayer,
      recruitSlots: this.recruitSlots,
      garrisonLayer: this.garrisonLayer,
      garrisonSlots: this.garrisonSlots,
      buildLayer: this.buildLayer,
      buildSlots: this.buildSlots,
      upgradeLayer: this.upgradeLayer,
      upgradeSlots: this.upgradeSlots,
      lastShownBuildings: this.lastShownBuildings,
      selectedFormationUnitId: this.selectedFormationUnitId,
      heroInCity: () => this.heroInCity(),
    };
  }

  private renderRecruit(): void {
    if (!this.city) return;
    renderRecruitTab(this.tabHost());
  }

  private renderGarrison(): void {
    if (!this.city) return;
    renderGarrisonTab(this.tabHost());
  }

  private renderBuild(): void {
    if (!this.city) return;
    renderBuildTab(this.tabHost());
  }

  /**
   * Rebuild the only click map for this modal.
   * Visuals can live in containers; hit targets must be flat screen rects.
   */
  private rebuildHitMap(): void {
    const list: ScreenHit[] = [
      {
        id: "close",
        z: 30,
        rect: rectFromCenter(
          this.cx + CITY_CLOSE.dx,
          this.cy + CITY_CLOSE.dy,
          CITY_CLOSE.w,
          CITY_CLOSE.h,
        ),
        onDown: () => this.hide(),
      },
      {
        id: "heal",
        z: 30,
        rect: rectFromCenter(
          this.cx + CITY_HEAL.dx,
          this.cy + CITY_HEAL.dy,
          CITY_HEAL.w,
          CITY_HEAL.h,
        ),
        onDown: () => this.doHeal(),
      },
    ];

    for (const t of this.tabSlots) {
      list.push({
        id: `tab:${t.id}`,
        z: 20,
        rect: t,
        onDown: () => {
          this.tab = t.id;
          this.refresh();
        },
      });
    }

    for (const c of this.recruitSlots) {
      list.push({
        id: `recruit:${c.defId}`,
        z: 10,
        rect: c,
        onDown: () => this.doRecruit(c.defId),
      });
    }

    for (const b of this.buildSlots) {
      list.push({
        id: `build:${b.index}`,
        z: 10,
        rect: b,
        onDown: () => this.doBuild(b.index),
      });
    }

    for (const u of this.upgradeSlots) {
      list.push({
        id: `upgrade:${u.unitId}`,
        z: 16,
        rect: u,
        onDown: () => this.doUpgrade(u.unitId),
      });
    }

    for (const g of this.garrisonSlots) {
      list.push({
        id: `gar:${g.from}:${g.formationSlot ?? g.unitId ?? "empty"}`,
        z: 10,
        rect: g,
        data: g,
        onDown: (pointer) => {
          if (!this.heroInCity()) {
            this.callbacks.onMessage("Встаньте героем на город, чтобы менять строй");
            return;
          }
          this.onFormationPointerDown(pointer, g);
        },
      });
    }

    this.hits.setAll(list);
  }

  private onFormationPointerDown(
    pointer: Phaser.Input.Pointer,
    g: {
      unitId: string | null;
      from: "army" | "garrison";
      formationSlot?: number;
    },
  ): void {
    // Click empty formation slot while a unit is selected → place / swap
    if (
      g.from === "army" &&
      g.formationSlot !== undefined &&
      !g.unitId &&
      this.selectedFormationUnitId &&
      this.army
    ) {
      const result = moveUnitToSlot(this.army, this.selectedFormationUnitId, g.formationSlot);
      this.callbacks.onMessage(result.ok ? "Строй изменён" : result.reason);
      this.selectedFormationUnitId = null;
      this.refresh();
      this.callbacks.onChanged();
      return;
    }

    if (!g.unitId) return;

    const unit =
      g.from === "army"
        ? this.army?.units.find((u) => u.instanceId === g.unitId)
        : this.city
          ? garrisonUnits(this.city).find((u) => u.instanceId === g.unitId)
          : undefined;
    if (!unit) return;

    // Second click on another occupied army slot → swap
    if (
      g.from === "army" &&
      g.formationSlot !== undefined &&
      this.selectedFormationUnitId &&
      this.selectedFormationUnitId !== g.unitId &&
      this.army
    ) {
      const result = moveUnitToSlot(this.army, this.selectedFormationUnitId, g.formationSlot);
      this.callbacks.onMessage(result.ok ? "Строй изменён" : result.reason);
      this.selectedFormationUnitId = null;
      this.refresh();
      this.callbacks.onChanged();
      return;
    }

    if (g.from === "army") {
      this.selectedFormationUnitId = g.unitId;
    }
    this.startUnitDrag(unit, g.from, pointer, g.formationSlot);
  }

  private clearTabLayer(): void {
    for (const obj of this.tabLayer) obj.destroy();
    this.tabLayer.length = 0;
    this.tabSlots.length = 0;
  }

  private clearRecruitLayer(): void {
    for (const obj of this.recruitLayer) obj.destroy();
    this.recruitLayer.length = 0;
    this.recruitSlots.length = 0;
  }

  private clearBuildLayer(): void {
    for (const obj of this.buildLayer) obj.destroy();
    this.buildLayer.length = 0;
    this.buildSlots.length = 0;
  }

  private clearUpgradeLayer(): void {
    for (const obj of this.upgradeLayer) obj.destroy();
    this.upgradeLayer.length = 0;
    this.upgradeSlots.length = 0;
  }

  private clearGarrisonLayer(): void {
    for (const obj of this.garrisonLayer) obj.destroy();
    this.garrisonLayer.length = 0;
    this.garrisonSlots.length = 0;
  }

  private buildScreenTabs(): void {
    const y = this.cy + CITY_TAB_Y;
    const faction = this.city ? cityCulture(this.city) : "ri";
    const accent = dossierAccent(faction);
    const specs: { id: TabId; x: number; label: string }[] = [
      { id: "recruit", x: this.cx + CITY_TAB_XS[0], label: "Рекруты" },
      { id: "garrison", x: this.cx + CITY_TAB_XS[1], label: "Гарнизон" },
      { id: "build", x: this.cx + CITY_TAB_XS[2], label: "Постройки" },
    ];
    for (const s of specs) {
      const active = this.tab === s.id;
      const bg = this.scene.add
        .rectangle(
          s.x,
          y,
          CITY_TAB_W,
          CITY_TAB_H,
          active ? 0x2c2418 : 0x16120e,
          active ? 0.98 : 0.82,
        )
        .setStrokeStyle(1, active ? accent : DOSSIER.plateEdge, active ? 0.95 : 0.4)
        .setDepth(80)
        .setScrollFactor(0);
      const text = this.scene.add
        .text(s.x, y - (active ? 2 : 0), s.label, {
          fontFamily: CITY_INK.family,
          fontSize: "16px",
          color: active ? DOSSIER.gold : DOSSIER.inkMuted,
          stroke: "#1a1008",
          strokeThickness: active ? 1 : 0,
        })
        .setOrigin(0.5)
        .setDepth(81)
        .setScrollFactor(0);
      this.tabLayer.push(bg, text);
      if (active) {
        const underline = this.scene.add
          .rectangle(s.x, y + CITY_TAB_H / 2 - 3, CITY_TAB_W - 28, 2, accent, 0.9)
          .setDepth(81)
          .setScrollFactor(0);
        this.tabLayer.push(underline);
      }
      this.tabSlots.push({
        id: s.id,
        left: s.x - CITY_TAB_W / 2,
        top: y - CITY_TAB_H / 2,
        right: s.x + CITY_TAB_W / 2,
        bottom: y + CITY_TAB_H / 2,
      });
    }
  }

  private onPanelPointerDown(pointer: Phaser.Input.Pointer): void {
    if (!this.open || !pointer.leftButtonDown()) return;
    this.callbacks.onBlockMapInput?.();

    if (this.hits.dispatch(pointer)) return;
    if (isLeftHudClick(pointer.x, pointer.y)) return;

    // Click dimmed area outside the plate → close
    const { x, y } = pointer;
    if (
      Math.abs(x - this.cx) > CITY_PLATE_HALF_W ||
      Math.abs(y - this.cy) > CITY_PLATE_HALF_H
    ) {
      this.hide();
    }
  }

  private syncArmyRef(): void {
    if (!this.army) return;
    this.army = session.state.armies.find((a) => a.id === this.army!.id) ?? null;
  }

  private heroInCity(): boolean {
    this.syncArmyRef();
    const army = this.army;
    const city = this.city;
    if (!army || !city) return false;
    return army.x === city.x && army.y === city.y && army.mapId === city.mapId;
  }

  private clearUnitDrag(): void {
    if (!this.unitDrag) return;
    this.unitDrag.ghost.destroy();
    this.unitDrag = null;
  }

  private startUnitDrag(
    unit: UnitInstance,
    from: "army" | "garrison",
    pointer: Phaser.Input.Pointer,
    formationSlot?: number,
  ): void {
    if (!this.heroInCity() || this.unitDrag) return;
    this.callbacks.onBlockMapInput?.();
    const def = UNIT_DEFS[unit.defId];
    const ghost = this.scene.add.container(pointer.x, pointer.y).setDepth(60).setScrollFactor(0);
    const labelName = unit.isHero && this.army ? this.army.hero.name : def.name;
    const key = resolveCityPortraitKey(this.scene, unit.defId);
    const icon = key
      ? this.scene.add.image(0, 0, key).setDisplaySize(52, 52)
      : this.scene.add.rectangle(0, 0, 52, 52, DOSSIER.paper).setStrokeStyle(1, 0xc9a227);
    const rim = this.scene.add.rectangle(0, 0, 56, 56, 0x000000, 0).setStrokeStyle(1, 0xc9a227, 0.85);
    const label = this.scene.add
      .text(0, 36, labelName, {
        fontFamily: CITY_INK.family,
        fontSize: "12px",
        color: DOSSIER.title,
        backgroundColor: "#1a1510aa",
      })
      .setOrigin(0.5, 0);
    ghost.add([rim, icon, label]);
    this.unitDrag = {
      unitId: unit.instanceId,
      from,
      formationSlot,
      startX: pointer.x,
      startY: pointer.y,
      moved: false,
      ghost,
    };
  }

  private onUnitDragMove(pointer: Phaser.Input.Pointer): void {
    if (!this.unitDrag || !this.open) return;
    const dx = pointer.x - this.unitDrag.startX;
    const dy = pointer.y - this.unitDrag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 6) this.unitDrag.moved = true;
    this.unitDrag.ghost.setPosition(pointer.x, pointer.y);
  }

  private onUnitDragEnd(pointer: Phaser.Input.Pointer): void {
    if (!this.unitDrag || !this.open) return;
    const { unitId, from, moved } = this.unitDrag;
    this.clearUnitDrag();

    if (!this.heroInCity() || !this.army) {
      this.callbacks.onMessage("Герой должен стоять в городе");
      return;
    }

    const drop = this.garrisonSlots.find(
      (s) =>
        pointer.x >= s.left &&
        pointer.x <= s.right &&
        pointer.y >= s.top &&
        pointer.y <= s.bottom,
    );

    if (!moved) {
      // Short click keeps selection (formation rearrange via second click / drag)
      if (from === "garrison") this.doTake(unitId);
      return;
    }

    // Drop onto a formation cell
    if (drop?.from === "army" && drop.formationSlot !== undefined) {
      if (from === "army") {
        const result = moveUnitToSlot(this.army, unitId, drop.formationSlot);
        this.callbacks.onMessage(result.ok ? "Строй изменён" : result.reason);
      } else {
        const taken = takeUnitFromCity(this.army, this.city!, unitId);
        if (!taken.ok) {
          this.callbacks.onMessage(taken.reason);
        } else {
          moveUnitToSlot(this.army, unitId, drop.formationSlot);
          this.callbacks.onMessage("Взят в строй");
        }
      }
      this.selectedFormationUnitId = null;
      this.refresh();
      this.callbacks.onChanged();
      return;
    }

    // Drop onto garrison column / icon
    if (drop?.from === "garrison" || pointer.x - this.cx > 30) {
      if (from === "army") this.doLeave(unitId);
      this.selectedFormationUnitId = null;
      return;
    }

    this.callbacks.onMessage("Перетащите на слот строя или в гарнизон");
    this.selectedFormationUnitId = null;
  }

  private doRecruit(defId: string): void {
    if (defId === "__missionary__") {
      const result = hireMissionary(session.state);
      this.callbacks.onMessage(result.ok ? session.state.lastMessage : result.reason);
      this.refresh();
      this.callbacks.onChanged();
      return;
    }
    if (!this.city) return;
    const result = recruitSmart(
      session.state,
      this.city,
      this.heroInCity() ? this.army : null,
      defId,
    );
    if (result.ok) {
      const where = result.into === "army" ? "в отряд" : "в гарнизон";
      this.callbacks.onMessage(`Нанят ${UNIT_DEFS[defId].name} ${where}`);
    } else {
      this.callbacks.onMessage(`${formatRecruitLine(defId)} — ${result.reason}`);
    }
    this.refresh();
    this.callbacks.onChanged();
  }

  private doUpgrade(unitInstanceId: string): void {
    if (!this.city) return;
    const unit =
      this.army?.units.find((u) => u.instanceId === unitInstanceId) ??
      garrisonUnits(this.city).find((u) => u.instanceId === unitInstanceId);
    if (!unit) {
      this.callbacks.onMessage("Юнит не найден");
      return;
    }
    const result = upgradeUnit(session.state, this.city, unit, playerFactionOf(session.state));
    if (result.ok) {
      const to = UNIT_DEFS[result.upgrade.to]?.name ?? result.upgrade.to;
      this.callbacks.onMessage(`Повышен: ${to}`);
    } else {
      this.callbacks.onMessage(result.reason);
    }
    this.refresh();
    this.callbacks.onChanged();
  }

  private doLeave(unitInstanceId: string): void {
    if (!this.army || !this.city) return;
    const result = leaveUnitInCity(this.army, this.city, unitInstanceId);
    this.callbacks.onMessage(result.ok ? "Юнит оставлен в гарнизоне" : result.reason);
    this.refresh();
    this.callbacks.onChanged();
  }

  private doTake(unitInstanceId: string): void {
    if (!this.army || !this.city) return;
    const result = takeUnitFromCity(this.army, this.city, unitInstanceId);
    this.callbacks.onMessage(result.ok ? "Юнит взят в отряд" : result.reason);
    this.refresh();
    this.callbacks.onChanged();
  }

  private doBuild(index: number): void {
    if (!this.city) return;
    session.state.lastMessage = tryBuildByIndex(session.state, this.city, index);
    this.callbacks.onMessage(session.state.lastMessage);
    this.refresh();
    this.callbacks.onChanged();
  }

  private doHeal(): void {
    if (!this.city) return;
    const armyInCity =
      this.army &&
      this.army.x === this.city.x &&
      this.army.y === this.city.y &&
      this.army.mapId === this.city.mapId
        ? this.army
        : null;
    const result = healInCity(session.state, this.city, armyInCity);
    if (!result.ok) {
      this.callbacks.onMessage(result.reason);
    } else {
      const parts: string[] = [];
      if (result.healed > 0) parts.push(`лечение ${result.healed}`);
      if (result.revived > 0) parts.push(`воскрешение ${result.revived}`);
      this.callbacks.onMessage(`${parts.join(" · ")}: −${result.cost} золота`);
    }
    this.refresh();
    this.callbacks.onChanged();
  }
}
