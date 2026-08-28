/** Texture keys for unit/hero bust portraits (public/assets/ui). */

const STYLE =
  "Heavily distressed antique Victorian daguerreotype bust portrait, desaturated sepia yellowed-silver, cracked glass-plate emulsion craquelure, torn ragged paper edges revealing cream cardstock, foxing stains, heavy grain, faded dissolving edges, melancholic haunted studio photo, square, no text";

/** Folk / cossack plates — warm earth sepia, not RI gold glass, not ice-blue. */
const STYLE_FOLK =
  "Heavily distressed antique Victorian daguerreotype bust portrait, warm earth sepia yellowed-silver, cracked glass-plate emulsion craquelure, torn ragged paper edges revealing cream cardstock, foxing stains, heavy grain, faded dissolving edges, melancholic haunted studio photo, square, no text, no ice-blue, no gold glass frame";

/** Thorn / highlander plates — austere bone-ash wet-plate, not ice-blue. */
const STYLE_THORN =
  "Heavily distressed antique wet-plate bust portrait, austere bone-white ash-grey desaturated tones, cracked emulsion craquelure, torn ragged paper edges revealing pale cardstock, foxing stains, heavy grain, faded dissolving edges, melancholic haunted studio photo, square, no text, no ice-blue, no gold glass";

/**
 * Living RI 1914 field kit — protective khaki, not British scarlet.
 * Ref: docs/lore/refs/ri-uniform-field-1914.png
 */
export const RI_FIELD_KIT =
  "Russian Imperial 1914 field kit: olive-khaki gymnastyorka or officer китель, high stand collar, brass buttons, rectangular gold погоны with thin red piping, olive фуражка with black visor and white-orange cockade, brown leather harness, no British scarlet coat, no crimson greatcoat, no red tabard, no ice-blue";

/** Upgrade tiers reuse the previous rank's plate until dedicated art exists. */
const PORTRAIT_ALIASES: Record<string, string> = {
  marksman: "archer",
  hieromonk: "acolyte",
  cossack_sotnik: "cossack_plastun",
  cossack_plastun_rifle: "cossack_shooter",
  cossack_starshina: "cossack_chaplain",
  highlander_abrek: "highlander_dzhigit",
  highlander_naib: "highlander_archer",
  highlander_qadi: "highlander_shaman",
  ordo_shock: "zombie",
  ordo_censor: "ghost",
  ordo_priest: "initiate",
  risen_guard: "zombie",
  risen_chekist: "zombie",
  risen_gunner: "ghost",
  risen_maxim: "ghost",
  risen_agitator: "initiate",
  risen_commissar: "initiate",
};

const HERO_PORTRAIT_KEYS = new Set([
  "hero_ri",
  "hero_ri_eliana",
  "hero_ordo",
  "hero_cossack",
  "hero_highlander",
]);

export function portraitTextureKey(defId: string): string {
  const id = PORTRAIT_ALIASES[defId] ?? defId;
  if (HERO_PORTRAIT_KEYS.has(id)) return id;
  return `unit_${id}`;
}

export function portraitPath(defId: string): string {
  const key = portraitTextureKey(defId);
  if (key === "hero_ri") return "assets/ui/hero_ri_portrait.png";
  if (key === "hero_ri_eliana") return "assets/ui/hero_ri_eliana_portrait.png";
  if (key === "hero_ordo") return "assets/ui/hero_ordo_portrait.png";
  if (key === "hero_cossack") return "assets/ui/hero_cossack_portrait.png";
  if (key === "hero_highlander") return "assets/ui/hero_highlander_portrait.png";
  return `assets/ui/${key}.png`;
}

/** Idle portrait key → hurt reaction frame key (`…_hurt`). */
export function hurtPortraitTextureKey(defIdOrPortraitKey: string): string {
  const key =
    defIdOrPortraitKey.startsWith("unit_") ||
    defIdOrPortraitKey.startsWith("hero_")
      ? defIdOrPortraitKey
      : portraitTextureKey(defIdOrPortraitKey);
  return `${key}_hurt`;
}

export function hurtPortraitPath(defId: string): string {
  const key = portraitTextureKey(defId);
  if (key === "hero_ri") return "assets/ui/hero_ri_hurt.png";
  if (key === "hero_ri_eliana") return "assets/ui/hero_ri_eliana_hurt.png";
  if (key === "hero_ordo") return "assets/ui/hero_ordo_hurt.png";
  if (key === "hero_cossack") return "assets/ui/hero_cossack_hurt.png";
  if (key === "hero_highlander") return "assets/ui/hero_highlander_hurt.png";
  return `assets/ui/${key}_hurt.png`;
}

/** All portrait files to preload in BootScene. */
export const PORTRAIT_DEF_IDS = [
  "hero_ri",
  "hero_ri_eliana",
  "hero_ordo",
  "hero_cossack",
  "hero_highlander",
  "squire",
  "archer",
  "acolyte",
  "knight",
  "witch",
  "missionary",
  "zombie",
  "ghost",
  "initiate",
  "skeleton",
  "banshee",
  "wolf",
  "bandit",
  "ogre",
  "dragon",
  "cossack_plastun",
  "cossack_shooter",
  "cossack_chaplain",
  "highlander_dzhigit",
  "highlander_archer",
  "highlander_shaman",
] as const;

/** Prompt hints for art generation (same visual language). */
export const PORTRAIT_PROMPTS: Record<string, string> = {
  hero_ri: `${STYLE}. ${RI_FIELD_KIT}. Stern bearded Russian Imperial commander, khaki officer tunic, gold shoulder boards`,
  hero_ri_eliana: `${STYLE}. ${RI_FIELD_KIT}. Young Russian Imperial female officer, olive peaked cap, khaki китель, gold shoulder boards, stern gaze`,
  hero_ordo: `${STYLE}. Ordo Lumen occult officer, pale face, cold grey-blue high-collar uniform`,
  hero_cossack: `${STYLE_FOLK}. Cossack Ataman, tall papakha, fine cherkeska with silver cartridge loops, saber hilt, commanding bearded steppe warlord`,
  hero_highlander: `${STYLE_THORN}. Caucasian highlander mountain prince, tall papakha, noble cherkeska, ornate kinjal at chest, stern aristocratic face`,
  squire: `${STYLE}. ${RI_FIELD_KIT}. Young RI junker cadet, olive-khaki mundir, gold погоны with red piping, saber, navy trousers with yellow stripe`,
  archer: `${STYLE}. ${RI_FIELD_KIT}. RI rifleman стрелок, khaki gymnastyorka, olive фуражка, Mosin rifle, no ushanka, no forest cloak`,
  acolyte: `${STYLE}. RI church acolyte, worn Orthodox robes, candle, not a military mundir`,
  knight: `${STYLE}. ${RI_FIELD_KIT}. RI elite guardsman, steel cuirass with imperial eagle, khaki or dark bottle-green tunic under the plate, gold shoulder boards, red piping only`,
  witch: `${STYLE}. RI black-clad nun-witch, veil, lace collar`,
  missionary: `${STYLE}. RI priest missionary, orthodox cross, travel cloak, not a military mundir`,
  zombie: `${STYLE}. Undead WW1 soldier zombie, torn muddy uniform`,
  ghost: `${STYLE}. Spectral soldier ghost, gas-mask silhouette, translucent fade`,
  initiate: `${STYLE}. Ordo Lumen cult initiate, hood, occult sigils`,
  skeleton: `${STYLE}. Skeleton in rotting WW1 uniform, barbed wire`,
  banshee: `${STYLE}. Wailing banshee spirit, veil, mourning portrait`,
  wolf: `${STYLE}. Dire grey wolf head, fangs, yellow eyes`,
  bandit: `${STYLE}. Cossack bandit, fur hat, rough beard`,
  ogre: `${STYLE}. Hulking ogre brute, rags, club`,
  dragon: `${STYLE}. Dark wyrm dragon head, scales, abyss eyes`,
  cossack_plastun: `${STYLE_FOLK}. Cossack plastun scout, tall black papakha, dark cherkeska with cartridge loops, weathered bearded steppe officer`,
  cossack_shooter: `${STYLE_FOLK}. Cossack shooter strelets, papakha, cherkeska with cartridge loops, long rifle, lean marksman face`,
  cossack_chaplain: `${STYLE_FOLK}. Cossack stanitsa chaplain, worn dark cassock, simple wooden cross, soft beard, folk parish priest`,
  highlander_dzhigit: `${STYLE_THORN}. Caucasian highlander dzhigit, papakha, dark cherkeska with cartridge loops, kinjal dagger, fierce mountain face`,
  highlander_archer: `${STYLE_THORN}. Caucasian highlander mountain archer, felt papakha, mountain cloak over cherkeska, long rifle, lean vigilant face`,
  highlander_shaman: `${STYLE_THORN}. Caucasian highlander mountain shaman знахарь, aged face, wool cloak, bone amulet, austere mystical elder`,
};

/** Full-page manuscript info cards (RMB inspect). Missing files fall back to the glass dossier. */
const UNIT_INFO_CARD_DEFS = [
  "squire",
  "archer",
  "acolyte",
  "knight",
  "witch",
  "marksman",
  "hieromonk",
  "missionary",
  "hero_ri",
  "hero_ri_eliana",
  "zombie",
  "ghost",
  "initiate",
  "skeleton",
  "banshee",
  "ordo_shock",
  "ordo_censor",
  "ordo_priest",
  "hero_ordo",
  "risen_guard",
  "risen_chekist",
  "risen_gunner",
  "risen_maxim",
  "risen_agitator",
  "risen_commissar",
  "wolf",
  "bandit",
  "ogre",
  "dragon",
  "cossack_plastun",
  "cossack_sotnik",
  "cossack_shooter",
  "cossack_plastun_rifle",
  "cossack_chaplain",
  "cossack_starshina",
  "hero_cossack",
  "highlander_dzhigit",
  "highlander_abrek",
  "highlander_archer",
  "highlander_naib",
  "highlander_shaman",
  "highlander_qadi",
  "hero_highlander",
] as const;

function infoCardKey(defId: string): string {
  return defId.startsWith("hero_") ? `${defId}_info_card` : `unit_${defId}_info_card`;
}

export const UNIT_INFO_CARD_ASSETS: [string, string][] = UNIT_INFO_CARD_DEFS.map((id) => {
  const key = infoCardKey(id);
  return [key, `assets/ui/${key}.png`];
});

export function unitInfoCardTextureKey(defId: string): string | undefined {
  return infoCardKey(defId);
}

/** Manuscript army / order-of-battle plates (world RMB inspect). */
export const ARMY_INFO_CARD_ASSETS: [string, string][] = [
  ["army_info_card_ri", "assets/ui/army_info_card_ri.png"],
  ["army_info_card_ordo", "assets/ui/army_info_card_ordo.png"],
  ["army_info_card_risen", "assets/ui/army_info_card_risen.png"],
  ["army_info_card_cossack", "assets/ui/army_info_card_cossack.png"],
  ["army_info_card_highlander", "assets/ui/army_info_card_highlander.png"],
  ["army_info_card_neutral", "assets/ui/army_info_card_neutral.png"],
];

export function armyInfoCardTextureKey(faction: string): string {
  return `army_info_card_${faction}`;
}

/** Legacy key used in sidebar — same art as hero_ri. */
export const HERO_SIDEBAR_KEY = "hero_aldric";

export const FORMATION_FRAME_KEYS = {
  player: "battle_formation_ri",
  enemy: "battle_formation_ordo",
} as const;

export const FORMATION_FRAME_PATHS: [string, string][] = [
  [FORMATION_FRAME_KEYS.player, "assets/ui/battle_formation_ri.png"],
  [FORMATION_FRAME_KEYS.enemy, "assets/ui/battle_formation_ordo.png"],
];

/** Vintage photo-under-glass experiment textures */
export const GLASS_PHOTO_ASSETS: [string, string][] = [
  ["glass_frame_vintage", "assets/ui/glass_frame_vintage.png"],
  ["glass_frame_border", "assets/ui/glass_frame_border.png"],
  ["glass_frame_square", "assets/ui/glass_frame_square.png"],
  ["glass_overlay_dust", "assets/ui/glass_overlay_dust.png"],
  ["photo_emulsion_edge", "assets/ui/photo_emulsion_edge.png"],
];
