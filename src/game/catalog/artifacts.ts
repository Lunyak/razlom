export type ArtifactSlot = "weapon" | "armor" | "banner" | "relic";

export type ArtifactId =
  | "saber_volkov"
  | "icon_pokrov"
  | "banner_eagle"
  | "compass_field"
  | "ring_ether"
  | "amulet_iron"
  | "shashka_don"
  | "kinjal_mountain";

export interface ArtifactBonuses {
  damage?: number;
  armor?: number;
  moves?: number;
  leadership?: number;
  spellPower?: number;
  /** Flat mana restored when picking up / winning. */
  manaOnFind?: number;
}

export interface ArtifactDef {
  id: ArtifactId;
  name: string;
  slot: ArtifactSlot;
  hint: string;
  bonuses: ArtifactBonuses;
}

export const ARTIFACT_SLOTS: ArtifactSlot[] = ["weapon", "armor", "banner", "relic"];

export const ARTIFACTS: Record<ArtifactId, ArtifactDef> = {
  saber_volkov: {
    id: "saber_volkov",
    name: "Сабля Волкова",
    slot: "weapon",
    hint: "+3 урона герою.",
    bonuses: { damage: 3 },
  },
  icon_pokrov: {
    id: "icon_pokrov",
    name: "Икона Покрова",
    slot: "armor",
    hint: "−2 входящего урона герою.",
    bonuses: { armor: 2 },
  },
  banner_eagle: {
    id: "banner_eagle",
    name: "Знамя двуглавого",
    slot: "banner",
    hint: "+1 к лимиту отряда.",
    bonuses: { leadership: 1 },
  },
  compass_field: {
    id: "compass_field",
    name: "Полевой компас",
    slot: "relic",
    hint: "+1 ОД на карте.",
    bonuses: { moves: 1 },
  },
  ring_ether: {
    id: "ring_ether",
    name: "Кольцо эфира",
    slot: "relic",
    hint: "+6 к силе заклинаний.",
    bonuses: { spellPower: 6 },
  },
  amulet_iron: {
    id: "amulet_iron",
    name: "Амулет железа",
    slot: "armor",
    hint: "−1 урона, +1 сила заклинаний.",
    bonuses: { armor: 1, spellPower: 1 },
  },
  shashka_don: {
    id: "shashka_don",
    name: "Донская шашка",
    slot: "weapon",
    hint: "+2 урона, +1 ОД.",
    bonuses: { damage: 2, moves: 1 },
  },
  kinjal_mountain: {
    id: "kinjal_mountain",
    name: "Горский кинжал",
    slot: "weapon",
    hint: "+4 урона.",
    bonuses: { damage: 4 },
  },
};

export const ARTIFACT_IDS = Object.keys(ARTIFACTS) as ArtifactId[];
