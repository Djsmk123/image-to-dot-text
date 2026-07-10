const BLANK = "⠀";
// dot bit positions within a 2x4 braille cell: (dx,dy) -> bit
const BITS = {
  "0,0": 0x01, "0,1": 0x02, "0,2": 0x04, "0,3": 0x40,
  "1,0": 0x08, "1,1": 0x10, "1,2": 0x20, "1,3": 0x80,
};

let img = null;

const $ = id => document.getElementById(id);
const drop = $("drop"), fileInput = $("file"), out = $("out");

drop.addEventListener("click", () => fileInput.click());
drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("hover"); });
drop.addEventListener("dragleave", () => drop.classList.remove("hover"));
drop.addEventListener("drop", e => {
  e.preventDefault();
  drop.classList.remove("hover");
  if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) loadFile(fileInput.files[0]);
});

function loadFile(file) {
  const url = URL.createObjectURL(file);
  const im = new Image();
  im.onload = () => {
    img = im;
    drop.innerHTML = "";
    const thumb = document.createElement("img");
    thumb.src = url;
    drop.appendChild(thumb);
    drop.appendChild(document.createTextNode("click to change"));
    render();
  };
  im.src = url;
}

// live controls
for (const [id, valId, fmt] of [
  ["width", "widthVal", v => v],
  ["gamma", "gammaVal", v => Number(v).toFixed(2)],
  ["floor", "floorVal", v => v],
]) {
  $(id).addEventListener("input", () => {
    $(valId).textContent = fmt($(id).value);
    render();
  });
}
$("invert").addEventListener("change", render);
$("trim").addEventListener("change", render);

function render() {
  if (!img) return;
  const { art, lines } = imageToArt(img, {
    wChars: parseInt($("width").value),
    gamma: parseFloat($("gamma").value),
    floor: parseInt($("floor").value),
    invert: $("invert").checked,
    trim: $("trim").checked,
  });
  out.textContent = art;
  $("copy").disabled = $("download").disabled = $("addActor").disabled = false;
  const maxW = Math.max(...lines.map(l => l.length), 0);
  $("stats").textContent = `${maxW} × ${lines.length} chars · ${art.length} total`;
}

// shared conversion pipeline — used by the main preview and by batch
// character uploads in the Scene Maker
function imageToArt(image, { wChars, gamma, floor, invert, trim }) {
  // resize: 2 px per char horizontally, 4 px per char vertically;
  // halve height ratio because a monospace char is ~twice as tall as wide
  const wPx = wChars * 2;
  let hPx = Math.round(wPx * (image.height / image.width) / 2) * 2;
  hPx -= hPx % 4;
  if (hPx < 4) hPx = 4;

  const canvas = document.createElement("canvas");
  canvas.width = wPx;
  canvas.height = hPx;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, wPx, hPx);
  const data = ctx.getImageData(0, 0, wPx, hPx).data;

  // grayscale (luminosity)
  const gray = new Float32Array(wPx * hPx);
  for (let i = 0; i < wPx * hPx; i++) {
    let v = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    if (invert) v = 255 - v;
    gray[i] = v;
  }

  // autocontrast, 0.5% cutoff each end (same as PIL autocontrast(cutoff=0.5))
  const hist = new Array(256).fill(0);
  for (let i = 0; i < gray.length; i++) hist[Math.round(gray[i])]++;
  const cut = gray.length * 0.005;
  let lo = 0, hi = 255, acc = 0;
  for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > cut) { lo = i; break; } }
  acc = 0;
  for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > cut) { hi = i; break; } }
  const scale = hi > lo ? 255 / (hi - lo) : 1;

  // stretch, then floor + gamma
  for (let i = 0; i < gray.length; i++) {
    let v = Math.min(255, Math.max(0, (gray[i] - lo) * scale));
    gray[i] = v < floor ? 0 : Math.pow(v / 255, gamma) * 255;
  }

  // Floyd–Steinberg dithering to 1-bit
  const bit = new Uint8Array(wPx * hPx);
  for (let y = 0; y < hPx; y++) {
    for (let x = 0; x < wPx; x++) {
      const i = y * wPx + x;
      const old = gray[i];
      const nw = old < 128 ? 0 : 255;
      bit[i] = nw ? 1 : 0;
      const err = old - nw;
      if (x + 1 < wPx) gray[i + 1] += err * 7 / 16;
      if (y + 1 < hPx) {
        if (x > 0) gray[i + wPx - 1] += err * 3 / 16;
        gray[i + wPx] += err * 5 / 16;
        if (x + 1 < wPx) gray[i + wPx + 1] += err * 1 / 16;
      }
    }
  }

  // map 2x4 cells to braille chars
  let lines = [];
  for (let cy = 0; cy < hPx; cy += 4) {
    let row = "";
    for (let cx = 0; cx < wPx; cx += 2) {
      let code = 0x2800;
      for (let dx = 0; dx < 2; dx++)
        for (let dy = 0; dy < 4; dy++)
          if (bit[(cy + dy) * wPx + (cx + dx)]) code |= BITS[dx + "," + dy];
      row += String.fromCharCode(code);
    }
    lines.push(row.replace(new RegExp(BLANK + "+$"), ""));
  }

  if (trim) {
    while (lines.length && !lines[0]) lines.shift();
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    const indents = lines
      .filter(l => l)
      .map(l => l.length - l.replace(new RegExp("^" + BLANK + "+"), "").length);
    const dedent = Math.max(Math.min(...indents) - 1, 0);
    lines = lines.map(l => l ? l.slice(dedent) : "");
  }

  const art = lines.join("\n");
  return { art, lines };
}

// ---------------------------------------------------------------------
// Scene Maker: multiple actors, each running a short timeline of basic
// actions (left / right / jump / talk / wait), max 5s per scene.
// ---------------------------------------------------------------------
const MAX_SCENE_MS = 5000;
const actors = []; // { id, art }
let actorSeq = 0;

// turn a user-typed or filename-derived label into a safe, unique JSON id
function sanitizeName(raw, fallbackPrefix) {
  let base = (raw || "").trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  if (!base) { actorSeq += 1; base = `${fallbackPrefix}${actorSeq}`; }
  let name = base, n = 2;
  while (actors.some(a => a.id === name)) { name = `${base}_${n}`; n += 1; }
  return name;
}

function renderActorRow() {
  const row = $("actorRow");
  row.querySelectorAll(".actor-chip").forEach(el => el.remove());
  for (const a of actors) {
    const chip = document.createElement("span");
    chip.className = "actor-chip";
    chip.innerHTML = `<span class="avatar">${a.id.charAt(0)}</span>${a.id} <button title="remove">×</button>`;
    chip.querySelector("button").addEventListener("click", () => {
      const i = actors.indexOf(a);
      if (i >= 0) actors.splice(i, 1);
      renderActorRow();
      updatePromptPreview();
    });
    row.insertBefore(chip, row.firstChild);
  }
  updatePromptPreview();
}

$("addActor").addEventListener("click", () => {
  const text = out.textContent;
  if (!text || !text.trim()) return;
  const id = sanitizeName($("actorName").value, "actor");
  actors.push({ id, art: text });
  $("actorName").value = "";
  renderActorRow();
});

// batch upload: convert each dropped/selected image with the current
// slider settings and add it as an actor named after its filename
$("addActorFiles").addEventListener("click", () => $("actorFiles").click());
$("actorFiles").addEventListener("change", async () => {
  const files = [...$("actorFiles").files];
  $("actorFiles").value = "";
  if (!files.length) return;

  const opts = {
    wChars: parseInt($("width").value),
    gamma: parseFloat($("gamma").value),
    floor: parseInt($("floor").value),
    invert: $("invert").checked,
    trim: $("trim").checked,
  };
  const log = $("uploadLog");
  let done = 0;
  log.textContent = `Converting 0/${files.length}…`;

  for (const file of files) {
    const image = await new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = reject;
      im.src = URL.createObjectURL(file);
    });
    const { art } = imageToArt(image, opts);
    const nameGuess = file.name.replace(/\.[^.]+$/, "");
    const id = sanitizeName(nameGuess, "actor");
    actors.push({ id, art });
    done += 1;
    log.textContent = `Converting ${done}/${files.length}…`;
  }
  log.textContent = `Added ${done} character${done === 1 ? "" : "s"}.`;
  renderActorRow();
});

// falls back to the most recently added actor's art, or the current
// output, so a scene script still runs even if actor ids don't match —
// this is meant for indie use, not strict validation
function getActorArt(id) {
  const found = actors.find(a => a.id === id);
  if (found) return found.art;
  if (actors.length) return actors[actors.length - 1].art;
  return out.textContent;
}

const EXAMPLE_SCENE = {
  actors: [
    { id: "actor1", xPct: 5 },
    { id: "actor2", xPct: 75 },
  ],
  timeline: [
    { actor: "actor1", action: "right", start: 0, duration: 1800, distancePct: 55 },
    { actor: "actor2", action: "left", start: 200, duration: 1600, distancePct: 40 },
    { actor: "actor1", action: "talk", start: 600, duration: 1000, text: "Hi! 👋" },
    { actor: "actor2", action: "talk", start: 1800, duration: 900, text: "Oh, hey!" },
    { actor: "actor1", action: "jump", start: 1900, duration: 700 },
  ],
};

$("loadExample").addEventListener("click", () => {
  $("sceneScript").value = JSON.stringify(EXAMPLE_SCENE, null, 2);
});

function buildPrompt() {
  const ids = actors.length ? actors.map(a => a.id).join(", ") : "actor1, actor2 (add actors first, or use these ids)";
  return `You write short scene scripts for a browser tool that animates ASCII/braille "dot art" characters. Output ONLY valid JSON, no prose, matching this schema:

{
  "actors": [ { "id": string, "xPct": number (0-100, starting horizontal position) } ],
  "timeline": [
    {
      "actor": string,        // must match an actor id
      "action": "left" | "right" | "jump" | "talk" | "wait",
      "start": number,        // ms from scene start
      "duration": number,     // ms
      "distancePct": number,  // for "left"/"right" only: % of stage width to move
      "text": string          // for "talk" only: speech bubble text, keep short
    }
  ]
}

Rules:
- Total scene length (max over all start+duration) must be <= ${MAX_SCENE_MS}ms (5 seconds). This is a hard cap — anything longer gets auto-compressed.
- "left"/"right" move an actor relative to their current position; "jump" is a quick hop in place; "talk" shows a speech bubble; "wait" is just a timing spacer.
- An actor can only do one movement action (left/right/jump) at a time, but "talk" can overlap with movement.
- Currently defined actor ids: ${ids}.

Scene to write: <describe your scene here, e.g. "two friends meet, wave, one jumps for joy">`;
}

function updatePromptPreview() {
  const el = $("aiPromptPreview");
  if (el) el.value = buildPrompt();
}
updatePromptPreview();

$("copyPrompt").addEventListener("click", async () => {
  await navigator.clipboard.writeText(buildPrompt());
  $("copyPrompt").textContent = "Copied!";
  setTimeout(() => $("copyPrompt").textContent = "🤖 Copy AI prompt", 1400);
});

function fitToStage(walker, stage, bubbleHeadroom) {
  const maxH = stage.clientHeight - 24 - bubbleHeadroom;
  const maxW = stage.clientWidth - 24;
  const fitScale = Math.min(1, maxH / walker.offsetHeight, maxW / walker.offsetWidth);
  if (fitScale < 1) walker.style.fontSize = `${9 * fitScale}px`;
  return fitScale;
}

function animateMove(walker, state, dxPx, duration) {
  const fromX = state.x, toX = state.x + dxPx;
  const fromY = state.y;
  const anim = walker.animate([
    { transform: `translate(${fromX}px, ${fromY}px)` },
    { transform: `translate(${fromX + (toX - fromX) * 0.25}px, ${fromY - 3}px)` },
    { transform: `translate(${fromX + (toX - fromX) * 0.5}px, ${fromY}px)` },
    { transform: `translate(${fromX + (toX - fromX) * 0.75}px, ${fromY - 3}px)` },
    { transform: `translate(${toX}px, ${fromY}px)` },
  ], { duration: Math.max(duration, 50), easing: "linear", fill: "forwards" });
  state.x = toX;
  return anim.finished;
}

function animateJump(walker, state, duration) {
  const x = state.x, y = state.y;
  const anim = walker.animate([
    { transform: `translate(${x}px, ${y}px) scale(1, 1)` },
    { transform: `translate(${x}px, ${y + 3}px) scale(1.08, 0.85)`, offset: 0.18 },
    { transform: `translate(${x}px, ${y - 48}px) scale(0.95, 1.12)`, offset: 0.55 },
    { transform: `translate(${x}px, ${y + 3}px) scale(1.08, 0.85)`, offset: 0.82 },
    { transform: `translate(${x}px, ${y}px) scale(1, 1)` },
  ], { duration: Math.max(duration, 50), easing: "cubic-bezier(.34,1.56,.64,1)", fill: "forwards" });
  return anim.finished;
}

// parse + validate the script box and clamp it to the 5s cap, returning a
// timeline with already-scaled start/duration — shared by live playback
// (WAAPI, on the DOM) and video export (manual time-sampled canvas)
function parseSceneConfig() {
  let config;
  try {
    config = JSON.parse($("sceneScript").value);
  } catch (e) {
    return { error: `Invalid JSON: ${e.message}` };
  }
  if (!config || !Array.isArray(config.timeline)) {
    return { error: `Scene needs a "timeline" array.` };
  }
  const sceneActors = Array.isArray(config.actors) ? config.actors : [];
  let total = 0;
  for (const item of config.timeline) total = Math.max(total, (item.start || 0) + (item.duration || 0));
  const scale = total > MAX_SCENE_MS ? MAX_SCENE_MS / total : 1;
  const timeline = config.timeline.map(item => ({
    actor: item.actor,
    action: item.action,
    start: (item.start || 0) * scale,
    duration: (item.duration || (item.action === "jump" ? 700 : item.action === "talk" ? 1200 : 600)) * scale,
    distancePct: item.distancePct,
    text: item.text,
  }));
  return { sceneActors, timeline, total: total * scale, rawTotal: total, scale };
}

function sceneStatusText(sceneActors, timeline, total, scale) {
  return `${sceneActors.length} actor${sceneActors.length === 1 ? "" : "s"} · ${timeline.length} action${timeline.length === 1 ? "" : "s"} · ` +
    (scale < 1 ? `compressed ${(1 / scale).toFixed(2)}× to fit ${MAX_SCENE_MS}ms` : `${Math.round(total)}ms`);
}

async function runScene() {
  const btn = $("runScene");
  const log = $("sceneLog");
  log.classList.remove("error");

  const parsed = parseSceneConfig();
  if (parsed.error) { log.classList.add("error"); log.textContent = parsed.error; return; }
  const { sceneActors, timeline, total, scale } = parsed;

  btn.disabled = true;
  const stage = $("stage");
  stage.innerHTML = "";

  const state = {}; // id -> { el, bubble, x, y }
  for (const a of sceneActors) {
    const walker = document.createElement("pre");
    walker.className = "walker";
    walker.textContent = getActorArt(a.id);
    walker.style.left = `${a.xPct ?? 0}%`;
    stage.appendChild(walker);
    fitToStage(walker, stage, 40);

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    walker.appendChild(bubble);

    state[a.id] = { el: walker, bubble, x: 0, y: 0 };
  }

  const runners = timeline.map(item => new Promise(resolve => {
    const st = state[item.actor];
    if (!st) { resolve(); return; }
    setTimeout(async () => {
      if (item.action === "left") await animateMove(st.el, st, -(stage.clientWidth * (item.distancePct || 20) / 100), item.duration);
      else if (item.action === "right") await animateMove(st.el, st, stage.clientWidth * (item.distancePct || 20) / 100, item.duration);
      else if (item.action === "jump") await animateJump(st.el, st, item.duration);
      else if (item.action === "talk") {
        st.bubble.textContent = item.text || "…";
        st.bubble.classList.add("show");
        await new Promise(r => setTimeout(r, item.duration));
        st.bubble.classList.remove("show");
      } else {
        await new Promise(r => setTimeout(r, item.duration)); // "wait"
      }
      resolve();
    }, item.start);
  }));

  await Promise.all(runners);
  log.textContent = sceneStatusText(sceneActors, timeline, total, scale);
  btn.disabled = false;
}

$("runScene").addEventListener("click", runScene);

// ---------------------------------------------------------------------
// Video export: a separate, purely time-sampled canvas renderer (not
// driven by WAAPI) so a scene can be "played" frame-by-frame at any
// instant and captured with MediaRecorder.
// ---------------------------------------------------------------------
function prepareMovements(timeline, actorId, stageWidthPx) {
  const items = timeline
    .filter(t => t.actor === actorId && (t.action === "left" || t.action === "right" || t.action === "jump"))
    .sort((a, b) => a.start - b.start);
  let x = 0;
  for (const m of items) {
    m._baseX = x;
    m._dx = m.action === "left" ? -(stageWidthPx * (m.distancePct || 20) / 100)
      : m.action === "right" ? stageWidthPx * (m.distancePct || 20) / 100
      : 0; // jump doesn't change committed position
    x = m._baseX + m._dx;
    m._afterX = x;
  }
  return items;
}

function moveBobY(frac) {
  // mirrors the 4-segment walk keyframes: 0 → -3 → 0 → -3 → 0
  const seg = Math.min(frac, 1) * 4;
  const i = Math.min(Math.floor(seg), 3), f = seg - i;
  const ys = [0, -3, 0, -3, 0];
  return ys[i] + (ys[i + 1] - ys[i]) * f;
}

function jumpCurve(frac) {
  // approximates the squash/stretch jump keyframes
  const stops = [
    { t: 0, y: 0, sx: 1, sy: 1 },
    { t: 0.18, y: 3, sx: 1.08, sy: 0.85 },
    { t: 0.55, y: -48, sx: 0.95, sy: 1.12 },
    { t: 0.82, y: 3, sx: 1.08, sy: 0.85 },
    { t: 1, y: 0, sx: 1, sy: 1 },
  ];
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (frac >= a.t && frac <= b.t) {
      const f = (frac - a.t) / (b.t - a.t || 1);
      return { y: a.y + (b.y - a.y) * f, sx: a.sx + (b.sx - a.sx) * f, sy: a.sy + (b.sy - a.sy) * f };
    }
  }
  return stops[stops.length - 1];
}

function sampleActor(movements, t) {
  let x = 0, y = 0, sx = 1, sy = 1;
  for (const m of movements) {
    if (t < m.start) break; // sorted by start — nothing later has started either
    const end = m.start + m.duration;
    if (t >= end) { x = m._afterX; continue; }
    const frac = m.duration > 0 ? (t - m.start) / m.duration : 1;
    if (m.action === "jump") {
      const j = jumpCurve(frac);
      x = m._baseX; y = j.y; sx = j.sx; sy = j.sy;
    } else {
      x = m._baseX + m._dx * frac;
      y = moveBobY(frac);
    }
    break;
  }
  return { x, y, sx, sy };
}

function sampleBubble(talks, t) {
  for (const tk of talks) {
    if (t >= tk.start && t <= tk.start + tk.duration) return tk.text || "…";
  }
  return null;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

async function recordScene() {
  const log = $("sceneLog");
  log.classList.remove("error");

  if (typeof MediaRecorder === "undefined") {
    log.classList.add("error");
    log.textContent = "Video export needs a browser with MediaRecorder support (Chrome, Firefox, Edge).";
    return;
  }

  const parsed = parseSceneConfig();
  if (parsed.error) { log.classList.add("error"); log.textContent = parsed.error; return; }
  const { sceneActors, timeline, total, scale } = parsed;
  if (!sceneActors.length || total <= 0) {
    log.classList.add("error");
    log.textContent = "Nothing to record — add actors and a timeline first.";
    return;
  }

  const runBtn = $("runScene"), recBtn = $("recordScene");
  runBtn.disabled = true;
  recBtn.disabled = true;
  $("recIndicator").classList.add("active");

  const stageEl = $("stage");
  const W = stageEl.clientWidth, H = stageEl.clientHeight;

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  stageEl.innerHTML = "";
  stageEl.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  const rootStyle = getComputedStyle(document.documentElement);
  const bg = rootStyle.getPropertyValue("--bg").trim() || "#0d1117";
  const textColor = rootStyle.getPropertyValue("--text").trim() || "#e6edf3";
  const accent = rootStyle.getPropertyValue("--accent").trim() || "#58a6ff";
  const panelColor = rootStyle.getPropertyValue("--panel").trim() || "#161b22";
  const FONT_STACK = `"SF Mono", Menlo, Consolas, monospace`;

  const actorRender = sceneActors.map(a => {
    const lines = getActorArt(a.id).split("\n");
    let fontSize = 9;
    ctx.font = `${fontSize}px ${FONT_STACK}`;
    const measureW = () => Math.max(...lines.map(l => ctx.measureText(l).width), 1);
    let w = measureW(), h = lines.length * fontSize * 1.15;
    const maxW = W - 24, maxH = H - 24 - 40;
    const fit = Math.min(1, maxW / w, maxH / h);
    if (fit < 1) fontSize *= fit;
    ctx.font = `${fontSize}px ${FONT_STACK}`;
    w = measureW();
    h = lines.length * fontSize * 1.15;
    return {
      id: a.id, lines, fontSize, w, h,
      baseLeft: (a.xPct || 0) / 100 * W,
      movements: prepareMovements(timeline, a.id, W),
      talks: timeline.filter(t => t.actor === a.id && t.action === "talk").sort((x, y) => x.start - y.start),
    };
  });

  function draw(t) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    ctx.textBaseline = "top";
    for (const ar of actorRender) {
      const { x, y, sx, sy } = sampleActor(ar.movements, t);
      const left = ar.baseLeft + x;
      const bottom = H - 10;
      const top = bottom - ar.h;
      const lineH = ar.fontSize * 1.15;

      ctx.save();
      const cx = left + ar.w / 2, cy = bottom;
      ctx.translate(cx, cy);
      ctx.scale(sx, sy);
      ctx.translate(-cx, -cy);
      ctx.fillStyle = textColor;
      ctx.font = `${ar.fontSize}px ${FONT_STACK}`;
      ar.lines.forEach((line, i) => ctx.fillText(line, left, top + y + i * lineH));
      ctx.restore();

      const bubbleText = sampleBubble(ar.talks, t);
      if (bubbleText) {
        ctx.font = `12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        const padX = 10, padY = 6, tw = ctx.measureText(bubbleText).width;
        const bw = tw + padX * 2, bh = 12 + padY * 2;
        const bx = left + ar.w / 2 - bw / 2, by = top + y - bh - 10;
        ctx.fillStyle = panelColor;
        ctx.strokeStyle = accent;
        roundRectPath(ctx, bx, by, bw, bh, 8);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = textColor;
        ctx.textBaseline = "middle";
        ctx.fillText(bubbleText, bx + padX, by + bh / 2);
        ctx.textBaseline = "top";
      }
    }
  }

  const mimeType = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
    .find(m => MediaRecorder.isTypeSupported(m)) || "";
  const stream = canvas.captureStream(30);
  const chunks = [];
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise(resolve => { recorder.onstop = resolve; });

  draw(0);
  recorder.start();
  const startTime = performance.now();
  await new Promise(resolve => {
    function frame(now) {
      const t = Math.min(now - startTime, total);
      draw(t);
      log.textContent = `Recording… ${Math.round((t / total) * 100)}%`;
      if (t < total) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
  recorder.stop();
  await stopped;

  const blob = new Blob(chunks, { type: mimeType || "video/webm" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "scene.webm";
  a.click();

  log.textContent = `Saved scene.webm (${(blob.size / 1024).toFixed(0)} KB) · ${sceneStatusText(sceneActors, timeline, total, scale)}`;
  $("recIndicator").classList.remove("active");
  runBtn.disabled = false;
  recBtn.disabled = false;
}

$("recordScene").addEventListener("click", recordScene);

$("copy").addEventListener("click", async () => {
  await navigator.clipboard.writeText(out.textContent);
  $("copy").textContent = "Copied!";
  setTimeout(() => $("copy").textContent = "Copy", 1200);
});

$("download").addEventListener("click", () => {
  const blob = new Blob([out.textContent], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "dot-art.txt";
  a.click();
});
