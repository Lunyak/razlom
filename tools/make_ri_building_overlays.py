"""Build hard-cut transparent RI building overlays.

Prefers clean black-on-white silhouettes in assets/ri_sil_{id}.png.
Falls back to punching preview plates if a silhouette is missing.

Output: pure black contour, binary alpha, no sky/ground box.
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
UI = ROOT / "public" / "assets" / "ui"
# Cursor GenerateImage drops here; also accept project assets/
SIL_DIRS = [
    ROOT / "assets",
    Path(r"C:\Users\Lunyak-Rdp\.cursor\projects\c-Users-Lunyak-Rdp-Projects-disciples-like\assets"),
]
IDS = ["barracks", "archery_range", "mage_tower", "temple", "hero_hall"]


def find_silhouette(bid: str) -> Path | None:
    name = f"ri_sil_{bid}.png"
    for d in SIL_DIRS:
        p = d / name
        if p.is_file():
            return p
    return None


def from_bw_silhouette(src: Path) -> np.ndarray:
    """Black (or dark) = building; white/light = transparent. Binary alpha."""
    im = Image.open(src).convert("RGBA")
    arr = np.asarray(im).astype(np.float32)
    lum = arr[:, :, 0] * 0.299 + arr[:, :, 1] * 0.587 + arr[:, :, 2] * 0.114
    # Hard cut — only the dark building mass.
    mask = lum < 80
    # Drop tiny speckles
    # Keep largest blob(s)
    mask = keep_largest(mask, keep=2)
    return mask_to_rgba(mask)


def keep_largest(mask: np.ndarray, keep: int = 2) -> np.ndarray:
    from collections import deque

    h, w = mask.shape
    seen = np.zeros_like(mask, dtype=bool)
    comps: list[tuple[int, list[tuple[int, int]]]] = []
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or seen[y, x]:
                continue
            q: deque[tuple[int, int]] = deque([(y, x)])
            seen[y, x] = True
            cells: list[tuple[int, int]] = [(y, x)]
            while q:
                cy, cx = q.popleft()
                for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
                        cells.append((ny, nx))
            comps.append((len(cells), cells))
    comps.sort(key=lambda t: t[0], reverse=True)
    out = np.zeros_like(mask)
    if not comps:
        return out
    big = comps[0][0]
    for size, cells in comps[:keep]:
        if size >= max(40, big * 0.03):
            for y, x in cells:
                out[y, x] = True
    return out


def mask_to_rgba(mask: np.ndarray) -> np.ndarray:
    out = np.zeros((*mask.shape, 4), dtype=np.uint8)
    out[mask, 0] = 6
    out[mask, 1] = 4
    out[mask, 2] = 2
    out[mask, 3] = 255
    ys, xs = np.where(mask)
    if len(xs) == 0:
        raise SystemExit("empty mask")
    pad = 4
    x0 = max(0, int(xs.min()) - pad)
    x1 = min(mask.shape[1], int(xs.max()) + pad + 1)
    y0 = max(0, int(ys.min()) - pad)
    y1 = min(mask.shape[0], int(ys.max()) + pad + 1)
    return out[y0:y1, x0:x1]


def trim_wide_foot(mask: np.ndarray) -> np.ndarray:
    """If a silhouette still has a wide ground slab, cut it to building width."""
    h, w = mask.shape
    widths = mask.sum(axis=1).astype(np.float64)
    rows = np.where(widths > 0)[0]
    if len(rows) == 0:
        return mask
    y0, y1 = int(rows[0]), int(rows[-1])
    span = y1 - y0 + 1
    upper = widths[y0 : y0 + max(1, span * 2 // 5)]
    body = upper[upper > 0]
    if len(body) == 0:
        return mask
    body_w = float(np.median(body))
    cut = None
    for y in range(y0 + span // 2, y1 + 1):
        if widths[y] >= max(body_w * 1.7, w * 0.55):
            cut = y
            break
    if cut is None:
        return mask
    upper_mask = mask[y0:cut]
    xs = np.where(upper_mask.any(axis=0))[0]
    if len(xs) == 0:
        return mask
    cx0, cx1 = int(xs.min()), int(xs.max()) + 1
    pad = max(2, (cx1 - cx0) // 40)
    cx0, cx1 = max(0, cx0 - pad), min(w, cx1 + pad)
    out = mask.copy()
    footing = min(h, cut + max(2, span // 80))
    out[cut:footing, :cx0] = False
    out[cut:footing, cx1:] = False
    out[footing:, :] = False
    return out


def make_overlay(bid: str) -> None:
    dest = UI / f"ri_building_{bid}_overlay.png"
    sil = find_silhouette(bid)
    if sil is None:
        raise SystemExit(f"missing silhouette assets/ri_sil_{bid}.png — generate it first")

    im = Image.open(sil).convert("RGBA")
    arr = np.asarray(im).astype(np.float32)
    lum = arr[:, :, 0] * 0.299 + arr[:, :, 1] * 0.587 + arr[:, :, 2] * 0.114
    mask = lum < 80
    mask = trim_wide_foot(mask)
    mask = keep_largest(mask, keep=2)
    cropped = mask_to_rgba(mask)

    # Archive silhouette next to previews for the repo
    archived = ROOT / "assets" / f"ri_sil_{bid}.png"
    archived.parent.mkdir(parents=True, exist_ok=True)
    if sil.resolve() != archived.resolve():
        Image.open(sil).save(archived)

    Image.fromarray(cropped, "RGBA").save(dest, optimize=True)
    print(f"{sil.name} -> {dest.name} {cropped.shape[1]}x{cropped.shape[0]}")


def main() -> None:
    for bid in IDS:
        make_overlay(bid)


if __name__ == "__main__":
    main()
