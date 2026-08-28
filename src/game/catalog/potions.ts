export type PotionId =
  | "heal"
  | "mana"
  | "life"
  | "strength"
  | "haste"
  | "poison"
  | "ward"
  | "elixir";

export type PotionTarget = "none" | "ally" | "allyDead" | "enemy";

export interface PotionDef {
  id: PotionId;
  name: string;
  texture: string;
  hint: string;
  battleHint: string;
  target: PotionTarget;
  worldUse: boolean;
}

export type Inventory = Record<PotionId, number>;

export const POTION_IDS: PotionId[] = [
  "heal",
  "mana",
  "life",
  "strength",
  "haste",
  "poison",
  "ward",
  "elixir",
];

export const POTIONS: Record<PotionId, PotionDef> = {
  heal: {
    id: "heal",
    name: "Настойка железа",
    texture: "potion_heal",
    hint: "Карта: лечит самого раненого в отряде.",
    battleHint: "Клик по союзнику — +35 HP.",
    target: "ally",
    worldUse: true,
  },
  mana: {
    id: "mana",
    name: "Эфир духа",
    texture: "potion_mana",
    hint: "Восстанавливает 18 маны.",
    battleHint: "Сразу +18 маны.",
    target: "none",
    worldUse: true,
  },
  life: {
    id: "life",
    name: "Миро воскресения",
    texture: "potion_life",
    hint: "Карта: поднимает одного павшего на половину сил.",
    battleHint: "Клик по павшему союзнику — воскрешение.",
    target: "allyDead",
    worldUse: true,
  },
  strength: {
    id: "strength",
    name: "Медвежий жир",
    texture: "potion_strength",
    hint: "Карта: сила всему живому отряду (на бой).",
    battleHint: "Клик по союзнику — сила на 4 хода.",
    target: "ally",
    worldUse: true,
  },
  haste: {
    id: "haste",
    name: "Живая ртуть",
    texture: "potion_haste",
    hint: "Карта: расторопность всему живому отряду.",
    battleHint: "Клик по союзнику — инициатива и удар на 4 хода.",
    target: "ally",
    worldUse: true,
  },
  poison: {
    id: "poison",
    name: "Вороний экстракт",
    texture: "potion_poison",
    hint: "Только в бою: яд на врага.",
    battleHint: "Клик по врагу — яд на 3 хода.",
    target: "enemy",
    worldUse: false,
  },
  ward: {
    id: "ward",
    name: "Оберег",
    texture: "potion_ward",
    hint: "Карта: оберег всему живому отряду.",
    battleHint: "Клик по союзнику — меньше входящего урона, 4 хода.",
    target: "ally",
    worldUse: true,
  },
  elixir: {
    id: "elixir",
    name: "Великий эликсир",
    texture: "potion_elixir",
    hint: "Карта: полное лечение отряда и +12 маны.",
    battleHint: "Клик по союзнику — полное лечение и +8 маны.",
    target: "ally",
    worldUse: true,
  },
};

export const HEAL_POTION_AMOUNT = 35;
export const MANA_POTION_AMOUNT = 18;
export const ELIXIR_MANA_WORLD = 12;
export const ELIXIR_MANA_BATTLE = 8;
export const BUFF_TURNS_BATTLE = 4;
export const BUFF_TURNS_WORLD = 8;
export const POISON_POTION_TURNS = 3;

export const STARTING_INVENTORY: Inventory = {
  heal: 4,
  mana: 3,
  life: 1,
  strength: 2,
  haste: 2,
  poison: 2,
  ward: 2,
  elixir: 1,
};
