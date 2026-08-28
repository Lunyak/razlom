"""Chroma-key the end-turn medallion, un-squash the ring to a circle, export square PNGs."""
from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets" / "ui"
CURSOR_ASSETS = Path(
    r"C:\Users\Lunyak-Rdp\.cursor\projects\c-Users-Lunyak-Rdp-Projects-disciples-like\assets"
)
SRC_DIR_CANDIDATES = [
    ROOT / "assets" / "ui",
    CURSOR_ASSETS,
]

OUT_SIZE = 512
PAD = 10


def find_src(name: str) -> Path:
    for folder in SRC_DIR_CANDIDATES:
        path = folder / name
        if path.is_file():
            return path
    raise FileNotFoundError(name)


def chroma_magenta(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """Return (rgb_u8, alpha). Magenta screen → transparent; despill the fringe."""
    src = rgb.astype(np.float32)
    r, g, b = src[:, :, 0], src[:, :, 1], src[:, :, 2]
    rb = np.minimum(r, b)
    magenta = rb - g
    hard = (r > 175) & (b > 175) & (g < 90) & ((r + b) > (2 * g + 90))
    # Soft key: how magenta vs how "not green"
    amount = np.clip(magenta / 165.0, 0, 1)
    amount = np.where(hard, np.maximum(amount, 0.92), amount)
    amount = np.where((r > 140) & (b > 140) & (g < 110) & (magenta > 40), amount, amount * 0.15)
    amount = np.where(hard, np.maximum(amount, 0.97), amount)
    alpha = ((1.0 - amount) * 255.0).astype(np.float32)
    alpha = np.array(Image.fromarray(alpha.astype(np.uint8)).filter(ImageFilter.MedianFilter(3)), dtype=np.float32)
    alpha = np.array(Image.fromarray(alpha.astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.55)), dtype=np.float32)
    alpha[hard] = 0
    # Despill leftover magenta on semi-opaque edges
    spill = np.maximum(0.0, magenta)
    keep = alpha / 255.0
    src[:, :, 0] = np.clip(r - spill * (1.0 - keep) * 0.9, 0, 255)
    src[:, :, 2] = np.clip(b - spill * (1.0 - keep) * 0.9, 0, 255)
    src[alpha < 8] = 0
    return src.astype(np.uint8), np.clip(alpha, 0, 255).astype(np.uint8)


def opaque_bbox(alpha: np.ndarray, thr: int = 20) -> tuple[int, int, int, int]:
    ys, xs = np.where(alpha > thr)
    if ys.size == 0:
        return 0, 0, alpha.shape[1], alpha.shape[0]
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def ray_radius(alpha: np.ndarray, cx: float, cy: float, deg: float) -> int:
    h, w = alpha.shape
    ang = np.deg2rad(deg)
    for rad in range(1, max(h, w)):
        y = int(round(cy + rad * np.sin(ang)))
        x = int(round(cx + rad * np.cos(ang)))
        if y < 0 or x < 0 or y >= h or x >= w or alpha[y, x] < 24:
            return rad - 1
    return 0


def ring_aspect(alpha: np.ndarray) -> float:
    """Width/height of the metal ring, sampled between the four crests. 1 = circle."""
    ys, xs = np.where(alpha > 40)
    if ys.size == 0:
        return 1.0
    cy, cx = float(ys.mean()), float(xs.mean())
    # 45° family = ring body, not the 12/3/6/9 ornaments
    diag = np.mean([ray_radius(alpha, cx, cy, d) for d in (40, 50, 130, 140, 220, 230, 310, 320)])
    horiz = np.mean([ray_radius(alpha, cx, cy, d) for d in (20, 25, 155, 160, 200, 205, 335, 340)])
    vert = np.mean([ray_radius(alpha, cx, cy, d) for d in (70, 75, 105, 110, 250, 255, 285, 290)])
    ring = (horiz + vert) / 2.0
    if diag < 8 or ring < 8:
        return 1.0
    # Horiz vs vert of the ring (ornament tips excluded)
    aspect = horiz / max(vert, 1.0)
    print(f"    ring r diag={diag:.0f} H={horiz:.0f} V={vert:.0f} aspect={aspect:.3f}")
    return float(np.clip(aspect, 0.92, 1.08))


def un_squash(im: Image.Image, aspect: float) -> Image.Image:
    """Mild scale so the ring is circular. Crests at 12/6 may stay taller."""
    if abs(aspect - 1.0) < 0.02:
        return im
    w, h = im.size
    if aspect > 1.0:
        nh = int(round(h * aspect))
        return im.resize((w, nh), Image.Resampling.LANCZOS)
    nw = int(round(w / max(aspect, 0.01)))
    return im.resize((nw, h), Image.Resampling.LANCZOS)


def to_square(im: Image.Image, size: int, pad: int) -> Image.Image:
    arr = np.array(im)
    alpha = arr[:, :, 3]
    x0, y0, x1, y1 = opaque_bbox(alpha, 12)
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(im.width, x1 + pad), min(im.height, y1 + pad)
    crop = im.crop((x0, y0, x1, y1))
    side = max(crop.size) + 2
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(crop, ((side - crop.size[0]) // 2, (side - crop.size[1]) // 2))
    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def finish_alpha(im: Image.Image) -> Image.Image:
    """Drop residual magenta after LANCZOS (it re-blends the keyed fringe)."""
    arr = np.array(im)
    r = arr[:, :, 0].astype(np.int16)
    g = arr[:, :, 1].astype(np.int16)
    b = arr[:, :, 2].astype(np.int16)
    a = arr[:, :, 3].astype(np.int16)
    mag = np.minimum(r, b) - g
    fringe = (mag > 48) & (g < 90) & (r > 70) & (b > 70)
    arr[fringe, 3] = np.clip(a[fringe] - mag[fringe], 0, 255).astype(np.uint8)
    arr[arr[:, :, 3] < 14] = 0
    return Image.fromarray(arr, "RGBA")


def process(src_name: str, out_name: str) -> None:
    src_path = find_src(src_name)
    rgb = np.asarray(Image.open(src_path).convert("RGB"))
    rgb_u8, alpha = chroma_magenta(rgb)
    aspect = ring_aspect(alpha)
    rgba = np.dstack([rgb_u8, alpha])
    rgba[alpha < 8] = 0
    im = Image.fromarray(rgba, "RGBA")
    im = un_squash(im, aspect)
    im = finish_alpha(to_square(im, OUT_SIZE, PAD))
    dest = OUT / out_name
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "PNG", optimize=True)
    a = np.array(im)[:, :, 3]
    print(
        f"{out_name} {im.size} from {src_path.name} "
        f"inner_aspect={aspect:.3f} opaque%={100 * (a > 24).mean():.1f}"
    )


def cache_src() -> None:
    """Keep a repo copy of the generated magenta plates."""
    dest_dir = ROOT / "assets" / "ui"
    dest_dir.mkdir(parents=True, exist_ok=True)
    for name in ("ui_btn_end_turn_idle_src.png", "ui_btn_end_turn_hover_src.png"):
        src = find_src(name)
        dest = dest_dir / name
        if src.resolve() != dest.resolve():
            dest.write_bytes(src.read_bytes())
            print("cached", dest)


def main() -> None:
    cache_src()
    process("ui_btn_end_turn_idle_src.png", "ui_btn_end_turn.png")
    process("ui_btn_end_turn_hover_src.png", "ui_btn_end_turn_hover.png")


if __name__ == "__main__":
    main()
