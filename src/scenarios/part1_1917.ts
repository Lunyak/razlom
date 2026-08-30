import { addMountainFoothills, createBlankMap, stampMountains, stampPolyline } from "../game/scenario/mapgen";
import type { PlotSequence } from "../game/scenario/plot";
import type { MapDef, ScenarioDef } from "../game/scenario/types";

const COLS = 20;
const ROWS = 14;

function buildFractureTerrain() {
  const map = createBlankMap(COLS, ROWS, "grass");
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if ((x * 3 + y) % 6 === 0) map[y][x] = "forest";
      if (y === 7 && x >= 2 && x <= COLS - 3) map[y][x] = "road";
      if (x >= 9 && x <= 11 && y >= 3 && y <= 5) map[y][x] = "water";
    }
  }
  stampPolyline(map, COLS, ROWS, [
    [3, 4],
    [5, 5],
    [7, 6],
    [8, 8],
    [10, 9],
    [12, 9],
    [14, 8],
    [16, 7],
  ], "trench", ["road", "water", "mountain"]);
  stampPolyline(map, COLS, ROWS, [
    [4, 9],
    [6, 10],
    [8, 11],
    [11, 11],
    [13, 10],
  ], "ditch", ["road", "water", "mountain", "trench"]);
  stampMountains(map, COLS, ROWS, [
    [0, 0], [1, 0], [0, 1],
    [18, 12], [19, 12], [19, 13],
    [10, 10], [11, 10], [11, 11],
  ]);
  return addMountainFoothills(map, COLS, ROWS);
}

const fractureMap: MapDef = {
  id: "fracture",
  name: "Разлом губернии",
  cols: COLS,
  rows: ROWS,
  buildTerrain: buildFractureTerrain,
  brief:
    "1917. Империя трещит. Главное: выбейте штаб Рейха (Ordo Lumen) из губернии. Вести со степи и гор — отголосок 1914-го, не отдельная победа.",
  win: { type: "capture_capital", faction: "ordo" },
  entry: { x: 3, y: 8 },
  cities: [
    {
      id: "c_gov",
      name: "Губернский посад",
      x: 4,
      y: 7,
      faction: "ri",
      isCapital: true,
      income: { gold: 22, mana: 4, people: 3 },
    },
    {
      id: "c_ordo_hq",
      name: "Штаб Рейха",
      x: 15,
      y: 6,
      faction: "ordo",
      isCapital: true,
      income: { gold: 20, mana: 6, people: 1 },
    },
    {
      id: "c_market",
      name: "Ярмарочный",
      x: 9,
      y: 9,
      faction: null,
      isCapital: false,
      income: { gold: 14, mana: 2, people: 2 },
    },
  ],
  sites: [
    { id: "s17_mine", kind: "gold_mine", x: 6, y: 3 },
    { id: "s17_coal", kind: "coal_mine", x: 3, y: 5 },
    { id: "s17_steel", kind: "steel_works", x: 15, y: 9 },
    { id: "s17_shrine", kind: "mana_shrine", x: 12, y: 4 },
    { id: "s17_ruins", kind: "ruins", x: 8, y: 11 },
  ],
  armies: [
    {
      id: "player_1917",
      faction: "ri",
      name: "Гвардия Волкова",
      x: 5,
      y: 8,
      isPlayer: true,
      movesLeft: 3,
      hero: { name: "Волков", level: 2, xp: 40, xpToNext: 120 },
      unitDefIds: ["squire", "archer", "knight"],
    },
    {
      id: "player_night",
      faction: "ri",
      name: "Скит Арсения",
      x: 4,
      y: 7,
      isPlayer: true,
      isNightHero: true,
      movesLeft: 0,
      hero: { name: "Арсений", level: 1, xp: 0, xpToNext: 100, classId: "priest" },
      unitDefIds: ["incorrupt"],
    },
    {
      id: "ordo_patrol",
      faction: "ordo",
      name: "Колонна корректоров",
      x: 12,
      y: 7,
      isPlayer: false,
      movesLeft: 2,
      hero: { name: "фон Гласс", level: 2, xp: 0, xpToNext: 100 },
      unitDefIds: ["zombie", "ghost", "initiate"],
    },
    {
      id: "ordo_hq_guard",
      faction: "ordo",
      name: "Стража штаба",
      x: 14,
      y: 6,
      isPlayer: false,
      movesLeft: 2,
      hero: { name: "Майор Lumen", level: 2, xp: 0, xpToNext: 100 },
      unitDefIds: ["skeleton", "zombie", "banshee"],
    },
    {
      id: "neutral_band",
      faction: "neutral",
      name: "Дезертиры",
      x: 10,
      y: 2,
      isPlayer: false,
      isNeutral: true,
      movesLeft: 0,
      hero: { name: "", level: 1, xp: 0, xpToNext: 100 },
      unitDefIds: ["bandit", "bandit", "wolf"],
      veil: "both",
    },
    {
      id: "neutral_memory_1917",
      faction: "neutral",
      name: "Хор Памяти",
      x: 9,
      y: 11,
      isPlayer: false,
      isNeutral: true,
      movesLeft: 0,
      hero: { name: "", level: 1, xp: 0, xpToNext: 100 },
      unitDefIds: ["ghost", "banshee"],
      veil: "night",
    },
  ],
};

/** Echoes of 1914 frontiers; win remains Ordo HQ. */
const plot1917Fracture: PlotSequence[] = [
  {
    id: "1917_fracture_start",
    name: "Разлом губернии",
    mapId: "fracture",
    trigger: { type: "map_start" },
    steps: [
      {
        type: "title",
        title: "Разлом · 1917",
        text: "Империя трещит. Ordo Lumen ставит штаб Рейха прямо в губернии.",
      },
      {
        type: "narration",
        text: "С фронта 1914-го доходят отголоски: станицы и аулы помнят гвардию — кто союз, кто обиду. Здесь же счёт один: выбить штаб.",
      },
      {
        type: "dialogue",
        speaker: "Волков",
        text: "Штаб Рейха — цель. Степь и горы ждут вестей с губернии, но победа здесь — взятие штаба, не чужой круг.",
        portrait: "hero_ri",
        faction: "ri",
      },
      { type: "camera", x: 15, y: 6 },
      {
        type: "message",
        text: "Цель: Штаб Рейха. Разлом уже начался.",
      },
    ],
  },
  {
    id: "1917_pax_fallen",
    name: "Штаб пал",
    mapId: "fracture",
    trigger: { type: "city_captured", cityId: "c_ordo_hq" },
    steps: [
      { type: "camera", x: 15, y: 6 },
      {
        type: "title",
        title: "Рейх сбит",
        text: "Штаб Ordo Lumen в губернии взят. Свет Януса меркнет — на время.",
      },
      {
        type: "dialogue",
        speaker: "Волков",
        text: "Передайте на Дон и в горы: губерния ещё дышит. Дальше будет хуже — Разлом не кончается одним штабом.",
        portrait: "hero_ri",
        faction: "ri",
      },
      {
        type: "message",
        text: "Штаб Рейха захвачен. Сценарий «Разлом · 1917» близок к победе.",
      },
    ],
  },
];

/** Second scenario of Part I — 1917 fracture. */
export const scenario1917Fracture: ScenarioDef = {
  id: "1917-fracture",
  name: "Разлом · 1917",
  eraId: "part1-1914",
  description: "Империя рушится. Ordo Lumen укрепляет Рейх в губернии.",
  brief:
    "1917. Выбейте Штаб Рейха из губернии. Степь и горы — память фронта, не условие победы.",
  maps: [fractureMap],
  startMapId: "fracture",
  startingResources: { gold: 9999, mana: 200, people: 99, coal: 24, steel: 12 },
  playerFaction: "ri",
  win: { type: "capture_capital", faction: "ordo" },
  plot: plot1917Fracture,
};
