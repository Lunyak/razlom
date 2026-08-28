/**
 * Artifact equip / stash. Tables live in catalog/artifacts.ts.
 */
import {
  ARTIFACTS,
  ARTIFACT_IDS,
  ARTIFACT_SLOTS,
  type ArtifactBonuses,
  type ArtifactDef,
  type ArtifactId,
  type ArtifactSlot,
} from "./catalog";
import type { GameState, Hero } from "./data";
import { ensureHeroClass } from "./heroClasses";

export type { ArtifactId, ArtifactSlot, ArtifactBonuses, ArtifactDef } from "./catalog";

export type HeroEquipment = Partial<Record<ArtifactSlot, ArtifactId>>;

export function emptyEquipment(): HeroEquipment {
  return {};
}

export function ensureEquipment(hero: Hero): HeroEquipment {
  if (!hero.equipment) hero.equipment = emptyEquipment();
  return hero.equipment;
}

export function ensureArtifactStash(state: GameState): ArtifactId[] {
  if (!Array.isArray(state.artifacts)) state.artifacts = [];
  return state.artifacts;
}

export function equipmentBonuses(hero: Hero): ArtifactBonuses {
  const eq = ensureEquipment(hero);
  const out: ArtifactBonuses = {};
  for (const slot of ARTIFACT_SLOTS) {
    const id = eq[slot];
    if (!id) continue;
    const def = ARTIFACTS[id];
    if (!def) continue;
    out.damage = (out.damage ?? 0) + (def.bonuses.damage ?? 0);
    out.armor = (out.armor ?? 0) + (def.bonuses.armor ?? 0);
    out.moves = (out.moves ?? 0) + (def.bonuses.moves ?? 0);
    out.leadership = (out.leadership ?? 0) + (def.bonuses.leadership ?? 0);
    out.spellPower = (out.spellPower ?? 0) + (def.bonuses.spellPower ?? 0);
  }
  return out;
}

export function equippedList(hero: Hero): ArtifactDef[] {
  const eq = ensureEquipment(hero);
  const list: ArtifactDef[] = [];
  for (const slot of ARTIFACT_SLOTS) {
    const id = eq[slot];
    if (id && ARTIFACTS[id]) list.push(ARTIFACTS[id]);
  }
  return list;
}

export function formatArtifactLine(id: ArtifactId): string {
  const a = ARTIFACTS[id];
  const bits: string[] = [];
  if (a.bonuses.damage) bits.push(`+${a.bonuses.damage} урон`);
  if (a.bonuses.armor) bits.push(`−${a.bonuses.armor} вх.`);
  if (a.bonuses.moves) bits.push(`+${a.bonuses.moves} ОД`);
  if (a.bonuses.leadership) bits.push(`+${a.bonuses.leadership} лид.`);
  if (a.bonuses.spellPower) bits.push(`+${a.bonuses.spellPower} маг.`);
  return `${a.name}${bits.length ? ` (${bits.join(", ")})` : ""}`;
}

/** Put into stash; auto-equip if the slot is free. */
export function grantArtifact(
  state: GameState,
  hero: Hero | null,
  id: ArtifactId,
): { message: string; equipped: boolean } {
  const def = ARTIFACTS[id];
  if (!def) return { message: "Неизвестный артефакт", equipped: false };

  if (hero) {
    ensureHeroClass(hero);
    const eq = ensureEquipment(hero);
    if (!eq[def.slot]) {
      eq[def.slot] = id;
      const mana = def.bonuses.manaOnFind ?? 0;
      if (mana) state.mana += mana;
      return { message: `${def.name} экипирован`, equipped: true };
    }
  }

  ensureArtifactStash(state).push(id);
  return { message: `${def.name} в сумке`, equipped: false };
}

export function equipFromStash(
  state: GameState,
  hero: Hero,
  id: ArtifactId,
): { ok: true; message: string } | { ok: false; reason: string } {
  const stash = ensureArtifactStash(state);
  const idx = stash.indexOf(id);
  if (idx < 0) return { ok: false, reason: "Нет в сумке" };
  const def = ARTIFACTS[id];
  if (!def) return { ok: false, reason: "Неизвестный" };

  const eq = ensureEquipment(hero);
  const prev = eq[def.slot];
  stash.splice(idx, 1);
  if (prev) stash.push(prev);
  eq[def.slot] = id;
  return { ok: true, message: `Надето: ${def.name}` };
}

export function unequipSlot(
  state: GameState,
  hero: Hero,
  slot: ArtifactSlot,
): { ok: true; message: string } | { ok: false; reason: string } {
  const eq = ensureEquipment(hero);
  const id = eq[slot];
  if (!id) return { ok: false, reason: "Слот пуст" };
  delete eq[slot];
  ensureArtifactStash(state).push(id);
  return { ok: true, message: `${ARTIFACTS[id]?.name ?? id} снят` };
}

const LOOT_TABLE: ArtifactId[] = [...ARTIFACT_IDS];

export function randomLootArtifact(): ArtifactId {
  return LOOT_TABLE[Math.floor(Math.random() * LOOT_TABLE.length)]!;
}
