"""Rebuild glass_frame_border.png: square window, compact height, no white margins."""
from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

UI = Path(__file__).resolve().parents[1] / "public" / "assets" / "ui"
WINDOW_PAD = 36


def largest_trans_run(alpha: np.ndarray) -> tuple[int, int, int]:
    best = (0, 0, 0)
    i = 0
    while i < len(alpha):
        if alpha[i] >= 20:
            i += 1
            continue
        j = i
        while j < len(alpha) and alpha[j] < 20:
            j += 1
        if j - i > best[2]:
            best = (i, j - 1, j - i)
        i = j
    return best


def main() -> None:
    src = UI / "glass_frame_vintage.png"
    out = UI / "glass_frame_border.png"
    square = UI / "glass_frame_square.png"
    v = np.array(Image.open(src).convert("RGBA")).copy()
    h, w = v.shape[:2]
    rgb = v[:, :, :3]

    visited = np.zeros((h, w), dtype=bool)

    def is_bg(y: int, x: int) -> bool:
        if visited[y, x] or v[y, x, 3] < 10:
            return False
        r, g, b = rgb[y, x]
        return r >= 248 and g >= 248 and b >= 245

    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        for y in (0, h - 1):
            if is_bg(y, x):
                visited[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if not visited[y, x] and is_bg(y, x):
                visited[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        v[y, x, 3] = 0
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and is_bg(ny, nx):
                visited[ny, nx] = True
                q.append((ny, nx))

    margin = 158
    side = w - 2 * margin
    cy = h // 2
    ty, by = cy - side // 2, cy + side // 2
    lx, rx = margin, margin + side
    v[ty:by, lx:rx, 3] = 0

    ch, cw = h, w
    cy, cx = ch // 2, cw // 2
    _, ty1, th = largest_trans_run(v[:, cx, 3])
    _, tx1, tw = largest_trans_run(v[cy, :, 3])
    ty0 = ty1 - th + 1
    tx0 = tx1 - tw + 1

    y0, y1 = ty0 - WINDOW_PAD, ty1 + WINDOW_PAD
    x0, x1 = tx0 - WINDOW_PAD, tx1 + WINDOW_PAD
    crop = v[y0 : y1 + 1, x0 : x1 + 1]

    ch, cw = crop.shape[:2]
    cy, cx = ch // 2, cw // 2
    _, _, rw = largest_trans_run(crop[cy, :, 3])
    _, _, rh = largest_trans_run(crop[:, cx, 3])

    Image.fromarray(crop).save(out)
    Image.fromarray(crop).save(square)
    print(f"saved {out.name}: {cw}x{ch}, square window {rw}x{rh}")

    for path in (out, square):
        im = np.array(Image.open(path).convert("RGBA"))
        rgb = im[:, :, :3].astype(np.float32)
        a = im[:, :, 3]
        lum = rgb.mean(axis=2)
        bad = (lum > 200) & (a > 0)
        bad2 = (rgb[:, :, 0] > 180) & (rgb[:, :, 1] > 170) & (rgb[:, :, 2] > 160) & (a > 0) & (a < 255)
        im[bad | bad2, 3] = 0
        Image.fromarray(im).save(path)
        print(f"  stripped fringe from {path.name}: {(bad | bad2).sum()} px")


if __name__ == "__main__":
    main()
