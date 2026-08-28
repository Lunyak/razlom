import type { FactionId, GameState, Hero } from "./data";
import { POTIONS } from "./catalog";
import { addPotion, ensureInventory, randomLootPotion } from "./items";
import { grantArtifact, randomLootArtifact } from "./artifacts";
import { rollHeroLoot } from "./heroPower";

export type SiteKind =
  | "ruins"
  | "gold_mine"
  | "coal_mine"
  | "steel_works"
  | "mana_shrine"
  | "treasure";

export interface MapSite {
  id: string;
  kind: SiteKind;
  x: number;
  y: number;
  mapId: string;
  /** Harvest sites: who holds the mine. Null / missing = unclaimed. */
  owner?: FactionId | null;
  /** Old saves: walk-on harvest once per turn. Income is now per-turn from owner. */
  lastHarvestTurn?: number;
}

export const SITE_LABEL: Record<SiteKind, string> = {
  ruins: "Руины",
  gold_mine: "Золотая шахта",
  coal_mine: "Угольная шахта",
  steel_works: "Сталелитейная",
  mana_shrine: "Святилище",
  treasure: "Клад",
};

export const SITE_COLOR: Record<SiteKind, number> = {
  ruins: 0x8a7a5a,
  gold_mine: 0xc9a227,
  coal_mine: 0x3a342c,
  steel_works: 0x8a9098,
  mana_shrine: 0x6a8ac8,
  treasure: 0xd4a840,
};

export const SITE_KINDS: SiteKind[] = [
  "ruins",
  "gold_mine",
  "coal_mine",
  "steel_works",
  "mana_shrine",
  "treasure",
];

const HARVEST: Partial<Record<SiteKind, { gold?: number; coal?: number; steel?: number }>> = {
  gold_mine: { gold: 20 },
  coal_mine: { coal: 14 },
  steel_works: { steel: 8 },
};

export function isHarvestSite(kind: SiteKind): boolean {
  return !!HARVEST[kind];
}

export function siteAt(state: GameState, x: number, y: number): MapSite | undefined {
  return state.sites.find((s) => s.mapId === state.currentMapId && s.x === x && s.y === y);
}

export function formatHarvestYield(kind: SiteKind): string {
  const yield_ = HARVEST[kind];
  if (!yield_) return "";
  const bits: string[] = [];
  if (yield_.gold) bits.push(`+${yield_.gold} золота / ход`);
  if (yield_.coal) bits.push(`+${yield_.coal} угля / ход`);
  if (yield_.steel) bits.push(`+${yield_.steel} стали / ход`);
  return bits.join(", ");
}

/** Claim a mine / works. Returns true if ownership changed. */
export function captureSite(site: MapSite, faction: FactionId): boolean {
  if (!isHarvestSite(site.kind)) return false;
  if (site.owner === faction) return false;
  site.owner = faction;
  return true;
}

export function collectOwnedSiteIncome(
  state: GameState,
  faction: FactionId,
): { gold: number; coal: number; steel: number } {
  let gold = 0;
  let coal = 0;
  let steel = 0;
  for (const site of state.sites) {
    if (site.owner !== faction || site.mapId !== state.currentMapId) continue;
    const yield_ = HARVEST[site.kind];
    if (!yield_) continue;
    gold += yield_.gold ?? 0;
    coal += yield_.coal ?? 0;
    steel += yield_.steel ?? 0;
  }
  return { gold, coal, steel };
}

function maybeArtifactLoot(state: GameState, hero: Hero, force = false): string {
  if (!force && !rollHeroLoot(hero) && Math.random() > 0.22) return "";
  const art = grantArtifact(state, hero, randomLootArtifact());
  return ` · ${art.message}`;
}

function claimHarvestSite(site: MapSite, faction: FactionId): { message: string; remove: boolean } {
  const yieldText = formatHarvestYield(site.kind);
  if (!yieldText) return { message: SITE_LABEL[site.kind], remove: false };
  if (site.owner === faction) {
    return { message: `${SITE_LABEL[site.kind]} уже ваша (${yieldText})`, remove: false };
  }
  const recapture = !!site.owner;
  captureSite(site, faction);
  return {
    message: recapture
      ? `Перехвачена ${SITE_LABEL[site.kind]}: ${yieldText}`
      : `Захвачена ${SITE_LABEL[site.kind]}: ${yieldText}`,
    remove: false,
  };
}

export function visitSite(
  state: GameState,
  site: MapSite,
  hero: Hero,
  visitorFaction: FactionId,
): { message: string; remove: boolean } {
  if (HARVEST[site.kind]) return claimHarvestSite(site, visitorFaction);

  switch (site.kind) {
    case "ruins": {
      state.gold += 45;
      hero.xp += 25;
      while (hero.xp >= hero.xpToNext) {
        hero.xp -= hero.xpToNext;
        hero.level += 1;
        hero.xpToNext = hero.level * 100;
      }
      const extra = maybeArtifactLoot(state, hero);
      return { message: `Руины: +45 золота, +25 опыта${extra}`, remove: true };
    }
    case "treasure": {
      ensureInventory(state);
      state.gold += 60;
      state.mana += 10;
      const potion = randomLootPotion();
      addPotion(state, potion, 1);
      const art = grantArtifact(state, hero, randomLootArtifact());
      return {
        message: `Клад: +60 золота, +10 маны, ${POTIONS[potion].name}, ${art.message}`,
        remove: true,
      };
    }
    case "mana_shrine": {
      state.mana += 20;
      return { message: "Святилище: +20 маны", remove: true };
    }
    default:
      return { message: SITE_LABEL[site.kind] ?? "Объект", remove: false };
  }
}

export function createDefaultSites(): MapSite[] {
  return [
    { id: "s_ruins", kind: "ruins", x: 7, y: 7, mapId: "frontier" },
    { id: "s_mine", kind: "gold_mine", x: 11, y: 2, mapId: "frontier" },
    { id: "s_coal", kind: "coal_mine", x: 19, y: 6, mapId: "frontier" },
    { id: "s_steel", kind: "steel_works", x: 10, y: 13, mapId: "frontier" },
    { id: "s_shrine", kind: "mana_shrine", x: 6, y: 4, mapId: "frontier" },
    { id: "s_treasure", kind: "treasure", x: 14, y: 7, mapId: "frontier" },
  ];
}
