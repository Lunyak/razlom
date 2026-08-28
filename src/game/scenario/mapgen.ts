import type { Terrain } from "../world";

export function createBlankMap(cols: number, rows: number, fill: Terrain = "grass"): Terrain[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => fill));
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
    if (current === "water" || current === "road") continue;
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
