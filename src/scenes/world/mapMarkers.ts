/**
 * Iso map tokens: cities, sites, graves, army figures.
 * Terrain tiles stay in TerrainLayer.
 */
import { livingUnits, type Army, type City, type FactionId, type Grave } from "../../game/data";
import { isoDrawOrder } from "../../game/iso";
import { SITE_COLOR, SITE_LABEL, isHarvestSite, type MapSite } from "../../game/sites";
import { ensureCutout } from "../../game/chromaCutout";
import {
  MAP_ARMY_HEIGHT,
  MAP_SITE_HEIGHT,
  armyMapTokenKey,
  cityMapTokenHeight,
  cityMapTokenKey,
  siteMapTokenKey,
} from "../../game/mapTokens";
import { RI_FIELD_KHAKI } from "../../game/factionVisual";

export type MarkerIso = (x: number, y: number) => { cx: number; cy: number };

const FOG_TINT = 0x5c574e;
const UNSEEN_ALPHA = 0.82;

export function cityFillColor(faction: City["faction"]): number {
  if (faction === "ri") return RI_FIELD_KHAKI;
  if (faction === "ordo") return 0x3a4a5c;
  if (faction === "risen") return 0x7a4a8a;
  if (faction === "cossack") return 0x6a5a30;
  if (faction === "highlander") return 0x4a3a28;
  return 0x888888;
}

export function cityRingColor(city: City, owned: boolean): number {
  if (owned) return 0xd4af37;
  if (city.faction === "ordo") return 0xc0c8d8;
  if (city.faction === "cossack") return 0xc9a870;
  if (city.faction === "highlander") return 0xa89070;
  return city.isCapital ? 0xfff0c0 : 0xf5e6c8;
}

export function cityLabelColor(faction: City["faction"], owned: boolean): string {
  if (owned) return "#e8d5a3";
  if (faction === "ordo") return "#b0c0d8";
  if (faction === "cossack") return "#d4c090";
  if (faction === "highlander") return "#c8b090";
  return "#c8b890";
}

function lerp2(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  t: number,
): { x: number; y: number } {
  return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
}

const RI_FLAG_HEIGHT = 34;

/** Compact Disciples-style marker. RI uses the 1914 civil flag with eagle canton. */
function paintSiteOwnerFlag(
  scene: Phaser.Scene,
  cx: number,
  cy: number,
  owner: FactionId,
  inVision: boolean,
): void {
  const alpha = inVision ? 1 : 0.78;
  if (owner === "ri") {
    const cut = ensureCutout(scene, "map_flag_ri");
    if (cut) {
      const img = scene.add.image(cx + 9, cy - 24, cut);
      const frame = img.frame;
      const fw = Math.max(1, frame.cutWidth || frame.width);
      const fh = Math.max(1, frame.cutHeight || frame.height);
      img.setOrigin(0.2, 0.92);
      img.setDisplaySize(RI_FLAG_HEIGHT * (fw / fh), RI_FLAG_HEIGHT);
      img.setRotation(0.08);
      img.setDepth(7.2);
      img.setAlpha(alpha);
      img.setData("siteToken", true);
      return;
    }
  }

  const gfx = scene.add.graphics().setDepth(7.2).setData("siteToken", true);
  const tilt = 0.16;
  const poleLen = 20;
  const ox = cx + 10;
  const oy = cy - 24;
  const hx = ox + Math.sin(tilt) * poleLen;
  const hy = oy - Math.cos(tilt) * poleLen;

  gfx.lineStyle(1.6, 0x2a2318, alpha);
  gfx.lineBetween(ox, oy, hx, hy);

  const h0x = hx + 0.8;
  const h0y = hy + 0.4;
  const h1x = h0x + Math.sin(tilt) * 10;
  const h1y = h0y + Math.cos(tilt) * 10;
  const tip = lerp2(h0x, h0y, h1x, h1y, 0.48);
  const tx = tip.x + Math.cos(tilt) * 15;
  const ty = tip.y + Math.sin(tilt) * 15 + 1.5;

  const stripes =
    owner === "ordo" ? [0xb8c0c8, 0x6a7078, 0x3a4248] : [0x8a7a58, 0x5a4a38, 0x3a3028];

  gfx.fillStyle(stripes[0], alpha);
  gfx.fillTriangle(h0x, h0y, h1x, h1y, tx, ty);
  const a = lerp2(h0x, h0y, h1x, h1y, 1 / 3);
  gfx.fillStyle(stripes[1], alpha);
  gfx.fillTriangle(a.x, a.y, h1x, h1y, tx, ty);
  const b = lerp2(h0x, h0y, h1x, h1y, 2 / 3);
  gfx.fillStyle(stripes[2], alpha);
  gfx.fillTriangle(b.x, b.y, h1x, h1y, tx, ty);

  gfx.lineStyle(1, 0x1a1510, alpha * 0.75);
  gfx.strokeTriangle(h0x, h0y, h1x, h1y, tx, ty);
}

export function sizeMapTokenImage(img: Phaser.GameObjects.Image, height: number): void {
  const frame = img.frame;
  const fw = Math.max(1, frame.cutWidth || frame.width);
  const fh = Math.max(1, frame.cutHeight || frame.height);
  img.setOrigin(0.5, 0.92);
  img.setDisplaySize(height * (fw / fh) * 0.9, height);
}

export function createMapTokenImage(
  scene: Phaser.Scene,
  srcKey: string | undefined,
  height: number,
): Phaser.GameObjects.Image | undefined {
  if (!srcKey) return undefined;
  const cut = ensureCutout(scene, srcKey);
  if (!cut) return undefined;
  const img = scene.add.image(0, 6, cut);
  sizeMapTokenImage(img, height);
  return img;
}

export function stampMapToken(
  scene: Phaser.Scene,
  srcKey: string | undefined,
  x: number,
  y: number,
  height: number,
  dataKey: string,
  depth: number,
  inVision = true,
): boolean {
  const img = createMapTokenImage(scene, srcKey, height);
  if (!img) return false;
  img.setPosition(x, y + 6).setDepth(depth);
  img.setData(dataKey, true);
  if (!inVision) {
    img.setTint(FOG_TINT);
    img.setAlpha(UNSEEN_ALPHA);
  }
  return true;
}

export function paintCityMarkers(
  scene: Phaser.Scene,
  gfx: Phaser.GameObjects.Graphics,
  cities: City[],
  mapId: string,
  fog: boolean[][],
  visible: boolean[][],
  isoCenter: MarkerIso,
  isOwned: (faction: City["faction"]) => boolean,
): void {
  for (const city of cities) {
    if (city.mapId !== mapId) continue;
    if (!fog[city.y]?.[city.x]) continue;
    const { cx, cy } = isoCenter(city.x, city.y);
    const inVision = visible[city.y][city.x];
    const owned = isOwned(city.faction);
    const stamped = stampMapToken(
      scene,
      cityMapTokenKey(city),
      cx,
      cy,
      cityMapTokenHeight(city),
      "cityToken",
      4,
      inVision,
    );

    if (!stamped) {
      gfx.fillStyle(cityFillColor(city.faction), inVision ? 1 : 0.6);
      gfx.fillCircle(cx, cy - 4, city.isCapital ? 18 : 14);
      gfx.lineStyle(2, cityRingColor(city, owned), 1);
      gfx.strokeCircle(cx, cy - 4, city.isCapital ? 18 : 14);
      if (owned) {
        gfx.fillStyle(0xd4af37, 0.95);
        gfx.fillCircle(cx, cy - 4, city.isCapital ? 5 : 4);
      } else if (city.faction === "ordo") {
        gfx.fillStyle(0xe8eef8, 0.95);
        gfx.fillCircle(cx - 4, cy - 4, 3);
        gfx.fillCircle(cx + 4, cy - 4, 3);
      } else if (inVision) {
        gfx.fillStyle(0xf5e6c8, 1);
        gfx.fillRect(cx - 3, cy - 22, 6, 6);
      }
    } else if (owned) {
      scene.add
        .circle(cx, cy + 10, 3.5, 0xd4af37, 0.95)
        .setStrokeStyle(1, 0x1a1510, 0.8)
        .setDepth(4.5)
        .setData("cityToken", true);
    }

    if (inVision) {
      scene.add
        .text(cx, cy + 18, city.name, {
          fontFamily: "Georgia, serif",
          fontSize: "11px",
          color: cityLabelColor(city.faction, owned),
          align: "center",
          stroke: "#1a1510",
          strokeThickness: 2,
        })
        .setOrigin(0.5, 0)
        .setData("cityLabel", true)
        .setDepth(5);
    }
  }
}

export function paintSiteMarkers(
  scene: Phaser.Scene,
  gfx: Phaser.GameObjects.Graphics,
  sites: MapSite[],
  mapId: string,
  fog: boolean[][],
  visible: boolean[][],
  isoCenter: MarkerIso,
): void {
  for (const site of sites) {
    if (site.mapId !== mapId) continue;
    if (!fog[site.y]?.[site.x]) continue;
    const inVision = !!visible[site.y]?.[site.x];
    const claimed = isHarvestSite(site.kind) && !!site.owner;
    if (!inVision && !claimed) continue;
    const { cx, cy } = isoCenter(site.x, site.y);
    const stamped = stampMapToken(
      scene,
      siteMapTokenKey(site.kind),
      cx,
      cy,
      MAP_SITE_HEIGHT,
      "siteToken",
      3.5,
      inVision,
    );
    if (!stamped) {
      gfx.fillStyle(SITE_COLOR[site.kind] ?? 0x888888, inVision ? 1 : 0.6);
      gfx.fillCircle(cx, cy + 6, 8);
      gfx.lineStyle(1, 0xf5e6c8, 0.8);
      gfx.strokeCircle(cx, cy + 6, 8);
    }
    if (site.owner) {
      paintSiteOwnerFlag(scene, cx, cy, site.owner, inVision);
    }
    if (inVision) {
      scene.add
        .text(cx, cy + 16, SITE_LABEL[site.kind] ?? site.kind, {
          fontFamily: "Georgia, serif",
          fontSize: "10px",
          color: "#c8b890",
          align: "center",
          stroke: "#1a1510",
          strokeThickness: 2,
        })
        .setOrigin(0.5, 0)
        .setData("siteLabel", true)
        .setDepth(5);
    }
  }
}

export function paintGraveMarkers(
  scene: Phaser.Scene,
  gfx: Phaser.GameObjects.Graphics,
  graves: Grave[],
  mapId: string,
  fog: boolean[][],
  visible: boolean[][],
  isoCenter: MarkerIso,
): void {
  for (const grave of graves) {
    if (grave.mapId !== mapId) continue;
    if (!fog[grave.y]?.[grave.x]) continue;
    const { cx, cy } = isoCenter(grave.x, grave.y);
    const inVision = visible[grave.y][grave.x];
    gfx.fillStyle(0x3a3428, inVision ? 1 : 0.55);
    gfx.fillRect(cx - 10, cy - 18, 20, 22);
    gfx.fillStyle(0x6a6050, inVision ? 1 : 0.55);
    gfx.fillTriangle(cx, cy - 28, cx - 14, cy - 16, cx + 14, cy - 16);
    gfx.lineStyle(2, 0xc9a227, inVision ? 0.9 : 0.4);
    gfx.strokeRect(cx - 10, cy - 18, 20, 22);
    scene.add
      .text(cx, cy + 12, "Могила", {
        fontFamily: "Georgia, serif",
        fontSize: "11px",
        color: "#c8b890",
      })
      .setOrigin(0.5, 0)
      .setData("graveLabel", true)
      .setDepth(7);
  }
}

export function armyTokenColor(army: Army): number {
  if (army.isPlayer) return RI_FIELD_KHAKI;
  if (army.isNeutral) return 0xc89840;
  if (army.faction === "ordo") return 0x5a6a7c;
  return 0xa04040;
}

export function armyMapLabel(army: Army): string {
  if (army.isNeutral) return army.name;
  if (army.isPlayer) return `${army.hero.name} (ур.${army.hero.level})`;
  return army.name;
}

export function paintArmyMarkers(
  scene: Phaser.Scene,
  gfx: Phaser.GameObjects.Graphics,
  armies: Army[],
  mapId: string,
  cols: number,
  rows: number,
  visible: boolean[][],
  isoCenter: MarkerIso,
): void {
  const list = armies
    .filter((a) => a.mapId === mapId && livingUnits(a).length > 0)
    .sort((a, b) => isoDrawOrder({ x: a.x, y: a.y }, { x: b.x, y: b.y }));

  for (const army of list) {
    if (army.y < 0 || army.x < 0 || army.y >= rows || army.x >= cols) continue;
    if (!army.isPlayer && !visible[army.y]?.[army.x]) continue;

    const { cx: px, cy: py } = isoCenter(army.x, army.y);
    const stamped = stampMapToken(
      scene,
      armyMapTokenKey(army),
      px,
      py,
      MAP_ARMY_HEIGHT,
      "armyToken",
      6,
      true,
    );

    if (!stamped) {
      gfx.fillStyle(armyTokenColor(army), 1);
      gfx.fillTriangle(px, py - 18, px - 14, py + 10, px + 14, py + 10);
      gfx.fillStyle(0xf5e6c8, 1);
      gfx.fillCircle(px, py - 22, 5);
    }

    scene.add
      .text(px, py + 18, armyMapLabel(army), {
        fontFamily: "Georgia, serif",
        fontSize: "11px",
        color: "#ddd0b0",
        align: "center",
      })
      .setOrigin(0.5, 0)
      .setData("armyLabel", true)
      .setDepth(7);
  }
}
