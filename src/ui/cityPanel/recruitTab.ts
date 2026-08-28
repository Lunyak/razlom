import {
  canRecruit,
  canRecruitToGarrison,
  getRecruitRoster,
} from "../../game/city";
import { GRAVE_RESURRECT_COST, UNIT_DEFS } from "../../game/catalog";
import { cityCulture, session, type Army, type City } from "../../game/data";
import { playerFactionOf } from "../../game/playerFaction";
import { canHireMissionary, formatMissionaryHire } from "../../game/graves";
import { DOSSIER } from "../chrome";
import { CITY_INK, paintDossierCard, spawnCityPhotoPlate } from "./photoPlate";
import type { CityRecruitCtx } from "./types";

export function recruitCheck(
  city: City | null,
  army: Army | null,
  heroInCity: boolean,
  defId: string,
): {
  ok: boolean;
  reason: string;
  into: "army" | "garrison" | null;
} {
  if (!city) return { ok: false, reason: "", into: null };
  if (heroInCity && army) {
    const toArmy = canRecruit(session.state, army, city, defId);
    if (toArmy.ok) return { ok: true, reason: "", into: "army" };
    if (toArmy.reason === "Лимит отряда") {
      const toGar = canRecruitToGarrison(session.state, city, defId);
      return {
        ok: toGar.ok,
        reason: toGar.ok ? "" : toGar.reason,
        into: toGar.ok ? "garrison" : null,
      };
    }
    return { ok: false, reason: toArmy.reason, into: null };
  }
  const toGar = canRecruitToGarrison(session.state, city, defId);
  return {
    ok: toGar.ok,
    reason: toGar.ok ? "" : toGar.reason,
    into: toGar.ok ? "garrison" : null,
  };
}

export function renderRecruitTab(p: CityRecruitCtx): void {
  clearRecruitLayer(p);

  const roster = getRecruitRoster(p.city, playerFactionOf(session.state));
  const hint = p.heroInCity()
    ? "Наём в отряд (если полон — в гарнизон). Старшие чины — повышение во вкладке Гарнизон"
    : "Героя нет в городе — наём в гарнизон. Повышение — когда герой стоит в городе";
  p.content.add(
    p.scene.add
      .text(0, -195, hint, {
        fontFamily: CITY_INK.family,
        fontSize: "13px",
        color: DOSSIER.inkMuted,
      })
      .setOrigin(0.5),
  );

  spawnMissionaryCard(p, p.cx, p.cy + 16 - 130);

  if (roster.length === 0) {
    p.content.add(
      p.scene.add
        .text(0, 40, "Нет доступных рекрутов — нужны постройки", {
          fontFamily: CITY_INK.family,
          fontSize: "16px",
          color: DOSSIER.gold,
        })
        .setOrigin(0.5),
    );
    return;
  }

  const cols = 3;
  const cardW = 250;
  const cardH = 118;
  const gapX = 18;
  const gapY = 14;
  const originX = p.cx;
  const originY = p.cy + 16;

  roster.forEach((defId, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const lx = -((cols - 1) * (cardW + gapX)) / 2 + col * (cardW + gapX);
    const ly = -20 + row * (cardH + gapY);
    spawnRecruitCard(p, originX + lx, originY + ly, cardW, cardH, defId);
  });
}

function clearRecruitLayer(p: CityRecruitCtx): void {
  for (const obj of p.recruitLayer) obj.destroy();
  p.recruitLayer.length = 0;
  p.recruitSlots.length = 0;
}

function spawnMissionaryCard(p: CityRecruitCtx, sx: number, sy: number): void {
  const check = canHireMissionary(session.state);
  const ok = check.ok;
  const graves = session.state.graves?.length ?? 0;
  const w = 520;
  const h = 72;
  const faction = cityCulture(p.city);
  const bg = paintDossierCard(p.scene, sx, sy, w, h, { ok, faction, depth: 50 });
  const plate = spawnCityPhotoPlate(p.scene, sx - w / 2 + 40, sy, {
    defId: "missionary",
    faction,
    size: 56,
    depth: 51,
  });
  if (!ok) plate.setAlpha(0.45);
  const title = p.scene.add
    .text(sx + 12, sy - 14, formatMissionaryHire(), {
      fontFamily: CITY_INK.family,
      fontSize: "16px",
      color: ok ? DOSSIER.title : DOSSIER.inkDim,
    })
    .setOrigin(0.5)
    .setDepth(51)
    .setScrollFactor(0);
  const sub = p.scene.add
    .text(
      sx + 12,
      sy + 14,
      graves > 0
        ? `Подойти к могиле и воскресить (−${GRAVE_RESURRECT_COST.gold}з −${GRAVE_RESURRECT_COST.mana}м)`
        : "Идёт к могиле павшего отряда и воскрешает его",
      {
        fontFamily: CITY_INK.family,
        fontSize: "12px",
        color: ok ? DOSSIER.inkMuted : DOSSIER.inkDim,
      },
    )
    .setOrigin(0.5)
    .setDepth(51)
    .setScrollFactor(0);
  p.recruitLayer.push(bg, plate, title, sub);
  if (ok) {
    p.recruitSlots.push({
      defId: "__missionary__",
      left: sx - w / 2,
      top: sy - h / 2,
      right: sx + w / 2,
      bottom: sy + h / 2,
    });
  }
}

function spawnRecruitCard(
  p: CityRecruitCtx,
  sx: number,
  sy: number,
  w: number,
  h: number,
  defId: string,
): void {
  const def = UNIT_DEFS[defId];
  const check = recruitCheck(p.city, p.army, p.heroInCity(), defId);
  const ok = check.ok;
  const cost = def.recruitCost!;
  const manaPart = cost.mana ? ` · ${cost.mana}м` : "";
  const peoplePart = cost.people ? ` · ${cost.people}л` : "";
  const dest =
    check.into === "army"
      ? "В отряд"
      : check.into === "garrison"
        ? "В гарнизон"
        : check.reason || "Недоступно";
  const faction = cityCulture(p.city);

  const bg = paintDossierCard(p.scene, sx, sy, w, h, { ok, faction, depth: 50 });
  const plate = spawnCityPhotoPlate(p.scene, sx - w / 2 + 40, sy, {
    defId,
    faction: def.faction ?? faction,
    size: 72,
    depth: 51,
  });
  if (!ok) plate.setAlpha(0.42);

  const name = p.scene.add
    .text(sx - w / 2 + 84, sy - 38, def.name, {
      fontFamily: CITY_INK.family,
      fontSize: "17px",
      color: ok ? DOSSIER.title : DOSSIER.inkDim,
      stroke: "#120e0a",
      strokeThickness: 1,
    })
    .setOrigin(0, 0)
    .setDepth(51)
    .setScrollFactor(0);
  const price = p.scene.add
    .text(sx - w / 2 + 84, sy - 10, `${cost.gold}з${manaPart}${peoplePart}`, {
      fontFamily: CITY_INK.family,
      fontSize: "13px",
      color: ok ? DOSSIER.gold : DOSSIER.inkDim,
    })
    .setOrigin(0, 0)
    .setDepth(51)
    .setScrollFactor(0);
  const action = p.scene.add
    .text(sx - w / 2 + 84, sy + 18, dest, {
      fontFamily: CITY_INK.family,
      fontSize: "14px",
      color: ok ? DOSSIER.gold : DOSSIER.inkDim,
    })
    .setOrigin(0, 0)
    .setDepth(51)
    .setScrollFactor(0);

  p.recruitLayer.push(bg, plate, name, price, action);
  if (ok) {
    p.recruitSlots.push({
      defId,
      left: sx - w / 2,
      top: sy - h / 2,
      right: sx + w / 2,
      bottom: sy + h / 2,
    });
  }
}
