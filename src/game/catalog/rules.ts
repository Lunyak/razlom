/** Neighbouring balance numbers that are not a unit/building/spell row. */

/** Temporary, while looking over the map. Player stacks that may march do not run out of steps. */
export const EXPLORE_UNLIMITED_MARCH = true;
export const EXPLORE_MARCH_BUDGET = 9999;

export const MOVES_HERO_ALIVE = 3;
export const MOVES_HERO_DEAD = 1;

export const FORMATION_SLOTS = 6;

/** Max units that can sit in a city garrison. */
export const GARRISON_LIMIT = 8;

export const MISSIONARY_HIRE_COST = { gold: 80, mana: 25, people: 1 };
export const GRAVE_RESURRECT_COST = { gold: 100, mana: 40, people: 0 };

/** Night AP for the missionary (day uses MOVES_HERO_ALIVE). */
export const MOVES_NIGHT_MISSIONARY = 2;
/** Extra day move cost on an un-requiemed blood tile. */
export const BLOOD_MOVE_PENALTY = 1;
/** Fog radius opened at dawn after a night look at ruins. */
export const RUIN_SCOUT_RADIUS = 2;
/** Fog radius opened at dawn after a city bell rite. */
export const CITY_BELL_RADIUS = 3;
/** Mana Ordo gains for harvesting blood at night. */
export const BLOOD_ORDO_MANA = 12;

/** Gold to lay one rail tile (указ, not per-army AP). */
export const RAIL_GOLD_PER_TILE = 14;
/** How far from a live rail/city an army still counts as supplied. */
export const RAIL_SUPPLY_REACH = 1;
/** Owned mine / works off the rail net. */
export const SITE_INCOME_OFF_RAIL = 0.5;
