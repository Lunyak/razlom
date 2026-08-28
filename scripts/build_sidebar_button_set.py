"""Legacy sidebar button niches — layout contract for WorldScene left HUD.

Current player panel uses punched mockup + live HUD (see build_player_sidebar_plate.py).
This script's numeric contract must stay aligned with src/ui/worldHud/layout.ts.
"""
from PIL import Image, ImageDraw, ImageFilter
import numpy as np
from pathlib import Path

ASSETS = Path(r"C:\Users\Lunyak-Rdp\.cursor\projects\c-Users-Lunyak-Rdp-Projects-disciples-like\assets")
OUT = Path(r"C:\Users\Lunyak-Rdp\Projects\disciples-like\public\assets\ui")

# Display coords — must match WorldScene (SIDEBAR_W=480, DESIGN_H=720)
SIDEBAR_W = 480
OUT_W, OUT_H = 960, 1440
SCALE = OUT_W / SIDEBAR_W

SIDE_CX = 240
SIDE_BTN_YS = [434, 530, 630]
SIDE_BTN_W = 380
SIDE_BTN_H = 56


def d(v: float) -> int:
    return int(round(v * SCALE))


def chroma_rgba(im: Image.Image, keep_color: bool = False) -> Image.Image:
    arr = np.asarray(im.convert("RGB")).astype(np.int16)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    magenta = (r > 140) & (g < 125) & (b > 140)
    pinkish = (r > 155) & (b > 135) & (g < 115)
    near_black = (r < 35) & (g < 35) & (b < 35)
    opaque = ~(magenta | pinkish | near_black)
    opaque = np.asarray(Image.fromarray((opaque.astype(np.uint8) * 255)).filter(ImageFilter.MedianFilter(3))) > 127
    alpha = np.asarray(
        Image.fromarray(np.where(opaque, 255, 0).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.35))
    )
    if keep_color:
        rgb = np.asarray(im.convert("RGB"))
    else:
        src = np.asarray(im.convert("RGB")).astype(np.float32)
        lum = (0.3 * src[:, :, 0] + 0.59 * src[:, :, 1] + 0.11 * src[:, :, 2]) / 255.0
        cream = np.zeros_like(src)
        cream[:, :, 0], cream[:, :, 1], cream[:, :, 2] = 236, 224, 198
        rgb = np.clip(cream * (0.4 + 0.6 * lum)[:, :, None], 0, 255).astype(np.uint8)
    rgba = np.dstack([rgb, alpha])
    rgba[alpha == 0] = 0
    return Image.fromarray(rgba, "RGBA")


def main() -> None:
    raw = ASSETS / "ui_sidebar_panel_raw.png"
    if not raw.exists():
        print("No ui_sidebar_panel_raw.png — use build_player_sidebar_plate.py for the live panel plate.")
        print("CONTRACT", dict(SIDEBAR_W=SIDEBAR_W, SIDE_CX=SIDE_CX, SIDE_BTN_YS=SIDE_BTN_YS, SIDE_BTN_W=SIDE_BTN_W, SIDE_BTN_H=SIDE_BTN_H))
        return

    panel = chroma_rgba(Image.open(raw))
    panel = panel.resize((OUT_W, OUT_H), Image.Resampling.LANCZOS)
    panel.save(OUT / "ui_sidebar_panel.png")
    print("sidebar", panel.size)
    print("CONTRACT", dict(SIDEBAR_W=SIDEBAR_W, SIDE_CX=SIDE_CX, SIDE_BTN_YS=SIDE_BTN_YS, SIDE_BTN_W=SIDE_BTN_W, SIDE_BTN_H=SIDE_BTN_H))


if __name__ == "__main__":
    main()
