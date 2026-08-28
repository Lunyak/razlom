import Phaser from "phaser";
import type { Army } from "../../game/data";
import { armyMaxMoves } from "../../game/data";
import { portraitTextureKey } from "../../game/portraits";
import { vintageLookForKey } from "../../game/vintagePortrait";
import { classLabel } from "../../game/heroClasses";
import { equippedList } from "../../game/artifacts";
import { PanelStack, hudObject } from "../panelStack";
import {
  getPanelLayout,
  PANEL_LAYOUT_IDS,
  pieceTransform,
  resolvePanelOrigin,
} from "../panelStack/panelLayoutStore";
import {
  activeSidebarVariant,
  sidebarVariantLayout,
} from "./sidebarVariants";
import { viewSize } from "../viewport";
import type { PlayerSidebarActions, SidebarButtonId } from "./playerSidebarTypes";

/** Layer stack — bottom → top. Edit depths / `under` to change who covers whom. */
export const PLAYER_SIDEBAR_LAYERS = [
  {
    name: "fill",
    depth: 8,
    under: null,
    note: "удлинение панели вниз на высоких экранах",
  },
  {
    name: "portrait",
    depth: 12,
    under: "fill",
    note: "только фото — под кольцом макета",
  },
  {
    name: "plate",
    depth: 18,
    under: "portrait",
    note: "PNG ui_sidebar (рамка + кольцо + кнопки)",
  },
  {
    name: "buttons",
    depth: 20,
    under: "plate",
    note: "невидимые метки hit-зон",
  },
  {
    name: "text",
    depth: 22,
    under: "plate",
    note: "шаги, имя, нед/ход",
  },
] as const;

/** Piece ids for layout editor (includes text sub-pieces). */
export const PLAYER_SIDEBAR_EDITOR_PIECES = [
  "fill",
  "portrait",
  "plate",
  "stepsValue",
  "nameText",
  "turnText",
  "buttons",
] as const;

export const PANEL_LAYOUT_PIECE = "__panel__";

/** Human-readable names for the layout editor list. */
export const PLAYER_SIDEBAR_PIECE_CATALOG: { id: string; label: string }[] = [
  { id: PANEL_LAYOUT_PIECE, label: "Панель целиком" },
  { id: "plate", label: "PNG-рамка (plate)" },
  { id: "fill", label: "Удлинение вниз (fill)" },
  { id: "portrait", label: "Портрет" },
  { id: "stepsValue", label: "Число шагов" },
  { id: "nameText", label: "Имя героя" },
  { id: "turnText", label: "Неделя / ход" },
  { id: "buttons", label: "Кнопки (хит-зоны)" },
];

/** Default size (scale = 1) for editor resize / bounds. */
export function sidebarPieceBaseMetrics(pieceId: string): { w: number; h: number } | null {
  const vl = sidebarVariantLayout();
  switch (pieceId) {
    case "plate":
      return { w: vl.sidebarW, h: vl.sidebarArtH };
    case "fill":
      return { w: vl.sidebarW, h: 120 };
    case "portrait": {
      const photo = portraitPhotoSize(vl);
      return { w: photo.w, h: photo.h };
    }
    case "stepsValue":
      return { w: 160, h: 44 };
    case "nameText":
      return { w: 260, h: 28 };
    case "turnText":
      return { w: 200, h: 28 };
    case "buttons": {
      const top = vl.sideBtnYs[0] - vl.sideBtnH / 2;
      const bottom = vl.sideBtnYs[2] + vl.sideBtnH / 2;
      return { w: vl.sideBtnW, h: bottom - top };
    }
    default:
      return null;
  }
}

function scaledRect(w: number, h: number, sx: number, sy: number): { w: number; h: number } {
  return { w: Math.max(8, w * sx), h: Math.max(8, h * sy) };
}

function portraitPhotoSize(vl: ReturnType<typeof sidebarVariantLayout>): { w: number; h: number } {
  return {
    w: Math.max(8, vl.portraitFrame - vl.portraitInset),
    h: Math.max(8, vl.portraitFrameH - vl.portraitInset),
  };
}

export type SidebarPieceBounds = {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: "rect" | "circle";
};

/** Screen-space hit box for editor highlight / click-pick. */
export function sidebarPieceBounds(
  pieceId: string,
  screenW: number,
  screenH: number,
): SidebarPieceBounds | null {
  const vl = sidebarVariantLayout(screenW, screenH);
  const cfg = getPanelLayout(PANEL_LAYOUT_IDS.playerSidebar);
  const origin = vl.fullWindow
    ? { x: 0, y: 0 }
    : resolvePanelOrigin(cfg, screenW, screenH, vl.sidebarW, screenH);
  const ox = origin.x;
  const oy = origin.y;

  if (pieceId === PANEL_LAYOUT_PIECE) {
    return {
      x: ox,
      y: oy,
      w: vl.sidebarW,
      h: Math.max(vl.sidebarArtH, screenH - oy),
      kind: "rect",
    };
  }

  const plateT = pieceTransform(cfg, "plate");
  const px = ox + plateT.x;
  const py = oy + plateT.y;

  switch (pieceId) {
    case "plate": {
      if (vl.fullWindow) {
        return { x: 0, y: 0, w: screenW, h: screenH, kind: "rect" };
      }
      const size = scaledRect(vl.sidebarW, vl.sidebarArtH, plateT.scaleX, plateT.scaleY);
      return { x: px, y: py, w: size.w, h: size.h, kind: "rect" };
    }
    case "fill": {
      const fillT = pieceTransform(cfg, "fill");
      const top = oy + vl.sidebarArtH + fillT.y;
      if (screenH <= top) return null;
      const size = scaledRect(vl.sidebarW, screenH - top, fillT.scaleX, fillT.scaleY);
      return { x: ox + fillT.x, y: top, w: size.w, h: size.h, kind: "rect" };
    }
    case "portrait": {
      const portT = pieceTransform(cfg, "portrait");
      const photo = portraitPhotoSize(vl);
      const size = scaledRect(photo.w, photo.h, portT.scaleX, portT.scaleY);
      return {
        x: vl.sideCx + ox + portT.x - size.w / 2,
        y: vl.portraitY + oy + portT.y - size.h / 2,
        w: size.w,
        h: size.h,
        kind: vl.portraitMask === "ellipse" ? "circle" : "circle",
      };
    }
    case "stepsValue": {
      const t = pieceTransform(cfg, "stepsValue");
      const base = sidebarPieceBaseMetrics("stepsValue")!;
      const size = scaledRect(base.w, base.h, t.scaleX, t.scaleY);
      const cx = vl.sideCx + ox + t.x;
      const cy = vl.stepsValueY + oy + t.y;
      return { x: cx - size.w / 2, y: cy - size.h / 2, w: size.w, h: size.h, kind: "rect" };
    }
    case "nameText": {
      const t = pieceTransform(cfg, "nameText");
      const base = sidebarPieceBaseMetrics("nameText")!;
      const size = scaledRect(base.w, base.h, t.scaleX, t.scaleY);
      return { x: 36 + ox + t.x, y: vl.nameRowY + oy + t.y - size.h / 2, w: size.w, h: size.h, kind: "rect" };
    }
    case "turnText": {
      const t = pieceTransform(cfg, "turnText");
      const base = sidebarPieceBaseMetrics("turnText")!;
      const size = scaledRect(base.w, base.h, t.scaleX, t.scaleY);
      return {
        x: vl.sidebarW - 36 + ox + t.x - size.w,
        y: vl.nameRowY + oy + t.y - size.h / 2,
        w: size.w,
        h: size.h,
        kind: "rect",
      };
    }
    case "buttons": {
      const t = pieceTransform(cfg, "buttons");
      const base = sidebarPieceBaseMetrics("buttons")!;
      const size = scaledRect(base.w, base.h, t.scaleX, t.scaleY);
      const cy = (vl.sideBtnYs[0] + vl.sideBtnYs[2]) / 2 + oy + t.y;
      return {
        x: vl.sideCx + ox + t.x - size.w / 2,
        y: cy - size.h / 2,
        w: size.w,
        h: size.h,
        kind: "rect",
      };
    }
    default:
      return null;
  }
}

export type PlayerSidebarPieces = {
  plate: Phaser.GameObjects.Image;
  fill: Phaser.GameObjects.Graphics;
  portrait: Phaser.GameObjects.Image;
  portraitMask: Phaser.GameObjects.Graphics;
  stepsValue: Phaser.GameObjects.Text;
  nameText: Phaser.GameObjects.Text;
  turnText: Phaser.GameObjects.Text;
  buttons: {
    id: SidebarButtonId;
    designY: number;
    label: Phaser.GameObjects.Text;
    action: () => void;
  }[];
};

export function buildPlayerSidebarStack(
  scene: Phaser.Scene,
  actions: PlayerSidebarActions,
): { stack: PanelStack; pieces: PlayerSidebarPieces } {
  const refs: Partial<PlayerSidebarPieces> = {
    buttons: [],
  };
  const variant = activeSidebarVariant();
  const { w: sw, h: sh } = viewSize(scene);
  const vl = sidebarVariantLayout(sw, sh);

  const stack = new PanelStack();
  for (const layer of PLAYER_SIDEBAR_LAYERS) {
    stack.layer({ ...layer });
  }

  stack.piece({
    id: "fill",
    layer: "fill",
    mount: () => {
      const fill = hudObject(scene.add.graphics());
      refs.fill = fill;
      return { objects: [fill] };
    },
  });

  stack.piece({
    id: "portrait",
    layer: "portrait",
    mount: () => {
      const portraitMask = hudObject(scene.add.graphics()).setVisible(false);
      const portraitKey = scene.textures.exists("hero_ri") ? "hero_ri" : undefined;
      const { w: photoW, h: photoH } = portraitPhotoSize(vl);
      const portrait = hudObject(
        portraitKey
          ? scene.add
              .image(vl.sideCx, vl.portraitY, portraitKey)
              .setDisplaySize(photoW, photoH)
          : scene.add.rectangle(vl.sideCx, vl.portraitY, photoW, photoH, 0x2a2018, 1),
      );
      portrait.setMask(portraitMask.createGeometryMask());
      syncPortraitMask(portraitMask);
      refs.portrait = portrait as Phaser.GameObjects.Image;
      refs.portraitMask = portraitMask;
      return { objects: [portrait, portraitMask] };
    },
  });

  stack.piece({
    id: "plate",
    layer: "plate",
    mount: () => {
      const plate = hudObject(
        scene.add
          .image(0, 0, variant.textureKey)
          .setOrigin(0, 0)
          .setDisplaySize(vl.sidebarW, vl.sidebarArtH),
      );
      refs.plate = plate;
      return { objects: [plate] };
    },
  });

  stack.piece({
    id: "text",
    layer: "text",
    mount: () => {
      const stepsValue = hudObject(
        scene.add
          .text(vl.sideCx, vl.stepsValueY, "0/0", {
            fontFamily: "Georgia, serif",
            fontSize: "28px",
            color: "#f5e6c8",
          })
          .setOrigin(0.5, 0.5),
      );
      const nameText = hudObject(
        scene.add
          .text(36, vl.nameRowY, "", {
            fontFamily: "Georgia, serif",
            fontSize: "16px",
            color: "#f5e6c8",
          })
          .setOrigin(0, 0.5),
      );
      const turnText = hudObject(
        scene.add
          .text(vl.sidebarW - 36, vl.nameRowY, "", {
            fontFamily: "Georgia, serif",
            fontSize: "14px",
            color: "#c8b890",
          })
          .setOrigin(1, 0.5),
      );
      refs.stepsValue = stepsValue;
      refs.nameText = nameText;
      refs.turnText = turnText;
      return { objects: [stepsValue, nameText, turnText] };
    },
  });

  const btnDefs: { id: SidebarButtonId; label: string; y: number; action: () => void }[] = [
    { id: "squad", label: "ОТРЯД", y: vl.sideBtnYs[0], action: actions.onSquad },
    { id: "map", label: "КАРТА", y: vl.sideBtnYs[1], action: actions.onMap },
    { id: "settings", label: "НАСТРОЙКИ", y: vl.sideBtnYs[2], action: actions.onSettings },
  ];

  stack.piece({
    id: "buttons",
    layer: "buttons",
    mount: () => {
      const buttons: PlayerSidebarPieces["buttons"] = [];
      const labels: Phaser.GameObjects.Text[] = [];
      for (const btn of btnDefs) {
        const label = hudObject(
          scene.add
            .text(vl.sideCx, btn.y, btn.label, {
              fontFamily: "Georgia, serif",
              fontSize: "20px",
              color: "#e8d5a3",
            })
            .setOrigin(0.5, 0.5)
            .setAlpha(0),
        );
        labels.push(label);
        buttons.push({ id: btn.id, designY: btn.y, label, action: btn.action });
      }
      refs.buttons = buttons;
      return { objects: labels };
    },
  });

  stack.build();
  return { stack, pieces: refs as PlayerSidebarPieces };
}

export function layoutPlayerSidebarStack(
  stack: PanelStack,
  pieces: PlayerSidebarPieces,
  screenW: number,
  screenH: number,
): void {
  const vl = sidebarVariantLayout(screenW, screenH);
  const cfg = getPanelLayout(PANEL_LAYOUT_IDS.playerSidebar);
  for (const layer of PLAYER_SIDEBAR_LAYERS) {
    stack.setLayerDepth(layer.name, layer.depth);
  }
  stack.applyLayerDepths(cfg.layerDepths);

  const origin = vl.fullWindow
    ? { x: 0, y: 0 }
    : resolvePanelOrigin(cfg, screenW, screenH, vl.sidebarW, screenH);
  const ox = origin.x;
  const oy = origin.y;

  const plateT = pieceTransform(cfg, "plate");
  if (vl.fullWindow) {
    pieces.plate.setPosition(0, 0).setDisplaySize(screenW, screenH);
    pieces.fill.clear();
  } else {
    const plateSize = scaledRect(vl.sidebarW, vl.sidebarArtH, plateT.scaleX, plateT.scaleY);
    pieces.plate.setPosition(ox + plateT.x, oy + plateT.y).setDisplaySize(plateSize.w, plateSize.h);

    const fillT = pieceTransform(cfg, "fill");
    pieces.fill.clear();
    const fillTop = oy + vl.sidebarArtH + fillT.y;
    if (screenH > fillTop) {
      const fillW = vl.sidebarW * fillT.scaleX;
      const fillH = (screenH - fillTop) * fillT.scaleY;
      pieces.fill.fillStyle(0x14110e, 1);
      pieces.fill.fillRect(ox + fillT.x, fillTop, fillW, fillH);
      pieces.fill.fillStyle(0x2a2420, 0.85);
      pieces.fill.fillRect(ox + fillT.x + 8, fillTop, 14, fillH);
      pieces.fill.fillRect(ox + fillT.x + fillW - 22, fillTop, 14, fillH);
    }
  }

  const portT = pieceTransform(cfg, "portrait");
  const photo = portraitPhotoSize(vl);
  const portSize = scaledRect(photo.w, photo.h, portT.scaleX, portT.scaleY);
  pieces.portrait.setPosition(vl.sideCx + ox + portT.x, vl.portraitY + oy + portT.y);
  if (pieces.portrait instanceof Phaser.GameObjects.Image) {
    pieces.portrait.setDisplaySize(portSize.w, portSize.h);
  }
  syncPortraitMask(pieces.portraitMask, ox + portT.x, oy + portT.y, portT.scaleX, portT.scaleY, screenW, screenH);

  const stepsT = pieceTransform(cfg, "stepsValue");
  pieces.stepsValue
    .setPosition(vl.sideCx + ox + stepsT.x, vl.stepsValueY + oy + stepsT.y)
    .setScale(stepsT.scaleX, stepsT.scaleY)
    .setFontSize(vl.fullWindow ? "18px" : "28px")
    .setVisible(!vl.hideHudTexts);

  const nameT = pieceTransform(cfg, "nameText");
  if (vl.hideHudTexts) {
    pieces.nameText.setVisible(false);
    pieces.turnText.setVisible(false);
  } else if (vl.fullWindow) {
    pieces.nameText
      .setOrigin(0.5, 0.5)
      .setPosition(vl.sideCx + ox + nameT.x, vl.nameRowY + oy + nameT.y)
      .setScale(nameT.scaleX, nameT.scaleY)
      .setFontSize("13px")
      .setVisible(true);
    pieces.turnText.setVisible(false);
  } else {
    pieces.nameText
      .setOrigin(0, 0.5)
      .setPosition(36 + ox + nameT.x, vl.nameRowY + oy + nameT.y)
      .setScale(nameT.scaleX, nameT.scaleY)
      .setFontSize("16px")
      .setVisible(true);
    pieces.turnText.setVisible(true);
    const turnT = pieceTransform(cfg, "turnText");
    pieces.turnText
      .setPosition(vl.sidebarW - 36 + ox + turnT.x, vl.nameRowY + oy + turnT.y)
      .setScale(turnT.scaleX, turnT.scaleY);
  }

  const btnT = pieceTransform(cfg, "buttons");
  for (let i = 0; i < pieces.buttons.length; i++) {
    const btn = pieces.buttons[i]!;
    const x = vl.sideBtnLayout === "row" ? (vl.sideBtnXs[i] ?? vl.sideCx) : vl.sideCx;
    btn.label.setPosition(x + ox + btnT.x, btn.designY + oy + btnT.y).setScale(btnT.scaleX, btnT.scaleY);
  }
}

/** Swap plate PNG + button row heights after variant change. */
export function applySidebarPlateVariant(pieces: PlayerSidebarPieces): void {
  const variant = activeSidebarVariant();
  const vl = sidebarVariantLayout();
  const scene = pieces.plate.scene;
  if (scene.textures.exists(variant.textureKey)) {
    pieces.plate.setTexture(variant.textureKey);
  }
  const ys = vl.sideBtnYs;
  for (let i = 0; i < pieces.buttons.length; i++) {
    pieces.buttons[i]!.designY = ys[i] ?? pieces.buttons[i]!.designY;
  }
}

function syncPortraitMask(
  mask: Phaser.GameObjects.Graphics,
  ox = 0,
  oy = 0,
  scaleX = 1,
  scaleY = 1,
  screenW = 1280,
  screenH = 720,
): void {
  const vl = sidebarVariantLayout(screenW, screenH);
  mask.clear();
  mask.fillStyle(0xffffff, 1);
  const cx = vl.sideCx + ox;
  const cy = vl.portraitY + oy;
  if (vl.portraitMask === "ellipse") {
    const rw = ((vl.portraitFrame - vl.portraitInset) / 2) * scaleX;
    const rh = ((vl.portraitFrameH - vl.portraitInset) / 2) * scaleY;
    mask.fillEllipse(cx, cy, rw * 2, rh * 2);
  } else {
    const r = ((vl.portraitFrame - vl.portraitInset) / 2) * Math.max(scaleX, scaleY);
    mask.fillCircle(cx, cy, r);
  }
}

/** Update portrait + texts from army state. */
export function refreshPlayerSidebarPieces(pieces: PlayerSidebarPieces, army: Army | undefined, turn: number): void {
  pieces.turnText.setText(`НЕД ${Math.ceil(turn / 7)}. ХОД ${turn}`);
  if (!army) {
    pieces.portrait.setVisible(false);
    pieces.nameText.setText("Нет героя");
    pieces.stepsValue.setText("—");
    return;
  }

  pieces.portrait.setVisible(true);
  const heroUnit = army.units.find((u) => u.isHero);
  const heroTex = heroUnit ? portraitTextureKey(heroUnit.defId) : "hero_ri";
  const scene = pieces.portrait.scene;
  const tex = scene.textures.exists(heroTex)
    ? heroTex
    : scene.textures.exists("hero_ri")
      ? "hero_ri"
      : undefined;
  if (tex && pieces.portrait instanceof Phaser.GameObjects.Image) {
    pieces.portrait.setTexture(tex);
    const look = vintageLookForKey(tex);
    pieces.portrait.setTint(look.tint).setAlpha(look.portraitAlpha);
  }

  pieces.nameText.setText(
    army.isMissionary ? "Миссионер" : `${army.hero.name} · ${classLabel(army.hero)}`,
  );
  const gear = equippedList(army.hero)
    .map((a) => a.name)
    .slice(0, 2)
    .join(", ");
  const maxMoves = armyMaxMoves(army);
  pieces.stepsValue.setText(
    gear ? `${army.movesLeft}/${maxMoves} · ${gear}` : `${army.movesLeft}/${maxMoves}`,
  );
}

export function sidebarPanelOrigin(screenW: number, screenH: number): { x: number; y: number } {
  const cfg = getPanelLayout(PANEL_LAYOUT_IDS.playerSidebar);
  const vl = sidebarVariantLayout();
  return resolvePanelOrigin(cfg, screenW, screenH, vl.sidebarW, screenH);
}
