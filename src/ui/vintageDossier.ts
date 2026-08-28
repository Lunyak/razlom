import Phaser from "phaser";
import type { FactionId } from "../game/data";
import { DOSSIER, dossierAccent, dossierHeaderColor } from "./chrome";

export { DOSSIER, dossierAccent, dossierHeaderColor } from "./chrome";

export { glassStyleForFaction } from "../game/factionVisual";

/**
 * Aged photo-dossier plate: dark paper, soft inset, ornate glass rim when available.
 */
export function buildDossierChrome(
  scene: Phaser.Scene,
  w: number,
  h: number,
  opts: { faction?: FactionId; title: string; headerH?: number } = { title: "" },
): {
  root: Phaser.GameObjects.Container;
  bodyHost: Phaser.GameObjects.Container;
  titleText: Phaser.GameObjects.Text;
  hintText: Phaser.GameObjects.Text;
  setFaction: (faction: FactionId) => void;
} {
  const root = scene.add.container(0, 0);
  const faction = opts.faction ?? "ri";
  const accent = dossierAccent(faction);
  const headerH = opts.headerH ?? 44;
  const headerY = -h / 2 + 12 + headerH / 2;

  const shadow = scene.add.rectangle(5, 7, w, h, DOSSIER.shadow, 0.55);
  const plate = scene.add
    .rectangle(0, 0, w, h, DOSSIER.plate, 0.97)
    .setStrokeStyle(2, accent, 0.85)
    .setName("dossierPlate");

  const inset = scene.add
    .rectangle(0, 4, w - 18, h - 22, DOSSIER.paper, 0.92)
    .setStrokeStyle(1, DOSSIER.plateEdge, 0.7)
    .setName("dossierInset");

  const header = scene.add
    .rectangle(0, headerY, w - 28, headerH, dossierHeaderColor(faction), 0.95)
    .setStrokeStyle(1, accent, 0.55)
    .setName("dossierHeader");

  const titleText = scene.add
    .text(0, -h / 2 + 16, opts.title, {
      fontFamily: "Georgia, serif",
      fontSize: "18px",
      color: DOSSIER.title,
      stroke: "#1a1008",
      strokeThickness: 2,
    })
    .setOrigin(0.5, 0);

  const hintText = scene.add
    .text(0, h / 2 - 16, "Отпустите ПКМ, чтобы закрыть", {
      fontFamily: "Georgia, serif",
      fontSize: "11px",
      color: DOSSIER.inkDim,
    })
    .setOrigin(0.5, 0.5);

  const rimKey = scene.textures.exists("glass_frame_border")
    ? "glass_frame_border"
    : scene.textures.exists("glass_frame_vintage")
      ? "glass_frame_vintage"
      : null;

  const parts: Phaser.GameObjects.GameObject[] = [shadow, plate, inset, header, titleText];
  const cornerImgs: Phaser.GameObjects.Image[] = [];

  if (rimKey) {
    // Corner ornaments — crop the square frame into four corners instead of stretching.
    const corner = 52;
    const ox = w / 2 - 10;
    const oy = h / 2 - 10;
    const corners: [number, number, number][] = [
      [-ox, -oy, 0],
      [ox, -oy, 1],
      [-ox, oy, 2],
      [ox, oy, 3],
    ];
    for (const [cx, cy, flip] of corners) {
      const img = scene.add
        .image(cx, cy, rimKey)
        .setDisplaySize(corner, corner)
        .setAlpha(0.55)
        .setTint(accent)
        .setName("dossierCorner");
      if (flip === 1) img.setFlipX(true);
      if (flip === 2) img.setFlipY(true);
      if (flip === 3) img.setFlipX(true).setFlipY(true);
      cornerImgs.push(img);
      parts.push(img);
    }
  }

  if (scene.textures.exists("glass_overlay_dust")) {
    parts.push(
      scene.add
        .image(0, 0, "glass_overlay_dust")
        .setDisplaySize(w - 24, h - 28)
        .setAlpha(0.12)
        .setTint(0xc8b890),
    );
  }

  parts.push(hintText);
  root.add(parts);

  const bodyHost = scene.add.container(0, 0);
  root.add(bodyHost);

  const setFaction = (next: FactionId) => {
    const a = dossierAccent(next);
    plate.setStrokeStyle(2, a, 0.85);
    header.setFillStyle(dossierHeaderColor(next), 0.95);
    header.setStrokeStyle(1, a, 0.55);
    for (const img of cornerImgs) img.setTint(a);
  };

  return { root, bodyHost, titleText, hintText, setFaction };
}

export function dossierStatText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  wrapWidth: number,
  fontSize = "13px",
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, content, {
      fontFamily: "Georgia, serif",
      fontSize,
      color: DOSSIER.ink,
      lineSpacing: 5,
      wordWrap: { width: wrapWidth },
      stroke: "#120e0a",
      strokeThickness: 1,
    })
    .setOrigin(0, 0);
}
