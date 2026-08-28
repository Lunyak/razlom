import Phaser from "phaser";
import type { FactionId } from "../../game/data";
import { portraitTextureKey } from "../../game/portraits";
import { glassStyleForFaction } from "../../game/factionVisual";
import { GlassPhotoFrame } from "../GlassPhotoFrame";
import { DOSSIER, dossierAccent } from "../chrome";

export const CITY_INK = {
  family: "Georgia, 'Palatino Linotype', 'Times New Roman', serif",
} as const;

export function resolveCityPortraitKey(scene: Phaser.Scene, defId: string): string | undefined {
  const key = portraitTextureKey(defId);
  if (scene.textures.exists(key)) return key;
  if (scene.textures.exists("unit_squire")) return "unit_squire";
  return undefined;
}

export function spawnCityPhotoPlate(
  scene: Phaser.Scene,
  x: number,
  y: number,
  opts: {
    defId?: string;
    faction: FactionId;
    size: number;
    hpLabel?: string;
    dead?: boolean;
    hero?: boolean;
    veteran?: boolean;
    empty?: boolean;
    selected?: boolean;
    depth?: number;
  },
): GlassPhotoFrame {
  const frame = new GlassPhotoFrame(scene, x, y, {
    portraitKey: opts.defId ? resolveCityPortraitKey(scene, opts.defId) : undefined,
    portraitSize: Math.max(24, opts.size - 10),
    frameW: opts.size,
    frameH: opts.size,
    style: glassStyleForFaction(opts.faction),
    hpLabel: opts.hpLabel,
    hpColor: opts.dead ? DOSSIER.danger : DOSSIER.ink,
    hero: opts.hero,
    veteran: opts.veteran,
  });
  frame.setDepth(opts.depth ?? 51).setScrollFactor(0);
  if (opts.empty) frame.setEmpty(true);
  if (opts.dead) frame.markDead();
  if (opts.selected) frame.setTargetHighlight("valid");
  return frame;
}

export function paintDossierCard(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: {
    ok?: boolean;
    owned?: boolean;
    faction?: FactionId;
    depth?: number;
  } = {},
): Phaser.GameObjects.Rectangle {
  const accent = dossierAccent(opts.faction ?? "ri");
  const owned = !!opts.owned;
  const ok = !!opts.ok && !owned;
  const fill = owned ? 0x1c1a14 : ok ? DOSSIER.paper : 0x16120e;
  const stroke = owned ? 0x8a7a50 : ok ? accent : DOSSIER.plateEdge;
  return scene.add
    .rectangle(x, y, w, h, fill, owned ? 0.9 : ok ? 0.96 : 0.88)
    .setStrokeStyle(1, stroke, owned || ok ? 0.85 : 0.45)
    .setDepth(opts.depth ?? 50)
    .setScrollFactor(0)
    .setAlpha(owned || ok ? 1 : 0.62);
}
