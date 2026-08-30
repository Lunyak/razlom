/** Night city rites. Logic lives in cityRites.ts. */

export type RiteId = "panikhida" | "sorokoust" | "bell";

export interface RiteDef {
  id: RiteId;
  name: string;
  blurb: string;
  cost: { gold?: number; mana?: number };
  /** Bless an army on the city tile (prefer the living day stack). */
  needArmy?: boolean;
  needTemple?: boolean;
}

export const CITY_RITES: RiteDef[] = [
  {
    id: "panikhida",
    name: "Панихида",
    blurb: "Рассвет: полное лечение и +1 ОД отряду в городе",
    cost: { mana: 8 },
    needArmy: true,
    needTemple: true,
  },
  {
    id: "sorokoust",
    name: "Сорокоуст",
    blurb: "Сорок дней в одну ночь — город даёт ману сейчас",
    cost: { gold: 22 },
  },
  {
    id: "bell",
    name: "Колокольный звон",
    blurb: "На рассвете туман вокруг города редеет",
    cost: { gold: 16, mana: 6 },
  },
];

/** Mana granted immediately by Сорокоуст. */
export const SOROKOUST_MANA = 14;
