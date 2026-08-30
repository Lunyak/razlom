import type { Terrain } from "../world";

const BLOCKED_STAMP: Terrain[] = ["water", "road", "mountain", "mountain_foot", "ditch", "trench"];

export function createBlankMap(cols: number, rows: number, fill: Terrain = "grass"): Terrain[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill));
}

export function inBounds(cols: number, rows: number, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < cols && y < rows;
}

export function stampTerrain(
  map: Terrain[][],
  cols: number,
  rows: number,
  cells: Iterable<[number, number]>,
  terrain: Terrain,
  skip: readonly Terrain[] = BLOCKED_STAMP,
): void {
  for (const [x, y] of cells) {
    if (!inBounds(cols, rows, x, y)) continue;
    if (skip.includes(map[y][x])) continue;
    map[y][x] = terrain;
  }
}

export function stampDisk(
  map: Terrain[][],
  cols: number,
  rows: number,
  cx: number,
  cy: number,
  radius: number,
  terrain: Terrain,
  skip: readonly Terrain[] = BLOCKED_STAMP,
): void {
  const cells: [number, number][] = [];
  for (let y = cy - radius; y <= cy + radius; y++) {
    for (let x = cx - radius; x <= cx + radius; x++) {
      if (Math.abs(x - cx) + Math.abs(y - cy) <= radius) cells.push([x, y]);
    }
  }
  stampTerrain(map, cols, rows, cells, terrain, skip);
}

export function stampPolyline(
  map: Terrain[][],
  cols: number,
  rows: number,
  points: [number, number][],
  terrain: Terrain,
  skip: readonly Terrain[] = [],
): void {
  const cells: [number, number][] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let s = 0; s <= steps; s++) {
      const t = steps === 0 ? 0 : s / steps;
      cells.push([Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t)]);
    }
  }
  stampTerrain(map, cols, rows, cells, terrain, skip);
}

export function stampMountains(
  map: Terrain[][],
  cols: number,
  rows: number,
  cells: [number, number][],
): void {
  for (const [x, y] of cells) {
    if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
    const current = map[y][x];
    if (current === "water" || current === "road" || current === "ditch" || current === "trench") continue;
    map[y][x] = "mountain";
  }
}

export function addMountainFoothills(map: Terrain[][], cols: number, rows: number): Terrain[][] {
  const next = map.map((row) => [...row]);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      if (map[y][x] !== "mountain") continue;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const neighbor = map[ny][nx];
        if (neighbor === "grass" || neighbor === "forest") {
          next[ny][nx] = "mountain_foot";
        }
      }
    }
  }
  return next;
}
