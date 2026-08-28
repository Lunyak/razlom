import type { FactionId } from "./factions";

export type BuildingId =
  | "barracks"
  | "archery_range"
  | "mage_tower"
  | "temple"
  | "hero_hall"
  | "stanitsa"
  | "cossack_range"
  | "cossack_church"
  | "aul"
  | "highland_forge"
  | "highland_shrine"
  | "pax_barracks"
  | "lumen_scriptorium"
  | "janus_crypt"
  | "risen_barracks"
  | "risen_tribune"
  | "risen_mausoleum";

export interface BuildingDef {
  id: BuildingId;
  name: string;
  cost: { gold: number; mana?: number };
  incomeBonus?: { gold?: number; mana?: number; people?: number };
  unlocks?: string[];
  description: string;
  /** Which culture tree this building belongs to. */
  culture: FactionId;
}

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  barracks: {
    id: "barracks",
    name: "Казармы гвардии",
    cost: { gold: 80 },
    unlocks: ["knight"],
    description: "Юнкер → Гвардеец",
    incomeBonus: { people: 2 },
    culture: "ri",
  },
  archery_range: {
    id: "archery_range",
    name: "Стрелковый двор",
    cost: { gold: 60 },
    unlocks: ["marksman"],
    description: "Стрелок → Егерь, +доход",
    incomeBonus: { gold: 5, people: 1 },
    culture: "ri",
  },
  mage_tower: {
    id: "mage_tower",
    name: "Императорская башня",
    cost: { gold: 100, mana: 15 },
    unlocks: ["witch"],
    incomeBonus: { mana: 4 },
    description: "Нанимать черниц, +4 маны",
    culture: "ri",
  },
  temple: {
    id: "temple",
    name: "Собор",
    cost: { gold: 90, mana: 10 },
    incomeBonus: { gold: 3, mana: 3, people: 1 },
    description: "Послушник → Иеромонах, дешевле лазарет",
    culture: "ri",
  },
  hero_hall: {
    id: "hero_hall",
    name: "Зал орденов",
    cost: { gold: 150, mana: 20 },
    description: "Второй герой (один раз)",
    culture: "ri",
  },
  stanitsa: {
    id: "stanitsa",
    name: "Станица",
    cost: { gold: 75 },
    unlocks: ["cossack_sotnik"],
    description: "Пластун → Сотник",
    incomeBonus: { people: 2, gold: 3 },
    culture: "cossack",
  },
  cossack_range: {
    id: "cossack_range",
    name: "Стрельбище",
    cost: { gold: 55 },
    unlocks: ["cossack_plastun_rifle"],
    description: "Стрелец → Пластун-стрелок",
    incomeBonus: { gold: 4 },
    culture: "cossack",
  },
  cossack_church: {
    id: "cossack_church",
    name: "Станичная церковь",
    cost: { gold: 85, mana: 8 },
    unlocks: ["cossack_starshina"],
    description: "Поп → Старшина",
    incomeBonus: { mana: 3, people: 1 },
    culture: "cossack",
  },
  aul: {
    id: "aul",
    name: "Аул",
    cost: { gold: 80 },
    unlocks: ["highlander_abrek"],
    description: "Джигит → Абрек",
    incomeBonus: { people: 2 },
    culture: "highlander",
  },
  highland_forge: {
    id: "highland_forge",
    name: "Горная кузня",
    cost: { gold: 65 },
    unlocks: ["highlander_naib"],
    description: "Стрелок → Наиб",
    incomeBonus: { gold: 5 },
    culture: "highlander",
  },
  highland_shrine: {
    id: "highland_shrine",
    name: "Святилище предков",
    cost: { gold: 90, mana: 10 },
    unlocks: ["highlander_qadi"],
    description: "Знахарь → Кадий",
    incomeBonus: { mana: 4, people: 1 },
    culture: "highlander",
  },
  pax_barracks: {
    id: "pax_barracks",
    name: "Казармы Pax",
    cost: { gold: 80 },
    unlocks: ["ordo_shock"],
    description: "Гренадер Pax → Ударный гренадер",
    incomeBonus: { people: 2 },
    culture: "ordo",
  },
  lumen_scriptorium: {
    id: "lumen_scriptorium",
    name: "Скрипторий Lumen",
    cost: { gold: 65 },
    unlocks: ["ordo_censor"],
    description: "Корректор → Цензор",
    incomeBonus: { gold: 4 },
    culture: "ordo",
  },
  janus_crypt: {
    id: "janus_crypt",
    name: "Крипта Януса",
    cost: { gold: 90, mana: 10 },
    unlocks: ["ordo_priest"],
    description: "Жрец Януса → Пастырь Lumen",
    incomeBonus: { mana: 4, people: 1 },
    culture: "ordo",
  },
  risen_barracks: {
    id: "risen_barracks",
    name: "Красные казармы",
    cost: { gold: 75 },
    unlocks: ["risen_chekist"],
    description: "Красногвардеец → Чекист",
    incomeBonus: { people: 2, gold: 2 },
    culture: "risen",
  },
  risen_tribune: {
    id: "risen_tribune",
    name: "Трибуна ревкома",
    cost: { gold: 60 },
    unlocks: ["risen_maxim"],
    description: "Пулемётчик → Максимист",
    incomeBonus: { gold: 5 },
    culture: "risen",
  },
  risen_mausoleum: {
    id: "risen_mausoleum",
    name: "Мавзолей скорби",
    cost: { gold: 90, mana: 10 },
    unlocks: ["risen_commissar"],
    description: "Агитатор → Комиссар",
    incomeBonus: { mana: 3, people: 1 },
    culture: "risen",
  },
};

export const EMPIRE_BUILD_ORDER: BuildingId[] = [
  "barracks",
  "archery_range",
  "mage_tower",
  "temple",
  "hero_hall",
];

export const COSSACK_BUILD_ORDER: BuildingId[] = [
  "stanitsa",
  "cossack_range",
  "cossack_church",
];

export const HIGHLANDER_BUILD_ORDER: BuildingId[] = [
  "aul",
  "highland_forge",
  "highland_shrine",
];

export const ORDO_BUILD_ORDER: BuildingId[] = [
  "pax_barracks",
  "lumen_scriptorium",
  "janus_crypt",
];

export const RISEN_BUILD_ORDER: BuildingId[] = [
  "risen_barracks",
  "risen_tribune",
  "risen_mausoleum",
];
