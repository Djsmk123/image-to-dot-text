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

## Scene Maker

A very basic animation layer for turning your dot-art characters into short scenes — built for quick, indie-movie-style clips, not production animation.

- **Multiple actors** — click "+ Add actor from current output" for each character you've converted (drop a new image, re-run the converter, add again).
- **Actions**: `left` / `right` (move relative to current position, custom `distancePct` and `duration`), `jump` (squash-and-stretch hop in place), `talk` (speech bubble with custom text and duration), `wait` (timing spacer).
- **Max 5 seconds per scene** — this is a hard cap. If your timeline runs longer, it's automatically compressed (start/duration scaled down proportionally) rather than cut off, and the tool tells you the compression factor.
- **LLM-assisted authoring** — click "🤖 Copy AI prompt" to copy a ready-made prompt (schema + your current actor ids) to your clipboard. Paste it into ChatGPT, Claude, or any LLM along with a plain-English scene description, and paste the JSON it returns back into the script box.

Scene JSON shape:

```json
{
  "actors": [ { "id": "actor1", "xPct": 5 } ],
  "timeline": [
    { "actor": "actor1", "action": "right", "start": 0, "duration": 1800, "distancePct": 55 },
    { "actor": "actor1", "action": "talk", "start": 600, "duration": 1000, "text": "Hi! 👋" },
    { "actor": "actor1", "action": "jump", "start": 1900, "duration": 700 }
  ]
}
```

### Python config

[`scene.py`](scene.py) lets you script scenes as Python instead of hand-writing JSON — handy for generating a batch of shots:

```console
$ python3 scene.py
```

```python
from scene import Scene, Actor, Action

scene = Scene(
    actors=[Actor("actor1", x_pct=5), Actor("actor2", x_pct=75)],
    timeline=[
        Action("actor1", "right", start=0, duration=1800, distance_pct=55),
        Action("actor1", "talk", start=600, duration=1000, text="Hi! 👋"),
        Action("actor1", "jump", start=1900, duration=700),
    ],
)
scene.save("scene.json")  # paste into the web tool's Scene Maker, or load it yourself
```

`scene.total_ms()` reports the raw (uncompressed) length; `to_json()`/`save()` auto-compress to the 5-second cap the same way the web tool does. `scene.prompt(description, actor_ids)` generates the same LLM prompt as the "Copy AI prompt" button, if you'd rather call an LLM from Python.

**Limits, by design (this is meant to stay basic):** one movement action (`left`/`right`/`jump`) at a time per actor — overlapping movement on the same actor isn't resolved, just don't schedule it that way; `talk` can freely overlap with movement. No collision detection, no z-ordering, no video/GIF export — it's a browser-only preview, not a renderer.

## Tips

- **Dark portraits**: gamma 0.4–0.6, floor 30–50
- **Light backgrounds**: turn on invert, then tune floor to clean the background
- **More detail**: increase width — but keep it under ~100 chars if it's going in a README, or GitHub will add a horizontal scrollbar
- Paste the output inside a fenced ` ```text ` block so the dots keep their alignment
