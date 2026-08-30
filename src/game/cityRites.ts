/**
 * Night rites in an owned city. Does not import city.ts (city imports buildings/dayNight).
 */
import { CITY_RITES, SOROKOUST_MANA, type RiteDef, type RiteId } from "./catalog";
import { livingUnits, type Army, type City, type GameState } from "./data";
import {
  canPray,
  cityHasTemple,
  ensureDayNight,
  isNight,
  pray,
} from "./dayNight";
import { playerFactionOf } from "./playerFaction";

export function riteDef(id: string): RiteDef | undefined {
  return CITY_RITES.find((r) => r.id === id);
}

export function riteKey(cityId: string, riteId: RiteId): string {
  return `${cityId}:${riteId}`;
}

export function riteUsedTonight(state: GameState, city: City, riteId: RiteId): boolean {
  ensureDayNight(state);
  return (state.cityRitesUsed ?? []).includes(riteKey(city.id, riteId));
}

/** Prefer a living day stack camped in the city; else the opener. */
export function armyForPanikhida(
  state: GameState,
  city: City,
  opener: Army | null,
): Army | null {
  const onTile = state.armies.filter(
    (a) =>
      a.isPlayer &&
      a.mapId === city.mapId &&
      a.x === city.x &&
      a.y === city.y &&
      livingUnits(a).length > 0,
  );
  return (
    onTile.find((a) => !a.isNightHero && !a.isMissionary) ??
    opener ??
    onTile[0] ??
    null
  );
}

export function canPerformRite(
  state: GameState,
  city: City,
  riteId: RiteId,
  opener: Army | null,
): { ok: true; rite: RiteDef; army: Army | null } | { ok: false; reason: string; rite?: RiteDef } {
  const rite = riteDef(riteId);
  if (!rite) return { ok: false, reason: "Нет такого обряда" };
  if (!isNight(state)) return { ok: false, reason: "Ритуалы — ночью", rite };
  const pf = playerFactionOf(state);
  if (city.faction !== pf) return { ok: false, reason: "Чужой город", rite };
  if (riteUsedTonight(state, city, riteId)) {
    return { ok: false, reason: "Уже совершали этой ночью", rite };
  }
  if (rite.needTemple && !cityHasTemple(city) && !city.isCapital) {
    return { ok: false, reason: "Нет храма", rite };
  }
  if (rite.cost.gold && state.gold < rite.cost.gold) {
    return { ok: false, reason: "Мало золота", rite };
  }
  if (rite.cost.mana && state.mana < rite.cost.mana) {
    return { ok: false, reason: "Мало маны", rite };
  }

  let army: Army | null = null;
  if (rite.needArmy) {
    army = armyForPanikhida(state, city, opener);
    if (!army) return { ok: false, reason: "Нужен отряд в городе", rite };
    if (rite.id === "panikhida") {
      const check = canPray(state, army);
      if (!check.ok) return { ok: false, reason: check.reason, rite };
    }
  }
  return { ok: true, rite, army };
}

export function performRite(
  state: GameState,
  city: City,
  riteId: RiteId,
  opener: Army | null,
): { ok: true } | { ok: false; reason: string } {
  const check = canPerformRite(state, city, riteId, opener);
  if (!check.ok) return check;
  const { rite, army } = check;
  ensureDayNight(state);

  if (rite.cost.gold) state.gold -= rite.cost.gold;
  if (rite.cost.mana) state.mana -= rite.cost.mana;
  state.cityRitesUsed!.push(riteKey(city.id, rite.id));

  if (rite.id === "panikhida" && army) {
    const prayed = pray(state, army);
    if (!prayed.ok) {
      state.cityRitesUsed = state.cityRitesUsed!.filter((k) => k !== riteKey(city.id, rite.id));
      if (rite.cost.gold) state.gold += rite.cost.gold;
      if (rite.cost.mana) state.mana += rite.cost.mana;
      return prayed;
    }
    state.lastMessage = `Панихида: ${army.hero.name} служит до рассвета`;
    return { ok: true };
  }

  if (rite.id === "sorokoust") {
    state.mana += SOROKOUST_MANA;
    state.lastMessage = `Сорокоуст в ${city.name}: +${SOROKOUST_MANA} маны`;
    return { ok: true };
  }

  if (rite.id === "bell") {
    const list = state.cityBells!;
    if (!list.some((m) => m.mapId === city.mapId && m.x === city.x && m.y === city.y)) {
      list.push({ mapId: city.mapId, x: city.x, y: city.y });
    }
    state.lastMessage = `Колокол ${city.name}: на рассвете откроется путь`;
    return { ok: true };
  }

  return { ok: true };
}

export function formatRiteCost(rite: RiteDef): string {
  const gold = rite.cost.gold ? `${rite.cost.gold}з` : "";
  const mana = rite.cost.mana ? `${rite.cost.mana}м` : "";
  return [gold, mana].filter(Boolean).join(" · ") || "даром";
}
