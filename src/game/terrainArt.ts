/**
 * Map terrain art — 1914 Western Front / Volhynia–Galicia ground plates.
 *
 * Ground sheets are sampled with world-space UVs (see terrainLayer) so a field
 * is one photograph, not a stamp per rhombus. Range cutouts sit on mountain blobs.
 *
 * Ground PNGs: Poly Haven CC0, graded in scripts/fetch_terrain_textures.py
 * (aerial_grass_rock, forrest_ground_01, mud_forest, rocky_trail, dirt,
 * brown_mud_03, brown_mud_leaves_01, aerial_rocks_02, rock_face).
 * Ditch / trench / khaki forest floor: generated plates, same olive-sepia grade.
 */

import type { Terrain } from "./world";

/** Shared look: wet harvest, mud, olive-sepia film — not Disciples emerald, not ice-blue. */
export const TERRAIN_STYLE =
  "Orthographic top-down square terrain texture, 1914 Western Front and Volhynia-Galicia, wet olive-sepia film photograph, muddy earth, heavy film grain, desaturated khaki umber olive-drab, dull wet straw, no bright emerald grass, no turquoise, no cyan, no ice-blue, no snow, no fantasy glow, no text, no letters, no frame, no UI, no people, no animals, no buildings, seamless tileable, edges wrap";

export const TERRAIN_OVERLAY_STYLE =
  "Isolated game sprite cutout, 1914 Galicia, wet olive-sepia film grain, dark muted foliage, no text, no frame, no people, no animals, no buildings, solid pure magenta background #FF00FF, no ground plane, no horizon, no drop shadow";

export type TerrainGroundKey =
  | "ground_grass_0"
  | "ground_grass_1"
  | "ground_forest_0"
  | "ground_forest_1"
  | "ground_road_0"
  | "ground_road_1"
  | "ground_water_0"
  | "ground_water_1"
  | "ground_mountain_foot_0"
  | "ground_mountain_0"
  | "ground_ditch_0"
  | "ground_trench_0";

export type TerrainOverlayKey =
  | "overlay_trees_0"
  | "overlay_trees_1"
  | "overlay_trees_2"
  | "overlay_trees_3"
  | "overlay_trees_4"
  | "overlay_trees_5"
  | "overlay_trench_0"
  | "overlay_trench_1"
  | "overlay_trench_bend_0"
  | "overlay_trench_ne_0"
  | "overlay_trench_ne_1"
  | "overlay_trench_nw_0"
  | "overlay_trench_pit_0"
  | "overlay_trench_h_0"
  | "overlay_trench_tee_0"
  | "overlay_trench_l_0"
  | "overlay_trench_l_1"
  | "overlay_ditch_0"
  | "overlay_ditch_bend_0"
  | "overlay_ditch_ne_0"
  | "overlay_ditch_nw_0"
  | "overlay_rock_0"
  | "overlay_mountain_range_0"
  | "overlay_mountain_range_1";

export type TerrainArtKey = TerrainGroundKey | TerrainOverlayKey;

export const GROUND_VARIANTS: Record<Terrain, TerrainGroundKey[]> = {
  grass: ["ground_grass_0", "ground_grass_1"],
  forest: ["ground_grass_0"],
  road: ["ground_road_0", "ground_road_1"],
  water: ["ground_water_0", "ground_water_1"],
  mountain: ["ground_mountain_0"],
  mountain_foot: ["ground_mountain_foot_0"],
  ditch: ["ground_ditch_0"],
  trench: ["ground_trench_0"],
};

/** Dark-earth trees sit on ground_forest_0; khaki-earth trees on ground_forest_1. */
export const TREE_OVERLAY_KEYS: TerrainOverlayKey[] = [
  "overlay_trees_0",
  "overlay_trees_1",
  "overlay_trees_2",
  "overlay_trees_3",
  "overlay_trees_4",
  "overlay_trees_5",
];

const TREE_OVERLAY_KHAKI: TerrainOverlayKey[] = ["overlay_trees_3", "overlay_trees_4", "overlay_trees_5"];

export const ROCK_OVERLAY_KEY: TerrainOverlayKey = "overlay_rock_0";

export const GROUND_SHEET: Record<Terrain, TerrainGroundKey> = {
  grass: "ground_grass_0",
  forest: "ground_grass_0",
  road: "ground_road_0",
  water: "ground_water_0",
  mountain: "ground_mountain_0",
  mountain_foot: "ground_mountain_foot_0",
  ditch: "ground_ditch_0",
  trench: "ground_trench_0",
};

export const MOUNTAIN_RANGE_KEYS: TerrainOverlayKey[] = [
  "overlay_mountain_range_0",
  "overlay_mountain_range_1",
];

export const TERRAIN_ART_KEYS: TerrainArtKey[] = [
  "ground_grass_0",
  "ground_grass_1",
  "ground_forest_0",
  "ground_forest_1",
  "ground_road_0",
  "ground_road_1",
  "ground_water_0",
  "ground_water_1",
  "ground_mountain_foot_0",
  "ground_mountain_0",
  "ground_ditch_0",
  "ground_trench_0",
  "overlay_trees_0",
  "overlay_trees_1",
  "overlay_trees_2",
  "overlay_trees_3",
  "overlay_trees_4",
  "overlay_trees_5",
  "overlay_trench_0",
  "overlay_trench_1",
  "overlay_trench_bend_0",
  "overlay_trench_ne_0",
  "overlay_trench_ne_1",
  "overlay_trench_nw_0",
  "overlay_trench_pit_0",
  "overlay_trench_h_0",
  "overlay_trench_tee_0",
  "overlay_trench_l_0",
  "overlay_trench_l_1",
  "overlay_ditch_0",
  "overlay_ditch_bend_0",
  "overlay_ditch_ne_0",
  "overlay_ditch_nw_0",
  "overlay_rock_0",
  "overlay_mountain_range_0",
  "overlay_mountain_range_1",
];

export function terrainArtPath(key: TerrainArtKey): string {
  return `assets/terrain/${key}.png`;
}

/** All terrain textures to preload (missing files fall back to TERRAIN_COLOR). */
export const TERRAIN_ART_ASSETS: [string, string][] = TERRAIN_ART_KEYS.map((key) => [
  key,
  terrainArtPath(key),
]);

/** Stable variant in 3×3 blobs so adjacent cells do not checkerboard. */
export function terrainVariantIndex(x: number, y: number, n: number): number {
  if (n <= 1) return 0;
  const bx = Math.floor(x / 3);
  const by = Math.floor(y / 3);
  return (((bx * 17 + by * 31) % n) + n) % n;
}

export function pickGroundKey(terrain: Terrain, x: number, y: number): TerrainGroundKey {
  const variants = GROUND_VARIANTS[terrain];
  return variants[terrainVariantIndex(x, y, variants.length)];
}

export function pickTreeOverlayKey(x: number, y: number): TerrainOverlayKey {
  return TREE_OVERLAY_KHAKI[terrainVariantIndex(x + 1, y + 2, TREE_OVERLAY_KHAKI.length)];
}

export type EarthworkPiece = "ne" | "nw" | "pit" | "tee" | "ell";

export function pickTrenchOverlayKey(piece: EarthworkPiece, x: number, y: number): TerrainOverlayKey {
  if (piece === "pit") return "overlay_trench_pit_0";
  if (piece === "tee") return "overlay_trench_tee_0";
  if (piece === "ell") return y % 2 === 0 ? "overlay_trench_l_0" : "overlay_trench_l_1";
  if (piece === "nw") return "overlay_trench_nw_0";
  return x % 2 === 0 ? "overlay_trench_ne_0" : "overlay_trench_ne_1";
}

export function pickDitchOverlayKey(piece: EarthworkPiece, x: number, y: number): TerrainOverlayKey {
  if (piece === "pit" || piece === "tee" || piece === "ell") return "overlay_trench_pit_0";
  return pickTrenchOverlayKey(piece, x, y);
}

export function pickMountainRangeKey(blobIndex: number, hasPeak: boolean): TerrainOverlayKey {
  if (!hasPeak) return "overlay_mountain_range_1";
  return blobIndex % 2 === 0 ? "overlay_mountain_range_0" : "overlay_mountain_range_1";
}

/** Prompt hints for regeneration (same visual language). */
export const TERRAIN_PROMPTS: Record<TerrainArtKey, string> = {
  ground_grass_0: `${TERRAIN_STYLE}. Wet harvested stubble field, flattened rye straw, muddy patches, dull khaki-olive, not lush`,
  ground_grass_1: `${TERRAIN_STYLE}. Rain-soaked meadow, flattened dull grass, brown puddles, olive-sepia, not emerald`,
  ground_forest_0: `${TERRAIN_STYLE}. Dark wet forest floor only, pine needles, rotting leaves, mud, very dark olive-brown, no trunks, no sky`,
  ground_forest_1: `${TERRAIN_STYLE}. Forest floor variation of the khaki field, olive-khaki wet earth, pine needles, rotting leaves, same color family as harvested stubble, no trunks, no sky`,
  ground_ditch_0: `${TERRAIN_STYLE}. Shallow 1914 communication ditch from above, wet khaki-olive clay, thrown-up earth lips, muddy water in the cut, no timber, no people`,
  ground_trench_0: `${TERRAIN_STYLE}. 1914 fighting trench from above, deeper excavation, wet khaki parapet earth, muddy floor, faint board streaks, no sandbags as objects, no people`,
  ground_road_0: `${TERRAIN_STYLE}. Dirt cart track, two deep muddy ruts, wet clay, hoof prints, no cobblestone`,
  ground_road_1: `${TERRAIN_STYLE}. Churned military dirt road, gravel and mud, puddles in ruts, no paving stones`,
  ground_water_0: `${TERRAIN_STYLE}. Dark still pond, brown-black silt water, overcast reflection, no turquoise, no blue`,
  ground_water_1: `${TERRAIN_STYLE}. Slow dark river surface, olive-black water, silt streaks, no cyan, no sparkle`,
  ground_mountain_foot_0: `${TERRAIN_STYLE}. Wet slate scree from above, dark grey-brown stones, mud between rocks, no snow`,
  ground_mountain_0: `${TERRAIN_STYLE}. Wet slate rock slab from above, damp dark grey stone, no snow, no ice`,
  overlay_trees_0: `${TERRAIN_OVERLAY_STYLE}. Cluster of three dark spruce trees, wet trunks, dense olive-black needles`,
  overlay_trees_1: `${TERRAIN_OVERLAY_STYLE}. Mixed birch and dark spruce, pale wet bark, sparse late-autumn leaves`,
  overlay_trees_2: `${TERRAIN_OVERLAY_STYLE}. Two tall dark firs close together, wet, heavy, almost black-green`,
  overlay_trees_3: `${TERRAIN_OVERLAY_STYLE}. Cluster of three dark spruce, khaki-olive earth mounds at the roots matching the field plate, not charcoal soil`,
  overlay_trees_4: `${TERRAIN_OVERLAY_STYLE}. Mixed birch and dark spruce, khaki-olive earth mounds at the roots matching the field plate`,
  overlay_trees_5: `${TERRAIN_OVERLAY_STYLE}. Two tall dark firs, khaki-olive earth mounds at the roots matching the field plate`,
  overlay_trench_0: `${TERRAIN_OVERLAY_STYLE}. Short straight 1914 fighting trench cut left-to-right, khaki parapet earth, wet muddy floor, isometric three-quarter, no people`,
  overlay_trench_1: `${TERRAIN_OVERLAY_STYLE}. Short straight fighting trench, churned khaki banks, wet umber floor, isometric three-quarter, no people`,
  overlay_trench_bend_0: `${TERRAIN_OVERLAY_STYLE}. Compact L-bend fighting trench junction, khaki thrown earth, wet floor, isometric three-quarter, no people`,
  overlay_ditch_0: `${TERRAIN_OVERLAY_STYLE}. Narrow shallow communication ditch left-to-right, thin khaki lips, wet clay, isometric three-quarter, no people`,
  overlay_ditch_bend_0: `${TERRAIN_OVERLAY_STYLE}. Small L-bend of a shallow communication ditch, khaki lips, wet clay, isometric three-quarter, no people`,
  overlay_trench_ne_0: `${TERRAIN_OVERLAY_STYLE}. Wooden-lined fighting trench diagonal, sandbag parapet, dug into khaki field`,
  overlay_trench_ne_1: `${TERRAIN_OVERLAY_STYLE}. Short wooden-lined fighting trench diagonal, sandbag parapet`,
  overlay_trench_nw_0: `${TERRAIN_OVERLAY_STYLE}. Wooden-lined fighting trench opposite diagonal, sandbag parapet`,
  overlay_trench_pit_0: `${TERRAIN_OVERLAY_STYLE}. Compact wooden foxhole / dugout, sandbag rim`,
  overlay_trench_h_0: `${TERRAIN_OVERLAY_STYLE}. Long straight wooden-lined trench with sandbag parapet`,
  overlay_trench_tee_0: `${TERRAIN_OVERLAY_STYLE}. T-junction wooden-lined trench, sandbag parapet`,
  overlay_trench_l_0: `${TERRAIN_OVERLAY_STYLE}. L-corner wooden-lined trench, sandbag parapet`,
  overlay_trench_l_1: `${TERRAIN_OVERLAY_STYLE}. L-corner wooden-lined trench variant, sandbag parapet`,
  overlay_ditch_ne_0: `${TERRAIN_OVERLAY_STYLE}. Flat narrow ditch cut lower-left to upper-right, depression in khaki field`,
  overlay_ditch_nw_0: `${TERRAIN_OVERLAY_STYLE}. Flat narrow ditch cut lower-right to upper-left, depression in khaki field`,
  overlay_rock_0: `${TERRAIN_OVERLAY_STYLE}. Small cluster of wet slate rocks, dark grey-brown, no plants`,
  overlay_mountain_range_0: `${TERRAIN_OVERLAY_STYLE}. One continuous Carpathian ridge, isometric three-quarter view, wet slate scree, a few dark spruce, irregular silhouette, not separate cubes`,
  overlay_mountain_range_1: `${TERRAIN_OVERLAY_STYLE}. Compact wet slate peak cluster, two or three summits as one mass, sparse dark fir`,
};
