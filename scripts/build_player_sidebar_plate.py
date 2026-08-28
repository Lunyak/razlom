"""Build left player sidebar plate from mockup JPG — punch windows for live HUD.

Layout contract lives in src/ui/worldHud/layout.ts (SIDEBAR_W=480, DESIGN_H=720).
Keep the numbers here in sync with that file.
"""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets" / "ui"
ASSETS = Path(r"C:\Users\Lunyak-Rdp\.cursor\projects\c-Users-Lunyak-Rdp-Projects-disciples-like\assets")

# Prefer workspace sample; fall back to assets folder name if present.
SAMPLE_CANDIDATES = [
    ASSETS
    / "c__Users_Lunyak-Rdp_AppData_Roaming_Cursor_User_workspaceStorage_09a300ff39d9d8133daaf33cad5c713d_images_image-fe78519f-78db-4a43-b23a-bd1cf789dd3d.jpg",
    ASSETS / "ui_player_sidebar_raw.jpg",
    ASSETS / "ui_player_sidebar_raw.png",
]

OUT_W = 960
SCALE = OUT_W / 480
OUT_H = 1440  # 720 design px @ 2×

# Must match src/ui/worldHud/layout.ts
SIDE_CX = 240
STEPS_LABEL_Y = 42
STEPS_VALUE_Y = 108
NAME_ROW_Y = 175
PORTRAIT_Y = 275
SIDE_BTN_YS = [432, 533, 634]


def d(v: float) -> int:
    return int(round(v * SCALE))


def punch_rect(arr: np.ndarray, cx: int, cy: int, w: int, h: int, soft: float = 2.0) -> None:
    H, W = arr.shape[:2]
    hole = Image.new("L", (W, H), 0)
    ImageDraw.Draw(hole).rectangle([cx - w // 2, cy - h // 2, cx + w // 2, cy + h // 2], fill=255)
    hole = hole.filter(ImageFilter.GaussianBlur(soft))
    hm = np.asarray(hole).astype(np.float32) / 255.0
    arr[:, :, 3] = (arr[:, :, 3].astype(np.float32) * (1.0 - hm)).astype(np.uint8)
    arr[hm > 0.85, :3] = 0


def punch_circle(arr: np.ndarray, cx: int, cy: int, r: int, soft: float = 2.0) -> None:
    H, W = arr.shape[:2]
    hole = Image.new("L", (W, H), 0)
    ImageDraw.Draw(hole).ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    hole = hole.filter(ImageFilter.GaussianBlur(soft))
    hm = np.asarray(hole).astype(np.float32) / 255.0
    arr[:, :, 3] = (arr[:, :, 3].astype(np.float32) * (1.0 - hm)).astype(np.uint8)
    arr[hm > 0.85, :3] = 0


def crop_dark_panel(im: Image.Image) -> Image.Image:
    arr = np.asarray(im.convert("RGB"))
    lum = arr.mean(axis=2)
    mask = lum < 220
    ys, xs = np.where(mask)
    if len(xs) == 0:
        return im
    pad = 2
    x0, y0 = max(0, int(xs.min()) - pad), max(0, int(ys.min()) - pad)
    x1, y1 = min(arr.shape[1] - 1, int(xs.max()) + pad), min(arr.shape[0] - 1, int(ys.max()) + pad)
    return im.crop((x0, y0, x1 + 1, y1 + 1))


def clear_light_backdrop(arr: np.ndarray) -> None:
    """Make light gray / near-white margins outside the ornate frame transparent."""
    from collections import deque

    r = arr[:, :, 0].astype(np.int16)
    g = arr[:, :, 1].astype(np.int16)
    b = arr[:, :, 2].astype(np.int16)
    a = arr[:, :, 3]
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    bg = (lum > 170) & (np.abs(r - g) < 25) & (np.abs(g - b) < 25) & (np.abs(r - b) < 25)
    H, W = lum.shape
    vis = np.zeros((H, W), dtype=bool)
    q: deque[tuple[int, int]] = deque()
    for y in range(H):
        for x in (0, W - 1):
            if bg[y, x] and not vis[y, x]:
                vis[y, x] = True
                q.append((y, x))
    for x in range(W):
        for y in (0, H - 1):
            if bg[y, x] and not vis[y, x]:
                vis[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and not vis[ny, nx] and bg[ny, nx]:
                vis[ny, nx] = True
                q.append((ny, nx))

    # Eat light fringe pixels sitting on the silhouette after first pass
    soft_bg = (lum > 140) & (np.abs(r - g) < 40) & (np.abs(g - b) < 40)
    pad = np.pad(vis, 1, constant_values=False)
    adj = (
        pad[:-2, 1:-1]
        | pad[2:, 1:-1]
        | pad[1:-1, :-2]
        | pad[1:-1, 2:]
        | pad[:-2, :-2]
        | pad[:-2, 2:]
        | pad[2:, :-2]
        | pad[2:, 2:]
    )
    fringe = soft_bg & adj & (a > 40) & ~vis
    q = deque(zip(*np.where(fringe)))
    for y, x in q:
        vis[y, x] = True
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and not vis[ny, nx] and soft_bg[ny, nx] and a[ny, nx] > 20:
                vis[ny, nx] = True
                q.append((ny, nx))

    mask = Image.fromarray((vis.astype(np.uint8) * 255)).filter(ImageFilter.MaxFilter(3)).filter(
        ImageFilter.GaussianBlur(1.2)
    )
    m = np.asarray(mask).astype(np.float32) / 255.0
    arr[:, :, 3] = (arr[:, :, 3].astype(np.float32) * (1.0 - m)).astype(np.uint8)
    arr[m > 0.9, :3] = 0


def main() -> None:
    src = next((p for p in SAMPLE_CANDIDATES if p.exists()), None)
    if src is None:
        raise SystemExit(f"No sample found. Tried: {SAMPLE_CANDIDATES}")

    prev = OUT / "ui_sidebar_panel.png"
    if prev.exists():
        (OUT / "ui_sidebar_panel_prev2.png").write_bytes(prev.read_bytes())

    crop = crop_dark_panel(Image.open(src))
    panel = crop.resize((OUT_W, OUT_H), Image.Resampling.LANCZOS).convert("RGBA")
    a = np.asarray(panel).copy()

    clear_light_backdrop(a)

    cx = d(SIDE_CX)
    punch_rect(a, cx, d(STEPS_VALUE_Y), d(180), d(52), soft=3)
    punch_rect(a, cx, d(NAME_ROW_Y), d(400), d(32), soft=2)
    punch_circle(a, cx, d(PORTRAIT_Y), d(100), soft=2)

    out = Image.fromarray(a, "RGBA")
    out_path = OUT / "ui_sidebar_panel.png"
    out.save(out_path)
    print("saved", out_path, out.size)
    print("CONTRACT", dict(SIDE_CX=SIDE_CX, STEPS_VALUE_Y=STEPS_VALUE_Y, NAME_ROW_Y=NAME_ROW_Y, PORTRAIT_Y=PORTRAIT_Y, SIDE_BTN_YS=SIDE_BTN_YS, SIDEBAR_ART_H=720))


if __name__ == "__main__":
    main()
