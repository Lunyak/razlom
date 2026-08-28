import type { BuildingId } from "./buildings";

/** Disciples-style capital upgrade: keep the slot, change the unit. */
export interface UnitUpgradeDef {
  from: string;
  to: string;
  building: BuildingId;
  cost: { gold: number; mana?: number; people?: number };
}

export const UNIT_UPGRADES: UnitUpgradeDef[] = [
  { from: "squire", to: "knight", building: "barracks", cost: { gold: 40, people: 1 } },
  { from: "archer", to: "marksman", building: "archery_range", cost: { gold: 35, people: 1 } },
  { from: "acolyte", to: "hieromonk", building: "temple", cost: { gold: 45, mana: 8 } },
  {
    from: "cossack_plastun",
    to: "cossack_sotnik",
    building: "stanitsa",
    cost: { gold: 38, people: 1 },
  },
  {
    from: "cossack_shooter",
    to: "cossack_plastun_rifle",
    building: "cossack_range",
    cost: { gold: 34, people: 1 },
  },
  {
    from: "cossack_chaplain",
    to: "cossack_starshina",
    building: "cossack_church",
    cost: { gold: 40, mana: 6 },
  },
  {
    from: "highlander_dzhigit",
    to: "highlander_abrek",
    building: "aul",
    cost: { gold: 42, people: 1 },
  },
  {
    from: "highlander_archer",
    to: "highlander_naib",
    building: "highland_forge",
    cost: { gold: 36, people: 1 },
  },
  {
    from: "highlander_shaman",
    to: "highlander_qadi",
    building: "highland_shrine",
    cost: { gold: 44, mana: 8 },
  },
  { from: "zombie", to: "ordo_shock", building: "pax_barracks", cost: { gold: 40, people: 1 } },
  { from: "ghost", to: "ordo_censor", building: "lumen_scriptorium", cost: { gold: 38, people: 1 } },
  { from: "initiate", to: "ordo_priest", building: "janus_crypt", cost: { gold: 45, mana: 8 } },
  {
    from: "risen_guard",
    to: "risen_chekist",
    building: "risen_barracks",
    cost: { gold: 40, people: 1 },
  },
  {
    from: "risen_gunner",
    to: "risen_maxim",
    building: "risen_tribune",
    cost: { gold: 36, people: 1 },
  },
  {
    from: "risen_agitator",
    to: "risen_commissar",
    building: "risen_mausoleum",
    cost: { gold: 42, mana: 6 },
  },
];
