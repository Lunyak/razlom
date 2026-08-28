/** City window geometry (centered on current view). */
export const CITY_W = 920;
export const CITY_H = 620;
export const CITY_PLATE_HALF_W = CITY_W / 2;
export const CITY_PLATE_HALF_H = CITY_H / 2;
export const CITY_HEADER_H = 88;

export const CITY_CLOSE = {
  dx: CITY_W / 2 - 28,
  dy: -CITY_H / 2 + 22,
  w: 44,
  h: 36,
} as const;

export const CITY_TAB_Y = -CITY_H / 2 + 108;
export const CITY_TAB_XS = [-268, 0, 268] as const;
export const CITY_TAB_W = 176;
export const CITY_TAB_H = 40;

export const CITY_HEAL = {
  dx: CITY_W / 2 - 140,
  dy: CITY_H / 2 - 38,
  w: 220,
  h: 40,
} as const;

export const CITY_ARMY_TEXT = {
  dx: -CITY_W / 2 + 36,
  dy: CITY_H / 2 - 38,
} as const;
