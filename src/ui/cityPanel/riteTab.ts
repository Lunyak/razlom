import { CITY_RITES } from "../../game/catalog";
import { canPerformRite, formatRiteCost } from "../../game/cityRites";
import { cityCulture, session } from "../../game/data";
import { DOSSIER } from "../chrome";
import { CITY_INK, paintDossierCard } from "./photoPlate";
import type { CityRiteCtx } from "./types";

export function renderRiteTab(p: CityRiteCtx): void {
  clearRiteLayer(p);

  p.content.add(
    p.scene.add
      .text(0, -195, "Обряд раз за ночь. Панихида — если в городе стоит живой отряд", {
        fontFamily: CITY_INK.family,
        fontSize: "13px",
        color: DOSSIER.inkMuted,
      })
      .setOrigin(0.5),
  );

  const cols = 3;
  const cardW = 250;
  const cardH = 132;
  const gapX = 18;
  const originX = p.cx;
  const originY = p.cy + 8;

  CITY_RITES.forEach((rite, i) => {
    const lx = -((cols - 1) * (cardW + gapX)) / 2 + i * (cardW + gapX);
    spawnRiteCard(p, originX + lx, originY, cardW, cardH, rite.id);
  });
}

function clearRiteLayer(p: CityRiteCtx): void {
  for (const obj of p.riteLayer) obj.destroy();
  p.riteLayer.length = 0;
  p.riteSlots.length = 0;
}

function spawnRiteCard(
  p: CityRiteCtx,
  sx: number,
  sy: number,
  w: number,
  h: number,
  riteId: (typeof CITY_RITES)[number]["id"],
): void {
  const rite = CITY_RITES.find((r) => r.id === riteId)!;
  const check = canPerformRite(session.state, p.city, riteId, p.army);
  const ok = check.ok;
  const faction = cityCulture(p.city);

  const bg = paintDossierCard(p.scene, sx, sy, w, h, { ok, faction, depth: 50 });
  const name = p.scene.add
    .text(sx, sy - 46, rite.name, {
      fontFamily: CITY_INK.family,
      fontSize: "18px",
      color: ok ? DOSSIER.title : DOSSIER.inkDim,
    })
    .setOrigin(0.5, 0)
    .setDepth(51)
    .setScrollFactor(0);
  const price = p.scene.add
    .text(sx, sy - 20, formatRiteCost(rite), {
      fontFamily: CITY_INK.family,
      fontSize: "13px",
      color: ok ? DOSSIER.gold : DOSSIER.inkDim,
    })
    .setOrigin(0.5, 0)
    .setDepth(51)
    .setScrollFactor(0);
  const blurb = p.scene.add
    .text(sx, sy + 8, rite.blurb, {
      fontFamily: CITY_INK.family,
      fontSize: "12px",
      color: ok ? DOSSIER.inkMuted : DOSSIER.inkDim,
      wordWrap: { width: w - 24 },
      align: "center",
    })
    .setOrigin(0.5, 0)
    .setDepth(51)
    .setScrollFactor(0);
  const action = p.scene.add
    .text(sx, sy + h / 2 - 22, ok ? "Совершить" : check.reason, {
      fontFamily: CITY_INK.family,
      fontSize: "13px",
      color: ok ? DOSSIER.gold : DOSSIER.inkDim,
    })
    .setOrigin(0.5)
    .setDepth(51)
    .setScrollFactor(0);

  p.riteLayer.push(bg, name, price, blurb, action);
  if (ok) {
    p.riteSlots.push({
      riteId,
      left: sx - w / 2,
      top: sy - h / 2,
      right: sx + w / 2,
      bottom: sy + h / 2,
    });
  }
}
