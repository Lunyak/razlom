/**
 * Normalized placement of RI building overlays on the capital plate.
 * Origin of each overlay = bottom-center. x/y are fractions of plate size from plate center.
 *
 * Runtime: defaults → optional public JSON → localStorage override (editor saves here).
 */

import { EMPIRE_BUILD_ORDER, type BuildingId } from "./catalog";

export type BuildingOverlayPose = {
  x: number;
  y: number;
  scale: number;
  depth: number;
};

/** Overlay poses — RI capital uses real values; other cultures get inert stubs. */
export type BuildingOverlayLayout = Record<BuildingId, BuildingOverlayPose>;

const STUB: BuildingOverlayPose = { x: 0, y: 0.42, scale: 0.01, depth: 0 };

export const BUILDING_OVERLAY_LAYOUT_DEFAULTS: BuildingOverlayLayout = {
  barracks: { x: -0.34, y: 0.42, scale: 0.38, depth: 2 },
  archery_range: { x: -0.16, y: 0.42, scale: 0.34, depth: 3 },
  mage_tower: { x: 0.36, y: 0.42, scale: 0.48, depth: 2 },
  temple: { x: 0.0, y: 0.42, scale: 0.4, depth: 1 },
  hero_hall: { x: 0.22, y: 0.42, scale: 0.38, depth: 3 },
  stanitsa: { ...STUB },
  cossack_range: { ...STUB },
  cossack_church: { ...STUB },
  aul: { ...STUB },
  highland_forge: { ...STUB },
  highland_shrine: { ...STUB },
  pax_barracks: { ...STUB },
  lumen_scriptorium: { ...STUB },
  janus_crypt: { ...STUB },
  risen_barracks: { ...STUB },
  risen_tribune: { ...STUB },
  risen_mausoleum: { ...STUB },
};

const STORAGE_KEY = "razlom-ri-building-overlay-layout-v1";
const JSON_PATH = "assets/ri_building_overlay_layout.json";

let runtime: BuildingOverlayLayout = cloneLayout(BUILDING_OVERLAY_LAYOUT_DEFAULTS);
let loaded = false;

function cloneLayout(src: BuildingOverlayLayout): BuildingOverlayLayout {
  const out = {} as BuildingOverlayLayout;
  for (const id of Object.keys(BUILDING_OVERLAY_LAYOUT_DEFAULTS) as BuildingId[]) {
    out[id] = { ...src[id] };
  }
  return out;
}

function sanitizePose(raw: unknown, fallback: BuildingOverlayPose): BuildingOverlayPose {
  if (!raw || typeof raw !== "object") return { ...fallback };
  const o = raw as Record<string, unknown>;
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  return {
    x: num(o.x, fallback.x),
    y: num(o.y, fallback.y),
    scale: Math.max(0.05, Math.min(2.5, num(o.scale, fallback.scale))),
    depth: Math.round(num(o.depth, fallback.depth)),
  };
}

export function mergeLayoutPartial(raw: unknown): BuildingOverlayLayout {
  const base = cloneLayout(BUILDING_OVERLAY_LAYOUT_DEFAULTS);
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  for (const id of EMPIRE_BUILD_ORDER) {
    if (obj[id]) base[id] = sanitizePose(obj[id], base[id]);
  }
  return base;
}

/** Current layout used by city UI / composite. */
export function getBuildingOverlayLayout(): BuildingOverlayLayout {
  ensureLayoutLoadedSync();
  return runtime;
}

export function getBuildingOverlayPose(id: BuildingId): BuildingOverlayPose {
  return getBuildingOverlayLayout()[id] ?? STUB;
}

/** Apply editor changes in-memory (does not persist until save). */
export function setBuildingOverlayLayout(layout: BuildingOverlayLayout): void {
  runtime = cloneLayout(layout);
}

export function setBuildingOverlayPose(id: BuildingId, pose: Partial<BuildingOverlayPose>): void {
  ensureLayoutLoadedSync();
  runtime[id] = sanitizePose({ ...runtime[id], ...pose }, runtime[id] ?? STUB);
}

function readStorage(): BuildingOverlayLayout | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return mergeLayoutPartial(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Sync load: defaults + localStorage (JSON file applied async if present). */
export function ensureLayoutLoadedSync(): void {
  if (loaded) return;
  loaded = true;
  runtime = cloneLayout(BUILDING_OVERLAY_LAYOUT_DEFAULTS);
  const stored = readStorage();
  if (stored) runtime = stored;
}

/** Optional: pull committed JSON from public/, then re-apply localStorage on top. */
export async function loadBuildingOverlayLayoutFromDisk(): Promise<void> {
  ensureLayoutLoadedSync();
  try {
    const res = await fetch(`${JSON_PATH}?t=${Date.now()}`);
    if (res.ok) {
      const json = await res.json();
      runtime = mergeLayoutPartial(json);
    }
  } catch {
    /* no file yet */
  }
  const stored = readStorage();
  if (stored) runtime = stored;
}

export function saveBuildingOverlayLayout(layout?: BuildingOverlayLayout): void {
  const next = cloneLayout(layout ?? runtime);
  runtime = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next, null, 2));
}

export function clearBuildingOverlayLayoutSave(): void {
  localStorage.removeItem(STORAGE_KEY);
  runtime = cloneLayout(BUILDING_OVERLAY_LAYOUT_DEFAULTS);
  loaded = true;
}

export function buildingOverlayLayoutToJson(layout?: BuildingOverlayLayout): string {
  return JSON.stringify(layout ?? runtime, null, 2);
}

/** Download JSON so it can be committed as public/assets/ri_building_overlay_layout.json */
export function downloadBuildingOverlayLayout(layout?: BuildingOverlayLayout): void {
  const blob = new Blob([buildingOverlayLayoutToJson(layout)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "ri_building_overlay_layout.json";
  a.click();
  URL.revokeObjectURL(url);
}

export { STORAGE_KEY as BUILDING_OVERLAY_LAYOUT_STORAGE_KEY, JSON_PATH as BUILDING_OVERLAY_LAYOUT_JSON_PATH };
