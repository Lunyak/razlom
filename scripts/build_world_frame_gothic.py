"""Build the full-window gothic HUD plate.

Source is a JPEG (checkerboard = portrait hole, black = map hole).
Output is a 2x 16:9 PNG so Phaser downsamples instead of upscaling 1024x560.
Holes are hard-cut (no Gaussian) so the silver oval frame stays intact.
"""
from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets" / "ui" / "ui_world_frame_gothic.png"
SRC_CANDIDATES = [
    ROOT / "assets" / "ui" / "world_frame_gothic_src.jpg",
    ROOT / "public" / "assets" / "ui" / "_gothic_src.jpg",
    Path(
        r"C:\Users\Lunyak-Rdp\AppData\Roaming\Cursor\User\workspaceStorage"
        r"\09a300ff39d9d8133daaf33cad5c713d\images"
        r"\Border 1-74900406-8734-4400-a1a5-9cbd6e92185e.jpg"
    ),
]

OUT_W, OUT_H = 2560, 1440
DESIGN_W, DESIGN_H = 1280, 720


def find_src() -> Path:
    for p in SRC_CANDIDATES:
        if p.is_file():
            return p
    raise FileNotFoundError("gothic frame source JPEG not found")


def flood_dark(lum: np.ndarray, seed: tuple[int, int], thr: float) -> np.ndarray:
    h, w = lum.shape
    sy, sx = seed
    vis = np.zeros((h, w), dtype=bool)
    q = deque([(sy, sx)])
    vis[sy, sx] = True
    while q:
        y, x = q.popleft()
        for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            ny, nx = y + dy, x + dx
            if ny < 0 or ny >= h or nx < 0 or nx >= w or vis[ny, nx]:
                continue
            if lum[ny, nx] <= thr:
                vis[ny, nx] = True
                q.append((ny, nx))
    return vis


def punch(arr: np.ndarray, hole: np.ndarray) -> None:
    arr[hole, 3] = 0
    arr[hole, :3] = 0


def main() -> None:
    src_path = find_src()
    src = Image.open(src_path).convert("RGB")
    print("src", src.size, src_path)

    plate = src.resize((OUT_W, OUT_H), Image.Resampling.LANCZOS)
    rgb = np.array(plate)
    lum = rgb.mean(axis=2)
    chroma = np.abs(rgb.astype(np.int16) - rgb.mean(axis=2, keepdims=True).astype(np.int16)).max(
        axis=2
    )
    h, w = lum.shape
    sx, sy = OUT_W / src.size[0], OUT_H / src.size[1]

    # Checkerboard circle inside the ornate oval (source ~ cx=66.5 cy=206 r=38).
    roi = np.zeros((h, w), dtype=bool)
    roi[int(90 * sy) : int(275 * sy), int(15 * sx) : int(130 * sx)] = True
    gray = chroma < 28
    light = roi & gray & (lum > 160)
    ys, xs = np.where(light)
    if xs.size < 200:
        raise RuntimeError(f"checkerboard not found ({xs.size} px)")
    cx = float(np.median(xs))
    cy = float(np.median(ys))
    dist = np.sqrt((xs - cx) ** 2 + (ys - cy) ** 2)
    r90 = float(np.percentile(dist, 90))
    r = min(max(r90, 36 * sx), 40 * sx)
    yy, xx = np.ogrid[:h, :w]
    circle = (xx - cx) ** 2 + (yy - cy) ** 2 <= r * r
    leftover = light & (((xx - cx) ** 2 + (yy - cy) ** 2) <= (r + 4 * sx) ** 2)

    # Map viewport: connected near-black from the island hole.
    map_hole = flood_dark(lum, (h // 2, int(w * 0.55)), thr=12)

    arr = np.dstack([rgb, np.full((h, w), 255, np.uint8)])
    punch(arr, circle | leftover | map_hole)
    out = Image.fromarray(arr, "RGBA")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    out.save(OUT, "PNG", compress_level=6)

    print(
        "portrait 1280",
        {
            "sideCx": round(cx * DESIGN_W / OUT_W),
            "portraitY": round(cy * DESIGN_H / OUT_H),
            "diameter": round(2 * r * DESIGN_W / OUT_W),
        },
    )
    print("portrait out", round(cx, 1), round(cy, 1), "r", round(r, 1))
    print("map hole frac", float(map_hole.mean()))
    print("circle px", int(circle.sum()), "leftover extra", int((leftover & ~circle).sum()))
    print("saved", OUT, OUT.stat().st_size, out.size)

    a = arr[:, :, 3]
    print("opaque%", round(100 * (a > 24).mean(), 1), "a0%", round(100 * (a == 0).mean(), 1))


if __name__ == "__main__":
    main()
