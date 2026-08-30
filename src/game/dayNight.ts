/**
 * Day / night veil — one grid, two faces. Rules: docs/design/day-night.md
 *
 * Does not import city.ts / sites.ts / buildings.ts (those import this).
 */
import {
  BLOOD_ORDO_MANA,
  BLOOD_MOVE_PENALTY,
  CITY_BELL_RADIUS,
  MOVES_NIGHT_MISSIONARY,
  RUIN_SCOUT_RADIUS,
  UNIT_DEFS,
  unitVeil,
} from "./catalog";
import { armyMaxMoves, createUnit, ensureHeroInArmy, livingUnits } from "./army";
import { ensureEquipment } from "./artifacts";
import { ensureHeroClass } from "./heroClasses";
import { playerFactionOf } from "./playerFaction";
import type { Army, City, DayPhase, FactionId, GameState, TileMark, VeilPresence } from "./types";

const TEMPLE_BUILDINGS = [
  "temple",
  "cossack_church",
  "highland_shrine",
  "janus_crypt",
  "risen_mausoleum",
] as const;

export function ensureDayNight(state: GameState): void {
  if (state.phase !== "day" && state.phase !== "night") state.phase = "day";
  if (!Array.isArray(state.bloodStains)) state.bloodStains = [];
  if (!Array.isArray(state.ruinMemory)) state.ruinMemory = [];
  if (!Array.isArray(state.prayedArmyIds)) state.prayedArmyIds = [];
  if (!Array.isArray(state.ruinScouts)) state.ruinScouts = [];
  if (!Array.isArray(state.cityRitesUsed)) state.cityRitesUsed = [];
  if (!Array.isArray(state.cityBells)) state.cityBells = [];
}

export function phaseOf(state: GameState): DayPhase {
  ensureDayNight(state);
  return state.phase === "night" ? "night" : "day";
}

export function isDay(state: GameState): boolean {
  return phaseOf(state) === "day";
}

export function isNight(state: GameState): boolean {
  return phaseOf(state) === "night";
}

export function cityHasTemple(city: City): boolean {
  return TEMPLE_BUILDINGS.some((id) => city.buildings.includes(id));
}

/** Capital bell, built temple, or claimed wayside shrine. */
export function hasTempleAnchor(state: GameState, faction: FactionId, mapId: string): boolean {
  if (
    state.cities.some(
      (c) =>
        c.mapId === mapId &&
        c.faction === faction &&
        (c.isCapital || cityHasTemple(c)),
    )
  ) {
    return true;
  }
  return state.sites.some(
    (s) => s.mapId === mapId && s.kind === "mana_shrine" && s.owner === faction,
  );
}

/** Walks the veil: missionary or the dedicated night hero. */
export function isVeilActor(army: Army): boolean {
  return !!army.isMissionary || !!army.isNightHero;
}

export function armyVeil(army: Army): VeilPresence {
  if (army.veil === "day" || army.veil === "night" || army.veil === "both") return army.veil;
  if (army.isNightHero) return "night";
  if (army.isMissionary) return "both";
  return "day";
}

/** Day stacks take living troops; night stacks take mystics. Both-face can take either. */
export function armyCanCarryUnit(army: Army, defId: string): boolean {
  const av = armyVeil(army);
  const uv = unitVeil(defId);
  if (uv === "both" || av === "both") return true;
  return av === uv;
}

export function armyPresentOnPhase(army: Army, phase: DayPhase): boolean {
  const v = armyVeil(army);
  return v === "both" || v === phase;
}

export function armyPresentNow(state: GameState, army: Army): boolean {
  return armyPresentOnPhase(army, phaseOf(state));
}

/** Own stacks stay as camp; strangers only exist on their face of the day. */
export function armyVisibleOnMap(state: GameState, army: Army): boolean {
  if (army.isPlayer) return true;
  return armyPresentNow(state, army);
}

export function sameVeilLayer(a: Army, b: Army): boolean {
  const va = armyVeil(a);
  const vb = armyVeil(b);
  if (va === "both" || vb === "both") return true;
  return va === vb;
}

export function canArmiesEngage(state: GameState, a: Army, b: Army): boolean {
  if (a.id === b.id) return false;
  if (a.isPlayer && b.isPlayer) return false;
  if (livingUnits(a).length === 0 || livingUnits(b).length === 0) return false;
  if (!armyPresentNow(state, a) || !armyPresentNow(state, b)) return false;
  if (!sameVeilLayer(a, b)) return false;
  if (a.isMissionary || b.isMissionary) return false;
  return true;
}

export function veilPresenceLabel(army: Army): string {
  const v = armyVeil(army);
  if (v === "night") return "только ночь";
  if (v === "day") return "только день";
  return "день и ночь";
}

export function canArmyMarch(state: GameState, army: Army): boolean {
  if (isDay(state)) return !army.isNightHero;
  return isVeilActor(army);
}

export function canArmyAttack(state: GameState, army: Army): boolean {
  if (army.isMissionary) return false;
  return canArmyMarch(state, army);
}

export function dayActionsClosed(state: GameState): boolean {
  return isNight(state);
}

function sameTile(a: TileMark, mapId: string, x: number, y: number): boolean {
  return a.mapId === mapId && a.x === x && a.y === y;
}

function markAt(
  list: TileMark[] | undefined,
  mapId: string,
  x: number,
  y: number,
): TileMark | undefined {
  return list?.find((m) => sameTile(m, mapId, x, y));
}

function pushUnique(list: TileMark[], mapId: string, x: number, y: number): void {
  if (markAt(list, mapId, x, y)) return;
  list.push({ mapId, x, y });
}

export function bloodAt(
  state: GameState,
  x: number,
  y: number,
  mapId = state.currentMapId,
): TileMark | undefined {
  ensureDayNight(state);
  return markAt(state.bloodStains, mapId, x, y);
}

export function addBloodStain(
  state: GameState,
  x: number,
  y: number,
  mapId = state.currentMapId,
): void {
  ensureDayNight(state);
  pushUnique(state.bloodStains!, mapId, x, y);
}

export function removeBloodStain(
  state: GameState,
  x: number,
  y: number,
  mapId = state.currentMapId,
): void {
  ensureDayNight(state);
  state.bloodStains = state.bloodStains!.filter((m) => !sameTile(m, mapId, x, y));
}

/** Extra AP to enter this tile by day. Night ignores blood cost. */
export function bloodMovePenalty(
  state: GameState,
  x: number,
  y: number,
  mapId = state.currentMapId,
): number {
  if (isNight(state)) return 0;
  return bloodAt(state, x, y, mapId) ? BLOOD_MOVE_PENALTY : 0;
}

export function rememberRuins(
  state: GameState,
  x: number,
  y: number,
  mapId = state.currentMapId,
): void {
  ensureDayNight(state);
  pushUnique(state.ruinMemory!, mapId, x, y);
}

export function ruinMemoryAt(
  state: GameState,
  x: number,
  y: number,
  mapId = state.currentMapId,
): TileMark | undefined {
  ensureDayNight(state);
  return markAt(state.ruinMemory, mapId, x, y);
}

export function hasRuinFace(
  state: GameState,
  x: number,
  y: number,
  mapId = state.currentMapId,
): boolean {
  if (ruinMemoryAt(state, x, y, mapId)) return true;
  return state.sites.some(
    (s) => s.mapId === mapId && s.x === x && s.y === y && s.kind === "ruins",
  );
}

function canRiteOnBlood(army: Army): boolean {
  return isVeilActor(army) || army.hero.classId === "priest";
}

function mapBounds(state: GameState, mapId: string): { cols: number; rows: number } {
  const fog = state.discoveredByMap[mapId];
  return { cols: fog?.[0]?.length ?? 64, rows: fog?.length ?? 64 };
}

function tileHasLivingArmy(
  state: GameState,
  mapId: string,
  x: number,
  y: number,
  exceptId?: string,
): boolean {
  return state.armies.some(
    (a) =>
      a.mapId === mapId &&
      a.x === x &&
      a.y === y &&
      a.id !== exceptId &&
      livingUnits(a).length > 0,
  );
}

/** First free cell at or around (x, y) — used when spawning Arseny or a raised stack. */
export function findOpenTile(
  state: GameState,
  mapId: string,
  x: number,
  y: number,
  exceptId?: string,
): { x: number; y: number } {
  const { cols, rows } = mapBounds(state, mapId);
  const tryAt = (tx: number, ty: number): boolean =>
    tx >= 0 && ty >= 0 && tx < cols && ty < rows && !tileHasLivingArmy(state, mapId, tx, ty, exceptId);
  if (tryAt(x, y)) return { x, y };
  const ring: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
    [2, 0],
    [-2, 0],
    [0, 2],
    [0, -2],
  ];
  for (const [dx, dy] of ring) {
    const nx = x + dx;
    const ny = y + dy;
    if (tryAt(nx, ny)) return { x: nx, y: ny };
  }
  return { x, y };
}

export function createNightHeroArmy(
  x: number,
  y: number,
  mapId: string,
  faction: FactionId,
  id = "player_night",
): Army {
  const army: Army = {
    id,
    faction,
    name: "Скит Арсения",
    x,
    y,
    mapId,
    isPlayer: true,
    isNightHero: true,
    movesLeft: 0,
    hero: { name: "Арсений", level: 1, xp: 0, xpToNext: 100, classId: "priest" },
    units: [createUnit("incorrupt")],
  };
  ensureHeroClass(army.hero);
  ensureEquipment(army.hero);
  ensureHeroInArmy(army);
  return army;
}

/** Old saves / custom maps: spawn Arseny at the player capital if missing. */
export function ensureNightHero(state: GameState): Army | null {
  ensureDayNight(state);
  const living = state.armies.find(
    (a) => a.isPlayer && a.isNightHero && livingUnits(a).length > 0,
  );
  if (living) return living;
  if (state.armies.some((a) => a.isPlayer && a.isNightHero)) return null;
  if (state.graves?.some((g) => g.isNightHero || g.hero.name === "Арсений")) return null;

  const pf = playerFactionOf(state);
  const mapId = state.currentMapId;
  const capital =
    state.cities.find((c) => c.mapId === mapId && c.faction === pf && c.isCapital) ??
    state.cities.find((c) => c.mapId === mapId && c.faction === pf) ??
    state.cities.find((c) => c.faction === pf && c.isCapital);
  if (!capital) return null;

  const tile = findOpenTile(state, capital.mapId, capital.x, capital.y);
  const taken = state.armies.some((a) => a.id === "player_night");
  const army = createNightHeroArmy(
    tile.x,
    tile.y,
    capital.mapId,
    pf,
    taken ? `player_night_${state.turn}` : "player_night",
  );
  state.armies.push(army);
  return army;
}

export function selectPhaseArmy(state: GameState): void {
  ensureDayNight(state);
  const mapId = state.currentMapId;
  const candidates = state.armies.filter(
    (a) => a.isPlayer && !a.isNeutral && a.mapId === mapId && livingUnits(a).length > 0,
  );
  if (candidates.length === 0) {
    state.selectedArmyId = null;
    return;
  }
  const pick = isNight(state)
    ? (candidates.find((a) => a.isNightHero) ?? candidates.find(isVeilActor) ?? candidates[0])
    : (candidates.find((a) => !a.isNightHero && !a.isMissionary) ??
      candidates.find((a) => !a.isNightHero) ??
      candidates[0]);
  state.selectedArmyId = pick.id;
}

export function canPray(
  state: GameState,
  army: Army,
): { ok: true } | { ok: false; reason: string } {
  if (!isNight(state)) return { ok: false, reason: "Служба — только ночью" };
  if (!army.isPlayer) return { ok: false, reason: "Не ваш отряд" };
  if (livingUnits(army).length === 0) return { ok: false, reason: "Отряд мёртв" };
  ensureDayNight(state);
  if (state.prayedArmyIds!.includes(army.id)) {
    return { ok: false, reason: "Уже служили этой ночью" };
  }
  const city = state.cities.find(
    (c) => c.mapId === army.mapId && c.x === army.x && c.y === army.y,
  );
  if (!city) return { ok: false, reason: "Служба — в своём храмовом городе" };
  const pf = playerFactionOf(state);
  if (city.faction !== army.faction && city.faction !== pf) {
    return { ok: false, reason: "Чужой город" };
  }
  if (!cityHasTemple(city) && !city.isCapital) {
    return { ok: false, reason: "Нет храма" };
  }
  return { ok: true };
}

export function pray(state: GameState, army: Army): { ok: true } | { ok: false; reason: string } {
  const check = canPray(state, army);
  if (!check.ok) return check;
  ensureDayNight(state);
  state.prayedArmyIds!.push(army.id);
  state.lastMessage = `${army.hero.name} служит до рассвета`;
  return { ok: true };
}

export function canRequiem(
  state: GameState,
  army: Army,
): { ok: true } | { ok: false; reason: string } {
  if (!isNight(state)) return { ok: false, reason: "Отпевание — только ночью" };
  if (!army.isPlayer) return { ok: false, reason: "Не ваш отряд" };
  if (livingUnits(army).length === 0) return { ok: false, reason: "Отряд мёртв" };
  if (!canRiteOnBlood(army)) return { ok: false, reason: "Нужен миссионер или иеромонах" };
  if (!bloodAt(state, army.x, army.y, army.mapId)) return { ok: false, reason: "Здесь нет крови" };
  return { ok: true };
}

export function requiem(state: GameState, army: Army): { ok: true } | { ok: false; reason: string } {
  const check = canRequiem(state, army);
  if (!check.ok) return check;
  removeBloodStain(state, army.x, army.y, army.mapId);
  state.lastMessage = `${army.hero.name} отпел кровь — утром клетка чистая`;
  return { ok: true };
}

export function canCollectBlood(
  state: GameState,
  army: Army,
): { ok: true } | { ok: false; reason: string } {
  if (!isNight(state)) return { ok: false, reason: "Сбор крови — только ночью" };
  if (army.faction !== "ordo") return { ok: false, reason: "Кровь собирает Ordo Lumen" };
  if (livingUnits(army).length === 0) return { ok: false, reason: "Отряд мёртв" };
  if (!bloodAt(state, army.x, army.y, army.mapId)) return { ok: false, reason: "Здесь нет крови" };
  return { ok: true };
}

export function collectBlood(
  state: GameState,
  army: Army,
): { ok: true; mana: number } | { ok: false; reason: string } {
  const check = canCollectBlood(state, army);
  if (!check.ok) return check;
  if (army.isPlayer) state.mana += BLOOD_ORDO_MANA;
  state.lastMessage = `${army.name} собрал кровь (+${BLOOD_ORDO_MANA} маны). Метка осталась.`;
  return { ok: true, mana: BLOOD_ORDO_MANA };
}

export function canLookRuins(
  state: GameState,
  army: Army,
): { ok: true } | { ok: false; reason: string } {
  if (!isNight(state)) return { ok: false, reason: "Глядеть в руины — только ночью" };
  if (!army.isPlayer) return { ok: false, reason: "Не ваш отряд" };
  if (livingUnits(army).length === 0) return { ok: false, reason: "Отряд мёртв" };
  if (!hasRuinFace(state, army.x, army.y, army.mapId)) {
    return { ok: false, reason: "Здесь нет памяти руин" };
  }
  ensureDayNight(state);
  if (markAt(state.ruinScouts, army.mapId, army.x, army.y)) {
    return { ok: false, reason: "Уже глядели — туман откроется на рассвете" };
  }
  return { ok: true };
}

export function lookRuins(
  state: GameState,
  army: Army,
): { ok: true } | { ok: false; reason: string } {
  const check = canLookRuins(state, army);
  if (!check.ok) return check;
  ensureDayNight(state);
  pushUnique(state.ruinScouts!, army.mapId, army.x, army.y);
  state.lastMessage = `${army.hero.name} глядит в руины — на рассвете откроется путь`;
  return { ok: true };
}

function healLivingFull(army: Army): number {
  let total = 0;
  for (const unit of livingUnits(army)) {
    const def = UNIT_DEFS[unit.defId];
    if (!def) continue;
    const bonus = unit.isHero ? Math.max(0, army.hero.level - 1) * 8 : 0;
    const cap = def.maxHp + bonus;
    const before = unit.hp;
    unit.hp = cap;
    total += unit.hp - before;
  }
  return total;
}

/** Freeze living stacks; veil actors get a night budget. */
export function beginNight(state: GameState): string {
  ensureDayNight(state);
  ensureNightHero(state);
  state.phase = "night";
  state.prayedArmyIds = [];
  state.cityRitesUsed = [];
  for (const army of state.armies) {
    if (!army.isPlayer) continue;
    if (army.isNightHero) army.movesLeft = armyMaxMoves(army);
    else if (army.isMissionary) army.movesLeft = MOVES_NIGHT_MISSIONARY;
    else army.movesLeft = 0;
  }
  selectPhaseArmy(state);
  const veil = state.armies.find((a) => a.id === state.selectedArmyId);
  const who = veil?.isNightHero ? veil.hero.name : "Шов";
  state.lastMessage = `Ночь. ${who} выходит на шов. Живые в лагере.`;
  return state.lastMessage;
}

/**
 * Heal those who served, open ruin fog, set phase to day.
 * Leave prayedArmyIds for {@link consumePrayerAp} when resetting moves.
 */
export function applyDawnVeil(state: GameState, cols: number, rows: number): string {
  ensureDayNight(state);
  const bits: string[] = [];
  for (const army of state.armies) {
    if (!(state.prayedArmyIds ?? []).includes(army.id)) continue;
    const healed = healLivingFull(army);
    if (healed > 0) bits.push(`${army.hero.name} после службы +${healed} HP`);
    else bits.push(`${army.hero.name} после службы +1 ОД`);
  }

  let fogTiles = 0;
  for (const scout of state.ruinScouts ?? []) {
    fogTiles += revealFogAround(
      state,
      scout.x,
      scout.y,
      scout.mapId,
      cols,
      rows,
      RUIN_SCOUT_RADIUS,
    );
  }
  state.ruinScouts = [];
  if (fogTiles > 0) bits.push(`Память руин открыла туман (${fogTiles})`);

  let bellTiles = 0;
  for (const bell of state.cityBells ?? []) {
    bellTiles += revealFogAround(
      state,
      bell.x,
      bell.y,
      bell.mapId,
      cols,
      rows,
      CITY_BELL_RADIUS,
    );
  }
  state.cityBells = [];
  if (bellTiles > 0) bits.push(`Колокол открыл туман (${bellTiles})`);

  state.phase = "day";
  for (const army of state.armies) {
    if (army.isNightHero) army.movesLeft = 0;
  }
  selectPhaseArmy(state);
  return bits.join(" · ");
}

/** +1 AP from night prayer; call once per army when resetting moves at dawn. */
export function consumePrayerAp(state: GameState, army: Army): number {
  ensureDayNight(state);
  if (!state.prayedArmyIds?.includes(army.id)) return 0;
  state.prayedArmyIds = state.prayedArmyIds.filter((id) => id !== army.id);
  return 1;
}

export function revealFogAround(
  state: GameState,
  x: number,
  y: number,
  mapId: string,
  cols: number,
  rows: number,
  radius: number,
): number {
  const fog = state.discoveredByMap[mapId];
  if (!fog) return 0;
  let n = 0;
  for (let gy = Math.max(0, y - radius); gy <= Math.min(rows - 1, y + radius); gy++) {
    for (let gx = Math.max(0, x - radius); gx <= Math.min(cols - 1, x + radius); gx++) {
      if (Math.abs(gx - x) + Math.abs(gy - y) > radius) continue;
      if (!fog[gy]?.[gx]) {
        fog[gy][gx] = true;
        n += 1;
      }
    }
  }
  return n;
}

/** Enemy night: Ordo standing on blood harvests it (does not add to player mana). */
export function enemyNightCollectBlood(state: GameState): string {
  ensureDayNight(state);
  const bits: string[] = [];
  for (const army of state.armies) {
    if (army.isPlayer || army.isNeutral) continue;
    if (army.faction !== "ordo") continue;
    if (livingUnits(army).length === 0) continue;
    const result = collectBlood(state, army);
    if (result.ok) bits.push(`${army.name} собрал кровь`);
  }
  return bits.join(" · ");
}

export function endTurnButtonHint(state: GameState): string {
  return isDay(state) ? "Ночь" : "Ход";
}

export function phaseLabel(state: GameState): string {
  const n = state.turn;
  return isNight(state) ? `НОЧЬ ${n}` : `ДЕНЬ ${n}`;
}

export function turnHudLine(state: GameState): string {
  const week = Math.ceil(state.turn / 7);
  const face = isNight(state) ? "НОЧЬ" : "ДЕНЬ";
  return `НЕД ${week}. ${face} ${state.turn}`;
}

export function settingsEndTurnLabel(state: GameState): string {
  return isDay(state) ? "На ночь (E)" : "Конец суток (E)";
}
