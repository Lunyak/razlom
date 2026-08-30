"""Key black→alpha on battle plates / skills; measure 2×3 cell UVs."""
from __future__ import annotations

import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(r"C:\Users\Lunyak-Rdp\Projects\disciples-like")
DUMP = Path(r"C:\Users\Lunyak-Rdp\.cursor\projects\c-Users-Lunyak-Rdp-Projects-disciples-like\assets")
STAGING = ROOT / "tmp-battle-art"
OUT = ROOT / "public" / "assets" / "ui"
SKILLS = OUT / "skills"
HOLE = 14


def find_dump(*needles: str) -> Path:
    hits: list[Path] = []
    for p in DUMP.iterdir():
        if not p.is_file():
            continue
        name = p.name.lower()
        if all(n.lower() in name for n in needles):
            hits.append(p)
    if not hits:
        raise FileNotFoundError(needles)
    hits.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return hits[0]


def load_rgba(path: Path) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA")).copy()


def is_hole(r: int, g: int, b: int, a: int) -> bool:
    if a < 16:
        return True
    return r <= HOLE and g <= HOLE and b <= HOLE


def flood(arr: np.ndarray, seeds: list[tuple[int, int]]) -> int:
    h, w = arr.shape[:2]
    seen = np.zeros((h, w), dtype=np.uint8)
    q: deque[tuple[int, int]] = deque()
    punched = 0
    for x, y in seeds:
        if 0 <= x < w and 0 <= y < h:
            q.append((x, y))
    while q:
        x, y = q.popleft()
        if x < 0 or y < 0 or x >= w or y >= h or seen[y, x]:
            continue
        seen[y, x] = 1
        r, g, b, a = (int(v) for v in arr[y, x])
        if not is_hole(r, g, b, a):
            continue
        if a != 0:
            arr[y, x, 3] = 0
            punched += 1
        q.append((x + 1, y))
        q.append((x - 1, y))
        q.append((x, y + 1))
        q.append((x, y - 1))
    return punched


def flood_corners(arr: np.ndarray) -> int:
    h, w = arr.shape[:2]
    return flood(arr, [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)])


def flood_center(arr: np.ndarray) -> int:
    h, w = arr.shape[:2]
    return flood(arr, [(w // 2, h // 2)])


def opaque_bbox(arr: np.ndarray, pad: int = 2) -> tuple[int, int, int, int] | None:
    a = arr[:, :, 3]
    ys, xs = np.where(a > 12)
    if xs.size == 0:
        return None
    h, w = a.shape
    x0 = max(0, int(xs.min()) - pad)
    y0 = max(0, int(ys.min()) - pad)
    x1 = min(w, int(xs.max()) + 1 + pad)
    y1 = min(h, int(ys.max()) + 1 + pad)
    return x0, y0, x1, y1


def crop(arr: np.ndarray) -> np.ndarray:
    box = opaque_bbox(arr)
    if not box:
        return arr
    x0, y0, x1, y1 = box
    return arr[y0:y1, x0:x1].copy()


def save(arr: np.ndarray, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(arr, "RGBA").save(dest, "PNG", optimize=True)
    print(f"  wrote {dest.name} {arr.shape[1]}x{arr.shape[0]}")


def detect_cells(arr: np.ndarray) -> list[dict[str, float]]:
    """Find six similar dark niches in a 2×3 iron grid."""
    h, w = arr.shape[:2]
    lum = (arr[:, :, 0].astype(np.int16) + arr[:, :, 1] + arr[:, :, 2]) / 3.0
    alpha = arr[:, :, 3]
    # Dark opaque interior (charcoal niches), not the keyed hole.
    dark = (alpha > 80) & (lum < 52)
    # Restrict search to the inner body of the plate (skip gold header/footer).
    y0, y1 = int(h * 0.18), int(h * 0.88)
    x0, x1 = int(w * 0.12), int(w * 0.88)
    region = np.zeros_like(dark)
    region[y0:y1, x0:x1] = dark[y0:y1, x0:x1]

    visited = np.zeros_like(region, dtype=np.uint8)
    blobs: list[tuple[int, int, int, int, int]] = []
    for y in range(y0, y1):
        xs = np.where(region[y] & (visited[y] == 0))[0]
        for x in xs:
            if visited[y, x]:
                continue
            q = deque([(int(x), int(y))])
            visited[y, x] = 1
            minx = maxx = int(x)
            miny = maxy = int(y)
            area = 0
            while q:
                cx, cy = q.popleft()
                area += 1
                if cx < minx:
                    minx = cx
                if cx > maxx:
                    maxx = cx
                if cy < miny:
                    miny = cy
                if cy > maxy:
                    maxy = cy
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if nx < 0 or ny < 0 or nx >= w or ny >= h:
                        continue
                    if visited[ny, nx] or not region[ny, nx]:
                        continue
                    visited[ny, nx] = 1
                    q.append((nx, ny))
            bw, bh = maxx - minx + 1, maxy - miny + 1
            if area < (w * h) * 0.012:
                continue
            aspect = bw / max(1, bh)
            if aspect < 0.55 or aspect > 1.7:
                continue
            fill = area / max(1, bw * bh)
            if fill < 0.45:
                continue
            blobs.append((area, minx, miny, bw, bh))

    blobs.sort(reverse=True)
    picked = blobs[:8]
    if len(picked) < 6:
        # Fallback: even 2×3 split of the search band.
        cells = []
        for row in range(3):
            for col in range(2):
                cw = (x1 - x0) / 2
                ch = (y1 - y0) / 3
                cells.append(
                    {
                        "x": (x0 + col * cw + cw * 0.08) / w,
                        "y": (y0 + row * ch + ch * 0.08) / h,
                        "w": (cw * 0.84) / w,
                        "h": (ch * 0.84) / h,
                    }
                )
        print("  fallback grid (detected", len(picked), "blobs)")
        return cells

    # Take 6 largest, sort into reading order (row-major: left-right, top-bottom).
    picked = sorted(picked[:6], key=lambda b: (b[2] + b[4] / 2, b[1] + b[3] / 2))
    cells = []
    for _, x, y, bw, bh in picked:
        inset = 0.04
        cells.append(
            {
                "x": (x + bw * inset) / w,
                "y": (y + bh * inset) / h,
                "w": (bw * (1 - inset * 2)) / w,
                "h": (bh * (1 - inset * 2)) / h,
            }
        )
    return cells


def punch_cell_interiors(arr: np.ndarray, cells: list[dict[str, float]]) -> None:
    h, w = arr.shape[:2]
    for cell in cells:
        x0 = int(cell["x"] * w + cell["w"] * w * 0.06)
        y0 = int(cell["y"] * h + cell["h"] * h * 0.06)
        x1 = int(cell["x"] * w + cell["w"] * w * 0.94)
        y1 = int(cell["y"] * h + cell["h"] * h * 0.94)
        cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
        flood(arr, [(cx, cy)])
        # Charcoal niches that are not near-black: punch a slightly inset rect,
        # but only pixels darker than the iron bars.
        lum = (arr[y0:y1, x0:x1, 0].astype(np.int16) + arr[y0:y1, x0:x1, 1] + arr[y0:y1, x0:x1, 2]) / 3.0
        dark = lum < 70
        arr[y0:y1, x0:x1, 3] = np.where(dark, 0, arr[y0:y1, x0:x1, 3])


def crop_slot(arr: np.ndarray, cells: list[dict[str, float]]) -> np.ndarray:
    """First cell plus iron border — turn-strip frame until dedicated art arrives."""
    h, w = arr.shape[:2]
    # cells are row-major; pick top-left.
    cell = min(cells, key=lambda c: (c["y"], c["x"]))
    pad_x = cell["w"] * 0.22
    pad_y = cell["h"] * 0.22
    x0 = max(0, int((cell["x"] - pad_x) * w))
    y0 = max(0, int((cell["y"] - pad_y) * h))
    x1 = min(w, int((cell["x"] + cell["w"] + pad_x) * w))
    y1 = min(h, int((cell["y"] + cell["h"] + pad_y) * h))
    return arr[y0:y1, x0:x1].copy()


def inner_circle(arr: np.ndarray) -> dict[str, float]:
    """Largest transparent disc at the center of a ring."""
    h, w = arr.shape[:2]
    cx, cy = w / 2, h / 2
    a = arr[:, :, 3]
    # Walk inward from mid-radius until we hit metal, then the hole.
    r_max = min(w, h) / 2
    hole_r = 0.0
    for r in range(int(r_max * 0.15), int(r_max * 0.92)):
        opaque = 0
        samples = 48
        for i in range(samples):
            ang = (i / samples) * 2 * np.pi
            x = int(cx + np.cos(ang) * r)
            y = int(cy + np.sin(ang) * r)
            if 0 <= x < w and 0 <= y < h and a[y, x] > 24:
                opaque += 1
        if opaque / samples > 0.55:
            break
        hole_r = r
    return {"cx": cx / w, "cy": cy / h, "r": hole_r / min(w, h)}


def process_plate(src: Path, dest: Path, slot_dest: Path | None = None) -> list[dict[str, float]]:
    print("plate", src.name)
    arr = load_rgba(src)
    n = flood_corners(arr)
    print(f"  corner punch {n}")
    arr = crop(arr)
    cells = detect_cells(arr)
    punch_cell_interiors(arr, cells)
    arr = crop(arr)
    cells = detect_cells(arr)
    save(arr, dest)
    print("  cells", json.dumps(cells, indent=2))
    if slot_dest is not None and cells:
        slot = crop_slot(arr, cells)
        save(slot, slot_dest)
    return cells


def process_ring(src: Path, dest: Path) -> dict[str, float]:
    print("ring", src.name)
    arr = load_rgba(src)
    print("  corner", flood_corners(arr), "center", flood_center(arr))
    arr = crop(arr)
    save(arr, dest)
    hole = inner_circle(arr)
    print("  hole", hole, "size", arr.shape[1], arr.shape[0])
    return hole


def process_skill(src: Path, dest: Path) -> None:
    print("skill", src.name, "->", dest.name)
    arr = load_rgba(src)
    print("  corner punch", flood_corners(arr))
    arr = crop(arr)
    # Keep a square canvas so HUD icons don't squash.
    h, w = arr.shape[:2]
    side = max(w, h)
    canvas = np.zeros((side, side, 4), dtype=np.uint8)
    ox, oy = (side - w) // 2, (side - h) // 2
    canvas[oy : oy + h, ox : ox + w] = arr
    out = Image.fromarray(canvas, "RGBA").resize((256, 256), Image.Resampling.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    out.save(dest, "PNG", optimize=True)
    print(f"  wrote {dest.name} 256x256")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    SKILLS.mkdir(parents=True, exist_ok=True)

    ri = STAGING / "formation_ri.jpg"
    ordo = STAGING / "formation_ordo.jpg"
    thorn = STAGING / "focus_thorn.png"
    heal = STAGING / "skill_heal_src.png"
    meteor = STAGING / "skill_meteor_src.png"

    cells_ri = process_plate(ri, OUT / "battle_formation_ri.png", OUT / "battle_slot_iron.png")
    cells_ordo = process_plate(ordo, OUT / "battle_formation_ordo.png")
    hole = process_ring(thorn, OUT / "combat_focus_frame.png")

    process_skill(heal, SKILLS / "skill_heal.png")
    process_skill(meteor, SKILLS / "skill_meteor.png")
    process_skill(STAGING / "skill_holy_strike.png", SKILLS / "skill_holy_strike.png")
    process_skill(STAGING / "skill_lightning.png", SKILLS / "skill_lightning.png")
    process_skill(STAGING / "skill_battle_cry.png", SKILLS / "skill_battle_cry.png")
    process_skill(STAGING / "skill_focus.png", SKILLS / "skill_focus.png")

    meta = {
        "ri": {"file": "battle_formation_ri.png", "cells": cells_ri},
        "ordo": {"file": "battle_formation_ordo.png", "cells": cells_ordo},
        "focus": {"file": "combat_focus_frame.png", **hole},
    }
    meta_path = ROOT / "src" / "ui" / "battlePlateMeta.json"
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print("meta", meta_path)


if __name__ == "__main__":
    main()
