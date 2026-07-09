#!/usr/bin/env python3
"""Author multi-actor, max-5-second scenes for the dot-text Scene Maker.

Build a Scene in Python, print/save it as JSON, then paste the JSON into
the web tool's "Scene Maker" script box (index.html) and click Run scene.

You can also hand the scene's schema to an LLM (see prompt() below, which
mirrors the "Copy AI prompt" button in the web tool) and have it write or
adjust the timeline for you in plain English.

Actions: left, right (relative move, distance_pct is % of stage width),
jump (in place), talk (speech bubble), wait (timing spacer only).
"""
from dataclasses import dataclass, field, asdict
import json

MAX_SCENE_MS = 5000


@dataclass
class Actor:
    id: str
    x_pct: int = 0  # starting horizontal position, 0-100


@dataclass
class Action:
    actor: str
    action: str  # "left" | "right" | "jump" | "talk" | "wait"
    start: int  # ms from scene start
    duration: int = 600  # ms
    distance_pct: int = 20  # only used by "left" / "right"
    text: str = ""  # only used by "talk"


@dataclass
class Scene:
    actors: list = field(default_factory=list)
    timeline: list = field(default_factory=list)

    def total_ms(self) -> int:
        return max((a.start + a.duration for a in self.timeline), default=0)

    def to_dict(self, *, clamp: bool = True) -> dict:
        total = self.total_ms()
        scale = MAX_SCENE_MS / total if clamp and total > MAX_SCENE_MS else 1.0
        timeline = []
        for t in self.timeline:
            item = {
                "actor": t.actor,
                "action": t.action,
                "start": round(t.start * scale),
                "duration": round(t.duration * scale),
            }
            if t.action in ("left", "right"):
                item["distancePct"] = t.distance_pct
            if t.action == "talk":
                item["text"] = t.text
            timeline.append(item)
        return {
            "actors": [{"id": a.id, "xPct": a.x_pct} for a in self.actors],
            "timeline": timeline,
        }

    def to_json(self, *, clamp: bool = True, indent: int = 2) -> str:
        return json.dumps(self.to_dict(clamp=clamp), indent=indent, ensure_ascii=False)

    def save(self, path: str, *, clamp: bool = True) -> None:
        with open(path, "w") as f:
            f.write(self.to_json(clamp=clamp))


def prompt(scene_description: str, actor_ids: list) -> str:
    """Build an LLM prompt to generate/adjust a scene's JSON — the same
    text the web tool's "Copy AI prompt" button produces."""
    ids = ", ".join(actor_ids) if actor_ids else "actor1, actor2"
    return f"""You write short scene scripts for a browser tool that animates ASCII/braille "dot art" characters. Output ONLY valid JSON, no prose, matching this schema:

{{
  "actors": [ {{ "id": string, "xPct": number (0-100, starting horizontal position) }} ],
  "timeline": [
    {{
      "actor": string,        // must match an actor id
      "action": "left" | "right" | "jump" | "talk" | "wait",
      "start": number,        // ms from scene start
      "duration": number,     // ms
      "distancePct": number,  // for "left"/"right" only: % of stage width to move
      "text": string          // for "talk" only: speech bubble text, keep short
    }}
  ]
}}

Rules:
- Total scene length (max over all start+duration) must be <= {MAX_SCENE_MS}ms (5 seconds). This is a hard cap — anything longer gets auto-compressed.
- "left"/"right" move an actor relative to their current position; "jump" is a quick hop in place; "talk" shows a speech bubble; "wait" is just a timing spacer.
- An actor can only do one movement action (left/right/jump) at a time, but "talk" can overlap with movement.
- Currently defined actor ids: {ids}.

Scene to write: {scene_description}"""


if __name__ == "__main__":
    scene = Scene(
        actors=[Actor("actor1", x_pct=5), Actor("actor2", x_pct=75)],
        timeline=[
            Action("actor1", "right", start=0, duration=1800, distance_pct=55),
            Action("actor2", "left", start=200, duration=1600, distance_pct=40),
            Action("actor1", "talk", start=600, duration=1000, text="Hi! 👋"),
            Action("actor2", "talk", start=1800, duration=900, text="Oh, hey!"),
            Action("actor1", "jump", start=1900, duration=700),
        ],
    )
    print(scene.to_json())
    print(f"\n# total: {scene.total_ms()}ms (cap: {MAX_SCENE_MS}ms)")
