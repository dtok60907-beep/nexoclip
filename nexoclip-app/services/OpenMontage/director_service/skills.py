"""OpenMontage skills the Director agent can load on demand.

Only an index (name + one line) goes into every prompt; the agent calls
read_skill when a task needs one. The list is limited to skills that fit what
the Director can actually do (generated images, video, voiceover and music).

The pipeline roles (idea-director, script-director, scene-director,
asset-director) keep one name each but follow the project's video type: a UGC
ad reads the UGC guide, an explainer the explainer pipeline, an animation the
animation pipeline, and so on (see VIDEO_TYPES).
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]  # the OpenMontage folder: skills/ and .agents/skills/
MAX_CHARS = 24000

SEEDANCE = ".agents/skills/seedance-2-5/SKILL.md"
SEEDANCE_TECHNIQUES = ".agents/skills/seedance-2-5/reference/techniques.md"

# The kinds of video the Director makes. label, pipeline guides by role, and the Seedance 2.5 prompt archetypes
# (reference/techniques.md) that fit it.
VIDEO_TYPES: dict[str, dict[str, object]] = {
    "ugc_ad": {"label": "UGC ad", "archetypes": "8 (UGC-style ad)",
               "roles": dict.fromkeys(("idea", "script", "scene", "asset"), "skills/creative/ugc-ad.md")},
    "product_ad": {"label": "product commercial", "archetypes": "3 (commercial product), 4 (environment as protagonist)",
                   "roles": {"idea": "skills/pipelines/cinematic/idea-director.md",
                             "script": "skills/pipelines/cinematic/script-director.md",
                             "scene": "skills/pipelines/cinematic/scene-director.md",
                             "asset": "skills/pipelines/cinematic/asset-director.md"}},
    "short_film": {"label": "short film / drama", "archetypes": "1 (dramatic exterior), 6 (multi-character), 5 (noir)",
                   "roles": {"idea": "skills/pipelines/cinematic/idea-director.md",
                             "script": "skills/pipelines/cinematic/script-director.md",
                             "scene": "skills/pipelines/cinematic/scene-director.md",
                             "asset": "skills/pipelines/cinematic/asset-director.md"}},
    "micro_drama": {"label": "vertical micro-drama episode", "archetypes": "1 (dramatic), 6 (multi-character)",
                    "roles": {"idea": "skills/creative/micro-drama.md", "script": "skills/creative/micro-drama.md",
                              "scene": "skills/creative/micro-drama.md",
                              "asset": "skills/pipelines/cinematic/asset-director.md"}},
    "trailer": {"label": "trailer / teaser", "archetypes": "2 (action multi-shot), 4 (epic landscape), 7 (fantasy action)",
                "roles": {"idea": "skills/pipelines/cinematic/idea-director.md",
                          "script": "skills/pipelines/cinematic/script-director.md",
                          "scene": "skills/pipelines/cinematic/scene-director.md",
                          "asset": "skills/pipelines/cinematic/asset-director.md"}},
    "music_video": {"label": "music video", "archetypes": "2 (action multi-shot), 4 (epic landscape), 5 (noir)",
                    "roles": {"idea": "skills/pipelines/cinematic/idea-director.md",
                              "script": "skills/pipelines/cinematic/script-director.md",
                              "scene": "skills/pipelines/cinematic/scene-director.md",
                              "asset": "skills/pipelines/cinematic/asset-director.md"}},
    "explainer": {"label": "explainer", "archetypes": "3 (commercial product) for product explainers, 10 (documentary)",
                  "roles": {"idea": "skills/pipelines/explainer/idea-director.md",
                            "script": "skills/pipelines/explainer/script-director.md",
                            "scene": "skills/pipelines/explainer/scene-director.md",
                            "asset": "skills/pipelines/explainer/asset-director.md"}},
    "documentary": {"label": "documentary / observational", "archetypes": "10 (documentary), 4 (epic landscape)",
                    "roles": {"idea": "skills/pipelines/documentary-montage/idea-director.md",
                              "script": "skills/pipelines/cinematic/script-director.md",
                              "scene": "skills/pipelines/documentary-montage/scene-director.md",
                              "asset": "skills/pipelines/cinematic/asset-director.md"}},
    "animation": {"label": "animation (3D, anime, illustrated, character-led)", "archetypes": "7 (fantasy action), 6 (multi-character)",
                  "roles": {"idea": "skills/pipelines/animation/idea-director.md",
                            "script": "skills/pipelines/character-animation/script-director.md",
                            "scene": "skills/pipelines/character-animation/scene-director.md",
                            "asset": "skills/pipelines/character-animation/asset-director.md"}},
    "presenter": {"label": "presenter / spokesperson talking to camera", "archetypes": "8 (UGC-style, natural delivery)",
                  "roles": {"idea": "skills/pipelines/avatar-spokesperson/idea-director.md",
                            "script": "skills/pipelines/avatar-spokesperson/script-director.md",
                            "scene": "skills/pipelines/avatar-spokesperson/scene-director.md",
                            "asset": "skills/pipelines/avatar-spokesperson/asset-director.md"}},
}
DEFAULT_TYPE = "short_film"  # projects from before video types: the cinematic guides, as before

ROLES = {
    "idea-director": ("idea", "shaping the concept and brief for this project's video type"),
    "script-director": ("script", "writing the script / beats for this project's video type"),
    "scene-director": ("scene", "turning the script into a shot plan for this project's video type"),
    "asset-director": ("asset", "planning reference assets and consistency for this project's video type"),
}

# name -> (path under OpenMontage/, when to use it)
SKILLS: dict[str, tuple[str, str]] = {
    "creative-intake": ("skills/meta/creative-intake.md", "the questions that matter when a brief is vague"),
    "taste-direction": ("skills/meta/taste-direction.md", "deciding a coherent visual identity / mood before visuals"),
    "storytelling": ("skills/creative/storytelling.md", "narrative structure, hooks, payoff"),
    "short-form": ("skills/creative/short-form.md", "TikTok/Reels/Shorts: hooks, pacing, vertical framing, retention"),
    "long-form": ("skills/creative/long-form.md", "videos over ~2 minutes: retention, chapters, pattern interrupts"),
    "cinematic": ("skills/creative/cinematic.md", "trailers, brand films, montages: rhythm, shot language, escalation"),
    "ugc-ad": ("skills/creative/ugc-ad.md", "UGC ads: creator on a phone, hook, testimonial/demo structure, UGC prompts"),
    "micro-drama": ("skills/creative/micro-drama.md", "vertical episodic drama: hook, escalation, cliffhanger, dialogue shots"),
    "proposal-director": ("skills/pipelines/cinematic/proposal-director.md", "comparing concept options and choosing one"),
    "character-design": ("skills/pipelines/character-animation/character-design-director.md", "character design: silhouettes, required views, expressions, props"),
    "broll-planning": ("skills/creative/broll-planning.md", "supporting shots / inserts for a script"),
    "color-grading": ("skills/core/color-grading.md", "palette and grade language for a consistent look"),
    "typography": ("skills/creative/typography.md", "on-screen text, captions and title cards"),
    "image-gen-usage": ("skills/creative/image-gen-usage.md", "writing image prompts (characters, locations, frames)"),
    "video-gen-prompting": ("skills/creative/video-gen-prompting.md", "universal video prompt vocabulary: camera, motion, light"),
    "seedance-prompting": (SEEDANCE, "Seedance 2.5 (our video model): prompt section order, locks for continuity, assets, voice"),
    "seedance-archetypes": (SEEDANCE_TECHNIQUES, "the ten official Seedance 2.5 prompt categories (UGC, product, drama, action, documentary...)"),
    "reviewer": ("skills/meta/reviewer.md", "critically reviewing a plan or result before showing it"),
    "video-reference-analyst": ("skills/meta/video-reference-analyst.md", "turning a reference video the user sent into a plan"),
    "voice-performance-director": ("skills/meta/voice-performance-director.md", "writing and directing a voiceover: pacing, pauses, energy, delivery"),
    "music-gen-usage": ("skills/creative/music-gen-usage.md", "music prompts for ElevenLabs music: genre, BPM by video type, mood, structure"),
    "sound-design": ("skills/creative/sound-design.md", "how voice, music and clip sound sit together (levels, ducking, timing)"),
}


def video_type(name: str) -> dict[str, object]:
    return VIDEO_TYPES.get(name or DEFAULT_TYPE) or VIDEO_TYPES[DEFAULT_TYPE]


def path_for(name: str, kind: str = "") -> str:
    """Where a skill lives; pipeline roles depend on the project's video type."""
    if name in ROLES:
        return str(video_type(kind)["roles"][ROLES[name][0]])  # type: ignore[index]
    entry = SKILLS.get(name)
    if entry is None:
        raise KeyError(f"unknown skill {name!r}; available: {', '.join([*ROLES, *SKILLS])}")
    return entry[0]


def index_text() -> str:
    roles = [f"- {name}: {why}" for name, (_, why) in ROLES.items()]
    return "\n".join([*roles, *(f"- {name}: {why}" for name, (_, why) in SKILLS.items())])


def read(name: str, kind: str = "") -> str:
    text = (ROOT / path_for(name, kind)).read_text(encoding="utf-8")
    if len(text) > MAX_CHARS:
        text = text[:MAX_CHARS] + "\n...(truncated)"
    return text
