"""Chroma-key the manuscript folio plate and cut corners + tileable rails."""
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(r"C:\Users\Lunyak-Rdp\Projects\disciples-like")
SRC_DIR = ROOT / "assets" / "folio"
OUT = ROOT / "public" / "assets" / "ui"

LANCZOS = Image.Resampling.LANCZOS


def magenta_mask(rgb: np.ndarray) -> np.ndarray:
    r = rgb[:, :, 0].astype(np.int16)
    g = rgb[:, :, 1].astype(np.int16)
    b = rgb[:, :, 2].astype(np.int16)
    hot = (r > 140) & (b > 130) & (g < 130) & ((r + b) > (2 * g + 50))
    fringe = (r > 95) & (b > 75) & (g < 115) & (r > g + 22) & ((r + b) > (2 * g + 35))
    return hot | fringe


def to_rgba(path: Path) -> Image.Image:
    rgb = np.asarray(Image.open(path).convert("RGB"))
    cut = magenta_mask(rgb)
    src = rgb.astype(np.float32)
    r, g, b = src[:, :, 0], src[:, :, 1], src[:, :, 2]
    chroma = np.maximum(r, b) - g
    tint = chroma > 28
    lum = 0.3 * r + 0.59 * g + 0.11 * b
    src[tint, 0] = lum[tint]
    src[tint, 1] = lum[tint]
    src[tint, 2] = lum[tint]
    rgb_u8 = np.clip(src, 0, 255).astype(np.uint8)
    alpha = np.where(cut, 0, 255).astype(np.uint8)
    alpha = np.array(Image.fromarray(alpha).filter(ImageFilter.MedianFilter(3)), copy=True)
    alpha = np.array(Image.fromarray(alpha).filter(ImageFilter.GaussianBlur(0.45)), copy=True)
    alpha[cut] = 0
    rgba = np.dstack([rgb_u8, alpha])
    rgba[alpha < 8] = 0
    return Image.fromarray(rgba, "RGBA")


def opaque_span(alpha: np.ndarray, axis: int) -> tuple[int, int]:
    hits = np.where(alpha.max(axis=axis) > 24)[0]
    if hits.size == 0:
        return 0, alpha.shape[1 if axis == 0 else 0]
    return int(hits[0]), int(hits[-1]) + 1


def crop_opaque(im: Image.Image, pad: int = 2) -> Image.Image:
    a = np.array(im)[:, :, 3]
    ys = np.where(a.max(axis=1) > 24)[0]
    xs = np.where(a.max(axis=0) > 24)[0]
    if ys.size == 0 or xs.size == 0:
        return im
    y0, y1 = max(0, int(ys[0]) - pad), min(im.height, int(ys[-1]) + 1 + pad)
    x0, x1 = max(0, int(xs[0]) - pad), min(im.width, int(xs[-1]) + 1 + pad)
    return im.crop((x0, y0, x1, y1))


def save(im: Image.Image, name: str) -> None:
    dest = OUT / name
    im.save(dest, "PNG", optimize=True)
    a = np.array(im)[:, :, 3]
    print(name, im.size, "opaque%", round(100 * (a > 24).mean(), 1))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    plate = to_rgba(SRC_DIR / "screen_frame_folio_src.png")
    arr = np.array(plate)
    alpha = arr[:, :, 3]
    w, h = plate.size
    save(plate, "screen_frame_folio.png")

    # Crop past the acanthus so the plate edge is already thin knotwork rail.
    # Flourish settles into the rail around 240px; 360 leaves a rail overlap.
    corner = 360
    save(plate.crop((0, 0, corner, corner)), "folio_corner_tl.png")
    save(plate.crop((w - corner, 0, w, corner)), "folio_corner_tr.png")
    save(plate.crop((0, h - corner, corner, h)), "folio_corner_bl.png")
    save(plate.crop((w - corner, h - corner, w, h)), "folio_corner_br.png")

    top = int(np.where(alpha[:, w // 2] < 8)[0][0])
    left = int(np.where(alpha[h // 2, :] < 8)[0][0])
    # Mid-edge knotwork only — same thickness as the rim inside the corner crop.
    rail_h = plate.crop((w // 2 - 192, 0, w // 2 + 192, top))
    rail_v = plate.crop((0, h // 2 - 192, left, h // 2 + 192))
    save(rail_h, "folio_rail_h.png")
    save(rail_v, "folio_rail_v.png")
    print("rim", {"top": top, "left": left, "corner": corner})

    panel = to_rgba(SRC_DIR / "screen_frame_folio_panel_src.png")
    save(crop_opaque(panel, pad=4), "screen_frame_folio_panel.png")


if __name__ == "__main__":
    main()
