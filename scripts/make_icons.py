"""Generate PWA PNG icons (192, 512, 512-maskable) for The System.

Usage:  python scripts/make_icons.py
Requires Pillow (pip install pillow).
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"
OUT.mkdir(parents=True, exist_ok=True)

BG = (11, 14, 20, 255)
CYAN = (120, 196, 255, 255)
SKY = (59, 158, 255, 255)


def hexagon(cx, cy, r):
    # pointy-top hexagon
    import math
    return [(cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))) for a in range(-90, 270, 60)]


def draw_icon(size: int, maskable: bool = False) -> Image.Image:
    s = size * 4  # supersample for smooth edges
    img = Image.new("RGBA", (s, s), BG)
    scale = 0.62 if maskable else 0.82  # maskable icons need a safe zone
    r = s * scale / 2
    cx = cy = s / 2

    # glow layer
    glow = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    gd.polygon(hexagon(cx, cy, r), outline=CYAN, width=int(s * 0.05))
    glow = glow.filter(ImageFilter.GaussianBlur(s * 0.03))
    img.alpha_composite(glow)

    d = ImageDraw.Draw(img)
    d.polygon(hexagon(cx, cy, r), fill=(5, 7, 11, 255), outline=CYAN, width=int(s * 0.035))

    # stylised "A" (Arise) glyph
    w = int(s * 0.06)
    top = (cx, cy - r * 0.55)
    left = (cx - r * 0.42, cy + r * 0.45)
    right = (cx + r * 0.42, cy + r * 0.45)
    d.line([left, top, right], fill=SKY, width=w, joint="curve")
    d.line([(cx - r * 0.22, cy + r * 0.12), (cx + r * 0.22, cy + r * 0.12)], fill=SKY, width=w)
    for p in (left, top, right):
        d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=SKY)

    return img.resize((size, size), Image.LANCZOS)


if __name__ == "__main__":
    draw_icon(192).save(OUT / "icon-192.png")
    draw_icon(512).save(OUT / "icon-512.png")
    draw_icon(512, maskable=True).save(OUT / "icon-512-maskable.png")
    print("icons written to", OUT)
