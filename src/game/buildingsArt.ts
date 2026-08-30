/**
 * RI castle / city construction art — grainy B&W Orthodox silhouettes.
 *
 * - Preview (`ri_building_{id}.png`): square plate for build cards / gallery.
 * - Overlay (`ri_building_{id}_overlay.png`): transparent PNG, layered on capital.
 * Capital stays the only full-background “main photo”.
 */

import { EMPIRE_BUILD_ORDER, type BuildingId } from "./catalog";

/** Shared look for RI structure silhouettes (mirror of portraits STYLE role). */
export const RI_BUILDING_STYLE =
  "High-contrast grainy black-and-white silhouette photograph, solid pure black building cutout against pale grainy grey sky, heavy film noise, stark atmospheric moody WW1-era Russian Empire architecture, onion domes and three-bar Orthodox crosses where appropriate, merges into solid black ground, no color, no text, square";

/** Capital / main city castle — base plate under overlays. */
export const RI_CAPITAL_ART_KEY = "ri_building_capital";
export const RI_CAPITAL_ART_PATH = "assets/ui/ri_building_capital.png";

/** Card / gallery preview (with sky background). */
export function buildingArtKey(id: BuildingId): string {
  return `ri_building_${id}`;
}

export function buildingArtPath(id: BuildingId): string {
  return `assets/ui/ri_building_${id}.png`;
}

/** Transparent cutout layered onto the capital plate. */
export function buildingOverlayKey(id: BuildingId): string {
  return `ri_building_${id}_overlay`;
}

export function buildingOverlayPath(id: BuildingId): string {
  return `assets/ui/ri_building_${id}_overlay.png`;
}

/** All RI structure textures to preload (capital + previews + overlays). */
export const RI_BUILDING_ART_ASSETS: [string, string][] = [
  [RI_CAPITAL_ART_KEY, RI_CAPITAL_ART_PATH],
  ...EMPIRE_BUILD_ORDER.flatMap((id): [string, string][] => [
    [buildingArtKey(id), buildingArtPath(id)],
    [buildingOverlayKey(id), buildingOverlayPath(id)],
  ]),
];

export const BUILDING_ART_LABELS: Record<BuildingId | "capital", string> = {
  capital: "Столица · замок",
  barracks: "Казармы гвардии",
  archery_range: "Стрелковый двор",
  mage_tower: "Императорская башня",
  temple: "Собор",
  hero_hall: "Зал орденов",
  stanitsa: "Станица",
  cossack_range: "Стрельбище",
  cossack_church: "Станичная церковь",
  aul: "Аул",
  highland_forge: "Горная кузня",
  highland_shrine: "Святилище предков",
  pax_barracks: "Казармы Рейха",
  lumen_scriptorium: "Скрипторий Lumen",
  janus_crypt: "Крипта Януса",
  risen_barracks: "Красные казармы",
  risen_tribune: "Трибуна ревкома",
  risen_mausoleum: "Мавзолей скорби",
};

/** Prompt hints for regeneration (same visual language). */
export const BUILDING_PROMPTS: Record<BuildingId | "capital", string> = {
  capital: `${RI_BUILDING_STYLE}. Grand multi-domed capital castle-cathedral complex, central onion dome flanked by smaller domes with Orthodox crosses, fortress mass`,
  barracks: `${RI_BUILDING_STYLE}. Long Imperial Guard barracks with steep roof, small onion-dome chapel wing with Orthodox cross`,
  archery_range: `${RI_BUILDING_STYLE}. Rifle range courtyard with low walls, tall watchtower topped by onion cupola and Orthodox cross`,
  mage_tower: `${RI_BUILDING_STYLE}. Very tall slender Imperial tower with onion dome and Orthodox cross`,
  temple: `${RI_BUILDING_STYLE}. Russian Orthodox cathedral, large central onion dome and flanking domes with three-bar crosses`,
  hero_hall: `${RI_BUILDING_STYLE}. Grand Hall of Orders palace, wide facade, central and flanking onion domes with Orthodox crosses`,
  stanitsa: `${RI_BUILDING_STYLE}. Cossack stanitsa wooden hall with watchtower`,
  cossack_range: `${RI_BUILDING_STYLE}. Steppe rifle range with low earthworks`,
  cossack_church: `${RI_BUILDING_STYLE}. Small stanitsa church with onion dome`,
  aul: `${RI_BUILDING_STYLE}. Caucasian mountain aul stone houses stacked on cliff`,
  highland_forge: `${RI_BUILDING_STYLE}. Mountain forge with chimney smoke against peaks`,
  highland_shrine: `${RI_BUILDING_STYLE}. Ancestral highland shrine of stone and banners`,
  pax_barracks: `${RI_BUILDING_STYLE}. Ordo Lumen occult barracks, iron plaque facade, ash-grey wet-plate bone tones`,
  lumen_scriptorium: `${RI_BUILDING_STYLE}. Occult scriptorium tower with sealed archives and Janus sigils`,
  janus_crypt: `${RI_BUILDING_STYLE}. Underground Janus crypt entrance, twin-faced stone portal`,
  risen_barracks: `${RI_BUILDING_STYLE}. Soviet red-guard barracks, mourning banners, mildew stone`,
  risen_tribune: `${RI_BUILDING_STYLE}. Revolutionary tribune platform with red banners against ruin`,
  risen_mausoleum: `${RI_BUILDING_STYLE}. Funerary mausoleum of the risen, black marble and wilted wreaths`,
};
