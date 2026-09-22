"""Grade generated road plates to 1914 olive-sepia and write 1024 sheets."""
from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets" / "terrain"
PREV = OUT / "_prev"
GEN = Path(
    r"C:\Users\Lunyak-Rdp\.cursor\projects\c-Users-Lunyak-Rdp-Projects-disciples-like\assets"
)

GRADE = {
    "ground_road_0": dict(sat=0.38, contrast=1.06, color=(92, 78, 52), color_a=0.26, dark=0.94),
    "ground_road_1": dict(sat=0.30, contrast=1.05, color=(74, 68, 44), color_a=0.24, dark=0.90),
}


def make_seamless(img: Image.Image, blend: int = 72) -> Image.Image:
    w, h = img.size
    offset = Image.new("RGB", (w, h))
    half_w, half_h = w // 2, h // 2
    offset.paste(img.crop((half_w, half_h, w, h)), (0, 0))
    offset.paste(img.crop((0, half_h, half_w, h)), (half_w, 0))
    offset.paste(img.crop((half_w, 0, w, half_h)), (0, half_h))
    offset.paste(img.crop((0, 0, half_w, half_h)), (half_w, half_h))
    mask = Image.new("L", (w, h), 0)
    px = mask.load()
    for y in range(h):
        for x in range(w):
            dx = min(x, w - 1 - x)
            dy = min(y, h - 1 - y)
            edge = min(dx, dy)
            px[x, y] = 0 if edge >= blend else int(255 * (1 - edge / blend))
    return Image.composite(img, offset, ImageOps.invert(mask))


def grade(img: Image.Image, spec: dict) -> Image.Image:
    img = ImageOps.exif_transpose(img.convert("RGB"))
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    img = img.crop((left, top, left + side, top + side)).resize((1024, 1024), Image.Resampling.LANCZOS)
    img = ImageEnhance.Color(img).enhance(spec["sat"])
    img = ImageEnhance.Contrast(img).enhance(spec["contrast"])
    wash = Image.new("RGB", img.size, spec["color"])
    img = Image.blend(img, wash, spec["color_a"])
    img = ImageEnhance.Brightness(img).enhance(spec["dark"])
    grain = Image.effect_noise(img.size, 18).convert("L").filter(ImageFilter.GaussianBlur(0.4))
    img = Image.blend(img, ImageOps.colorize(grain, (20, 16, 10), (210, 190, 140)), 0.06)
    return make_seamless(img)


def main() -> None:
    PREV.mkdir(parents=True, exist_ok=True)
    for key, spec in GRADE.items():
        src = GEN / f"{key}.png"
        dest = OUT / f"{key}.png"
        if dest.exists():
            shutil.copy2(dest, PREV / dest.name)
        graded = grade(Image.open(src), spec)
        dest.parent.mkdir(parents=True, exist_ok=True)
        graded.save(dest, "PNG", optimize=True)
        print(f"wrote {dest} {dest.stat().st_size} bytes")


if __name__ == "__main__":
    main()
