/** Per-portrait grading — portraits already bake vintage distress; keep post-process light. */

export interface VintagePortraitLook {
  /** Light multiplicative tint (near white — art is already sepia). */
  tint: number;
  /** Paper color behind the photo. */
  paperColor: number;
  /** Photo strength; near 1 so baked distress stays visible. */
  portraitAlpha: number;
}

const DEFAULT: VintagePortraitLook = {
  tint: 0xffffff,
  paperColor: 0x1a1410,
  portraitAlpha: 1,
};

export const VINTAGE_PORTRAIT_LOOK: Record<string, VintagePortraitLook> = {
  hero_ri: {
    tint: 0xfff8f0,
    paperColor: 0x1a1208,
    portraitAlpha: 1,
  },
  hero_ri_eliana: {
    tint: 0xfff8f0,
    paperColor: 0x1a1208,
    portraitAlpha: 1,
  },
  hero_ordo: {
    tint: 0xf0f4ff,
    paperColor: 0x101418,
    portraitAlpha: 1,
  },
  unit_squire: {
    tint: 0xffffff,
    paperColor: 0x1a1410,
    portraitAlpha: 1,
  },
  unit_archer: {
    tint: 0xffffff,
    paperColor: 0x1a1410,
    portraitAlpha: 1,
  },
  unit_acolyte: {
    tint: 0xffffff,
    paperColor: 0x1a1410,
    portraitAlpha: 1,
  },
  unit_knight: {
    tint: 0xffffff,
    paperColor: 0x1a1410,
    portraitAlpha: 1,
  },
  unit_witch: {
    tint: 0xf8f0ff,
    paperColor: 0x140810,
    portraitAlpha: 1,
  },
  unit_missionary: {
    tint: 0xffffff,
    paperColor: 0x1a1410,
    portraitAlpha: 1,
  },
  unit_zombie: {
    tint: 0xf0f4e8,
    paperColor: 0x101810,
    portraitAlpha: 1,
  },
  unit_ghost: {
    tint: 0xe8f0ff,
    paperColor: 0x0c1018,
    portraitAlpha: 0.96,
  },
  unit_initiate: {
    tint: 0xf0f4ff,
    paperColor: 0x0c1018,
    portraitAlpha: 1,
  },
  unit_skeleton: {
    tint: 0xffffff,
    paperColor: 0x141410,
    portraitAlpha: 1,
  },
  unit_banshee: {
    tint: 0xf0f4ff,
    paperColor: 0x101018,
    portraitAlpha: 1,
  },
  unit_wolf: {
    tint: 0xffffff,
    paperColor: 0x1a1410,
    portraitAlpha: 1,
  },
  unit_bandit: {
    tint: 0xffffff,
    paperColor: 0x1a1410,
    portraitAlpha: 1,
  },
  unit_ogre: {
    tint: 0xffffff,
    paperColor: 0x1a1410,
    portraitAlpha: 1,
  },
  unit_dragon: {
    tint: 0xfff0f0,
    paperColor: 0x140808,
    portraitAlpha: 1,
  },
};

export function vintageLookForKey(portraitKey?: string): VintagePortraitLook {
  if (!portraitKey) return DEFAULT;
  return VINTAGE_PORTRAIT_LOOK[portraitKey] ?? DEFAULT;
}

/** Compact square frame (780×780 asset, 708×708 window). */
export const GLASS_PHOTO_SIZE = {
  frameW: 160,
  frameH: 160,
  /** Square photo — 708/780 of frame display size. */
  portraitSize: 146,
} as const;
