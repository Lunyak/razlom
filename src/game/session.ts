import { UNIT_DEFS } from "./catalog";
import {
  createUnit,
  ensureHeroInArmy,
  livingUnits,
  resetUnitInstanceIds,
  session,
  type Army,
} from "./data";
import { ensureNightHero } from "./dayNight";
import {
  createStateFromScenario,
  getScenario,
  nextScenarioId,
  snapshotPlayerArmies,
  startCampaign,
} from "./scenario";

export function bootstrapSession(campaignId = "part1-1914"): void {
  resetUnitInstanceIds();
  session.state = startCampaign(campaignId);
}

export function resetGame(): void {
  bootstrapSession("part1-1914");
}

/** Start a specific scenario (campaign or editor custom). */
export function playScenario(scenarioId: string, campaignId: string | null = null): void {
  resetUnitInstanceIds();
  session.state = createStateFromScenario(scenarioId, campaignId);
}

/**
 * After scenario victory: start next campaign scenario, carrying heroes + resources.
 * Returns false if there is no next scenario.
 */
export function continueCampaign(): boolean {
  const prev = session.state;
  const nextId = nextScenarioId(prev.campaignId, prev.scenarioId);
  if (!nextId || !prev.campaignId) return false;

  const carried = snapshotPlayerArmies(prev);
  const { gold, mana, people, coal, steel, campaignId, inventory } = prev;

  resetUnitInstanceIds();
  const next = createStateFromScenario(nextId, campaignId);
  next.gold = Math.max(next.gold, gold);
  next.mana = Math.max(next.mana, mana);
  next.people = Math.max(next.people, people);
  next.coal = Math.max(next.coal, coal);
  next.steel = Math.max(next.steel, steel);
  if (inventory) next.inventory = { ...inventory };

  const playerSlots = next.armies.filter((a) => a.isPlayer);
  for (let i = 0; i < playerSlots.length; i++) {
    const slot = playerSlots[i];
    const src = carried[i];
    if (!src) break;
    slot.name = src.name;
    slot.hero = { ...src.hero };
    slot.isMissionary = src.isMissionary;
    slot.isNightHero = src.isNightHero;
    slot.units = src.unitDefIds.map((defId, ui) => {
      const u = createUnit(defId);
      const hp = src.unitHps[ui];
      const maxHp = UNIT_DEFS[defId]?.maxHp ?? u.hp;
      if (typeof hp === "number") u.hp = Math.max(0, Math.min(maxHp, hp));
      if (src.unitHeroFlags?.[ui]) u.isHero = true;
      const slotN = src.unitSlots?.[ui];
      if (typeof slotN === "number") u.slot = slotN;
      return u;
    });
    ensureHeroInArmy(slot);
    if (livingUnits(slot).length === 0) {
      slot.units = [createUnit("squire"), createUnit("archer")];
      ensureHeroInArmy(slot);
    }
  }

  const origin = playerSlots[0];
  for (let i = playerSlots.length; i < carried.length; i++) {
    const src = carried[i];
    if (!src || !origin) break;
    const extra: Army = {
      id: `carried_${i}`,
      faction: origin.faction,
      name: src.name,
      x: origin.x + (i - playerSlots.length + 1),
      y: origin.y,
      mapId: origin.mapId,
      isPlayer: true,
      isMissionary: src.isMissionary,
      isNightHero: src.isNightHero,
      movesLeft: src.isNightHero ? 0 : origin.movesLeft,
      hero: { ...src.hero },
      units: src.unitDefIds.map((defId, ui) => {
        const u = createUnit(defId);
        const hp = src.unitHps[ui];
        const maxHp = UNIT_DEFS[defId]?.maxHp ?? u.hp;
        if (typeof hp === "number") u.hp = Math.max(0, Math.min(maxHp, hp));
        if (src.unitHeroFlags?.[ui]) u.isHero = true;
        const slotN = src.unitSlots?.[ui];
        if (typeof slotN === "number") u.slot = slotN;
        return u;
      }),
    };
    ensureHeroInArmy(extra);
    next.armies.push(extra);
  }

  ensureNightHero(next);

  const scenario = getScenario(nextId);
  next.lastMessage = scenario?.brief ?? `Сценарий: ${scenario?.name ?? nextId}`;
  session.state = next;
  return true;
}
