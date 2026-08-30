import type { StatusId } from "./statuses";

/** Per-unit combat skills (not army/hero spells). */
export type UnitSkillId = "guard_charge";

export interface UnitSkillDef {
  id: UnitSkillId;
  name: string;
  icon: string;
  /** Instant — no second click for a target. */
  instant?: boolean;
  applyStatus?: { id: StatusId; turns: number };
}

export const UNIT_SKILLS: Record<UnitSkillId, UnitSkillDef> = {
  guard_charge: {
    id: "guard_charge",
    name: "Натиск",
    icon: "skill_battle_cry",
    instant: true,
    applyStatus: { id: "might", turns: 2 },
  },
};

export function unitSkill(id: UnitSkillId): UnitSkillDef {
  return UNIT_SKILLS[id];
}

export function firstUnitSkill(ids: UnitSkillId[] | undefined): UnitSkillDef | undefined {
  const id = ids?.[0];
  return id ? UNIT_SKILLS[id] : undefined;
}
