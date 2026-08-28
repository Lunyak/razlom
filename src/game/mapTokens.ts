/**
 * Strategic-map city and army tokens — isometric cutouts on magenta, like terrain overlays.
 *
 * Drop-ins: `public/assets/map/map_city_{faction}.png`, `map_city_ri_capital.png`,
 * `map_army_{faction}.png`, `map_site_{kind}.png`. Missing files fall back to the old circle/triangle markers.
 */
import type { Army, City, FactionId } from "./types";
import type { SiteKind } from "./sites";
import { MAP_CITY_CAPITAL_HEIGHT, MAP_CITY_HEIGHT } from "../ui/chrome";

export {
  MAP_ARMY_HEIGHT,
  MAP_CITY_CAPITAL_HEIGHT,
  MAP_CITY_HEIGHT,
  MAP_SITE_HEIGHT,
} from "../ui/chrome";

export const MAP_TOKEN_STYLE =
  "Isolated isometric strategic-map sprite, three-quarter Disciples-2 view, compact silhouette for one diamond tile, 1914 Galicia, wet olive-sepia film grain, desaturated khaki umber, no text, no frame, no UI, solid pure magenta background #FF00FF, no ground plane, no horizon, no drop shadow, no ice-blue, no cyan";

export type MapCityTokenKey =
  | "map_city_ri"
  | "map_city_ri_capital"
  | "map_city_ordo"
  | "map_city_risen"
  | "map_city_cossack"
  | "map_city_highlander"
  | "map_city_neutral";

export type MapArmyTokenKey =
  | "map_army_ri"
  | "map_army_ordo"
  | "map_army_risen"
  | "map_army_cossack"
  | "map_army_highlander"
  | "map_army_neutral";

export type MapSiteTokenKey =
  | "map_site_ruins"
  | "map_site_gold_mine"
  | "map_site_coal_mine"
  | "map_site_steel_works"
  | "map_site_mana_shrine"
  | "map_site_treasure";

export type MapTokenKey = MapCityTokenKey | MapArmyTokenKey | MapSiteTokenKey;

const CITY_BY_FACTION: Record<FactionId, MapCityTokenKey> = {
  ri: "map_city_ri",
  ordo: "map_city_ordo",
  risen: "map_city_risen",
  cossack: "map_city_cossack",
  highlander: "map_city_highlander",
  neutral: "map_city_neutral",
};

const ARMY_BY_FACTION: Record<FactionId, MapArmyTokenKey> = {
  ri: "map_army_ri",
  ordo: "map_army_ordo",
  risen: "map_army_risen",
  cossack: "map_army_cossack",
  highlander: "map_army_highlander",
  neutral: "map_army_neutral",
};

export const MAP_TOKEN_KEYS: MapTokenKey[] = [
  "map_city_ri",
  "map_city_ri_capital",
  "map_city_ordo",
  "map_city_risen",
  "map_city_cossack",
  "map_city_highlander",
  "map_city_neutral",
  "map_army_ri",
  "map_army_ordo",
  "map_army_risen",
  "map_army_cossack",
  "map_army_highlander",
  "map_army_neutral",
  "map_site_ruins",
  "map_site_gold_mine",
  "map_site_coal_mine",
  "map_site_steel_works",
  "map_site_mana_shrine",
  "map_site_treasure",
];

export function mapTokenPath(key: MapTokenKey): string {
  return `assets/map/${key}.png`;
}

export const MAP_TOKEN_ASSETS: [string, string][] = MAP_TOKEN_KEYS.map((key) => [
  key,
  mapTokenPath(key),
]);

/** Claimed-mine banners. Optional drop-ins; missing files fall back to a pennant. */
export const MAP_FLAG_ASSETS: [string, string][] = [["map_flag_ri", "assets/map/map_flag_ri.png"]];

export function cityCultureId(city: Pick<City, "culture" | "faction">): FactionId {
  return city.culture ?? city.faction ?? "neutral";
}

export function cityMapTokenKey(city: Pick<City, "culture" | "faction" | "isCapital">): MapCityTokenKey {
  const culture = cityCultureId(city);
  if (city.isCapital && culture === "ri") return "map_city_ri_capital";
  return CITY_BY_FACTION[culture];
}

export function cityMapTokenHeight(city: Pick<City, "isCapital">): number {
  return city.isCapital ? MAP_CITY_CAPITAL_HEIGHT : MAP_CITY_HEIGHT;
}

export function armyMapTokenKey(army: Pick<Army, "faction" | "isNeutral">): MapArmyTokenKey {
  if (army.isNeutral) return "map_army_neutral";
  return ARMY_BY_FACTION[army.faction] ?? "map_army_neutral";
}

const SITE_TOKEN: Record<SiteKind, MapSiteTokenKey> = {
  ruins: "map_site_ruins",
  gold_mine: "map_site_gold_mine",
  coal_mine: "map_site_coal_mine",
  steel_works: "map_site_steel_works",
  mana_shrine: "map_site_mana_shrine",
  treasure: "map_site_treasure",
};

export function siteMapTokenKey(kind: SiteKind): MapSiteTokenKey {
  return SITE_TOKEN[kind];
}

/** Prompt hints for regeneration (same visual language). */
export const MAP_TOKEN_PROMPTS: Record<MapTokenKey, string> = {
  map_city_ri: `${MAP_TOKEN_STYLE}. Russian Empire town, small Orthodox church with one onion dome, wooden houses`,
  map_city_ri_capital: `${MAP_TOKEN_STYLE}. Imperial capital kremlin-cathedral, central onion dome and flanking domes with Orthodox crosses`,
  map_city_ordo: `${MAP_TOKEN_STYLE}. Ordo Lumen iron occult fortress, bone-grey wet-plate stone, Janus portal, no onion domes, no ice-blue`,
  map_city_risen: `${MAP_TOKEN_STYLE}. Funerary mildew town, rotting plaster, mourning banners, collapsed cupola`,
  map_city_cossack: `${MAP_TOKEN_STYLE}. Cossack stanitsa, log houses, wooden watchtower, modest church, folk earth sepia, not gold glass`,
  map_city_highlander: `${MAP_TOKEN_STYLE}. Caucasian mountain aul, stacked stone houses, slate roofs, austere bone-ash, no snow, no ice-blue`,
  map_city_neutral: `${MAP_TOKEN_STYLE}. Humble Galicia hamlet, two cottages and a barn, brass tintype, unornamented`,
  map_army_ri: `${MAP_TOKEN_STYLE}. Single RI officer in olive-khaki 1914 китель, gold погоны, olive фуражка, saber, not crimson, not British scarlet`,
  map_army_ordo: `${MAP_TOKEN_STYLE}. Single Ordo occult officer, ash-grey iron collar uniform, no ice-blue`,
  map_army_risen: `${MAP_TOKEN_STYLE}. Single undead WW1 soldier, torn muddy uniform, mildew grey-green`,
  map_army_cossack: `${MAP_TOKEN_STYLE}. Cossack ataman, tall papakha, cherkeska with cartridge loops, saber, folk earth sepia`,
  map_army_highlander: `${MAP_TOKEN_STYLE}. Caucasian highlander prince, papakha, cherkeska, kinjal, bone-ash, no ice-blue`,
  map_army_neutral: `${MAP_TOKEN_STYLE}. Neutral bandit, fur hat, ragged coat, rifle`,
  map_site_ruins: `${MAP_TOKEN_STYLE}. Ruined Galicia manor-church, collapsed plaster, broken onion cupola, rubble`,
  map_site_gold_mine: `${MAP_TOKEN_STYLE}. 1914 wooden gold-mine headframe, shaft house, dirty ore heap`,
  map_site_coal_mine: `${MAP_TOKEN_STYLE}. Donbass coal tipple and headframe, black coal heaps, soot`,
  map_site_steel_works: `${MAP_TOKEN_STYLE}. 1914 blast furnace, brick chimney, slag, iron-grey, no ice-blue`,
  map_site_mana_shrine: `${MAP_TOKEN_STYLE}. Small Orthodox wayside shrine, modest onion cupola, warm earth, not ice-blue`,
  map_site_treasure: `${MAP_TOKEN_STYLE}. Cracked wooden crate and iron-bound chest half in mud, dull gold coins`,
};
