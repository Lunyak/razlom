"""Build folk-harp sidebar plate — transparent margins + oval portrait punch.

Layout contract: src/ui/worldHud/sidebarVariants.ts (folk-harp entry).
"""
from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets" / "ui"
ASSETS = ROOT.parent / ".cursor" / "projects" / "c-Users-Lunyak-Rdp-Projects-disciples-like" / "assets"

SRC_CANDIDATES = [
    ASSETS
    / "c__Users_Lunyak-Rdp_AppData_Roaming_Cursor_User_workspaceStorage_09a300ff39d9d8133daaf33cad5c713d_images_image-d2c12b97-0a73-4509-b4d6-1ccf6f0cbce5.png",
    ASSETS / "ui_sidebar_folk_harp_raw.png",
]

OUT_W = 960  # 480 @2x
OUT_H = 1380  # 690 @2x
SCALE = 2
# design px from sidebarVariants folk-harp
PORTRAIT_CX = 240
PORTRAIT_CY = 300
PORTRAIT_RX = 98
PORTRAIT_RY = 128


def main() -> None:
    src = next((p for p in SRC_CANDIDATES if p.is_file()), None)
    if not src:
        raise SystemExit("No folk-harp source PNG in assets/")

    im = Image.open(src).convert("RGBA")
    arr = np.array(im, copy=True)
    lum = arr[:, :, :3].mean(axis=2)
    H, W = lum.shape
    vis = arr[:, :, 3] > 8
    seed = (lum > 200) & vis
    q: deque[tuple[int, int]] = deque()
    for y in range(H):
        for x in (0, W - 1):
            if seed[y, x]:
                q.append((x, y))
                seed[y, x] = False
    for x in range(W):
        for y in (0, H - 1):
            if seed[y, x]:
                q.append((x, y))
                seed[y, x] = False
    removed = np.zeros((H, W), bool)
    while q:
        x, y = q.popleft()
        if removed[y, x] or lum[y, x] < 185 or not vis[y, x]:
            continue
        removed[y, x] = True
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < W and 0 <= ny < H and not removed[ny, nx] and lum[ny, nx] > 175 and vis[ny, nx]:
                q.append((nx, ny))
    arr[removed, 3] = 0

    ys, xs = np.where(arr[:, :, 3] > 16)
    im = Image.fromarray(arr).crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    nh = int(round(im.height * (OUT_W / im.width)))
    im = im.resize((OUT_W, nh), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (OUT_W, OUT_H), (0, 0, 0, 0))
    canvas.paste(im, (0, 0))
    im = canvas.crop((0, 0, OUT_W, OUT_H))

    arr = np.array(im, copy=True)
    cx, cy = int(PORTRAIT_CX * SCALE), int(PORTRAIT_CY * SCALE)
    rx, ry = int(PORTRAIT_RX * SCALE), int(PORTRAIT_RY * SCALE)
    hole = Image.new("L", (OUT_W, OUT_H), 0)
    ImageDraw.Draw(hole).ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=255)
    hole = hole.filter(ImageFilter.GaussianBlur(2))
    hm = np.asarray(hole, dtype=np.float32) / 255
    arr[:, :, 3] = (arr[:, :, 3].astype(np.float32) * (1 - hm)).astype(np.uint8)
    arr[hm > 0.85, :3] = 0

    out = OUT / "ui_sidebar_folk_harp.png"
    Image.fromarray(arr).save(out)
    print("Wrote", out)


if __name__ == "__main__":
    main()
