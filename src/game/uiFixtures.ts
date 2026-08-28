import { livingUnits, session, type Army, type City } from "./data";
import { ensureArtifactStash } from "./artifacts";
import { bootstrapSession } from "./session";
import type { Terrain } from "./world";

/** Seed session for UI panel gallery / previews. */
export function seedPanelGallerySession(): { army: Army | undefined; city: City | undefined } {
  bootstrapSession("part1-1914");
  session.state.gold = 2400;
  session.state.mana = 48;
  session.state.people = 120;
  session.state.coal = 40;
  session.state.steel = 18;
  session.state.turn = 1;
  session.state.lastMessage = "Галерея панелей — переключайте вкладки сверху.";
  ensureArtifactStash(session.state);
  session.state.inventory = { ...session.state.inventory, heal: 3 };

  const army = session.state.armies.find((a) => a.isPlayer && livingUnits(a).length > 0);
  const city =
    session.state.cities.find((c) => c.faction === "ri" && c.isCapital) ??
    session.state.cities.find((c) => c.faction === "ri") ??
    session.state.cities[0];

  if (army && city) {
    army.movesLeft = 3;
    army.x = city.x;
    army.y = city.y;
    army.mapId = city.mapId;
  } else if (army) {
    army.movesLeft = 3;
    army.x = 4;
    army.y = 5;
  }

  if (city && city.buildings.length === 0) {
    city.buildings = ["barracks", "archery_range", "temple"];
  }

  return { army, city };
}

export function mockMinimapGrid(cols = 12, rows = 8): {
  map: Terrain[][];
  fog: boolean[][];
  visible: boolean[][];
  cols: number;
  rows: number;
} {
  const map: Terrain[][] = [];
  const fog: boolean[][] = [];
  const visible: boolean[][] = [];
  for (let y = 0; y < rows; y++) {
    map[y] = [];
    fog[y] = [];
    visible[y] = [];
    for (let x = 0; x < cols; x++) {
      map[y][x] = x === 0 || y === 0 || x === cols - 1 || y === rows - 1 ? "road" : "grass";
      fog[y][x] = true;
      visible[y][x] = true;
    }
  }
  return { map, fog, visible, cols, rows };
}
