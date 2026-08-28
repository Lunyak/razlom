"""Export charcoal corner plates: chroma-key only — never punch or crop the drawing."""
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(r"C:\Users\Lunyak-Rdp\Projects\disciples-like")
SRC = ROOT / "assets" / "frame_hi"
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


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for tag in ("tl", "tr", "bl", "br"):
        im = to_rgba(SRC / f"frame_corner_{tag}.png")
        dest = OUT / f"charcoal_corner_{tag}.png"
        im.save(dest, "PNG", optimize=True)
        a = np.array(im)[:, :, 3]
        print(tag, im.size, "opaque%", round(100 * (a > 24).mean(), 1), dest.name)

    # Thin connecting rails — squash hi-res vine plates into a filament.
    h = to_rgba(SRC / "frame_edge_top.png").resize((2048, 72), LANCZOS)
    h.save(OUT / "charcoal_rail_h.png", "PNG", optimize=True)
    v = to_rgba(SRC / "frame_edge_side.png").resize((72, 2048), LANCZOS)
    v.save(OUT / "charcoal_rail_v.png", "PNG", optimize=True)
    print("rails", h.size, v.size)


if __name__ == "__main__":
    main()
