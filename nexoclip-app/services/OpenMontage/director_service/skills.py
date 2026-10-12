"""OpenMontage skills the Director agent can load on demand.

Only an index (name + one line) goes into every prompt; the agent calls
read_skill when a task needs one. The list is limited to skills that fit what
the Director can actually do (image/video generation, no audio or render yet).
"""

from __future__ import annotations

from pathlib import Path

SKILLS_DIR = Path(__file__).resolve().parents[1] / "skills"
MAX_CHARS = 24000

# name -> (path under skills/, when to use it)
SKILLS: dict[str, tuple[str, str]] = {
    "taste-direction": ("meta/taste-direction.md", "deciding a coherent visual identity / mood before visuals"),
    "storytelling": ("creative/storytelling.md", "narrative structure, hooks, payoff"),
    "short-form": ("creative/short-form.md", "TikTok/Reels/Shorts: hooks, pacing, vertical framing, retention"),
    "cinematic": ("creative/cinematic.md", "trailers, brand films, montages: rhythm, shot language, escalation"),
    "idea-director": ("pipelines/cinematic/idea-director.md", "shaping a cinematic concept from the brief"),
    "proposal-director": ("pipelines/cinematic/proposal-director.md", "comparing concept options and choosing one"),
    "script-director": ("pipelines/cinematic/script-director.md", "beat map, title-card copy, reveal structure"),
    "scene-director": ("pipelines/cinematic/scene-director.md", "turning beats into a shot-by-shot visual plan"),
    "asset-director": ("pipelines/cinematic/asset-director.md", "planning reference assets and consistency across shots"),
    "character-design": ("pipelines/character-animation/character-design-director.md", "character design: silhouettes, required views, expressions, props"),
    "broll-planning": ("creative/broll-planning.md", "supporting shots / inserts for a script"),
    "color-grading": ("core/color-grading.md", "palette and grade language for a consistent look"),
    "typography": ("creative/typography.md", "on-screen text and title cards"),
    "image-gen-usage": ("creative/image-gen-usage.md", "writing image prompts (characters, locations, frames)"),
    "video-gen-prompting": ("creative/video-gen-prompting.md", "universal video prompt vocabulary: camera, motion, light"),
    "seedance-prompting": ("creative/prompting/seedance-prompting.md", "Seedance-specific video prompt structure (our video model)"),
    "reviewer": ("meta/reviewer.md", "critically reviewing a plan or result before showing it"),
}


def index_text() -> str:
    return "\n".join(f"- {name}: {why}" for name, (_, why) in SKILLS.items())


def read(name: str) -> str:
    entry = SKILLS.get(name)
    if entry is None:
        raise KeyError(f"unknown skill {name!r}; available: {', '.join(SKILLS)}")
    text = (SKILLS_DIR / entry[0]).read_text(encoding="utf-8")
    if len(text) > MAX_CHARS:
        text = text[:MAX_CHARS] + "\n...(truncated)"
    return text
