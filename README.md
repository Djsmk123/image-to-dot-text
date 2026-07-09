# image → dot text

Convert any image into braille dot-text art — the kind you can paste into a GitHub README, a terminal, or anywhere monospace text renders.

**Try it live: [image-to-dot-text.vercel.app](https://image-to-dot-text.vercel.app)**

```text
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⢄⢄⢔⢄⢄⢄⢀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡀⡦⡳⠹⠑⠁⠁⠃⠈⠐⠕⠕⠠⡀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢀⢰⢕⠅⠀⠀⠀⢀⢀⣀⢄⢄⢀⢀⠈
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⡢⣳⠁⠀⠀⢠⣼⣾⣿⣟⣿⡯⣟⡾⣜⡄⡀
⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⢪⢪⡣⡁⢠⣿⣿⣿⣿⣿⣿⡽⣯⣻⣪⢺⢸⢐⢄
```

*(see [example_output.txt](example_output.txt) for the full portrait)*

## How it works

1. **Grayscale** — luminosity weights
2. **Autocontrast** — 0.5% histogram cutoff on each end
3. **Background floor** — pixels below a threshold become pure empty, which kills dither "sparkle" in dark backgrounds
4. **Gamma** — lift shadows so dark subjects don't vanish
5. **Floyd–Steinberg dithering** — down to 1-bit
6. **Braille mapping** — every 2×4 pixel cell becomes one Unicode braille character (U+2800–U+28FF), so the image is literally drawn in dots

## Web version

Open [`index.html`](index.html) in any browser — no build, no dependencies, everything runs locally. Drag an image in and tune:

| Control | Default | What it does |
|---|---|---|
| Width | 82 chars | output width; height follows the image aspect ratio |
| Gamma | 0.50 | lower = brighter shadows |
| Floor | 38 | background cutoff (0–255) |
| Invert | off | for dark subjects on light backgrounds |
| Trim | on | strips empty margins |

Copy the result or download it as `.txt`.

## CLI version

```console
$ pip install pillow
$ python3 convert.py photo.png --width 82 --gamma 0.5 --floor 38
```

Same pipeline, same defaults. Add `--invert` for light backgrounds.

## Tips

- **Dark portraits**: gamma 0.4–0.6, floor 30–50
- **Light backgrounds**: turn on invert, then tune floor to clean the background
- **More detail**: increase width — but keep it under ~100 chars if it's going in a README, or GitHub will add a horizontal scrollbar
- Paste the output inside a fenced ` ```text ` block so the dots keep their alignment
