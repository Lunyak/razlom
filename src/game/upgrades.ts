/**
 * Unit upgrade logic. Tables live in catalog/upgrades.ts.
 */
import { UNIT_DEFS, UNIT_UPGRADES, unitMatchesPhase, type UnitUpgradeDef } from "./catalog";
import { cityHasBuilding } from "./buildings";
import { cityCulture, type City, type FactionId, type GameState, type UnitInstance } from "./data";
import { isNight, phaseOf } from "./dayNight";

export type { UnitUpgradeDef } from "./catalog";

export function upgradeFor(defId: string): UnitUpgradeDef | undefined {
  return UNIT_UPGRADES.find((u) => u.from === defId);
}

export function formatUpgradeCost(upgrade: UnitUpgradeDef): string {
  const mana = upgrade.cost.mana ? ` · ${upgrade.cost.mana}м` : "";
  const people = upgrade.cost.people ? ` · ${upgrade.cost.people}л` : "";
  return `${upgrade.cost.gold}з${mana}${people}`;
}

export function formatUpgradeLine(upgrade: UnitUpgradeDef): string {
  const from = UNIT_DEFS[upgrade.from]?.name ?? upgrade.from;
  const to = UNIT_DEFS[upgrade.to]?.name ?? upgrade.to;
  return `${from} → ${to} (${formatUpgradeCost(upgrade)})`;
}

export function canUpgradeUnit(
  state: GameState,
  city: City,
  unit: UnitInstance,
  playerFaction: FactionId = "ri",
): { ok: true; upgrade: UnitUpgradeDef } | { ok: false; reason: string; upgrade?: UnitUpgradeDef } {
  if (unit.isHero) return { ok: false, reason: "Героя нельзя повысить" };
  if (unit.hp <= 0) return { ok: false, reason: "Сначала воскресите" };
  if (!unitMatchesPhase(unit.defId, phaseOf(state))) {
    return {
      ok: false,
      reason: isNight(state) ? "Обычных повышают днём" : "Мистических — ночью",
    };
  }

  const upgrade = upgradeFor(unit.defId);
  if (!upgrade) return { ok: false, reason: "Нет повышения" };

  if (city.faction !== playerFaction) return { ok: false, reason: "Не ваш город", upgrade };
  if (cityCulture(city) !== (UNIT_DEFS[unit.defId]?.faction ?? "ri")) {
    return { ok: false, reason: "Не та культура города", upgrade };
  }
  if (!cityHasBuilding(city, upgrade.building)) {
    return { ok: false, reason: "Нужно здание", upgrade };
  }

  if (state.gold < upgrade.cost.gold) return { ok: false, reason: "Мало золота", upgrade };
  if (upgrade.cost.mana && state.mana < upgrade.cost.mana) {
    return { ok: false, reason: "Мало маны", upgrade };
  }
  if (upgrade.cost.people && state.people < upgrade.cost.people) {
    return { ok: false, reason: "Мало людей", upgrade };
  }

  return { ok: true, upgrade };
}

/** Scale current HP onto the new unit; full HP stays full. */
export function applyUpgrade(state: GameState, unit: UnitInstance, upgrade: UnitUpgradeDef): void {
  const oldDef = UNIT_DEFS[unit.defId];
  const newDef = UNIT_DEFS[upgrade.to];
  if (!oldDef || !newDef) return;

  state.gold -= upgrade.cost.gold;
  if (upgrade.cost.mana) state.mana -= upgrade.cost.mana;
  if (upgrade.cost.people) state.people -= upgrade.cost.people;

  const wasFull = unit.hp >= oldDef.maxHp;
  unit.defId = upgrade.to;
  unit.hp = wasFull
    ? newDef.maxHp
    : Math.max(1, Math.round(unit.hp * (newDef.maxHp / oldDef.maxHp)));
}

export function upgradeUnit(
  state: GameState,
  city: City,
  unit: UnitInstance,
  playerFaction: FactionId = "ri",
): { ok: true; upgrade: UnitUpgradeDef } | { ok: false; reason: string } {
  const check = canUpgradeUnit(state, city, unit, playerFaction);
  if (!check.ok) return check;
  applyUpgrade(state, unit, check.upgrade);
  return { ok: true, upgrade: check.upgrade };
}
