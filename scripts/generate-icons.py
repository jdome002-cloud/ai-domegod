#!/usr/bin/env python3
"""Generate PWA icons for AI DOMEgod.

ImageMagick was not available in the build environment (apt repo error),
so icons are drawn with Pillow instead: a dark rounded square and a bold
violet D, plus a maskable full-bleed variant.
"""
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public")
ICON_DIR = os.path.join(OUT, "icons")
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
BG = (8, 10, 18, 255)
ACCENT = (139, 123, 255, 255)


def make_icon(size, maskable=False, rounded=False):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    if maskable:
        draw.rectangle((0, 0, size, size), fill=BG)
    elif rounded:
        draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * 0.22), fill=BG)
    else:
        draw.rectangle((0, 0, size, size), fill=BG)

    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    cx = cy = size / 2
    radius = int(size * (0.28 if maskable else 0.34))
    gd.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=(109, 94, 252, 90))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=max(2, size // 14)))
    img = Image.alpha_composite(img, glow)
    draw = ImageDraw.Draw(img)

    font = ImageFont.truetype(FONT, int(size * (0.46 if maskable else 0.58)))
    text = "D"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - tw) / 2 - bbox[0]
    y = (size - th) / 2 - bbox[1] - size * 0.03
    draw.text((x, y + max(1, size * 0.008)), text, font=font, fill=(60, 50, 140, 200))
    draw.text((x, y), text, font=font, fill=ACCENT)
    return img


def main():
    os.makedirs(ICON_DIR, exist_ok=True)
    make_icon(192, rounded=True).save(os.path.join(ICON_DIR, "icon-192.png"), "PNG", optimize=True)
    make_icon(512, rounded=True).save(os.path.join(ICON_DIR, "icon-512.png"), "PNG", optimize=True)
    make_icon(512, maskable=True).save(os.path.join(ICON_DIR, "icon-maskable-512.png"), "PNG", optimize=True)
    apple = make_icon(180, rounded=False)
    apple.save(os.path.join(OUT, "apple-touch-icon-180.png"), "PNG", optimize=True)
    apple.save(os.path.join(OUT, "apple-touch-icon.png"), "PNG", optimize=True)
    make_icon(32, rounded=True).save(os.path.join(OUT, "favicon-32.png"), "PNG", optimize=True)


if __name__ == "__main__":
    main()
