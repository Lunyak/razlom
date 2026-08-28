/**
 * Hero class helpers. Tables live in catalog/heroClasses.ts.
 */
import { HERO_CLASS_IDS, HERO_CLASSES, type HeroClassDef, type HeroClassId } from "./catalog";
import type { Hero } from "./data";

export type { HeroClassId, HeroClassDef } from "./catalog";

export function isHeroClassId(id: string | undefined | null): id is HeroClassId {
  return !!id && (HERO_CLASS_IDS as string[]).includes(id);
}

export function ensureHeroClass(hero: Hero): HeroClassId {
  if (!isHeroClassId(hero.classId)) {
    hero.classId = defaultClassForName(hero.name);
  }
  return hero.classId;
}

export function defaultClassForName(name: string): HeroClassId {
  if (name === "Элиана") return "priest";
  if (name.toLowerCase().includes("развед")) return "scout";
  return "officer";
}

export function classDef(hero: Hero): HeroClassDef {
  return HERO_CLASSES[ensureHeroClass(hero)];
}

export function classLabel(hero: Hero): string {
  return classDef(hero).name;
}

export function cycleHeroClass(hero: Hero): HeroClassId {
  const cur = ensureHeroClass(hero);
  const i = HERO_CLASS_IDS.indexOf(cur);
  const next = HERO_CLASS_IDS[(i + 1) % HERO_CLASS_IDS.length]!;
  hero.classId = next;
  return next;
}

/** Level 1 heroes may switch class freely (no spent XP). */
export function canRespecClass(hero: Hero): boolean {
  return hero.level <= 1 && hero.xp === 0;
}
