"""Compose the README banner + LinkedIn post image from the captured screenshots.

Usage:  python scripts/make_cover.py      (run `npm run screenshots` first)
Outputs:
  docs/assets/cover-linkedin.png  1200x627  (LinkedIn link/post image ratio 1.91:1)
  docs/assets/banner.png          1600x560  (README hero)
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
SHOTS = ROOT / "docs" / "screenshots"
OUT = ROOT / "docs" / "assets"
OUT.mkdir(parents=True, exist_ok=True)

BG = (11, 14, 20)
CYAN = (120, 196, 255)
SKY = (59, 158, 255)
WHITE = (226, 243, 255)
MUTED = (120, 140, 160)


def font(names, size):
    for n in names:
        for base in (Path("C:/Windows/Fonts"), Path("/usr/share/fonts/truetype/dejavu")):
            p = base / n
            if p.exists():
                return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()


BOLD = ["bahnschrift.ttf", "segoeuib.ttf", "arialbd.ttf", "DejaVuSans-Bold.ttf"]
MONO = ["consola.ttf", "cour.ttf", "DejaVuSansMono.ttf"]


def backdrop(w, h):
    img = Image.new("RGB", (w, h), BG)
    glow = Image.new("RGB", (w, h), (0, 0, 0))
    g = ImageDraw.Draw(glow)
    g.ellipse([-w * 0.2, -h * 0.9, w * 0.7, h * 0.6], fill=(10, 60, 80))
    g.ellipse([w * 0.55, h * 0.4, w * 1.3, h * 1.6], fill=(45, 20, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(120))
    img = Image.blend(img, glow, 0.6)
    d = ImageDraw.Draw(img)
    for x in range(0, w, 40):  # subtle grid
        d.line([(x, 0), (x, h)], fill=(16, 24, 36))
    for y in range(0, h, 40):
        d.line([(0, y), (w, y)], fill=(16, 24, 36))
    return img


def framed(shot: Image.Image, width: int, radius=18):
    ratio = width / shot.width
    s = shot.resize((width, int(shot.height * ratio)), Image.LANCZOS)
    mask = Image.new("L", s.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s.width, s.height], radius, fill=255)
    framed_img = Image.new("RGBA", (s.width + 6, s.height + 6), (0, 0, 0, 0))
    ImageDraw.Draw(framed_img).rounded_rectangle([0, 0, s.width + 5, s.height + 5], radius + 3, outline=SKY + (200,), width=3)
    framed_img.paste(s, (3, 3), mask)
    return framed_img


def shadowed(base: Image.Image, layer: Image.Image, xy):
    sh = Image.new("RGBA", base.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle([xy[0], xy[1], xy[0] + layer.width, xy[1] + layer.height], 20, fill=(0, 255, 255, 70))
    sh = sh.filter(ImageFilter.GaussianBlur(22))
    base.alpha_composite(sh)
    base.alpha_composite(layer, xy)


def compose(w, h, title_size, path):
    img = backdrop(w, h).convert("RGBA")
    d = ImageDraw.Draw(img)
    pad = int(w * 0.05)

    # text block
    d.text((pad, int(h * 0.16)), "THE SYSTEM", font=font(BOLD, title_size), fill=CYAN)
    d.text((pad, int(h * 0.16) + title_size + 10), "Solo Leveling-inspired", font=font(BOLD, int(title_size * 0.34)), fill=WHITE)
    d.text((pad, int(h * 0.16) + int(title_size * 1.5) + 14), "RPG habit tracker", font=font(BOLD, int(title_size * 0.34)), fill=WHITE)
    bullets = ["Daily quests · EXP · E→S rank", "28-day grid · streaks · stats", "Offline PWA · React + TS"]
    y = int(h * 0.16) + int(title_size * 2.25) + 26
    for b in bullets:
        d.text((pad, y), "▸ " + b, font=font(MONO, int(title_size * 0.24)), fill=MUTED)
        y += int(title_size * 0.38)
    d.text((pad, h - pad - int(title_size * 0.3)), "ARISE AND LEVEL UP.", font=font(BOLD, int(title_size * 0.3)), fill=SKY)

    # screenshots
    desk = Image.open(SHOTS / "02-grid-desktop.png").convert("RGB")
    desk = desk.crop((0, 0, desk.width, int(desk.width * 0.62)))
    mob = Image.open(SHOTS / "05-today-mobile.png").convert("RGB")
    mob = mob.crop((0, 0, mob.width, int(mob.width * 1.9)))

    dw = int(w * 0.45)
    dl = framed(desk, dw)
    dx = w - dw - int(pad * 0.6)
    dy = int(h * 0.12)
    shadowed(img, dl, (dx, dy))

    mw = int(w * 0.13)
    ml = framed(mob, mw, radius=22)
    mh = min(ml.height, h - int(h * 0.28))
    ml = ml.crop((0, 0, ml.width, mh))
    shadowed(img, ml, (dx - int(mw * 0.35), h - mh - int(pad * 0.35)))

    img.convert("RGB").save(path, optimize=True)
    print("wrote", path)


if __name__ == "__main__":
    compose(1200, 627, 76, OUT / "cover-linkedin.png")
    compose(1600, 560, 84, OUT / "banner.png")
