export type StatusId =
  | "frost" // Мороз — холодный DoT + ослабление удара
  | "poison" // Яд — DoT
  | "burn" // Огонь — DoT
  | "bleed" // Кровотечение — DoT
  | "weakness" // Слабость — меньше исходящего урона
  | "shatter" // Разбитая броня — больше входящего
  | "curse" // Проклятие — удар слабее, лечение хуже
  | "stun" // Оглушение — пропуск хода
  | "blind" // Слепота — промах
  | "silence" // Немота — без заклинаний
  | "might" // Сила — зелье, больше исходящего
  | "haste" // Расторопность — зелье, инициатива
  | "ward"; // Оберег — зелье, меньше входящего

export interface StatusDef {
  id: StatusId;
  /** Short dossier label (RU). */
  label: string;
  /** Compact chip on portrait. */
  chip: string;
  color: string;
  /** DoT at turn start (before acting). */
  tickDamage?: number;
  /** Multiply outgoing attack damage. */
  outgoingMul?: number;
  /** Multiply incoming damage. */
  incomingMul?: number;
  /** Multiply healing received. */
  healMul?: number;
  /** Chance 0–1 to miss an attack. */
  missChance?: number;
  /** Skip the unit’s action this turn. */
  skipTurn?: boolean;
  /** Block player spells while on the acting hero/unit. */
  blockSpells?: boolean;
  /** Added to unit initiative when building battle order. */
  initiativeBonus?: number;
  /** Survives the wipe at battle start (world-map potions). */
  persistIntoBattle?: boolean;
}

export const STATUS_DEFS: Record<StatusId, StatusDef> = {
  frost: {
    id: "frost",
    label: "Мороз",
    chip: "МОР",
    color: "#7ec8e8",
    tickDamage: 4,
    outgoingMul: 0.75,
  },
  poison: {
    id: "poison",
    label: "Яд",
    chip: "ЯД",
    color: "#7ec060",
    tickDamage: 6,
  },
  burn: {
    id: "burn",
    label: "Огонь",
    chip: "ОГН",
    color: "#ff8040",
    tickDamage: 8,
  },
  bleed: {
    id: "bleed",
    label: "Кровотечение",
    chip: "КРВ",
    color: "#e05050",
    tickDamage: 5,
  },
  weakness: {
    id: "weakness",
    label: "Слабость",
    chip: "СЛБ",
    color: "#c0a070",
    outgoingMul: 0.65,
  },
  shatter: {
    id: "shatter",
    label: "Разбитая броня",
    chip: "БРН↓",
    color: "#d0b060",
    incomingMul: 1.35,
  },
  curse: {
    id: "curse",
    label: "Проклятие",
    chip: "ПРК",
    color: "#b080d0",
    outgoingMul: 0.85,
    healMul: 0.5,
  },
  stun: {
    id: "stun",
    label: "Оглушение",
    chip: "ОГЛ",
    color: "#e8e0a0",
    skipTurn: true,
  },
  blind: {
    id: "blind",
    label: "Слепота",
    chip: "СЛП",
    color: "#9098a8",
    missChance: 0.35,
  },
  silence: {
    id: "silence",
    label: "Немота",
    chip: "НЕМ",
    color: "#a090b8",
    blockSpells: true,
  },
  might: {
    id: "might",
    label: "Сила",
    chip: "СИЛ",
    color: "#d4a040",
    outgoingMul: 1.35,
    persistIntoBattle: true,
  },
  haste: {
    id: "haste",
    label: "Расторопность",
    chip: "БСТ",
    color: "#c9a86a",
    outgoingMul: 1.12,
    initiativeBonus: 20,
    persistIntoBattle: true,
  },
  ward: {
    id: "ward",
    label: "Оберег",
    chip: "ОБР",
    color: "#c8b070",
    incomingMul: 0.65,
    persistIntoBattle: true,
  },
};

export const STATUS_IDS = Object.keys(STATUS_DEFS) as StatusId[];
