#!/usr/bin/env python3
"""Convert an image to braille dot-text art.

Pipeline: grayscale -> autocontrast -> background floor + gamma ->
Floyd-Steinberg dither -> 2x4 braille cells.

Usage:
    python3 convert.py input.png [--width 82] [--gamma 0.5] [--floor 38]
"""
import argparse

from PIL import Image, ImageOps

BLANK = "⠀"
# dot bit positions within a 2x4 braille cell: (dx, dy) -> bit
BITS = {
    (0, 0): 0x01, (0, 1): 0x02, (0, 2): 0x04, (0, 3): 0x40,
    (1, 0): 0x08, (1, 1): 0x10, (1, 2): 0x20, (1, 3): 0x80,
}


def to_braille(im: Image.Image, w_chars: int, gamma: float, floor: int) -> str:
    # 2 px per char horizontally, 4 px vertically; halve the height ratio
    # because a monospace character is roughly twice as tall as it is wide
    w_px = w_chars * 2
    h_px = int(round(w_px * (im.height / im.width) / 2)) * 2
    h_px -= h_px % 4
    h_px = max(h_px, 4)

    im = im.convert("L").resize((w_px, h_px))
    im = ImageOps.autocontrast(im, cutoff=0.5)
    # floor kills dither sparkle in dark backgrounds; gamma lifts shadows
    im = im.point(lambda x: 0 if x < floor else int(((x / 255) ** gamma) * 255))
    px = im.convert("1").load()  # Floyd-Steinberg dithering

    lines = []
    for cy in range(0, h_px, 4):
        row = []
        for cx in range(0, w_px, 2):
            code = 0x2800
            for dx in range(2):
                for dy in range(4):
                    if px[cx + dx, cy + dy]:
                        code |= BITS[(dx, dy)]
            row.append(chr(code))
        lines.append("".join(row).rstrip(BLANK))
    return "\n".join(lines)


def trim(art: str, margin: int = 1) -> str:
    lines = art.split("\n")
    while lines and not lines[0].strip(BLANK):
        lines.pop(0)
    while lines and not lines[-1].strip(BLANK):
        lines.pop()
    indents = [len(l) - len(l.lstrip(BLANK)) for l in lines if l.strip(BLANK)]
    dedent = max(min(indents, default=0) - margin, 0)
    return "\n".join(l[dedent:] if l.strip(BLANK) else "" for l in lines)


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("image")
    p.add_argument("--width", type=int, default=82, help="output width in characters")
    p.add_argument("--gamma", type=float, default=0.5, help="lower = brighter shadows")
    p.add_argument("--floor", type=int, default=38, help="0-255; pixels below become empty")
    p.add_argument("--invert", action="store_true", help="for light backgrounds")
    p.add_argument("--no-trim", action="store_true", help="keep empty margins")
    args = p.parse_args()

    im = Image.open(args.image).convert("L")
    if args.invert:
        im = ImageOps.invert(im)
    art = to_braille(im, args.width, args.gamma, args.floor)
    if not args.no_trim:
        art = trim(art)
    print(art)


if __name__ == "__main__":
    main()
