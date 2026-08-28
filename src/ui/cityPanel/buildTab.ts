import Phaser from "phaser";
import { BUILDINGS } from "../../game/catalog";
import { buildOrderFor, canBuild } from "../../game/city";
import { cityHasBuilding, type BuildingId } from "../../game/buildings";
import { buildingArtKey } from "../../game/buildingsArt";
import { cityCulture, session } from "../../game/data";
import { playerFactionOf } from "../../game/playerFaction";
import { spawnCastleComposite } from "../CityCastleComposite";
import { DOSSIER, dossierAccent } from "../chrome";
import { CITY_INK, paintDossierCard } from "./photoPlate";
import type { CityBuildCtx } from "./types";

export function renderBuildTab(p: CityBuildCtx): void {
  clearBuildLayer(p);

  const built = [...p.city.buildings];
  const appear = built.filter((id) => !p.lastShownBuildings.includes(id));
  const plateSize = 240;
  const plateY = p.cy - 16;
  const faction = cityCulture(p.city);

  const composite = spawnCastleComposite(p.scene, {
    x: p.cx,
    y: plateY,
    size: plateSize,
    built,
    appear,
    depth: 50,
    faction,
  });
  p.buildLayer.push(...composite);
  p.lastShownBuildings.length = 0;
  p.lastShownBuildings.push(...built);

  p.content.add(
    p.scene.add
      .text(0, -195, "Клик по карточке — указ о постройке", {
        fontFamily: CITY_INK.family,
        fontSize: "12px",
        color: DOSSIER.inkMuted,
      })
      .setOrigin(0.5),
  );

  const cols = 5;
  const cardW = 158;
  const cardH = 100;
  const gapX = 10;
  const originX = p.cx;
  const originY = p.cy + 176;

  const order = buildOrderFor(cityCulture(p.city));
  order.forEach((id, i) => {
    const lx = -((Math.min(order.length, cols) - 1) * (cardW + gapX)) / 2 + i * (cardW + gapX);
    spawnBuildCard(p, originX + lx, originY, cardW, cardH, id, i);
  });
}

function clearBuildLayer(p: CityBuildCtx): void {
  for (const obj of p.buildLayer) obj.destroy();
  p.buildLayer.length = 0;
  p.buildSlots.length = 0;
}

function spawnBuildCard(
  p: CityBuildCtx,
  sx: number,
  sy: number,
  w: number,
  h: number,
  id: BuildingId,
  index: number,
): void {
  const def = BUILDINGS[id];
  const owned = cityHasBuilding(p.city, id);
  const pf = playerFactionOf(session.state);
  const check = canBuild(session.state, p.city, id, pf);
  const ok = !owned && check.ok;
  const manaPart = def.cost.mana ? ` · ${def.cost.mana}м` : "";
  const artKey = buildingArtKey(id);
  const thumb = 40;
  const faction = cityCulture(p.city);
  const accent = dossierAccent(faction);

  const bg = paintDossierCard(p.scene, sx, sy, w, h, { ok, owned, faction, depth: 50 });
  const layer: Phaser.GameObjects.GameObject[] = [bg];

  const well = p.scene.add
    .rectangle(sx, sy - h / 2 + 8 + thumb / 2, thumb + 8, thumb + 8, DOSSIER.paper, 1)
    .setStrokeStyle(1, owned ? 0x8a7a50 : ok ? accent : DOSSIER.plateEdge, 0.7)
    .setDepth(51)
    .setScrollFactor(0);
  layer.push(well);

  if (p.scene.textures.exists(artKey)) {
    const img = p.scene.add
      .image(sx, sy - h / 2 + 8 + thumb / 2, artKey)
      .setDisplaySize(thumb, thumb)
      .setDepth(52)
      .setScrollFactor(0)
      .setAlpha(owned ? 0.88 : ok ? 1 : 0.4);
    layer.push(img);
  }

  const name = p.scene.add
    .text(sx, sy + 4, def.name, {
      fontFamily: CITY_INK.family,
      fontSize: "12px",
      color: owned ? DOSSIER.gold : ok ? DOSSIER.title : DOSSIER.inkDim,
      wordWrap: { width: w - 10 },
      align: "center",
    })
    .setOrigin(0.5, 0)
    .setDepth(51)
    .setScrollFactor(0);
  const price = p.scene.add
    .text(sx, sy + h / 2 - 24, owned ? "Возведено" : `${def.cost.gold}з${manaPart}`, {
      fontFamily: CITY_INK.family,
      fontSize: "12px",
      color: owned ? DOSSIER.inkMuted : ok ? DOSSIER.gold : DOSSIER.inkDim,
    })
    .setOrigin(0.5)
    .setDepth(51)
    .setScrollFactor(0);
  const action = p.scene.add
    .text(
      sx,
      sy + h / 2 - 10,
      owned ? "уже есть" : ok ? "Построить" : !owned && !check.ok ? check.reason : "—",
      {
        fontFamily: CITY_INK.family,
        fontSize: "11px",
        color: owned ? DOSSIER.inkMuted : ok ? DOSSIER.gold : DOSSIER.inkDim,
      },
    )
    .setOrigin(0.5)
    .setDepth(51)
    .setScrollFactor(0);

  p.buildLayer.push(...layer, name, price, action);
  if (ok) {
    p.buildSlots.push({
      index,
      left: sx - w / 2,
      top: sy - h / 2,
      right: sx + w / 2,
      bottom: sy + h / 2,
    });
  }
}
