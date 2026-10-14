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
MAX_CHARS = 36000  # the official Seedance 2.5 reference is ~32k characters

# Third-party guides (skills/external/CREDITS.md): Serge Shima's visual-skills (CC BY 4.0) and
# jnMetaCode's ai-shortfilm-prompts templates (MIT).
VS = "skills/external/visual-skills/video/references/"
SF = "skills/external/shortfilm-prompts/templates/"
SEEDANCE = VS + "seedance-25.md"  # a summary of ByteDance's official Seedance 2.5 guides
# Left out on purpose, to keep one source for prompt syntax (ByteDance's own optimizer, SD25_PE): visual-skills'
# seedance.md (Seedance 1.x/2.0), universal-rules.md and fixes-and-skeletons.md (multi-model skeletons, default
# negatives), shortfilm-prompts' negative-prompts.md, OpenMontage's seedance-2-5 SKILL.md and video-gen-prompting.md.
SEEDANCE_TECHNIQUES = ".agents/skills/seedance-2-5/reference/techniques.md"
SD25_PE = "skills/external/seedance-sd25-pe/"  # ByteDance's own Seedance 2.5 prompt optimizer, split in three parts
CINEMATIC = {"idea": "skills/pipelines/cinematic/idea-director.md", "script": "skills/pipelines/cinematic/script-director.md",
             "scene": "skills/pipelines/cinematic/scene-director.md", "asset": "skills/pipelines/cinematic/asset-director.md"}
# Story-led films: arcs and genre modules, the screenwriter's beat breakdown, the director's scene method.
DRAMA = {"idea": VS + "patterns-and-genres.md", "script": VS + "role-modes.md", "scene": VS + "dramaturgy.md",
         "asset": "skills/pipelines/cinematic/asset-director.md"}

# The kinds of video the Director makes. label, pipeline guides by role, and the Seedance 2.5 prompt archetypes
# (reference/techniques.md) that fit it.
VIDEO_TYPES: dict[str, dict[str, object]] = {
    "ugc_ad": {"label": "UGC ad", "archetypes": "8 (UGC-style ad); genre-modules: UGC / Social",
               "roles": {**dict.fromkeys(("idea", "script", "scene"), "skills/creative/ugc-ad.md"),
                         "asset": "skills/creative/ugc-ad.md", "example": SF + "travel-vlog.md"}},
    "product_ad": {"label": "product commercial", "archetypes": "3 (commercial product); genre-modules: Commercial, pattern 5",
                   "roles": {"idea": VS + "patterns-and-genres.md", "script": VS + "role-modes.md",
                             "scene": VS + "dramaturgy.md", "asset": CINEMATIC["asset"], "example": SF + "product-commercial.md"}},
    "short_film": {"label": "short film / drama", "archetypes": "1 (dramatic exterior), 6 (multi-character); genre-modules: drama",
                   "roles": {**DRAMA, "example": SF + "multi-shot-narrative.md"}},
    "micro_drama": {"label": "vertical micro-drama episode", "archetypes": "1 (dramatic), 6 (multi-character)",
                    "roles": {"idea": "skills/creative/micro-drama.md", "script": "skills/creative/micro-drama.md",
                              "scene": VS + "dramaturgy.md", "asset": CINEMATIC["asset"], "example": SF + "micro-drama.md"}},
    "trailer": {"label": "trailer / teaser", "archetypes": "2 (action multi-shot), 4 (epic landscape), 7 (fantasy action)",
                "roles": {**CINEMATIC, "example": SF + "movie-trailer.md"}},
    "music_video": {"label": "music video", "archetypes": "2 (action multi-shot), 5 (noir); genre-modules: Music video, pattern 6",
                    "roles": {"idea": VS + "patterns-and-genres.md", "script": VS + "role-modes.md",
                              "scene": VS + "dramaturgy.md", "asset": CINEMATIC["asset"], "example": SF + "music-video.md"}},
    "explainer": {"label": "explainer", "archetypes": "3 (commercial product) for product explainers, 10 (documentary)",
                  "roles": {"idea": "skills/pipelines/explainer/idea-director.md",
                            "script": "skills/pipelines/explainer/script-director.md",
                            "scene": "skills/pipelines/explainer/scene-director.md",
                            "asset": "skills/pipelines/explainer/asset-director.md"}},
    "documentary": {"label": "documentary / observational", "archetypes": "10 (documentary), 4 (epic landscape)",
                    "roles": {"idea": "skills/pipelines/documentary-montage/idea-director.md", "script": VS + "role-modes.md",
                              "scene": "skills/pipelines/documentary-montage/scene-director.md", "asset": CINEMATIC["asset"],
                              "example": SF + "travel-vlog.md"}},
    "animation": {"label": "animation (3D, anime, illustrated, character-led)", "archetypes": "7 (fantasy action), 6 (multi-character)",
                  "roles": {"idea": "skills/pipelines/animation/idea-director.md",
                            "script": "skills/pipelines/character-animation/script-director.md",
                            "scene": "skills/pipelines/character-animation/scene-director.md",
                            "asset": "skills/pipelines/character-animation/asset-director.md", "example": SF + "claymation.md"}},
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
    "example-prompt": ("example", "a complete worked prompt example for this project's video type (when there is one)"),
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
    "seedance-prompting": (SEEDANCE, "a summary of ByteDance's Seedance 2.5 guides with extras: anti-collapse skeleton, realistic humans (anti AI face), physics, failure modes and fixes"),
    "seedance-archetypes": (SEEDANCE_TECHNIQUES, "the ten official Seedance 2.5 prompt categories (UGC, product, drama, action, documentary...)"),
    "seedance-official-workflow": (SD25_PE + "1-workflow.md", "ByteDance's official Seedance 2.5 prompt optimizer, part 1: principles, story contract, asset inventory, mapping every asset to one role, choosing generation/edit/extend"),
    "seedance-official-generation": (SD25_PE + "2-generation.md", "official optimizer part 2: generation templates, many references, stages and timecodes, keyframes ('Use @Image1 through @ImageN as keyframes'), storyboard grids, blockouts, emotion, camera, ()<>{}【】 sound syntax"),
    "seedance-official-edit": (SD25_PE + "3-edit-extend-output.md", "official optimizer part 3: video and audio editing, forward/backward extension, output contract, final checklist"),
    "dramaturgy": (VS + "dramaturgy.md", "scene formula, three-detail rule, blocking, subtext, shot functions, rhythm"),
    "genre-modules": (VS + "patterns-and-genres.md", "montage patterns and genre modules: commercial, music video, UGC, drama, action, fashion; story arcs"),
    "role-modes": (VS + "role-modes.md", "director treatment, screenwriter beat breakdown and dialogue, editor timecoded beats"),
    "camera-lighting": (VS + "camera-lighting-vocabulary.md", "camera moves, lenses and lighting vocabulary"),
    "camera-moves": (SF + "camera-move-library.md", "a library of camera moves with prompt wording"),
    "atmosphere": (SF + "atmosphere-prefabs.md", "ready atmosphere/weather/light descriptions"),
    "genre-camera": (SF + "genre-camera-sop.md", "camera habits per genre (horror, romance, action, documentary...)"),
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
        roles = video_type(kind)["roles"]
        if ROLES[name][0] not in roles:  # type: ignore[operator]
            raise KeyError(f"{name} has no guide for this video type; use seedance-archetypes instead")
        return str(roles[ROLES[name][0]])  # type: ignore[index]
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
