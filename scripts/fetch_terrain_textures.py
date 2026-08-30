"""Download CC0 Poly Haven / ambientCG ground plates and grade them to 1914 olive-sepia."""
from __future__ import annotations

import io
import json
import shutil
import urllib.error
import urllib.request
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "assets" / "terrain"
PREV = OUT / "_prev"
UA = "disciples-like-terrain-fetch/1.0 (local art pipeline)"

# slot -> candidate sources, first success wins
# Poly Haven: (haven, asset_id)
# ambientCG: (acg, FileName_1K-JPG.zip inner jpg)
SOURCES: dict[str, list[tuple[str, str]]] = {
    "ground_grass_0": [("haven", "aerial_grass_rock"), ("haven", "dry_grass"), ("acg", "Ground037")],
    "ground_grass_1": [("haven", "grass"), ("haven", "forrest_ground_01"), ("acg", "Ground003")],
    "ground_forest_0": [("haven", "mud_forest"), ("haven", "forest_leaves"), ("acg", "Ground048")],
    "ground_road_0": [("haven", "rocky_trail"), ("haven", "dirt"), ("acg", "Ground054")],
    "ground_road_1": [("haven", "dirt"), ("haven", "rocky_dirt_path"), ("acg", "Ground082")],
    "ground_water_0": [("haven", "brown_mud_03"), ("haven", "brown_mud"), ("acg", "Ground042")],
    "ground_water_1": [("haven", "mud"), ("haven", "brown_mud_leaves_01"), ("acg", "Ground049")],
    "ground_mountain_foot_0": [("haven", "aerial_rocks_02"), ("haven", "rock_08"), ("acg", "Rock023")],
    "ground_mountain_0": [("haven", "rock_face"), ("haven", "slate_floor_02"), ("acg", "Rock020")],
    "ground_forest_1": [("haven", "aerial_grass_rock"), ("haven", "forrest_ground_01"), ("acg", "Ground003")],
    "ground_ditch_0": [("haven", "brown_mud"), ("haven", "dirt"), ("acg", "Ground042")],
    "ground_trench_0": [("haven", "dirt"), ("haven", "brown_mud_03"), ("acg", "Ground054")],
}

GRADE = {
    "ground_grass_0": dict(sat=0.42, contrast=1.08, color=(118, 108, 72), color_a=0.38, dark=0.88),
    "ground_grass_1": dict(sat=0.38, contrast=1.05, color=(102, 96, 64), color_a=0.40, dark=0.86),
    "ground_forest_0": dict(sat=0.28, contrast=1.12, color=(54, 48, 32), color_a=0.46, dark=0.72),
    "ground_road_0": dict(sat=0.30, contrast=1.10, color=(86, 72, 48), color_a=0.36, dark=0.84),
    "ground_road_1": dict(sat=0.28, contrast=1.08, color=(78, 66, 46), color_a=0.38, dark=0.82),
    "ground_water_0": dict(sat=0.18, contrast=1.15, color=(28, 32, 26), color_a=0.55, dark=0.48),
    "ground_water_1": dict(sat=0.16, contrast=1.12, color=(24, 30, 28), color_a=0.58, dark=0.44),
    "ground_mountain_foot_0": dict(sat=0.22, contrast=1.10, color=(72, 66, 56), color_a=0.40, dark=0.80),
    "ground_mountain_0": dict(sat=0.18, contrast=1.12, color=(64, 60, 52), color_a=0.42, dark=0.76),
    "ground_forest_1": dict(sat=0.40, contrast=1.06, color=(92, 84, 58), color_a=0.22, dark=0.92),
    "ground_ditch_0": dict(sat=0.38, contrast=1.08, color=(86, 76, 52), color_a=0.28, dark=0.90),
    "ground_trench_0": dict(sat=0.34, contrast=1.10, color=(78, 68, 46), color_a=0.30, dark=0.86),
}


def req(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urllib.request.urlopen(request, timeout=60) as resp:
        return resp.read()


def haven_diffuse(asset_id: str) -> bytes | None:
    try:
        raw = req(f"https://api.polyhaven.com/files/{asset_id}")
    except urllib.error.HTTPError as exc:
        print(f"  haven miss {asset_id}: {exc.code}")
        return None
    except Exception as exc:
        print(f"  haven fail {asset_id}: {exc}")
        return None
    data = json.loads(raw)
    for map_name in ("Diffuse", "diff", "albedo"):
        node = data.get(map_name)
        if not node:
            continue
        for res in ("2k", "1k", "4k"):
            for fmt in ("jpg", "jpeg", "png"):
                item = node.get(res, {}).get(fmt)
                if item and item.get("url"):
                    print(f"  haven {asset_id} {map_name} {res} {fmt}")
                    return req(item["url"])
    print(f"  haven no diffuse: {asset_id} keys={list(data)[:8]}")
    return None


def acg_color(stem: str) -> bytes | None:
    url = f"https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/{stem}/{stem}_diff_1k.jpg"
    # ambientCG pack
    zip_url = f"https://ambientcg.com/get?file={stem}_1K-JPG.zip"
    try:
        blob = req(zip_url)
    except Exception as exc:
        print(f"  acg miss {stem}: {exc}")
        return None
    import zipfile

    with zipfile.ZipFile(io.BytesIO(blob)) as zf:
        names = zf.namelist()
        color = next((n for n in names if n.lower().endswith(("color.jpg", "color.png"))), None)
        if not color:
            color = next((n for n in names if n.lower().endswith((".jpg", ".jpeg", ".png"))), None)
        if not color:
            print(f"  acg empty {stem}: {names}")
            return None
        print(f"  acg {stem} -> {color}")
        return zf.read(color)


def fetch_source(kind: str, name: str) -> bytes | None:
    if kind == "haven":
        return haven_diffuse(name)
    if kind == "acg":
        return acg_color(name)
    return None


def grade(img: Image.Image, spec: dict) -> Image.Image:
    img = ImageOps.exif_transpose(img.convert("RGB"))
    # crop to square center, then 1024
    w, h = img.size
    side = min(w, h)
    left = (w - side) // 2
    top = (h - side) // 2
    img = img.crop((left, top, left + side, top + side)).resize((1024, 1024), Image.Resampling.LANCZOS)
    img = ImageEnhance.Color(img).enhance(spec["sat"])
    img = ImageEnhance.Contrast(img).enhance(spec["contrast"])
    wash = Image.new("RGB", img.size, spec["color"])
    img = Image.blend(img, wash, spec["color_a"])
    dark = ImageEnhance.Brightness(img).enhance(spec["dark"])
    grain = Image.effect_noise(img.size, 18).convert("L").filter(ImageFilter.GaussianBlur(0.4))
    img = Image.blend(dark, ImageOps.colorize(grain, (20, 16, 10), (210, 190, 140)), 0.07)
    return img


def backup_existing() -> None:
    PREV.mkdir(parents=True, exist_ok=True)
    for key in SOURCES:
        src = OUT / f"{key}.png"
        if src.exists():
            shutil.copy2(src, PREV / src.name)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    backup_existing()
    used: dict[str, str] = {}
    for key, candidates in SOURCES.items():
        blob = None
        label = ""
        for kind, name in candidates:
            print(f"{key}: try {kind}:{name}")
            blob = fetch_source(kind, name)
            if blob:
                label = f"{kind}:{name}"
                break
        if not blob:
            print(f"FAILED {key}")
            continue
        img = Image.open(io.BytesIO(blob))
        graded = grade(img, GRADE[key])
        dest = OUT / f"{key}.png"
        graded.save(dest, "PNG", optimize=True)
        used[key] = label
        print(f"wrote {dest.name} from {label} {dest.stat().st_size} bytes")
    print("DONE", json.dumps(used, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
