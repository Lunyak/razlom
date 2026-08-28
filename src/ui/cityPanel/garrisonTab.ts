import { leadershipLimit } from "../../game/battle";
import { GARRISON_LIMIT, UNIT_DEFS } from "../../game/catalog";
import { garrisonUnits } from "../../game/city";
import {
  canUpgradeUnit,
  formatUpgradeCost,
  upgradeFor,
} from "../../game/upgrades";
import {
  cityCulture,
  ensureFormationSlots,
  livingUnits,
  session,
  unitInSlot,
  type UnitInstance,
} from "../../game/data";
import { playerFactionOf } from "../../game/playerFaction";
import { DOSSIER, dossierAccent } from "../chrome";
import { CITY_INK, paintDossierCard, spawnCityPhotoPlate } from "./photoPlate";
import type { CityGarrisonCtx } from "./types";

export function renderGarrisonTab(p: CityGarrisonCtx): void {
  clearGarrisonLayer(p);

  const canAct = p.heroInCity();
  const limit = p.army ? leadershipLimit(p.army.hero) : 0;
  if (p.army) ensureFormationSlots(p.army);
  const garUnits = garrisonUnits(p.city);
  const aliveN = p.army ? livingUnits(p.army).filter((u) => !u.isHero).length : 0;
  const faction = cityCulture(p.city);
  const accent = canAct ? dossierAccent(faction) : DOSSIER.plateEdge;

  p.content.add(
    p.scene.add
      .rectangle(-220, -20, 360, 320, DOSSIER.paper, 0.72)
      .setStrokeStyle(1, accent, canAct ? 0.8 : 0.4),
  );
  p.content.add(
    p.scene.add
      .rectangle(220, -20, 360, 320, DOSSIER.paper, 0.72)
      .setStrokeStyle(1, accent, canAct ? 0.8 : 0.4),
  );
  p.content.add(
    p.scene.add
      .text(-220, -195, `Строй${p.army ? ` ${aliveN}/${limit}` : ""}`, {
        fontFamily: CITY_INK.family,
        fontSize: "16px",
        color: DOSSIER.gold,
        stroke: "#120e0a",
        strokeThickness: 1,
      })
      .setOrigin(0.5),
  );
  p.content.add(
    p.scene.add
      .text(220, -195, `Гарнизон ${garUnits.length}/${GARRISON_LIMIT}`, {
        fontFamily: CITY_INK.family,
        fontSize: "16px",
        color: DOSSIER.gold,
        stroke: "#120e0a",
        strokeThickness: 1,
      })
      .setOrigin(0.5),
  );
  p.content.add(
    p.scene.add
      .text(
        0,
        -165,
        canAct
          ? "Строй: тяните между слотами · клик по слоту — переставить · в гарнизон — вправо"
          : "Сначала встаньте героем НА клетку города",
        {
          fontFamily: CITY_INK.family,
          fontSize: "12px",
          color: DOSSIER.inkMuted,
          align: "center",
          wordWrap: { width: 700 },
        },
      )
      .setOrigin(0.5),
  );

  const originX = p.cx;
  const originY = p.cy + 16;

  if (!canAct) {
    p.content.add(
      p.scene.add
        .text(0, -20, "Герой не в городе — строй недоступен", {
          fontFamily: CITY_INK.family,
          fontSize: "15px",
          color: DOSSIER.gold,
        })
        .setOrigin(0.5),
    );
    garUnits.forEach((unit, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      spawnScreenIcon(p, originX + 100 + col * 78, originY - 110 + row * 92, unit, "garrison");
    });
    p.garrisonSlots.length = 0;
    return;
  }

  p.content.add(
    p.scene.add
      .text(-220, -130, "Передний ряд", {
        fontFamily: CITY_INK.family,
        fontSize: "12px",
        color: DOSSIER.inkMuted,
      })
      .setOrigin(0.5),
  );
  p.content.add(
    p.scene.add
      .text(-220, -20, "Задний ряд", {
        fontFamily: CITY_INK.family,
        fontSize: "12px",
        color: DOSSIER.inkMuted,
      })
      .setOrigin(0.5),
  );

  for (let slot = 0; slot < 6; slot++) {
    const row = slot < 3 ? 0 : 1;
    const col = slot % 3;
    const sx = originX - 320 + col * 78;
    const sy = originY - 90 + row * 108;
    const unit = p.army ? unitInSlot(p.army, slot) : undefined;
    spawnFormationCell(p, sx, sy, slot, unit);
  }

  garUnits.forEach((unit, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    spawnScreenIcon(p, originX + 100 + col * 78, originY - 110 + row * 92, unit, "garrison");
  });

  if (garUnits.length === 0) {
    p.content.add(
      p.scene.add
        .text(220, -20, "Пусто", {
          fontFamily: CITY_INK.family,
          fontSize: "14px",
          color: DOSSIER.inkDim,
        })
        .setOrigin(0.5),
    );
  }

  renderUpgradeStrip(p);
}

function clearGarrisonLayer(p: CityGarrisonCtx): void {
  for (const obj of p.garrisonLayer) obj.destroy();
  p.garrisonLayer.length = 0;
  p.garrisonSlots.length = 0;
}

function spawnFormationCell(
  p: CityGarrisonCtx,
  sx: number,
  sy: number,
  slot: number,
  unit: UnitInstance | undefined,
): void {
  const size = 68;
  const selected = unit && unit.instanceId === p.selectedFormationUnitId;
  const faction = cityCulture(p.city);
  const empty = !unit;

  const plate = spawnCityPhotoPlate(p.scene, sx, sy, {
    defId: unit?.defId,
    faction: unit ? (UNIT_DEFS[unit.defId]?.faction ?? faction) : faction,
    size,
    hpLabel: unit ? (unit.hp <= 0 ? "†" : String(unit.hp)) : undefined,
    dead: unit ? unit.hp <= 0 : false,
    hero: unit?.isHero,
    veteran: unit?.veteran,
    empty,
    selected: !!selected,
    depth: 50,
  });
  p.garrisonLayer.push(plate);

  const label = unit
    ? unit.isHero && p.army
      ? p.army.hero.name
      : UNIT_DEFS[unit.defId]?.name ?? ""
    : "";
  const name = p.scene.add
    .text(sx, sy + size / 2 + 4, empty ? "" : unit!.hp <= 0 ? `${label} †` : label, {
      fontFamily: CITY_INK.family,
      fontSize: "11px",
      color: unit && unit.hp <= 0 ? DOSSIER.danger : DOSSIER.inkMuted,
    })
    .setOrigin(0.5, 0)
    .setDepth(51)
    .setScrollFactor(0);
  p.garrisonLayer.push(name);

  p.garrisonSlots.push({
    left: sx - size / 2,
    top: sy - size / 2,
    right: sx + size / 2,
    bottom: sy + size / 2 + 16,
    unitId: unit?.instanceId ?? null,
    from: "army",
    formationSlot: slot,
  });
}

function spawnScreenIcon(
  p: CityGarrisonCtx,
  sx: number,
  sy: number,
  unit: UnitInstance,
  from: "army" | "garrison",
): void {
  const def = UNIT_DEFS[unit.defId];
  const dead = unit.hp <= 0;
  const size = 68;
  const faction = cityCulture(p.city);
  const plate = spawnCityPhotoPlate(p.scene, sx, sy, {
    defId: unit.defId,
    faction: def?.faction ?? faction,
    size,
    hpLabel: dead ? "†" : String(unit.hp),
    dead,
    hero: unit.isHero,
    veteran: unit.veteran,
    depth: 50,
  });
  const name = p.scene.add
    .text(sx, sy + size / 2 + 4, dead ? `${def.name} †` : def.name, {
      fontFamily: CITY_INK.family,
      fontSize: "11px",
      color: dead ? DOSSIER.danger : DOSSIER.inkMuted,
    })
    .setOrigin(0.5, 0)
    .setDepth(51)
    .setScrollFactor(0);

  p.garrisonLayer.push(plate, name);
  p.garrisonSlots.push({
    left: sx - size / 2,
    top: sy - size / 2,
    right: sx + size / 2,
    bottom: sy + size / 2 + 18,
    unitId: unit.instanceId,
    from,
  });
}

function cityUpgradeCandidates(p: CityGarrisonCtx): UnitInstance[] {
  const out: UnitInstance[] = [];
  if (p.heroInCity() && p.army) {
    for (const unit of p.army.units) {
      if (upgradeFor(unit.defId)) out.push(unit);
    }
  }
  for (const unit of garrisonUnits(p.city)) {
    if (upgradeFor(unit.defId)) out.push(unit);
  }
  return out;
}

function renderUpgradeStrip(p: CityGarrisonCtx): void {
  clearUpgradeLayer(p);

  const title = p.scene.add
    .text(p.cx, p.cy + 148, "Повышение чина", {
      fontFamily: CITY_INK.family,
      fontSize: "13px",
      color: DOSSIER.gold,
    })
    .setOrigin(0.5)
    .setDepth(50)
    .setScrollFactor(0);
  p.upgradeLayer.push(title);

  const candidates = cityUpgradeCandidates(p);
  if (candidates.length === 0) {
    const hint = p.scene.add
      .text(p.cx, p.cy + 176, "Юнкер, стрелок и послушник растут в казармах, дворе и соборе", {
        fontFamily: CITY_INK.family,
        fontSize: "12px",
        color: DOSSIER.inkDim,
        wordWrap: { width: 820 },
        align: "center",
      })
      .setOrigin(0.5)
      .setDepth(50)
      .setScrollFactor(0);
    p.upgradeLayer.push(hint);
    return;
  }

  const shown = candidates.slice(0, 3);
  const cardW = 260;
  const gap = 14;
  const total = shown.length * cardW + (shown.length - 1) * gap;
  const startX = p.cx - total / 2 + cardW / 2;

  shown.forEach((unit, i) => {
    spawnUpgradeCard(p, startX + i * (cardW + gap), p.cy + 188, cardW, 56, unit);
  });
}

function clearUpgradeLayer(p: CityGarrisonCtx): void {
  for (const obj of p.upgradeLayer) obj.destroy();
  p.upgradeLayer.length = 0;
  p.upgradeSlots.length = 0;
}

function spawnUpgradeCard(
  p: CityGarrisonCtx,
  sx: number,
  sy: number,
  w: number,
  h: number,
  unit: UnitInstance,
): void {
  const upgrade = upgradeFor(unit.defId);
  if (!upgrade) return;
  const check = canUpgradeUnit(
    session.state,
    p.city,
    unit,
    playerFactionOf(session.state),
  );
  const ok = check.ok;
  const toName = UNIT_DEFS[upgrade.to]?.name ?? upgrade.to;
  const fromName = UNIT_DEFS[unit.defId]?.name ?? unit.defId;
  const reason = ok ? formatUpgradeCost(upgrade) : check.reason;
  const faction = cityCulture(p.city);

  const bg = paintDossierCard(p.scene, sx, sy, w, h, { ok, faction, depth: 50 });
  const label = p.scene.add
    .text(sx, sy - 10, `${fromName} → ${toName}`, {
      fontFamily: CITY_INK.family,
      fontSize: "14px",
      color: ok ? DOSSIER.title : DOSSIER.inkDim,
    })
    .setOrigin(0.5)
    .setDepth(51)
    .setScrollFactor(0);
  const sub = p.scene.add
    .text(sx, sy + 12, ok ? `Повысить · ${reason}` : reason, {
      fontFamily: CITY_INK.family,
      fontSize: "12px",
      color: ok ? DOSSIER.gold : DOSSIER.inkDim,
    })
    .setOrigin(0.5)
    .setDepth(51)
    .setScrollFactor(0);

  p.upgradeLayer.push(bg, label, sub);
  if (ok) {
    p.upgradeSlots.push({
      unitId: unit.instanceId,
      left: sx - w / 2,
      top: sy - h / 2,
      right: sx + w / 2,
      bottom: sy + h / 2,
    });
  }
}
