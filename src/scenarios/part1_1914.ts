import { addMountainFoothills, createBlankMap, stampMountains } from "../game/scenario/mapgen";
import type { PlotSequence } from "../game/scenario/plot";
import type { CampaignDef, MapDef, ScenarioDef } from "../game/scenario/types";

const FRONTIER_COLS = 32;
const FRONTIER_ROWS = 20;

function buildFrontierTerrain() {
  const cols = FRONTIER_COLS;
  const rows = FRONTIER_ROWS;
  const midY = Math.floor(rows / 2);
  const map = createBlankMap(cols, rows, "grass");
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if ((x + y) % 7 === 0) map[y][x] = "forest";
      if (y === midY && x >= 3 && x <= cols - 4) map[y][x] = "road";
      if (x >= 7 && x <= 9 && y >= 2 && y <= 4) map[y][x] = "water";
    }
  }
  stampMountains(map, cols, rows, [
    [16, 0], [17, 0], [18, 0], [19, 0],
    [15, 1], [16, 1], [17, 1], [18, 1], [19, 1],
    [16, 2], [17, 2], [18, 2], [17, 3],
  ]);
  stampMountains(map, cols, rows, [
    [0, 5], [0, 6], [0, 7], [1, 5], [1, 6], [1, 7], [0, 8], [1, 8],
  ]);
  stampMountains(map, cols, rows, [
    [14, 10], [15, 10], [16, 10], [15, 11], [16, 11], [16, 12],
  ]);
  return addMountainFoothills(map, cols, rows);
}

function buildRearTerrain() {
  const cols = 16;
  const rows = 12;
  const map = createBlankMap(cols, rows, "grass");
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if ((x + y) % 5 === 0) map[y][x] = "forest";
      if (y === 6 && x >= 1 && x <= cols - 2) map[y][x] = "road";
    }
  }
  stampMountains(map, cols, rows, [
    [0, 0], [1, 0], [0, 1],
    [14, 10], [15, 10], [15, 11],
  ]);
  return addMountainFoothills(map, cols, rows);
}

const frontierMap: MapDef = {
  id: "frontier",
  name: "Западный фронт",
  cols: FRONTIER_COLS,
  rows: FRONTIER_ROWS,
  buildTerrain: buildFrontierTerrain,
  brief:
    "Главное: возьмите Цитадель Януса — столицу Ordo Lumen на фронте. По пути можно привлечь или подчинить степь (Станица Донская) и горы (Аул Кавказа) — это не ломает победу, но даёт силу.",
  win: { type: "capture_capital", faction: "ordo" },
  cities: [
    {
      id: "c1",
      name: "Цареград",
      x: 4,
      y: 5,
      faction: "ri",
      isCapital: true,
      income: { gold: 25, mana: 5, people: 4 },
    },
    {
      id: "c3",
      name: "Орловский Брод",
      x: 9,
      y: 8,
      faction: null,
      isCapital: false,
      income: { gold: 18, mana: 4, people: 3 },
    },
    {
      id: "c2",
      name: "Цитадель Януса",
      x: 15,
      y: 8,
      faction: "ordo",
      isCapital: true,
      income: { gold: 25, mana: 8, people: 2 },
    },
    {
      id: "c_stanitsa",
      name: "Станица Донская",
      x: 2,
      y: 14,
      faction: "cossack",
      isCapital: false,
      income: { gold: 14, mana: 2, people: 3 },
      buildings: ["stanitsa"],
    },
    {
      id: "c_aul",
      name: "Аул Кавказа",
      x: 22,
      y: 3,
      faction: "highlander",
      isCapital: false,
      income: { gold: 12, mana: 3, people: 2 },
      buildings: ["aul"],
    },
  ],
  sites: [
    { id: "s_ruins", kind: "ruins", x: 7, y: 7 },
    { id: "s_mine", kind: "gold_mine", x: 11, y: 2 },
    { id: "s_coal", kind: "coal_mine", x: 19, y: 6 },
    { id: "s_steel", kind: "steel_works", x: 10, y: 13 },
    { id: "s_shrine", kind: "mana_shrine", x: 6, y: 4 },
    { id: "s_treasure", kind: "treasure", x: 14, y: 7 },
  ],
  armies: [
    {
      id: "player",
      faction: "ri",
      name: "Гвардия Волкова",
      x: 5,
      y: 6,
      isPlayer: true,
      movesLeft: 3,
      hero: { name: "Волков", level: 1, xp: 0, xpToNext: 100, classId: "officer" },
      unitDefIds: ["squire", "archer", "acolyte"],
    },
    {
      id: "enemy1",
      faction: "ordo",
      name: "Колонна Ordo Lumen",
      x: 10,
      y: 6,
      isPlayer: false,
      movesLeft: 2,
      hero: { name: "фон Шталь", level: 1, xp: 0, xpToNext: 100 },
      unitDefIds: ["zombie", "ghost", "initiate"],
    },
    {
      id: "enemy2",
      faction: "ordo",
      name: "Австрийский корпус",
      x: 13,
      y: 9,
      isPlayer: false,
      movesLeft: 2,
      hero: { name: "фон Лихт", level: 1, xp: 0, xpToNext: 100 },
      unitDefIds: ["zombie", "skeleton"],
    },
    {
      id: "neutral_wolves",
      faction: "neutral",
      name: "Стая волков",
      x: 8,
      y: 2,
      isPlayer: false,
      isNeutral: true,
      movesLeft: 0,
      hero: { name: "", level: 1, xp: 0, xpToNext: 100 },
      unitDefIds: ["wolf", "wolf", "wolf"],
    },
    {
      id: "neutral_bandits",
      faction: "neutral",
      name: "Банда батьки",
      x: 12,
      y: 4,
      isPlayer: false,
      isNeutral: true,
      movesLeft: 0,
      hero: { name: "", level: 1, xp: 0, xpToNext: 100 },
      unitDefIds: ["bandit", "bandit"],
    },
    {
      id: "cossack_patrol",
      faction: "cossack",
      name: "Сотня Донская",
      x: 3,
      y: 13,
      isPlayer: false,
      movesLeft: 2,
      hero: { name: "Атаман Седой", level: 1, xp: 0, xpToNext: 100, classId: "officer" },
      unitDefIds: ["cossack_plastun", "cossack_shooter"],
    },
    {
      id: "highlander_patrol",
      faction: "highlander",
      name: "Отряд абреков",
      x: 21,
      y: 4,
      isPlayer: false,
      movesLeft: 2,
      hero: { name: "Князь гор", level: 1, xp: 0, xpToNext: 100, classId: "scout" },
      unitDefIds: ["highlander_dzhigit", "highlander_archer"],
    },
  ],
};

const rearMap: MapDef = {
  id: "rear",
  name: "Тыл Империи",
  cols: 16,
  rows: 12,
  buildTerrain: buildRearTerrain,
  brief: "Тыл открыт. Зачистите враждебные отряды в тылу.",
  win: { type: "eliminate_enemies" },
  entry: { x: 5, y: 6 },
  cities: [
    {
      id: "c_rear",
      name: "Складской Посад",
      x: 4,
      y: 5,
      faction: "ri",
      isCapital: false,
      income: { gold: 12, mana: 2, people: 2 },
    },
  ],
  sites: [
    { id: "s_rear_mine", kind: "gold_mine", x: 8, y: 3 },
    { id: "s_rear_coal", kind: "coal_mine", x: 3, y: 2 },
    { id: "s_rear_steel", kind: "steel_works", x: 13, y: 4 },
    { id: "s_rear_shrine", kind: "mana_shrine", x: 10, y: 8 },
  ],
  armies: [
    {
      id: "neutral_ogre",
      faction: "neutral",
      name: "Огр-шатун",
      x: 12,
      y: 9,
      isPlayer: false,
      isNeutral: true,
      movesLeft: 0,
      hero: { name: "", level: 1, xp: 0, xpToNext: 100 },
      unitDefIds: ["ogre", "wolf"],
    },
  ],
};

/** Plot beats: Janus remains the win; steppe & mountains are optional side arcs. */
const plot1914Frontier: PlotSequence[] = [
  {
    id: "1914_frontier_start",
    name: "Наказ на фронт",
    mapId: "frontier",
    trigger: { type: "map_start" },
    steps: [
      {
        type: "title",
        title: "Западный фронт · 1914",
        text: "Мир на чужих условиях. Ordo Lumen уже чертит Pax поверх губерний.",
      },
      {
        type: "narration",
        text: "Ставка требует одного: Цитадель Януса. Пока колонны Lumen стоят на фронте, ковчег-страна трещит по швам.",
      },
      {
        type: "dialogue",
        speaker: "Волков",
        text: "Приказ ясен. Столица Януса — наша цель. Степь и горы — не приказ, а возможность: казачья станица на юге, аул в отрогах. Союз или сила — решите сами, но Януса не оставляйте.",
        portrait: "hero_ri",
        faction: "ri",
      },
      { type: "camera", x: 15, y: 8 },
      {
        type: "message",
        text: "Цель: Цитадель Януса. Побочно: Станица Донская, Аул Кавказа.",
      },
    ],
  },
  {
    id: "1914_stanitsa_approach",
    name: "Дым станицы",
    mapId: "frontier",
    trigger: { type: "tile", x: 3, y: 12 },
    steps: [
      { type: "camera", x: 2, y: 14 },
      {
        type: "title",
        title: "Станица Донская",
        text: "На южном краю фронта дымят курени. Шашки звенят не по приказу из столицы.",
      },
      {
        type: "narration",
        text: "Казаки держат свою землю. Ordo Lumen для них — чужой молот; Империя — старый долг, не всегда оплаченный.",
      },
      {
        type: "dialogue",
        speaker: "Волков",
        text: "Сотня на виду. Можно договориться — или взять станицу силой. Главное не забыть Януса, пока мы торгуемся с атаманом.",
        portrait: "hero_ri",
        faction: "ri",
      },
      {
        type: "dialogue",
        speaker: "Атаман Седой",
        text: "Гвардия пришла на чужой круг. Скажите прямо: вы за волю станиц — или за перепись и наряд?",
        portrait: "hero_cossack",
        faction: "cossack",
      },
      {
        type: "message",
        text: "Обнаружена Станица Донская. Захват сохранит казачий найм.",
      },
    ],
  },
  {
    id: "1914_stanitsa_captured",
    name: "Круг при Империи",
    mapId: "frontier",
    trigger: { type: "city_captured", cityId: "c_stanitsa" },
    steps: [
      { type: "camera", x: 2, y: 14 },
      {
        type: "title",
        title: "Станица под знаменем",
        text: "Донская принята. Степь не сдалась — она вошла в строй на своих условиях.",
      },
      {
        type: "dialogue",
        speaker: "Атаман Седой",
        text: "Будет сотня. Будет шашка. Только помните: казак служит кругу и земле. Янус — ваш враг; чужая перепись — наш.",
        portrait: "hero_cossack",
        faction: "cossack",
      },
      {
        type: "dialogue",
        speaker: "Волков",
        text: "Принято. Степь с нами — пока держим фронт. Дальше — Цитадель.",
        portrait: "hero_ri",
        faction: "ri",
      },
      { type: "grant", gold: 40, people: 2 },
      {
        type: "message",
        text: "Станица Донская под контролем. Казачий найм доступен.",
      },
    ],
  },
  {
    id: "1914_aul_approach",
    name: "Тропа к аулу",
    mapId: "frontier",
    trigger: { type: "tile", x: 19, y: 4 },
    steps: [
      { type: "camera", x: 22, y: 3 },
      {
        type: "title",
        title: "Аул Кавказа",
        text: "В отрогах — каменные дворы и чужая честь. Здесь закон горы старше приказа.",
      },
      {
        type: "narration",
        text: "Горцы не солдаты чужого Pax и не казачий круг. Для них война — кровный счёт и твердыня, а не карта штаба.",
      },
      {
        type: "dialogue",
        speaker: "Волков",
        text: "Абреки на тропе. Можно куначеством — можно клинком. Янус не ждёт, пока мы считаем обиды в горах.",
        portrait: "hero_ri",
        faction: "ri",
      },
      {
        type: "dialogue",
        speaker: "Князь гор",
        text: "Империя приходит с низин. Ordo — с чужим светом. Скажите, за чью гору вы стоите — и чего стоите сами.",
        portrait: "hero_highlander",
        faction: "highlander",
      },
      {
        type: "message",
        text: "Обнаружен Аул Кавказа. Захват сохранит горский найм.",
      },
    ],
  },
  {
    id: "1914_aul_captured",
    name: "Клятва твердыни",
    mapId: "frontier",
    trigger: { type: "city_captured", cityId: "c_aul" },
    steps: [
      { type: "camera", x: 22, y: 3 },
      {
        type: "title",
        title: "Аул под щитом",
        text: "Кавказская твердыня принята. Гора не сдалась — она встала рядом.",
      },
      {
        type: "dialogue",
        speaker: "Князь гор",
        text: "Джигиты пойдут. Но честь горы не продаётся за мундир. Бейте Януса — и не трогайте кровный закон.",
        portrait: "hero_highlander",
        faction: "highlander",
      },
      {
        type: "dialogue",
        speaker: "Волков",
        text: "Договор ясен. Горы с нами на этом фронте. Цель прежняя — Цитадель Януса.",
        portrait: "hero_ri",
        faction: "ri",
      },
      { type: "grant", gold: 35, mana: 5 },
      {
        type: "message",
        text: "Аул Кавказа под контролем. Горский найм доступен.",
      },
    ],
  },
  {
    id: "1914_janus_captured",
    name: "Падение Януса",
    mapId: "frontier",
    trigger: { type: "city_captured", cityId: "c2" },
    steps: [
      { type: "camera", x: 15, y: 8 },
      {
        type: "title",
        title: "Цитадель пала",
        text: "Столица Ordo Lumen на фронте взята. Pax отступает — но не кончается.",
      },
      {
        type: "dialogue",
        speaker: "Волков",
        text: "Янус молчит. Степь и горы, если шли с нами, — пусть знают: Империя ещё держит ковчег.",
        portrait: "hero_ri",
        faction: "ri",
      },
      {
        type: "message",
        text: "Цитадель Януса захвачена. Фронт пройден.",
      },
    ],
  },
  {
    id: "1914_frontier_win",
    name: "К тылу",
    mapId: "frontier",
    trigger: { type: "map_win" },
    steps: [
      {
        type: "narration",
        text: "Фронт закрыт. Ставка зовёт в тыл: там уже бродят чужие отряды, пока гвардия била Януса.",
      },
      {
        type: "message",
        text: "Миссия «Западный фронт» завершена. Далее — Тыл Империи.",
      },
    ],
  },
  {
    id: "1914_rear_start",
    name: "Тыл открыт",
    mapId: "rear",
    trigger: { type: "map_start" },
    steps: [
      {
        type: "title",
        title: "Тыл Империи",
        text: "Пока брали Януса, в тылу поднялась чужая тень.",
      },
      {
        type: "dialogue",
        speaker: "Волков",
        text: "Зачистить враждебные отряды. Степь и горы остались на фронте — здесь работа гвардии.",
        portrait: "hero_ri",
        faction: "ri",
      },
      {
        type: "message",
        text: "Цель: уничтожить враждебные силы в тылу.",
      },
    ],
  },
];

/** First playable scenario of Part I (1914). */
export const scenario1914Frontier: ScenarioDef = {
  id: "1914-frontier",
  name: "Западный фронт · 1914",
  eraId: "part1-1914",
  description:
    "Цепочка миссий: фронт → тыл. Победа на карте открывает следующую.",
  brief:
    "1914. Мир на чужих условиях. Возьмите Цитадель Януса; по желанию привлеките степь и горы.",
  maps: [frontierMap, rearMap],
  startMapId: "frontier",
  startingResources: { gold: 9999, mana: 200, people: 99, coal: 24, steel: 12 },
  playerFaction: "ri",
  win: { type: "eliminate_enemies" },
  plot: plot1914Frontier,
};

export const campaignPart1: CampaignDef = {
  id: "part1-1914",
  name: "Разлом · Часть I",
  description: "1914 → 1917. Цепочка сценариев и карт-миссий.",
  scenarioIds: ["1914-frontier", "1917-fracture"],
};
