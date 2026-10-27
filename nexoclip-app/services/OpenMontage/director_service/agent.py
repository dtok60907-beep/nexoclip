"""The Director agent: an LLM that edits the project board through tools.

There is no fixed pipeline. Each user message starts a turn: the model sees
the conversation and the current board, calls whatever tools it needs (brief,
concepts, web research, script, elements, shots, generation requests), and
ends with a chat reply. It cannot spend credits on its own (request_generation
prices a request and the user approves it) and cannot change anything the
user locked. The same validated edit functions back the user's direct edits
in the board, and every change is recorded as a new board version.
"""

from __future__ import annotations

import base64
import copy
import hashlib
import io
import json
import re
import uuid
from dataclasses import dataclass
from typing import Any, Callable, Optional

from director_service import billing, board as boards, generation, live, llm, nexoclip, skills
from director_service.store import add_llm_cost, append_chat, append_llm_log, now_iso, read_chat, read_director, update_director

MAX_STEPS = 30  # "Langsung jadi" goes from a brief to approved generation in one turn
HISTORY_ENTRIES = 40
BOARD_CHARS = 30000
_ID = re.compile(r"^[a-z0-9_]{2,40}$")

INSTRUCTIONS = """You are the AI Director inside nexoclip, a video creation studio. You chat with the user and
build their video on a shared project board using tools. You decide what to do next; there is no fixed pipeline.

What you can do (tools):
- set_project_title: as soon as you know what the video is (usually with the first brief), give the project a short
  name (2-6 words, the title, product or idea, e.g. "Iklan Serum Glowria", "Peron Tujuh"); rename it when the
  direction really changes. Keep it if the user named it.
- update_brief: the creative brief. summary is 2-4 sentences: what the video is, the story or idea, and how it should
  feel. The detail fields: goal (sell, awareness, story, education ...), audience, platform, key_message (the one thing
  viewers must remember), product (name, look, colours, logo; empty when there is none), tone (mood, pace, music feel),
  references (similar films, ads, creators), cta (the ending / call to action), must_have, avoid. Plus look, aspect
  ratio, target duration, visual style, resolution and native audio on/off. Keep resolution 720p unless the user asks
  for another one (1080p costs about 2.5x per second). Aspect ratios: 16:9, 9:16, 1:1, 4:3, 3:4, 21:9 (cinematic wide).
  video_type is the kind of video (ugc_ad, product_ad, short_film, micro_drama, trailer, music_video, explainer,
  documentary, animation, presenter): it decides the craft guides, the shot language and how prompts are written.
  Infer it yourself from what the user says and set it with the brief; never ask the user only for this. "UGC",
  "review/testimoni ala creator" -> ugc_ad; "iklan produk/commercial" -> product_ad; "drama", "film pendek" ->
  short_film; "drama vertikal/series/episode" -> micro_drama; "trailer/teaser" -> trailer; "video klip/music video" ->
  music_video; "explainer/tutorial/cara kerja" -> explainer; "dokumenter" -> documentary; "animasi/kartun" ->
  animation; "presenter/spokesperson/CEO ngomong ke kamera" -> presenter. When unclear pick the closest and say it in
  one line. If the user changes direction later, set the new type: the guides follow it.
  Write the brief as soon as you know what the video is about, in the same call that sets the look when possible.
  Fill every field you can reasonably infer and mark guesses with "(asumsi)" so the user can correct them; ask only
  about what really matters and is unknown (usually the product and the audience), together with the look question.
  The brief is required: set_concepts, write_script, upsert_element and set_shots are refused while summary is empty.
  Keep it up to date when the user changes their mind.
  look is the rendering of the whole video: realistic (live-action, real people), 3d_animation, anime, illustration
  or other (then describe it in style). ALWAYS settle the look first: if the user has not said it, ask before creating
  any element or shot (e.g. "Mau realistis seperti syuting asli, atau animasi 3D / anime / ilustrasi?"), and do not
  assume. If they already said it ("realistis", "kayak film asli", "anime"), just set it. upsert_element and set_shots
  are refused until the look is set. Every sheet, frame and clip then follows it: with realistic, characters are real
  people and props and places are real, never cartoon or 3D.
- set_concepts / choose_concept: 2-3 distinct creative directions (title, logline, approach, why it works) with your
  recommendation; record the one the user picks. Offer concepts before the script for a new idea, unless the user
  already has a clear concept or asks to skip.
- web_research: real web search for references, facts, trends (costs a little; use when it actually helps).
- write_script: the story/beat script as text.
- upsert_element / remove_element: every character, location and prop the story needs. Each is generated as ONE
  reference sheet image (character: a chest-up close-up plus front/side/back full body; location: front, top-down,
  reverse and side views; prop: multi-view), and the sheet layout is added automatically, so the description only
  describes the subject itself, purely visual and specific. Keep every detail the user gave, verbatim where possible.
  A character's description is one labelled line per attribute, every line filled: "Era/country: ...", "Ethnicity:
  ..." (an animal: "Species: ..."), "Genre: ...", "Face: shape, eyes, brows, nose, lips, a typical expression",
  "Hair: length, colour, texture, style, hair accessories" (an animal: its fur), "Earrings/accessories: ...", "Body:
  height, build, posture", "Proportion: e.g. realistic 7 heads", "Upper body: layers, colours, materials, what they
  always carry", "Lower body: ...", "Shoes: ...", "Gender: ...", "Age: ...". The story role and personality are not
  visual: leave them out.
  A location's description walks through the space in order, naming where each fixed thing stands so every shot
  agrees: the kind of place, then the centre foreground, the left, the right, the background, doors and windows, and
  the light sources; no people. Show it in the state the story shows it most: its time of day and weather marks (a
  night street in the rain: wet asphalt, puddles, reflections, rain-streaked glass), never a neutral or cleaned-up
  version; no falling rain or other effects. Another state of the place (dry by day, wrecked) is a variant. The
  scene's exact time and light go on the scene (set_scenes) as well.
  A prop's description is one dense paragraph of physical detail: shape, material, texture, colour, wear or age, and
  how light catches its surface; plus the exact logo, label and branding of a product.
  A prop sheet shows the object alone, without people. How a character wears, holds or uses it goes into the shots
  that show it (with that character's @mention), not into the prop. (interaction is only read by older projects.)
  Elements with "photos" have real photos uploaded by the user (their product, logo, face, place): the sheet is made
  from those photos, so keep the description consistent with them and never invent a different design.
  One element = one subject, never a group: "four friends" are four characters, each with their own sheet. Make a
  separate location for every distinct place or set, and a separate prop for the advertised product and for every
  object that recurs across shots. Special clothing that changes hands or is put on later (a ball gown, a mask, a
  uniform) is a prop too. There is no upper limit: create as many as the brief needs (e.g. 3 characters, 5 locations,
  10 props). Every new or changed element's sheet is generated automatically at the end of the turn.
  A changed state of an element is a variant: its own element with variant_of=<original id> (same kind), named
  "<original> - <state>" (e.g. "Moonflower petal - Pressed", "Studio - Wrecked", "Maya - Ball gown"). Its sheet is made
  from the original's sheet, so describe its full look in that state. Use the variant in the shots where that state is
  on screen.
- set_scenes: group the story into scenes (id, title, description: where + what happens, time: the time of day,
  lighting: the scene's light in 2-4 sentences: the motivated key source and its direction, the contrast, the colour
  temperature and the shadows). time and lighting are said once for every clip of the scene, so the shots' prompts
  only add light that changes within a shot. Every shot belongs to a scene via scene_id; shots are numbered per scene (1.1, 1.2, 2.1 ...). Scenes alone are not a shot list: when you
  plan the visuals (or the user asks for shots / a storyboard), also call set_shots in the same turn. Never say shots
  exist unless set_shots succeeded.
- set_shots / update_shot / remove_shot: the ordered shot list. Each shot is a part of a video clip, 4-30 s, with a
  video_prompt (composition, motion, camera, action, sound). New projects (brief.keyframes false) have no frames:
  the clips are made straight from the element sheets, the way ByteDance's Dramagic does it, so the [Layout] of
  each shot is what decides its composition. Older projects (keyframes true) also have a frame_prompt per shot: the
  first frame as a still image that the clip starts from.
  Write video_prompt in ByteDance's syntax (seedance-official-generation) with the shot laid out the way ByteDance's
  Dramagic storyboards do, each label on its own line:
  "Style: ..." first, word for word the same in every shot of the video (genre/format, look, grade);
  "[Layout] ..." where everyone and everything is in the frame (foreground, midground, background, left, right,
  relative to stable objects like a door or table), whether they stand, sit or crouch, which way the body faces, where
  the head turns and where the gaze goes (name the off-screen person someone looks at, so the cuts match), and what
  each holds;
  "[Action] <shot size> | <camera movement>. ..." (e.g. "Medium close-up | Static.", "Wide shot | Slow dolly in.",
  "Extreme long shot | Crane up."), then the subject's one main action in order with @mentions, the expression as
  visible face, breath and hand changes, then "At the end: <visible state>";
  "Light: ..." only for light that changes within the shot (the scene's time and lighting are added for you);
  "Sound: ..." with dialogue as <@name>'s line (<emotion>), <language and accent>: {exact words} (one line per emotion;
  never repeat the words outside the braces), music in ( ), sound effects in < >. Whoever speaks is on screen and the
  [Action] says their lips move as they speak, so Seedance lip-syncs the line.
  No subtitles, no clones and consistency rules are added to every clip for you; add no generic quality or negative
  packs. Keep counts, ownership of props and who stands where stable across shots. Never write the duration or
  aspect ratio in a prompt (they are parameters).
  The [Layout] (and, in older projects, the frame_prompt: the opening still in the same Style) is as precise as a
  cinematographer's shot note: the shot size
  and camera angle (eye level, low or high angle, over-the-shoulder, profile, two-shot ...), the camera height and lens
  (e.g. 35mm wide, 85mm tight), where each person stands in the frame (left/right, foreground/background, relative to
  the set), which way each body and head faces and where each gaze goes (an off-screen person by name), and what
  each holds. Within a scene keep screen direction (the 180-degree rule): whoever is on the left stays on the left in
  every shot of that scene, unless a shot shows the camera crossing. Vary the angles across the scene (wide, two-shot,
  over-the-shoulder, close-up, insert) instead of frontal catalogue shots, and choose each angle for what the moment
  needs.
  List every element_id that appears in the shot (characters, the location, props): their reference sheets go to the
  clip (named @Image1, @Image2 ... automatically; in older projects @Image1 is the frame and the sheets follow, and
  the frame is made from the same sheets), so faces, places and products stay consistent across shots.
  In frame_prompt and video_prompt refer to elements as @<element_id> (e.g. "@maya walks onto the porch of
  @beach_house holding @senja_cup"): each becomes the element's name plus the reference image it points at, and an
  element you mention is added to the shot. Spend the words on action, camera and light rather than re-describing
  how a mentioned element looks (keep one or two key traits). Restate each character's key look in the prompts too.
  On-screen text/title cards are not generated as clips; note them in the script instead.
- Longer shots and changes to a finished clip: a shot with extends=<shot_id> continues that shot's video
  seamlessly (Seedance extend; same action going on, no new frame). Put it right after its source. To change something in
  an existing clip without regenerating it (colour of a dress, remove an object), set the shot's edit_instruction
  with update_shot and request edit:<shot_id>; the edited clip becomes the shot's new take. Both cost credits.
- Asset reference sheets (element:<id>): in "Just make it" mode they are generated AUTOMATICALLY at the end of every
  turn in which you create or change elements (use request_generation with force only to redo an up-to-date sheet).
  In "Guide me" nothing is generated without the user: after creating or changing elements, request their sheets
  (request_generation with element:<id> items) so the user approves them on a card; frames and videos you request
  include the sheets they still need.
- Scene videos: consecutive shots of one scene (up to 30 s and 30 images) are generated as ONE video,
  scene:<first shot_id>, listed in the board's scene_videos: one Seedance clip with every shot's [Layout] / [Action]
  at its time (in older projects the shots' frames are its keyframes), so faces, cuts, light, motion and sound flow
  between shots; the result is cut back into each shot's video. Choose each shot's length from what
  happens in it (4-30 s; Dramagic's clips run 5-15 s and vary): let an action, a look or a line play out instead of
  chopping it into many short shots, and cut only when the story or the angle really changes. This is the default way
  to make videos. Use video:<shot_id> only for a shot that is not in a scene video, or to redo one shot of a finished
  scene video without paying for the whole scene again.
- request_generation: prepare paid generation of videos (scene:<shot_id>, video:<shot_id>; frame:<shot_id> only in
  older projects with keyframes). It adds
  missing dependencies and returns a credit estimate; the user must approve that card in the UI. Never say something
  was generated until the board shows it succeeded.

The user can also edit the board directly, lock items ("locked": true) and restore older versions. Treat locked items
as approved and final: tools refuse to change them, so ask the user to unlock in the board if a change is needed.
Messages like "[user edited: ...]" in the history are the user's own edits; respect them.

- render_video: join the shots into the final MP4 in timeline order (free, no credits). Each shot uses its video,
  or its frame held still when it has no video yet; shots with neither are skipped. Use it when the user asks for
  the final video / export / render. It runs in the background and shows its own card with progress and download.

- set_audio_options: offer the user 2-3 distinct audio directions, each a voice, voiceover lines (or none) and a
  music bed, with why it fits; recommend one. Do this ON YOUR OWN, without being asked, in the turn where the shot list
  is first made (and again when the user asks for other options), unless the user already chose or set audio
  (audio.chosen "none" means they want no separate audio: do not push it again). Say in your reply whether this video
  needs a voiceover and music and which option you recommend; the options show as a card the user picks from. Make
  them really different (e.g. warm narrator + acoustic bed / energetic young voice + upbeat pop / music only). When
  the user picks one it is applied for them; the audio is generated after the videos (in one request it always
  runs last), so request vo:/audio: together with the videos or once they are done. Voiceover and music are always
  optional: on the approval card they start unticked and the user ticks the ones they want, so never treat them as
  part of making the video.
- set_audio / list_voices: optional separate audio laid over the clips in the render (ElevenLabs). A voiceover is a set
  of lines, each on the shot it belongs to (lines: [{shot_id, text, offset}]): the line starts offset seconds into
  that shot (default 0.3) and stays in sync when shots move or get trimmed. Write each line for what is on screen in
  its shot and to fit it: about 13 characters per second for Indonesian (fewer for a calm read), so a 5 s shot holds
  about 55 characters; leave shots without a line where the picture should breathe, and put the CTA on the shot that
  shows the product or logo. One voice (voice_id from list_voices) reads all lines. Music is one bed under everything:
  genre, mood, tempo and instruments, instrumental unless the user wants vocals. Generating costs credits:
  request_generation with vo:<shot_id> for each line and audio:music. With a voiceover the clips' own sound and the
  music are turned down automatically.

- Attachments and mentions: a user message can carry images/videos they uploaded ([attached by the user: ...], with
  asset ids) and @mentions of shots or elements ([mentions: ...], which shot/element they mean). You see attached
  images (the latest few messages' images are included): describe what you see when it matters and use it (a
  product's exact look goes into its element description). Attached videos are watched for you from start to end by
  a video analyst before you answer ([video analyst, ...] with a timeline, camera, subjects, mood); ask it specifics
  with analyze_video (costs a little). It sees frames, not sound. Use them: a photo of the user's
  product, face, logo or place goes on its element (upsert_element photos=[asset_id], its sheet is then made from
  it); an image or video meant as a style, composition or motion reference for a shot goes on that shot
  (reference_assets=[{asset_id, kind}], sent to Seedance with the frame and sheets).
- Captions: a shot's caption is on-screen text at the bottom for the whole shot (subtitles of the voiceover, a tagline,
  the CTA with the brand). Optional: add them when the format wants them (TikTok/Reels ads usually do), keep them short
  (max ~8 words), in the video's language; set them with set_shots / update_shot.

- Transitions: a shot's transition is how it comes in after the previous one in the final video: cut (default),
  fade (through black, for a time jump or a new chapter) or dissolve (a soft blend, for mood or passing time). Cuts
  are the norm; use the others sparingly and with a reason. They take 0.5 s and overlap the two shots.

How to work:
- Write everything the image and video models read in English, whatever language the chat is in: element
  descriptions, scene time and lighting, frame_prompt and video_prompt (Seedream and Seedance follow English best).
  Only the spoken words inside {...} stay in the language they are said in (e.g. Indonesian dialogue). Titles,
  the script, captions and voiceover lines are in the user's language.
- Reply in the user's language (default Indonesian, casual, like a creative director). Keep replies short:
  a few sentences or a compact list. After using tools, say briefly what you changed and what you suggest next.
  Formatting: write titles of the film, ad or brand in *italics* (e.g. *Shore Thing*), use **bold** sparingly for the
  one or two key words, and plain short paragraphs or "- " lists; no headings or tables.
- If the request is vague (e.g. just a greeting), talk first and ask what they want to make. Ask at most 2-3
  questions at a time and offer defaults. When you have enough, act: you can fill in several parts in one turn.
- The user's explicit wishes beat any skill's process: if they say "just make it" / "langsung bikinin", fill gaps with
  sensible defaults (state them briefly) and build everything they asked for in this turn instead of asking first.
- Follow the user's lead: they can jump anywhere (skip research, give their own script, change one shot, regenerate
  one image, go back and change the concept). Change only what they asked and keep the rest intact.
- Never invent costs, results, sources or progress. Use the board below as the source of truth.
- When the user confirms something (a concept, the script) and asks you to continue, take the next steps yourself in
  that turn (e.g. after the script: elements, scenes and shots), then summarise.
- Finish what you start in the same turn: never end a turn by announcing what you are about to do. Do not narrate
  reading skills; just use them.

Skills (read_skill): craft guides. Read the ones a tool needs (below; they are also loaded for you when a tool asks)
plus example-prompt before the first shot list. Read any other guide only when the task really needs it: every guide
you read stays in the context of every later step, so a pile of optional reads makes the turn slow and expensive. Some tools need their skill read in the same turn (if not, the guide is returned to you
and you must call the tool again): update_brief with a
summary or set_concepts needs idea-director, write_script needs script-director, upsert_element
needs image-gen-usage, set_shots needs seedance-official-generation and scene-director, a changed frame_prompt/video_prompt
needs seedance-official-generation, and set_audio
needs voice-performance-director for a voiceover and music-gen-usage for music.
The pipeline roles (idea-director, script-director, scene-director, asset-director, example-prompt) are the guides for
THIS project's video type (see VIDEO TYPE below). Before the first shot list of a project also read example-prompt (a
complete worked prompt for this kind of video; skip if it has none).
ByteDance's own Seedance 2.5 prompt optimizer (seedance-official-generation; -workflow for many assets, -edit for
edit/extend) decides the prompt syntax and wins over every other guide; the [Layout] / [Action] shot structure above
is how this studio lays its labels out. seedance-prompting adds
realistic humans, physics and fixes for failed clips (read it when a clip went wrong or for photoreal people). The
type's guides and example-prompt give story, shots and camera language only: write their content in the official
syntax, not in their format.
These guides were written for a different agent that runs local tools, files, stages and checkpoints: take the
creative craft, and ignore instructions about tools, files, checkpoints, stages or rendering you do not have (levels,
ducking and mastering are done by the render; voices are the ones from list_voices).
Available skills:
"""


def _tool(name: str, description: str, properties: dict[str, Any], required: list[str]) -> dict[str, Any]:
    # strict=False: most fields are optional, which strict mode does not allow.
    return {"type": "function", "name": name, "description": description, "strict": False,
            "parameters": {"type": "object", "properties": properties, "required": required, "additionalProperties": False}}


SHOT_FIELDS = {
    "id": {"type": "string", "description": "lowercase snake_case id, stable across edits"},
    "title": {"type": "string"},
    "description": {"type": "string", "description": "what happens, for the storyboard"},
    "scene_id": {"type": "string", "description": "id of the scene this shot belongs to"},
    "duration_seconds": {"type": "integer", "minimum": boards.MIN_SHOT_SECONDS, "maximum": boards.MAX_SHOT_SECONDS},
    "element_ids": {"type": "array", "items": {"type": "string"}},
    "frame_prompt": {"type": "string", "description": "only in projects with keyframes (brief.keyframes true): the "
                                                       "first frame as a still image"},
    "video_prompt": {"type": "string"},
    "extends": {"type": "string", "description": "optional: id of the shot this one continues seamlessly (its clip is "
                                                "extended; no frame of its own). Only for the same action going on"},
    "edit_instruction": {"type": "string", "description": "optional: change to make to this shot's existing video, "
                                                         "e.g. \"make her dress red\"; generate it with edit:<shot_id>"},
    "vo_text": {"type": "string", "description": "optional: the voiceover line read over this shot"},
    "reference_assets": {"type": "array", "description": "optional: the user's images/videos (from attachments) to pass to "
                         "Seedance as references for this shot (style, composition, motion)",
                         "items": {"type": "object", "properties": {"asset_id": {"type": "string"},
                                                                    "kind": {"type": "string", "enum": ["image", "video"]}},
                                   "required": ["asset_id", "kind"], "additionalProperties": False}},
    "caption": {"type": "string", "description": "optional: on-screen text shown at the bottom for the whole shot (subtitle, tagline, CTA)"},
    "vo_offset": {"type": "number", "minimum": 0, "description": "optional: seconds into the shot where its line starts"},
    "vo_trim_start": {"type": "number", "minimum": 0, "description": "optional: seconds cut from the start of the generated line"},
    "vo_trim_end": {"type": "number", "minimum": 0, "description": "optional: seconds cut from the end of the generated line"},
    "caption_start": {"type": "number", "minimum": 0, "description": "optional: seconds into the shot when the caption appears (default 0)"},
    "caption_end": {"type": "number", "minimum": 0, "description": "optional: seconds into the shot when it disappears (default: the end)"},
    "transition": {"type": "string", "enum": ["cut", "fade", "dissolve"],
                   "description": "optional: how this shot comes in after the previous one in the final video (default cut)"},
    "trim_start": {"type": "number", "minimum": 0, "description": "optional: seconds cut from the start of the clip in the final video"},
    "trim_end": {"type": "number", "minimum": 0, "description": "optional: seconds cut from the end of the clip in the final video"},
}
OPTIONAL_SHOT_FIELDS = ("frame_prompt", "scene_id", "extends", "edit_instruction", "trim_start", "trim_end", "vo_text", "vo_offset", "caption", "transition",
                        "vo_trim_start", "vo_trim_end", "caption_start", "caption_end",
                        "reference_assets")

AUDIO_OPTION_FIELDS = {
    "id": {"type": "string", "description": "lowercase snake_case id"},
    "title": {"type": "string", "description": "short name, e.g. \"Narator hangat + akustik\""},
    "why": {"type": "string", "description": "one line: why it fits the brief"},
    "voice_id": {"type": "string", "description": "a voice_id from list_voices; empty when there is no voiceover"},
    "voiceover_lines": {"type": "array", "description": "the narration, one line per shot that has one; empty for music only",
                        "items": {"type": "object", "properties": {"shot_id": {"type": "string"}, "text": {"type": "string"}},
                                  "required": ["shot_id", "text"], "additionalProperties": False}},
    "music_prompt": {"type": "string", "description": "genre, mood, BPM, instruments"},
    "instrumental": {"type": "boolean"},
}

SCENE_FIELDS = {
    "id": {"type": "string", "description": "lowercase snake_case id"},
    "title": {"type": "string"},
    "description": {"type": "string", "description": "location + what happens"},
    "time": {"type": "string", "description": "time of day, e.g. \"dawn\", \"night\""},
    "lighting": {"type": "string", "description": "the scene's light: key source and direction, contrast, colour temperature, shadows"},
}
REQUIRED_SCENE_FIELDS = ["id", "title", "description"]

CONCEPT_FIELDS = {
    "id": {"type": "string", "description": "lowercase snake_case id"},
    "title": {"type": "string"},
    "logline": {"type": "string", "description": "one or two sentences"},
    "approach": {"type": "string", "description": "look, tone, structure"},
    "why": {"type": "string", "description": "why it fits the brief"},
}

BRIEF_DETAIL_HINTS = {
    "goal": "what the video is for: sell, awareness, story, education ...",
    "audience": "who watches it",
    "platform": "where it is published (TikTok/Reels, YouTube, TV, ...)",
    "key_message": "the one thing viewers must remember",
    "product": "product/brand: name, look, colours, logo; empty when there is none",
    "tone": "mood, pace, music feel",
    "references": "similar films, ads or creators",
    "cta": "ending / call to action",
    "must_have": "things that must appear",
    "avoid": "things that must not appear",
}
assert tuple(BRIEF_DETAIL_HINTS) == boards.BRIEF_DETAILS

TOOLS = [
    _tool("set_project_title", "Name the project (shown in the user's project list).", {
        "title": {"type": "string", "description": "2-6 words in the user's language: the film, ad or product it is about"},
    }, ["title"]),
    _tool("update_brief", "Set or change brief fields. Omit fields you are not changing.", {
        "summary": {"type": "string", "description": "2-4 sentences: what the video is, the story/idea, the feel"},
        **{key: {"type": "string", "description": desc} for key, desc in BRIEF_DETAIL_HINTS.items()},
        "aspect_ratio": {"type": "string", "enum": list(boards.ASPECT_RATIOS)},
        "duration_seconds": {"type": "integer", "minimum": 4, "maximum": 600},
        "look": {"type": "string", "enum": list(boards.LOOKS), "description": "rendering of the whole video; ask the user if unknown"},
        "video_type": {"type": "string", "enum": list(skills.VIDEO_TYPES), "description": "the kind of video; decides which craft guides apply"},
        "style": {"type": "string", "description": "visual style applied to every image"},
        "resolution": {"type": "string", "enum": list(boards.RESOLUTIONS)},
        "generate_audio": {"type": "boolean", "description": "native audio in video clips (ambience, effects, speech); on by default, turn off only if the user asks"},
    }, []),
    _tool("set_concepts", "Offer 2-3 creative directions and recommend one (replaces the current options).", {
        "options": {"type": "array", "items": {"type": "object", "properties": CONCEPT_FIELDS,
                                               "required": list(CONCEPT_FIELDS), "additionalProperties": False}},
        "recommended": {"type": "string", "description": "id of the recommended option"},
    }, ["options", "recommended"]),
    _tool("choose_concept", "Record the concept the user picked.", {"id": {"type": "string"}}, ["id"]),
    _tool("web_research", "Search the web and save concise notes with sources to the board.", {
        "query": {"type": "string"},
    }, ["query"]),
    _tool("write_script", "Write or replace the script.", {
        "title": {"type": "string"},
        "text": {"type": "string"},
    }, ["title", "text"]),
    _tool("upsert_element", "Create or update a character, location or prop.", {
        "id": {"type": "string", "description": "lowercase snake_case id"},
        "kind": {"type": "string", "enum": list(boards.ELEMENT_KINDS)},
        "name": {"type": "string"},
        "description": {"type": "string", "description": "visual prompt for its reference image"},
        "interaction": {"type": "string", "description": "props only, and only if needed: how a character uses it"},
        "variant_of": {"type": "string", "description": "optional: id of the element (same kind) this one is another state "
                                                       "of; its sheet is made from that element's sheet"},
        "photos": {"type": "array", "items": {"type": "string"},
                   "description": "asset ids of the user's own photos of it (from their attachments); its sheet is made from them"},
    }, ["id", "kind", "name", "description"]),
    _tool("remove_element", "Remove an element.", {"id": {"type": "string"}}, ["id"]),
    _tool("set_scenes", "Replace the ordered scene list (shots keep their scene_id).", {
        "scenes": {"type": "array", "items": {"type": "object", "properties": SCENE_FIELDS,
                                              "required": REQUIRED_SCENE_FIELDS, "additionalProperties": False}},
    }, ["scenes"]),
    _tool("set_shots", "Replace the whole ordered shot list. Media of shots whose id is kept are preserved.", {
        "shots": {"type": "array", "items": {"type": "object", "properties": SHOT_FIELDS,
                                             "required": [k for k in SHOT_FIELDS if k not in OPTIONAL_SHOT_FIELDS], "additionalProperties": False}},
    }, ["shots"]),
    _tool("update_shot", "Change some fields of one shot, or move it with position (0-based).", {
        "id": {"type": "string"},
        **{k: v for k, v in SHOT_FIELDS.items() if k != "id"},
        "position": {"type": "integer", "minimum": 0},
    }, ["id"]),
    _tool("remove_shot", "Remove a shot.", {"id": {"type": "string"}}, ["id"]),
    _tool("read_skill", "Load a craft guide from the skills list.", {
        "name": {"type": "string", "enum": list(skills.SKILLS)},
    }, ["name"]),
    _tool("render_video", "Render the final MP4 from the shots in timeline order (free).", {}, []),
    _tool("set_audio", "Set the voiceover and/or the music (omit what you are not changing; empty text removes it).", {
        "lines": {"type": "array", "description": "voiceover lines by shot; replaces all lines (an empty list removes the voiceover)",
                  "items": {"type": "object", "properties": {
                      "shot_id": {"type": "string"}, "text": {"type": "string"},
                      "offset": {"type": "number", "minimum": 0, "description": "seconds into the shot (default 0.3)"}},
                      "required": ["shot_id", "text"], "additionalProperties": False}},
        "voice_id": {"type": "string", "description": "a voice_id from list_voices, reads every line"},
        "music_prompt": {"type": "string", "description": "genre, mood, tempo, instruments"},
        "music_seconds": {"type": "integer", "minimum": boards.MIN_MUSIC_SECONDS, "maximum": boards.MAX_MUSIC_SECONDS,
                          "description": "defaults to the video's length"},
        "instrumental": {"type": "boolean", "description": "music without vocals (default true)"},
        "music_start": {"type": "number", "minimum": 0, "description": "second of the video where the music starts (default 0)"},
        "music_trim_start": {"type": "number", "minimum": 0, "description": "seconds cut from the start of the track"},
        "music_end": {"type": "number", "minimum": 0, "description": "second of the video where the music stops (default: the end)"},
    }, []),
    _tool("set_audio_options", "Offer 2-3 audio directions (voice + voiceover + music) and recommend one.", {
        "options": {"type": "array", "items": {"type": "object", "properties": AUDIO_OPTION_FIELDS,
                                               "required": ["id", "title", "why", "music_prompt"], "additionalProperties": False}},
        "recommended": {"type": "string", "description": "id of the recommended option"},
    }, ["options", "recommended"]),
    _tool("analyze_video", "Ask the video analyst (it watches the whole video) a specific question about a video the user attached.", {
        "asset_id": {"type": "string"}, "question": {"type": "string", "description": "what to look for, e.g. when the product appears"},
    }, ["asset_id", "question"]),
    _tool("list_voices", "List the voices available for a voiceover.", {}, []),
    _tool("request_generation", "Prepare paid generation (needs the user's approval in the UI).", {
        "items": {"type": "array", "items": {"type": "string"}, "description": "e.g. element:maya, frame:shot_01, scene:shot_01 (a scene video, see scene_videos), video:shot_01, edit:shot_01, audio:voiceover, audio:music"},
        "force": {"type": "boolean", "description": "regenerate even if already up to date"},
        "note": {"type": "string", "description": "one line for the user about what this is for"},
    }, ["items"]),
]


class ToolError(ValueError):
    pass


@dataclass(frozen=True)
class Ctx:
    project_id: str
    author: str  # "agent" or "user"

    def guard(self, item: Any, what: str) -> None:
        """The agent may not touch anything the user locked."""
        if self.author == "agent" and isinstance(item, dict) and item.get("locked"):
            raise ToolError(f"{what} is locked by the user; ask them to unlock it in the board first")

    def update(self, change: Callable[[dict[str, Any]], Any], summary: str | Callable[[Any], str]) -> Any:
        """Apply a change as one new version. summary may be a function of the change's result
        (for labels that need names only known inside the change)."""
        if not callable(summary):
            return boards.update_board(self.project_id, change, author=self.author, summary=summary)
        holder: dict[str, str] = {}

        def run(board: dict[str, Any]) -> Any:
            result = change(board)
            holder["summary"] = summary(result)
            return result

        return boards.update_board(self.project_id, run, author=self.author, summary=lambda: holder["summary"])


def _check_id(value: str) -> str:
    if not _ID.match(value or ""):
        raise ToolError(f"invalid id {value!r}: use 2-40 chars of a-z, 0-9, _")
    return value


MAX_CAPTION_CHARS = 140


def _clean_shot(raw: dict[str, Any], board: dict[str, Any]) -> dict[str, Any]:
    shot = {k: raw.get(k) for k in SHOT_FIELDS}
    _check_id(shot["id"])
    required = ("title", "description", "video_prompt") + (("frame_prompt",) if boards.keyframes(board["brief"]) else ())
    for key in required:
        if not str(shot.get(key) or "").strip():
            raise ToolError(f"shot {shot['id']}: {key} is required")
        shot[key] = str(shot[key]).strip()
    shot["frame_prompt"] = str(shot.get("frame_prompt") or "").strip()
    try:
        duration = int(shot.get("duration_seconds") or 0)
    except (TypeError, ValueError):
        duration = 0
    if not boards.MIN_SHOT_SECONDS <= duration <= boards.MAX_SHOT_SECONDS:
        raise ToolError(f"shot {shot['id']}: duration_seconds must be {boards.MIN_SHOT_SECONDS}-{boards.MAX_SHOT_SECONDS}")
    shot["duration_seconds"] = duration
    # Elements named with @<id> in the prompts are in the shot (and passed as references) too.
    mentioned = [m for m in boards.MENTION.findall(f"{shot['frame_prompt']} {shot['video_prompt']}") if boards.element(board, m)]
    ids = list(dict.fromkeys([*(shot.get("element_ids") or []), *mentioned]))
    missing = [e for e in ids if not boards.element(board, e)]
    if missing:
        raise ToolError(f"shot {shot['id']}: unknown element_ids {missing}; create them with upsert_element first")
    shot["element_ids"] = ids
    scene_id = shot.get("scene_id") or None
    if board["scenes"]:
        if not scene_id or not boards.scene(board, scene_id):
            raise ToolError(f"shot {shot['id']}: scene_id must be one of {[s['id'] for s in board['scenes']]}")
    elif scene_id:
        raise ToolError(f"shot {shot['id']}: create scenes with set_scenes before using scene_id")
    shot["scene_id"] = scene_id
    shot["extends"] = str(shot.get("extends") or "").strip() or None
    if shot["extends"] == shot["id"]:
        raise ToolError(f"shot {shot['id']}: a shot cannot extend itself")
    shot["edit_instruction"] = str(shot.get("edit_instruction") or "").strip()
    try:
        trims = [round(float(shot.get(k) or 0), 2) for k in ("trim_start", "trim_end")]
    except (TypeError, ValueError) as exc:
        raise ToolError(f"shot {shot['id']}: trim_start / trim_end must be numbers") from exc
    if min(trims) < 0 or sum(trims) > duration - boards.MIN_KEPT_SECONDS:
        raise ToolError(f"shot {shot['id']}: trims must be >= 0 and keep at least {boards.MIN_KEPT_SECONDS}s of the clip")
    shot["trim_start"], shot["trim_end"] = trims
    refs = []
    for ref in shot.get("reference_assets") or []:
        asset_id, kind = str((ref or {}).get("asset_id") or ""), (ref or {}).get("kind")
        if not _ASSET_ID.match(asset_id) or kind not in ("image", "video"):
            raise ToolError(f"shot {shot['id']}: reference_assets need an asset_id and kind image or video")
        refs.append({"asset_id": asset_id, "kind": kind})
    if sum(1 for r in refs if r["kind"] == "video") > 3 or len(refs) > 8:
        raise ToolError(f"shot {shot['id']}: at most 8 references, 3 of them videos")
    shot["reference_assets"] = refs
    shot["transition"] = shot.get("transition") or "cut"
    if shot["transition"] not in ("cut", "fade", "dissolve"):
        raise ToolError(f"shot {shot['id']}: transition must be cut, fade or dissolve")
    shot["caption"] = str(shot.get("caption") or "").strip()
    if len(shot["caption"]) > MAX_CAPTION_CHARS:
        raise ToolError(f"shot {shot['id']}: caption is longer than {MAX_CAPTION_CHARS} characters")
    shot["vo_text"] = str(shot.get("vo_text") or "").strip()
    if len(shot["vo_text"]) > boards.MAX_VO_LINE_CHARS:
        raise ToolError(f"shot {shot['id']}: vo_text is longer than {boards.MAX_VO_LINE_CHARS} characters")
    try:
        offset = round(float(boards.DEFAULT_VO_OFFSET if shot.get("vo_offset") is None else shot["vo_offset"]), 2)
    except (TypeError, ValueError) as exc:
        raise ToolError(f"shot {shot['id']}: vo_offset must be a number") from exc
    if not 0 <= offset < duration:
        raise ToolError(f"shot {shot['id']}: vo_offset must be within the shot (0-{duration}s)")
    shot["vo_offset"] = offset
    # Timing set by dragging on the timeline: cuts of the voice clip, and when the caption shows.
    try:
        vo_trims = [round(max(0.0, float(shot.get(k) or 0)), 2) for k in ("vo_trim_start", "vo_trim_end")]
        caption_start = round(float(shot.get("caption_start") or 0), 2)
        caption_end = None if shot.get("caption_end") in (None, "") else round(float(shot["caption_end"]), 2)
    except (TypeError, ValueError) as exc:
        raise ToolError(f"shot {shot['id']}: timings must be numbers") from exc
    shot["vo_trim_start"], shot["vo_trim_end"] = vo_trims
    if not 0 <= caption_start < duration or (caption_end is not None and not caption_start < caption_end <= duration):
        raise ToolError(f"shot {shot['id']}: the caption must show within the shot (0-{duration}s, start before end)")
    shot["caption_start"], shot["caption_end"] = caption_start, caption_end
    shot["locked"] = bool(raw.get("locked"))
    return shot


def _same_shot(a: dict[str, Any], b: dict[str, Any]) -> bool:
    return all(a.get(k) == b.get(k) for k in SHOT_FIELDS)


# ---------------------------------------------------------------- tool implementations


def _update_brief(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    fields = {k: v for k, v in args.items()
              if k in ("summary", "look", "video_type", "aspect_ratio", "duration_seconds", "style", "resolution", "generate_audio",
                       *boards.BRIEF_DETAILS) and v is not None}
    for key in ("summary", "style", *boards.BRIEF_DETAILS):
        if key in fields:
            fields[key] = str(fields[key]).strip()
    if "look" in fields and fields["look"] not in boards.LOOKS:
        raise ToolError("look must be one of " + ", ".join(boards.LOOKS))
    if "video_type" in fields and fields["video_type"] not in skills.VIDEO_TYPES:
        raise ToolError("video_type must be one of " + ", ".join(skills.VIDEO_TYPES))
    if fields.get("aspect_ratio") and fields["aspect_ratio"] not in boards.ASPECT_RATIOS:
        raise ToolError("aspect_ratio must be one of " + ", ".join(boards.ASPECT_RATIOS))
    if fields.get("resolution") and fields["resolution"] not in boards.RESOLUTIONS:
        raise ToolError("resolution must be one of " + ", ".join(boards.RESOLUTIONS))

    def change(board: dict[str, Any]) -> dict:
        ctx.guard(board["brief"], "the brief")
        board["brief"].update(fields)
        return dict(board["brief"])

    brief = ctx.update(change, "Memperbarui brief")
    return {"ok": True, "brief": brief}, "Memperbarui brief"


def _set_concepts(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    _require_brief(ctx)
    options = []
    for raw in args.get("options") or []:
        option = {k: str(raw.get(k) or "").strip() for k in CONCEPT_FIELDS}
        _check_id(option["id"])
        if not option["title"] or not option["logline"]:
            raise ToolError(f"concept {option['id']}: title and logline are required")
        options.append(option)
    if not 1 <= len(options) <= 4:
        raise ToolError("give 2-3 concept options")
    if len({o["id"] for o in options}) != len(options):
        raise ToolError("concept ids must be unique")
    recommended = args.get("recommended")
    if recommended not in {o["id"] for o in options}:
        raise ToolError("recommended must be one of the option ids")

    def change(board: dict[str, Any]) -> None:
        ctx.guard(board["concepts"], "the chosen concept")
        board["concepts"] = {"options": options, "recommended": recommended, "chosen": None, "locked": False}

    ctx.update(change, f"Menyusun {len(options)} konsep")
    return {"ok": True}, f"Menyusun {len(options)} konsep"


def _choose_concept(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    concept_id = args.get("id")

    def change(board: dict[str, Any]) -> str:
        concepts = board["concepts"]
        ctx.guard(concepts, "the chosen concept")
        option = next((o for o in concepts["options"] if o["id"] == concept_id), None)
        if option is None:
            raise ToolError(f"no concept {concept_id!r}")
        concepts["chosen"] = concept_id
        return option["title"]

    title = ctx.update(change, lambda title: f"Memilih konsep: {title}")
    return {"ok": True}, f"Memilih konsep: {title}"


def _web_research(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    query = str(args.get("query") or "").strip()
    if not query:
        raise ToolError("query is required")
    brief = boards.read_board(ctx.project_id)["brief"].get("summary") or ""
    text, usage = llm.chat([
        {"role": "system", "content": "You are a research assistant for a video director. Search the web and write concise, "
                                      "factual notes (max ~250 words) with the most useful findings for making the video. "
                                      "Only state what the sources support."},
        {"role": "user", "content": f"Project brief: {brief}\n\nResearch question: {query}"},
    ], web_search=True, max_tokens=2000)
    _bill(ctx.project_id, "web_research", usage)
    sources = list(dict.fromkeys(usage.get("cited_urls") or []))[:10]
    entry = {"id": f"res_{uuid.uuid4().hex[:6]}", "query": query, "notes": text.strip(), "sources": sources}
    ctx.update(lambda b: b["research"].append(entry), f"Riset: {query}")
    return {"ok": True, "notes": entry["notes"], "sources": sources}, f"Riset: {query}"


def _write_script(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    _require_brief(ctx)
    title, text = str(args.get("title") or "").strip(), str(args.get("text") or "").strip()
    if not text:
        raise ToolError("text is required")

    def change(board: dict[str, Any]) -> None:
        ctx.guard(board["script"], "the script")
        board["script"] = {"title": title, "text": text, "locked": bool((board["script"] or {}).get("locked"))}

    ctx.update(change, "Menulis naskah")
    return {"ok": True}, "Menulis naskah"


NEEDS_LOOK = ("the look is not set: ask the user first whether the video is realistic (live-action, real people) or "
              "3D animation, anime or illustration, then update_brief(look=...) before creating elements or shots")


NEEDS_BRIEF = ("the brief is empty: call update_brief first with a summary and every detail field you can infer "
               "(goal, audience, platform, key_message, product, tone, references, cta, must_have, avoid; mark guesses "
               "with \"(asumsi)\"), then do this again")


def _require_brief(ctx: Ctx) -> None:
    """The agent may not build on a project whose brief was never written."""
    if ctx.author == "agent" and not boards.read_board(ctx.project_id)["brief"].get("summary"):
        raise ToolError(NEEDS_BRIEF)


def _require_look(ctx: Ctx) -> None:
    """The agent may not design assets or shots before the brief and the look of the video are settled."""
    _require_brief(ctx)
    if ctx.author == "agent" and not boards.read_board(ctx.project_id)["brief"].get("look"):
        raise ToolError(NEEDS_LOOK)


def _set_project_title(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    title = " ".join(str(args.get("title") or "").split())[:80]
    if not title:
        raise ToolError("title is required")
    if read_director(ctx.project_id).get("title_by") == "user":
        return {"ok": False, "error": "the user named this project themselves; keep their name"}, "Nama project tetap"
    update_director(ctx.project_id, title=title, title_by="agent")
    return {"ok": True}, f"Memberi nama project: {title}"


def _upsert_element(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    _require_look(ctx)
    item = {"id": _check_id(args.get("id")), "kind": args.get("kind"), "name": str(args.get("name") or "").strip(),
            "description": str(args.get("description") or "").strip()}
    # Fields left out keep their value, so an edit of the name or description (the board's edit form) keeps them.
    if item["kind"] == "prop" and args.get("interaction") is not None:
        item["interaction"] = str(args["interaction"]).strip()
    if args.get("variant_of") is not None:
        item["variant_of"] = str(args["variant_of"]).strip() or None
    if args.get("photos") is not None:
        photos = list(dict.fromkeys(str(p) for p in args["photos"]))
        if len(photos) > boards.MAX_ELEMENT_PHOTOS or not all(_ASSET_ID.match(p) for p in photos):
            raise ToolError(f"photos must be up to {boards.MAX_ELEMENT_PHOTOS} asset ids")
        item["photos"] = photos
    if item["kind"] not in boards.ELEMENT_KINDS:
        raise ToolError("kind must be character, location or prop")
    if not item["name"] or len(item["description"]) < 20:
        raise ToolError("name and a visual description (20+ chars) are required")
    labels = {"character": "karakter", "location": "lokasi", "prop": "properti"}

    def change(board: dict[str, Any]) -> bool:
        existing = boards.element(board, item["id"])
        original_id = item.get("variant_of")
        if original_id:
            original = boards.element(board, original_id)
            if original is None or original_id == item["id"] or original["kind"] != item["kind"]:
                raise ToolError(f"variant_of must be the id of another {item['kind']}")
            if original.get("variant_of"):
                raise ToolError(f"{original_id} is itself a variant; use its original {original['variant_of']}")
            if any(e.get("variant_of") == item["id"] for e in board["elements"]):
                raise ToolError(f"{item['id']} has variants of its own, so it cannot be a variant")
        if existing:
            ctx.guard(existing, f"element {item['id']}")
            existing.update(item)
            return False
        board["elements"].append({"interaction": "", **item, "locked": False} if item["kind"] == "prop"
                                 else {**item, "locked": False})
        return True

    created = ctx.update(change, f"{labels[item['kind']].capitalize()}: {item['name']}")
    return {"ok": True, "created": created}, f"{'Menambah' if created else 'Mengubah'} {labels[item['kind']]}: {item['name']}"


_ASSET_ID = re.compile(r"^[A-Za-z0-9-]{8,64}$")


def _set_element_photos(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    """User only: the user's own photos of an element (nexoclip asset ids); its sheet is regenerated from them."""
    element_id = args.get("id")
    photos = list(dict.fromkeys(str(p) for p in args.get("photos") or []))
    if len(photos) > boards.MAX_ELEMENT_PHOTOS or not all(_ASSET_ID.match(p) for p in photos):
        raise ToolError(f"photos must be up to {boards.MAX_ELEMENT_PHOTOS} asset ids")

    def change(board: dict[str, Any]) -> str:
        item = boards.element(board, element_id)
        if not item:
            raise ToolError(f"no element {element_id!r}")
        ctx.guard(item, f"element {element_id}")
        item["photos"] = photos
        return item["name"]

    name = ctx.update(change, lambda name: f"Foto referensi: {name}")
    return {"ok": True}, f"Foto referensi: {name}"


def _remove_element(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    element_id = args.get("id")

    def change(board: dict[str, Any]) -> str:
        item = boards.element(board, element_id)
        if not item:
            raise ToolError(f"no element {element_id!r}")
        ctx.guard(item, f"element {element_id}")
        users = [s["id"] for s in board["shots"] if element_id in s.get("element_ids", []) and s.get("locked")]
        if users and ctx.author == "agent":
            raise ToolError(f"element {element_id} is used by locked shots {users}")
        board["elements"].remove(item)
        for other in board["elements"]:
            if other.get("variant_of") == element_id:
                other["variant_of"] = None  # its sheet stays as it is, now a standalone element
        for shot in board["shots"]:
            shot["element_ids"] = [e for e in shot.get("element_ids", []) if e != element_id]
        return item["name"]

    name = ctx.update(change, lambda name: f"Menghapus elemen: {name}")
    return {"ok": True}, f"Menghapus elemen: {name}"


def _set_scenes(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    scenes = []
    for raw in args.get("scenes") or []:
        item = {k: str(raw.get(k) or "").strip() for k in SCENE_FIELDS}
        _check_id(item["id"])
        if not item["title"]:
            raise ToolError(f"scene {item['id']}: title is required")
        scenes.append(item)
    ids = [s["id"] for s in scenes]
    if len(ids) != len(set(ids)):
        raise ToolError("scene ids must be unique")

    def change(board: dict[str, Any]) -> int:
        orphans = [s["id"] for s in board["shots"] if s.get("scene_id") and s["scene_id"] not in ids]
        if orphans:
            raise ToolError(f"shots {orphans} still use removed scenes; move or remove them first")
        if not scenes and board["shots"] and any(s.get("scene_id") for s in board["shots"]):
            raise ToolError("cannot remove all scenes while shots use them")
        board["scenes"] = scenes
        return len(scenes)

    count = ctx.update(change, f"Menyusun {len(scenes)} scene")
    return {"ok": True, "scenes": count}, f"Menyusun {count} scene"


def _voice_check(ctx: Ctx) -> dict[str, str]:
    """Voiceover lines need a voice before they can be generated: tell the agent right away."""
    board = boards.read_board(ctx.project_id)
    if ctx.author == "agent" and any(s.get("vo_text") for s in board["shots"]) \
            and not ((board.get("audio") or {}).get("voiceover") or {}).get("voice_id"):
        return {"note": "these shots have voiceover lines but no voice is chosen: call list_voices, then set_audio(voice_id=...)"}
    return {}


def _set_shots(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    _require_look(ctx)

    def change(board: dict[str, Any]) -> int:
        current = {s["id"]: s for s in board["shots"]}
        shots = []
        for raw in args.get("shots") or []:
            existing = current.get(raw.get("id"))
            shot = _clean_shot({**raw, "locked": bool(existing and existing.get("locked"))}, board)
            if existing and existing.get("locked") and not _same_shot(shot, existing):
                ctx.guard(existing, f"shot {existing['id']}")
            shots.append(shot)
        kept = {s["id"] for s in shots}
        for gone in (s for s in board["shots"] if s["id"] not in kept):
            ctx.guard(gone, f"shot {gone['id']}")
        ids = [s["id"] for s in shots]
        if len(ids) != len(set(ids)):
            raise ToolError("shot ids must be unique")
        board["shots"] = shots
        return len(shots)

    count = ctx.update(change, f"Menyusun {len(args.get('shots') or [])} shot")
    return {"ok": True, "shots": count, **_voice_check(ctx)}, f"Menyusun {count} shot"


def _update_shot(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    shot_id = args.get("id")

    def change(board: dict[str, Any]) -> str:
        current = boards.shot(board, shot_id)
        if not current:
            raise ToolError(f"no shot {shot_id!r}")
        ctx.guard(current, f"shot {shot_id}")
        patch = {k: v for k, v in args.items() if k in SHOT_FIELDS and k != "id" and v is not None}
        updated = _clean_shot({**current, **patch}, board)
        index = board["shots"].index(current)
        board["shots"][index] = updated
        position = args.get("position")
        if position is not None:
            board["shots"].pop(index)
            board["shots"].insert(max(0, min(int(position), len(board["shots"]))), updated)
        return updated["title"]

    title = ctx.update(change, lambda title: f"Mengubah shot: {title}")
    return {"ok": True, **_voice_check(ctx)}, f"Mengubah shot: {title}"


def _remove_shot(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    shot_id = args.get("id")

    def change(board: dict[str, Any]) -> str:
        current = boards.shot(board, shot_id)
        if not current:
            raise ToolError(f"no shot {shot_id!r}")
        ctx.guard(current, f"shot {shot_id}")
        board["shots"].remove(current)
        return current["title"]

    title = ctx.update(change, lambda title: f"Menghapus shot: {title}")
    return {"ok": True}, f"Menghapus shot: {title}"


def _timeline_order(board: dict[str, Any]) -> list[dict[str, Any]]:
    """Shots as the timeline shows them: by scene, then shots without a known scene."""
    scene_ids = [sc["id"] for sc in board["scenes"]]
    if not scene_ids:
        return list(board["shots"])
    ordered = [sh for sid in scene_ids for sh in board["shots"] if sh.get("scene_id") == sid]
    return ordered + [sh for sh in board["shots"] if sh.get("scene_id") not in scene_ids]


def _move_shot(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    """Move a shot to another place in the timeline (0-based). Dropped among another scene's
    shots, it joins that scene, so the timeline shows it exactly where it was dropped."""
    shot_id = args.get("id")
    try:
        to_index = int(args.get("to_index"))
    except (TypeError, ValueError) as exc:
        raise ToolError("to_index must be a number") from exc

    def change(board: dict[str, Any]) -> str:
        current = boards.shot(board, shot_id)
        if not current:
            raise ToolError(f"no shot {shot_id!r}")
        ctx.guard(current, f"shot {shot_id}")
        order = [sh for sh in _timeline_order(board) if sh is not current]
        index = max(0, min(to_index, len(order)))
        order.insert(index, current)
        neighbour = order[index - 1] if index > 0 else (order[1] if len(order) > 1 else None)
        if board["scenes"] and neighbour is not None and neighbour.get("scene_id"):
            current["scene_id"] = neighbour["scene_id"]
        board["shots"] = order
        return current["title"]

    title = ctx.update(change, lambda title: f"Memindah urutan shot: {title}")
    return {"ok": True}, f"Memindah urutan shot: {title}"


def _add_shot(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    """User only: a new shot after another one (or at the end), from a short description."""
    description = str(args.get("description") or "").strip()
    if len(description) < 5:
        raise ToolError("describe the shot in a few words")
    after, before = args.get("after"), args.get("before")

    def change(board: dict[str, Any]) -> dict:
        anchor_id = after or before
        anchor = boards.shot(board, anchor_id) if anchor_id else None
        if anchor_id and anchor is None:
            raise ToolError(f"no shot {anchor_id!r}")
        n = len(board["shots"]) + 1
        while boards.shot(board, f"shot_{n}"):
            n += 1
        scene_id = (anchor or {}).get("scene_id") or args.get("scene_id") or (board["scenes"][-1]["id"] if board["scenes"] else None)
        item = _clean_shot({
            "id": f"shot_{n}", "title": str(args.get("title") or "").strip() or description[:60], "description": description,
            "scene_id": scene_id, "duration_seconds": args.get("duration_seconds") or 5,
            "element_ids": [e for e in args.get("element_ids") or [] if boards.element(board, e)],
            "frame_prompt": description, "video_prompt": description,
        }, board)
        index = (board["shots"].index(anchor) + (0 if before else 1)) if anchor else len(board["shots"])
        board["shots"].insert(index, item)
        return item

    item = ctx.update(change, lambda item: f"Menambah shot: {item['title']}")
    return {"ok": True, "shot": item}, f"Menambah shot: {item['title']}"


def _duplicate_shot(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    """User only: a copy of a shot right after it, with its frame and video (same prompts, so not stale)."""
    source_id = args.get("id")

    def change(board: dict[str, Any]) -> dict:
        source = boards.shot(board, source_id)
        if not source:
            raise ToolError(f"no shot {source_id!r}")
        n = 2
        while boards.shot(board, f"{source_id[:33]}_copy{n}"):
            n += 1
        item = {**copy.deepcopy(source), "id": f"{source_id[:33]}_copy{n}", "title": f"{source['title']} (salinan)", "locked": False}
        board["shots"].insert(board["shots"].index(source) + 1, item)
        for kind in ("frame", "video", "vo"):
            media = board["media"].get(f"{kind}:{source_id}")
            if media and media.get("status") == boards.TERMINAL_OK:
                board["media"][f"{kind}:{item['id']}"] = copy.deepcopy(media)
        return item

    item = ctx.update(change, lambda item: f"Menduplikat shot: {item['title']}")
    return {"ok": True, "shot": item}, f"Menduplikat shot: {item['title']}"


def _extend_shot(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    """User only: add a continuation right after a shot; its clip extends that shot's video."""
    source_id = args.get("id")
    prompt = str(args.get("video_prompt") or "").strip() or "Continue the same action naturally."
    try:
        duration = int(args.get("duration_seconds") or 5)
    except (TypeError, ValueError) as exc:
        raise ToolError("duration_seconds must be a number") from exc

    def change(board: dict[str, Any]) -> dict:
        source = boards.shot(board, source_id)
        if not source:
            raise ToolError(f"no shot {source_id!r}")
        n = 2
        while boards.shot(board, f"{source_id[:34]}_ext{n}"):
            n += 1
        item = _clean_shot({
            "id": f"{source_id[:34]}_ext{n}", "title": f"{source['title']} (lanjutan)",
            "description": f"Lanjutan dari {source['title']}.", "scene_id": source.get("scene_id"),
            "duration_seconds": duration, "element_ids": source.get("element_ids") or [],
            "frame_prompt": source["frame_prompt"], "video_prompt": prompt, "extends": source_id,
        }, board)
        board["shots"].insert(board["shots"].index(source) + 1, item)
        return item

    item = ctx.update(change, lambda item: f"Memperpanjang shot: {item['title']}")
    return {"ok": True, "shot": item}, f"Memperpanjang shot: {item['title']}"


def _set_audio(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    def change(board: dict[str, Any]) -> dict:
        audio = board.get("audio") or boards.empty_audio()
        voiceover, music = dict(audio["voiceover"]), dict(audio["music"])
        if args.get("lines") is not None:
            _apply_lines(ctx, board, args["lines"])
            voiceover["text"] = ""  # lines replace the older single narration
        if args.get("voiceover_text") is not None:
            voiceover["text"] = str(args["voiceover_text"]).strip()
            if len(voiceover["text"]) > 5000:
                raise ToolError("voiceover_text is longer than 5000 characters")
        if args.get("voice_id") is not None:
            voiceover["voice_id"] = str(args["voice_id"]).strip()
            if voiceover["voice_id"] and not _VOICE_ID.match(voiceover["voice_id"]):
                raise ToolError("voice_id is invalid; use one from list_voices")
            voiceover["voice_name"] = str(args.get("voice_name") or _voice_name(voiceover["voice_id"]))
        if (voiceover["text"] or any(s.get("vo_text") for s in board["shots"])) and not voiceover["voice_id"]:
            raise ToolError("pick a voice_id from list_voices for the voiceover")
        if args.get("music_prompt") is not None:
            music["prompt"] = str(args["music_prompt"]).strip()
        if args.get("music_seconds") is not None:
            seconds = int(args["music_seconds"])
            if not boards.MIN_MUSIC_SECONDS <= seconds <= boards.MAX_MUSIC_SECONDS:
                raise ToolError(f"music_seconds must be {boards.MIN_MUSIC_SECONDS}-{boards.MAX_MUSIC_SECONDS}")
            music["duration_seconds"] = seconds
        elif music["prompt"] and not music.get("duration_seconds"):
            music["duration_seconds"] = max(boards.MIN_MUSIC_SECONDS, min(boards.MAX_MUSIC_SECONDS, boards.video_seconds(board) or 30))
        if args.get("instrumental") is not None:
            music["instrumental"] = bool(args["instrumental"])
        try:
            for key, field in (("music_start", "start"), ("music_trim_start", "trim_start")):
                if args.get(key) is not None:
                    music[field] = round(max(0.0, float(args[key])), 2)
            if "music_end" in args:
                music["end"] = None if args["music_end"] in (None, "") else round(float(args["music_end"]), 2)
        except (TypeError, ValueError) as exc:
            raise ToolError("music timings must be numbers") from exc
        if music.get("end") is not None and music["end"] <= float(music.get("start") or 0):
            raise ToolError("the music must end after it starts")
        board["audio"] = {**boards.empty_audio(), **audio, "voiceover": voiceover, "music": music}
        return board["audio"]

    audio = ctx.update(change, "Mengatur audio")
    return {"ok": True, "audio": audio}, "Mengatur audio"


_VOICE_ID = re.compile(r"^[A-Za-z0-9]{10,40}$")


def _apply_lines(ctx: Ctx, board: dict[str, Any], lines: list[dict[str, Any]]) -> None:
    """Put each voiceover line on its shot (all other shots lose theirs)."""
    by_shot: dict[str, dict[str, Any]] = {}
    for line in lines:
        shot_id, text = str(line.get("shot_id") or ""), str(line.get("text") or "").strip()
        item = boards.shot(board, shot_id)
        if item is None:
            raise ToolError(f"voiceover line for unknown shot {shot_id!r}")
        if len(text) > boards.MAX_VO_LINE_CHARS:
            raise ToolError(f"shot {shot_id}: a voiceover line is longer than {boards.MAX_VO_LINE_CHARS} characters")
        by_shot[shot_id] = {"text": text, "offset": line.get("offset")}
    for item in board["shots"]:
        line = by_shot.get(item["id"], {"text": "", "offset": None})
        if (item.get("vo_text") or "") == line["text"] and line["offset"] is None:
            continue
        ctx.guard(item, f"shot {item['id']}")
        item["vo_text"] = line["text"]
        if line["offset"] is not None:
            offset = round(float(line["offset"]), 2)
            if not 0 <= offset < item["duration_seconds"]:
                raise ToolError(f"shot {item['id']}: offset must be within the shot (0-{item['duration_seconds']}s)")
            item["vo_offset"] = offset


def _set_audio_options(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    options = []
    for raw in args.get("options") or []:
        option = {k: str(raw.get(k) or "").strip() for k in ("id", "title", "why", "voice_id", "music_prompt")}
        option["instrumental"] = raw.get("instrumental") is not False
        _check_id(option["id"])
        lines = [{"shot_id": str(l.get("shot_id") or ""), "text": str(l.get("text") or "").strip()}
                 for l in raw.get("voiceover_lines") or [] if str(l.get("text") or "").strip()]
        known = {s["id"] for s in boards.read_board(ctx.project_id)["shots"]}
        unknown = [l["shot_id"] for l in lines if l["shot_id"] not in known]
        if unknown:
            raise ToolError(f"option {option['id']}: voiceover lines for unknown shots {unknown}")
        if any(len(l["text"]) > boards.MAX_VO_LINE_CHARS for l in lines):
            raise ToolError(f"option {option['id']}: a voiceover line is longer than {boards.MAX_VO_LINE_CHARS} characters")
        option["voiceover_lines"] = lines
        if not option["title"] or not (lines or option["music_prompt"]):
            raise ToolError(f"option {option['id']}: a title and voiceover lines or a music prompt are required")
        if lines and not _VOICE_ID.match(option["voice_id"]):
            raise ToolError(f"option {option['id']}: pick a voice_id from list_voices for its voiceover")
        option["voice_name"] = _voice_name(option["voice_id"]) if lines else ""
        options.append(option)
    if not 2 <= len(options) <= 3 or len({o["id"] for o in options}) != len(options):
        raise ToolError("give 2-3 options with distinct ids")
    recommended = args.get("recommended")
    if recommended not in {o["id"] for o in options}:
        raise ToolError("recommended must be one of the option ids")

    def change(board: dict[str, Any]) -> None:
        audio = {**boards.empty_audio(), **(board.get("audio") or {})}
        audio.update(options=options, recommended=recommended, chosen=None)
        board["audio"] = audio

    ctx.update(change, f"Menyusun {len(options)} opsi audio")
    return {"ok": True}, f"Menyusun {len(options)} opsi audio"


def _choose_audio_option(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    """User only: apply one of the agent's audio options as the voiceover and music ("none": no separate audio)."""
    option_id = args.get("id")

    def change(board: dict[str, Any]) -> str:
        audio = {**boards.empty_audio(), **(board.get("audio") or {})}
        if option_id == "none":
            empty = boards.empty_audio()
            audio.update(voiceover=empty["voiceover"], music=empty["music"], chosen="none")
            _apply_lines(ctx, board, [])
            board["audio"] = audio
            return "tanpa audio tambahan"
        option = next((o for o in audio["options"] if o["id"] == option_id), None)
        if option is None:
            raise ToolError(f"no audio option {option_id!r}")
        lines = option.get("voiceover_lines") or []
        _apply_lines(ctx, board, lines)
        audio["voiceover"] = {"text": "", "voice_id": option["voice_id"] if lines else "", "voice_name": option.get("voice_name") or ""}
        seconds = max(boards.MIN_MUSIC_SECONDS, min(boards.MAX_MUSIC_SECONDS, boards.video_seconds(board) or 30))
        audio["music"] = {"prompt": option["music_prompt"], "duration_seconds": seconds if option["music_prompt"] else None,
                          "instrumental": option["instrumental"]}
        audio["chosen"] = option_id
        board["audio"] = audio
        return option["title"]

    title = ctx.update(change, lambda title: f"Memilih audio: {title}")
    return {"ok": True}, f"Memilih audio: {title}"


def _voices() -> list[dict[str, Any]]:
    return nexoclip.VOICES


def _voice_name(voice_id: str) -> str:
    return next((v["name"] for v in _voices() if v["id"] == voice_id), "")


def _list_voices(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    return {"ok": True, "voices": _voices()}, "Melihat daftar suara"


def _analyze_video(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    """Ask the video analyst a specific question about a video the user attached."""
    asset_id, question = str(args.get("asset_id") or ""), str(args.get("question") or "").strip()
    if not _ASSET_ID.match(asset_id) or not question:
        raise ToolError("asset_id (a video the user attached) and a question are required")
    bridge = billing.bridge_for(ctx.project_id)
    if bridge is None:
        raise ToolError("video analysis needs the nexoclip connection")
    if billing.balance_short(ctx.project_id, billing.MIN_ANALYSIS_CREDITS) is not None:
        raise ToolError("not enough credits to ask the video analyst; tell the user to top up")
    key = hashlib.sha256(f"{asset_id}:{question}".encode("utf-8")).hexdigest()[:24]
    try:
        answer = bridge.analyze_video(asset_id=asset_id, question=question, idempotency_key=f"{ctx.project_id}:{key}")
    except nexoclip.BridgeError as exc:
        raise ToolError(f"the video analyst failed: {exc}") from exc
    return {"ok": True, "answer": answer["text"]}, "Menonton ulang video"


def _set_shot_media(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    """User only: the user's own image (as the shot's frame) or video (as its clip), instead of generating one."""
    shot_id, kind, asset_id = args.get("id"), args.get("kind"), str(args.get("asset_id") or "")
    if kind not in ("frame", "video") or not _ASSET_ID.match(asset_id):
        raise ToolError("kind (frame or video) and an uploaded asset_id are required")
    board = boards.read_board(ctx.project_id)
    item = boards.shot(board, shot_id)
    if item is None:
        raise ToolError(f"no shot {shot_id!r}")
    if boards.media_specs(board).get(f"{kind}:{shot_id}") is None:
        raise ToolError(f"shot {shot_id} has no {kind} (a continuation shot only has a video)")
    generation._record_take(ctx.project_id, f"{kind}:{shot_id}", asset_id=asset_id, spec_sig=None, dep_assets=[],
                            generated_at=now_iso(), uploaded=True)
    return {"ok": True}, f"Upload {'gambar' if kind == 'frame' else 'video'}: {item['title']}"


def _add_scene(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    """User only: a new scene (after another one, or at the end)."""
    title = str(args.get("title") or "").strip()
    if not title:
        raise ToolError("a scene title is required")

    def change(board: dict[str, Any]) -> str:
        n = len(board["scenes"]) + 1
        while boards.scene(board, f"scene_{n}"):
            n += 1
        item = {"id": f"scene_{n}", "title": title[:120], "description": str(args.get("description") or "").strip()[:400]}
        after = boards.scene(board, args.get("after")) if args.get("after") else None
        board["scenes"].insert(board["scenes"].index(after) + 1 if after else len(board["scenes"]), item)
        if len(board["scenes"]) == 1:  # the first scene: shots without one join it
            for s in board["shots"]:
                s["scene_id"] = s.get("scene_id") or item["id"]
        return item["id"]

    scene_id = ctx.update(change, f"Menambah scene: {title}")
    return {"ok": True, "scene_id": scene_id}, f"Menambah scene: {title}"


def _update_scene(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    def change(board: dict[str, Any]) -> str:
        item = boards.scene(board, args.get("id"))
        if item is None:
            raise ToolError(f"no scene {args.get('id')!r}")
        for key, limit in (("title", 120), ("description", 400), ("time", 120), ("lighting", 800)):
            if args.get(key) is not None:
                item[key] = str(args[key]).strip()[:limit]
        if not item["title"]:
            raise ToolError("a scene title is required")
        return item["title"]

    title = ctx.update(change, lambda title: f"Mengubah scene: {title}")
    return {"ok": True}, f"Mengubah scene: {title}"


def _remove_scene(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    """User only: remove a scene; its shots move to the scene before it (or after it), or are removed with it."""
    def change(board: dict[str, Any]) -> str:
        item = boards.scene(board, args.get("id"))
        if item is None:
            raise ToolError(f"no scene {args.get('id')!r}")
        index = board["scenes"].index(item)
        rest = [s for s in board["scenes"] if s is not item]
        shots = [s for s in board["shots"] if s.get("scene_id") == item["id"]]
        if args.get("with_shots"):
            for s in shots:
                ctx.guard(s, f"shot {s['id']}")
            board["shots"] = [s for s in board["shots"] if s.get("scene_id") != item["id"]]
        else:
            target = rest[index - 1] if index > 0 else (rest[0] if rest else None)
            for s in shots:
                s["scene_id"] = target["id"] if target else None
        board["scenes"] = rest
        return item["title"]

    title = ctx.update(change, lambda title: f"Menghapus scene: {title}")
    return {"ok": True}, f"Menghapus scene: {title}"


def _batch_shots(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    """User only: several shots at once: remove them, or move them into a scene."""
    ids = list(dict.fromkeys(str(i) for i in args.get("ids") or []))
    action = args.get("action")
    if not ids or action not in ("remove", "move_scene"):
        raise ToolError("ids and an action (remove or move_scene) are required")

    def change(board: dict[str, Any]) -> int:
        chosen = [s for s in board["shots"] if s["id"] in ids]
        if len(chosen) != len(ids):
            raise ToolError("some of those shots do not exist")
        for s in chosen:
            ctx.guard(s, f"shot {s['id']}")
        if action == "remove":
            board["shots"] = [s for s in board["shots"] if s["id"] not in ids]
        else:
            target = boards.scene(board, args.get("scene_id"))
            if target is None:
                raise ToolError(f"no scene {args.get('scene_id')!r}")
            for s in chosen:
                s["scene_id"] = target["id"]
        return len(chosen)

    verb = "Menghapus" if action == "remove" else "Memindah"
    count = ctx.update(change, lambda n: f"{verb} {n} shot")
    return {"ok": True, "count": count}, f"{verb} {count} shot"


def _use_take(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    """User only: make an earlier take of a frame/video/sheet the one the board uses."""
    key, asset_id = str(args.get("key") or ""), str(args.get("asset_id") or "")

    def change(board: dict[str, Any]) -> str:
        media = board["media"].get(key) or {}
        take = next((t for t in media.get("takes") or [] if t["asset_id"] == asset_id), None)
        if take is None:
            raise ToolError(f"no take {asset_id!r} for {key}")
        if media.get("status") == "running":
            raise ToolError(f"{key} is generating; wait until it finishes")
        media.update(status=boards.TERMINAL_OK, asset_id=take["asset_id"], error=None, done_spec_sig=take["spec_sig"],
                     dep_assets=take["dep_assets"], generated_at=take["generated_at"], uploaded=bool(take.get("uploaded")))
        return key

    ctx.update(change, f"Memilih take {key}")
    return {"ok": True}, f"Memilih take {key}"


def _request_generation(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    keys = list(dict.fromkeys(str(k).strip() for k in args.get("items") or [] if str(k).strip()))
    if not keys:
        raise ToolError("items is required")
    force = bool(args.get("force"))
    just_make_it = read_director(ctx.project_id).get("run_mode") == "auto"
    if ctx.author == "agent" and just_make_it and generation.is_auto(keys) and not force:
        # "Just make it": new or changed sheets are generated automatically at the end of the turn.
        return ({"ok": True, "status": "asset reference sheets are generated automatically after this turn; no approval needed"},
                "Reference sheet aset akan dibuat otomatis")
    # Sheets start right away only when the user asked for them on the board, or in "Just make it"; the Director's
    # requests in "Guide me" wait on the approval card like frames and videos.
    auto = generation.is_auto(keys) and (ctx.author == "user" or just_make_it)
    try:
        request = generation.create_request(ctx.project_id, keys, force=force, note=str(args.get("note") or ""), auto=auto,
                                            sheets_apart=just_make_it)
    except generation.GenerationError as exc:
        raise ToolError(str(exc)) from exc
    est = request["estimate"]
    parts = []
    if est["images"]:
        parts.append(f"{est['images']} gambar")
    if est["videos"]:
        parts.append(f"{est['videos']} video ({est['video_seconds']} detik)")
    result = {"ok": True, "request_id": request["id"], "items": request["items"], "estimate": est, "auto": auto,
              "status": "generating now (asset sheets need no approval)" if auto else "waiting for the user to approve the card in the UI"}
    return result, f"Menyiapkan generate: {' + '.join(parts)}"


def _render_video(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    from director_service import session  # session imports this module

    try:
        item = session.start_render(ctx.project_id)
    except (session.Busy, session.InvalidAction) as exc:
        raise ToolError(str(exc)) from exc
    note = f"{len(item['shots'])} shot"
    if item["stills"]:
        note += f", {item['stills']} masih frame diam (belum ada video)"
    if item["skipped"]:
        note += f", {item['skipped']} dilewati (belum ada frame/video)"
    return ({"ok": True, "render_id": item["id"], "shots": len(item["shots"]), "stills": item["stills"],
             "skipped": item["skipped"], "status": "rendering in the background; the render card shows progress and the download"},
            f"Render video final ({note})")


def _read_skill(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    name = str(args.get("name") or "")
    try:
        text = skills.read(name, boards.read_board(ctx.project_id)["brief"].get("video_type") or "")
    except KeyError as exc:
        raise ToolError(str(exc)) from exc
    note = ("Craft reference written for another agent. Use its creative guidance. Its process (stages, gates, "
            "checkpoints, 'ask before starting') never overrides what the user explicitly asked for in this conversation.")
    return {"ok": True, "skill": name, "note": note, "content": text}, f"Membaca skill: {name}"


def _set_lock(ctx: Ctx, args: dict[str, Any]) -> tuple[dict, str]:
    """User only: lock (approve) or unlock an item. target: brief | script | concepts | element:<id> | shot:<id>."""
    target, locked = str(args.get("target") or ""), bool(args.get("locked"))

    def change(board: dict[str, Any]) -> str:
        if target in ("brief", "script", "concepts"):
            item, name = board[target], {"brief": "brief", "script": "naskah", "concepts": "konsep"}[target]
        elif target.startswith("element:"):
            item = boards.element(board, target.split(":", 1)[1])
            name = item and item["name"]
        elif target.startswith("shot:"):
            item = boards.shot(board, target.split(":", 1)[1])
            name = item and item["title"]
        else:
            item, name = None, None
        if not item:
            raise ToolError(f"nothing to lock at {target!r}")
        item["locked"] = locked
        return name

    name = ctx.update(change, lambda name: f"{'Mengunci' if locked else 'Membuka kunci'} {name}")
    return {"ok": True}, f"{'Mengunci' if locked else 'Membuka kunci'} {name}"


HANDLERS: dict[str, Callable[[Ctx, dict[str, Any]], tuple[dict, str]]] = {
    "read_skill": _read_skill,
    "set_project_title": _set_project_title,
    "update_brief": _update_brief,
    "set_concepts": _set_concepts,
    "choose_concept": _choose_concept,
    "web_research": _web_research,
    "write_script": _write_script,
    "upsert_element": _upsert_element,
    "remove_element": _remove_element,
    "set_scenes": _set_scenes,
    "set_shots": _set_shots,
    "update_shot": _update_shot,
    "remove_shot": _remove_shot,
    "request_generation": _request_generation,
    "set_audio": _set_audio,
    "set_audio_options": _set_audio_options,
    "list_voices": _list_voices,
    "analyze_video": _analyze_video,
    "render_video": _render_video,
}

# What the user may change directly from the board (same validation as the agent).
USER_EDITS: dict[str, Callable[[Ctx, dict[str, Any]], tuple[dict, str]]] = {
    "update_brief": _update_brief,
    "choose_concept": _choose_concept,
    "write_script": _write_script,
    "upsert_element": _upsert_element,
    "remove_element": _remove_element,
    "update_shot": _update_shot,
    "remove_shot": _remove_shot,
    "move_shot": _move_shot,
    "use_take": _use_take,
    "set_shot_media": _set_shot_media,
    "add_scene": _add_scene,
    "update_scene": _update_scene,
    "remove_scene": _remove_scene,
    "batch_shots": _batch_shots,
    "set_audio": _set_audio,
    "choose_audio_option": _choose_audio_option,
    "extend_shot": _extend_shot,
    "add_shot": _add_shot,
    "duplicate_shot": _duplicate_shot,
    "set_element_photos": _set_element_photos,
    "set_scenes": _set_scenes,
    "set_lock": _set_lock,
}


def user_request(project_id: str, items: list[str], force: bool = False) -> dict[str, Any]:
    """Generation prepared from the board (e.g. a shot's Generate button): same estimate card, same approval."""
    result, label = _request_generation(Ctx(project_id, "user"), {"items": items, "force": force})
    append_chat(project_id, "user", label, kind="request", meta={"tool": "request_generation", "request_id": result["request_id"]})
    return result


def apply_user_edit(project_id: str, tool: str, args: dict[str, Any]) -> str:
    handler = USER_EDITS.get(tool)
    if handler is None:
        raise ToolError(f"cannot edit with {tool!r}")
    _, label = handler(Ctx(project_id, "user"), args)
    # Shown in the chat and fed back to the agent, so it knows what the user changed.
    append_chat(project_id, "user", label, kind="edit", meta={"tool": tool})
    return label


# ---------------------------------------------------------------- the turn


def _bill(project_id: str, purpose: str, usage: dict[str, Any]) -> None:
    credits = billing.charge_llm(project_id, llm.model_name(), usage)
    add_llm_cost(project_id, float(usage.get("cost") or 0.0), credits)
    append_llm_log(project_id, {"purpose": purpose, "model": llm.model_name(), "cost_usd": usage.get("cost"),
                                "input_tokens": usage.get("input_tokens"), "output_tokens": usage.get("output_tokens")})


def _instructions(project_id: str) -> str:
    board_json = json.dumps(boards.summary_for_agent(boards.read_board(project_id)), ensure_ascii=False)
    if len(board_json) > BOARD_CHARS:
        board_json = board_json[:BOARD_CHARS] + " ...(truncated)"
    mode = RUN_MODE_NOTES.get(read_director(project_id).get("run_mode") or "guide", "")
    return (f"{INSTRUCTIONS}{skills.index_text()}\n\n{mode}\n\n{_video_type_note(project_id)}\n\n"
            f"PROJECT BOARD (JSON) as it was when this turn began; your tool results tell you what changed since:\n{board_json}")


VIDEO_TYPE_NOTES = {
    "ugc_ad": "Looks filmed on a phone by a real person: 9:16, selfie or friend-held handheld, available light, one creator "
              "in one place, understated imperfect performance. The creator speaks in the clips (DIALOGUE + VOICE, native "
              "audio on), so usually no separate voiceover and no music under speech. Hook in the first 1.5 s, honest "
              "claim per shot, spoken CTA plus a caption at the end. No cinematic camera moves or grading.",
    "product_ad": "The product is the hero: a prop element with its exact packaging in every product shot, label to camera, "
                  "macro details and motion that show the benefit, polished motivated light. One clear visual idea written "
                  "as a mechanic with rules. Music bed, optional voiceover, end on the product with a CTA caption.",
    "short_film": "Story first: a clear arc, characters kept consistent with their sheets, sparse dialogue in quotes, faces "
                  "carry emotion, shot language motivated by the story. Score or ambience rather than wall-to-wall music.",
    "micro_drama": "Vertical episodic drama: conflict in the first 2 s, escalation, a turn, a cliffhanger in the last 2 s. "
                   "Dialogue-driven close-ups and reactions, 3-6 s shots, COUNT and SCREEN DIRECTION locks, one VOICE "
                   "sentence per character. Native audio on.",
    "trailer": "Beats escalate: world, character, conflict, rising montage, title. Short cuts that get faster, title cards as "
               "captions, music drives the cut (set the music early), lines of dialogue as punctuation only.",
    "music_video": "The music comes first (set the music bed early and plan shots on its sections and beats). Performance "
                   "and/or a visual narrative, cuts on the beat, no dialogue; motion and rhythm over plot.",
    "explainer": "Clarity first: a voiceover line per shot carries the explanation and each shot illustrates exactly its "
                 "line (objects, process, before/after). Simple compositions, captions on, calm pacing, no dialogue.",
    "documentary": "Observational: one lens for the whole piece (SINGLE-LENS LOCK), handheld operator, natural light, real "
                   "places and unposed people, optional voiceover narration, ambience instead of a dramatic score.",
    "animation": "Animated, never live-action: follow the look (3D, anime, illustration) in every prompt, characters from "
                 "sheets with expressions, stylised motion and staging, colour script per scene.",
    "presenter": "One presenter talking to camera (medium shot, eye line on the lens) who speaks in the clips (DIALOGUE + "
                 "VOICE, native audio on, lip sync by the video model); plain or branded background, captions, short "
                 "scene-safe chunks of speech, cutaways only to show what is being said.",
}


def _video_type_note(project_id: str) -> str:
    kind = boards.read_board(project_id)["brief"].get("video_type") or ""
    if not kind:
        return ("VIDEO TYPE: not set yet. Set it with the brief; the role guides follow it as soon as it is set.")
    meta = skills.video_type(kind)
    example = "example-prompt has a worked example for it. " if "example" in meta["roles"] else ""  # type: ignore[operator]
    return (f"VIDEO TYPE: {meta['label']} ({kind}). {VIDEO_TYPE_NOTES.get(kind, '')} {example}"
            f"Closest official Seedance 2.5 prompt archetypes: {meta['archetypes']} (seedance-archetypes, genre-modules).")


RUN_MODE_NOTES = {
    "guide": ("RUN MODE: Guide me. The user reviews each step: offer choices (concepts, audio), wait for their pick, and "
              "prepare paid generation for them to approve. Nothing is generated on its own, reference sheets included: "
              "request element:<id> sheets for approval once the elements are ready."),
    "auto": ("RUN MODE: Just make it. Do not stop to ask or wait for picks: decide yourself with sensible defaults "
             "(including the look when the user did not say it; state your choices in one line) and drive straight to a "
             "finished video in this turn: brief, choose a concept yourself, script, elements, scenes, shots, audio "
             "(set_audio with your recommended voice, lines and music unless it clearly needs none), then "
             "request_generation for every scene video in scene_videos plus video:<shot_id> for shots not in one "
             "(and vo:/audio: items). Requests are approved automatically "
             "and the video is exported when everything is generated. Only ask when the request is too vague to "
             "start at all."),
}


def _message_notes(meta: dict[str, Any], video_notes: Optional[dict[str, str]] = None) -> str:
    """What a chat message carried besides its text, spelled out for the model."""
    notes = []
    for a in meta.get("attachments") or []:
        seen = (video_notes or {}).get(a["asset_id"]) if a.get("kind") == "video" else None
        if seen:
            notes.append(f"[video analyst, watched video {a['asset_id']} from start to end]:\n{seen}")
    files = [f"{a['kind']} asset_id={a['asset_id']}" + (f" ({a['name']})" if a.get("name") else "")
             for a in meta.get("attachments") or []]
    if files:
        notes.append("[attached by the user: " + "; ".join(files) + "]")
    refs = [f"@{m.get('label') or m['id']} = {m['type']} {m['id']}" for m in meta.get("mentions") or []]
    if refs:
        notes.append("[mentions: " + "; ".join(refs) + "]")
    return ("\n" + "\n".join(notes)) if notes else ""


SEEN_IMAGE_MESSAGES = 3  # user messages whose attached images the model sees (older ones: ids only)
IMAGE_SIDE = 1024
_image_cache: dict[str, Optional[str]] = {}


def _image_data_url(project_id: str, asset_id: str) -> Optional[str]:
    """An attached image, shrunk to IMAGE_SIDE and inlined, for the model to look at (None if unavailable)."""
    if asset_id in _image_cache:
        return _image_cache[asset_id]
    url = None
    bridge = billing.bridge_for(project_id)
    if bridge is not None:
        try:
            from PIL import Image

            image = Image.open(io.BytesIO(bridge.download(asset_id).content)).convert("RGB")
            image.thumbnail((IMAGE_SIDE, IMAGE_SIDE))
            out = io.BytesIO()
            image.save(out, format="JPEG", quality=85)
            url = "data:image/jpeg;base64," + base64.b64encode(out.getvalue()).decode("ascii")
        except Exception:  # unreadable or gone: the model still gets the asset id
            url = None
    if len(_image_cache) > 200:
        _image_cache.clear()
    _image_cache[asset_id] = url
    return url


def _user_content(project_id: str, entry: dict[str, Any], show_images: bool, video_notes: dict[str, str]) -> Any:
    meta = entry.get("meta") or {}
    text = (entry.get("text") or "") + _message_notes(meta, video_notes)
    images = [a for a in meta.get("attachments") or [] if a.get("kind") == "image"] if show_images else []
    parts = [{"type": "input_image", "image_url": url} for url in (_image_data_url(project_id, a["asset_id"]) for a in images) if url]
    return [{"type": "input_text", "text": text}, *parts] if parts else text


VIDEO_NOTE_MESSAGES = 6  # recent user messages whose new videos are watched before the Director answers


def watch_new_videos(project_id: str) -> None:
    """Have the video analyst (a Seed vision model) watch every video the user attached recently and not yet seen."""
    bridge = billing.bridge_for(project_id)
    if bridge is None:
        return
    notes = boards.read_board(project_id).get("video_notes") or {}
    entries = [e for e in read_chat(project_id, limit=HISTORY_ENTRIES) if e.get("role") == "user"][-VIDEO_NOTE_MESSAGES:]
    videos = [a for e in entries for a in (e.get("meta") or {}).get("attachments") or [] if a.get("kind") == "video"]
    for video in videos:
        if video["asset_id"] in notes:
            continue
        name = video.get("name") or "video"
        if billing.balance_short(project_id, billing.MIN_ANALYSIS_CREDITS) is not None:
            return  # not enough credits to watch it; it is watched on a later turn, after a top-up
        append_chat(project_id, "assistant", f"Menonton video: {name}", kind="activity", meta={"tool": "analyze_video"})
        try:
            text = bridge.analyze_video(asset_id=video["asset_id"], idempotency_key=f"{project_id}:{video['asset_id']}")["text"]
        except nexoclip.BridgeError as exc:
            text = f"(could not watch this video: {exc})"[:300]
        notes[video["asset_id"]] = text

        def change(board: dict[str, Any], asset_id: str = video["asset_id"], seen: str = text) -> None:
            board["video_notes"] = {**(board.get("video_notes") or {}), asset_id: seen}

        boards.update_board(project_id, change)


# A reply that is only a tool log ("[tool used: ...]") instead of a tool call. Some models (Seed) copy the log
# lines they see in the history rather than calling the tool, which ends the turn with nothing done.
FAKE_TOOL_LOG = re.compile(r"^\s*(\[(tool used|system)\b[^\]]*\]\s*)+$", re.IGNORECASE)


def build_history(project_id: str) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    tools_used: list[str] = []

    def flush_tools() -> None:
        # Tool use is told to the model as a note, never as words the assistant said: a model shown assistant
        # turns that read "[tool used: ...]" learns to write that line instead of calling the tool.
        if tools_used:
            items.append({"role": "user", "content": "[system note: tools the assistant ran here: "
                                                     + "; ".join(tools_used) + "]"})
            tools_used.clear()

    entries = read_chat(project_id, limit=HISTORY_ENTRIES)
    with_images = [i for i, e in enumerate(entries) if e.get("role") == "user"
                   and any(a.get("kind") == "image" for a in (e.get("meta") or {}).get("attachments") or [])]
    shown = set(with_images[-SEEN_IMAGE_MESSAGES:])
    video_notes = boards.read_board(project_id).get("video_notes") or {}
    for index, entry in enumerate(entries):
        kind, text = entry.get("kind"), entry.get("text") or ""
        if kind in ("activity", "request") and entry.get("role") != "user":
            if not (kind == "activity" and (entry.get("meta") or {}).get("tool") == "analyze_video"
                    and text.startswith("Menonton video:")):  # the analyst's notes are on the user's message itself
                tools_used.append(text)
            continue
        if kind == "card" or (kind == "message" and entry.get("role") == "assistant" and FAKE_TOOL_LOG.match(text)):
            continue  # a UI card the tool notes already cover, or an earlier fake tool log
        flush_tools()
        if kind == "edit":
            items.append({"role": "user", "content": f"[user edited: {text}]"})
        elif kind == "request" and entry.get("role") == "user":
            items.append({"role": "user", "content": f"[user prepared generation: {text}]"})
        elif entry.get("role") == "user":
            items.append({"role": "user", "content": _user_content(project_id, entry, index in shown, video_notes)})
        elif kind in ("generation", "error"):
            items.append({"role": "user", "content": f"[system note: {text}]"})
        else:
            items.append({"role": "assistant", "content": text})
    flush_tools()
    return items


def _args(call: dict[str, Any]) -> dict[str, Any]:
    try:
        args = json.loads(call["arguments"] or "{}")
    except json.JSONDecodeError:
        return {}
    return args if isinstance(args, dict) else {}


def _audio_skills(args: dict[str, Any]) -> tuple[str, ...]:
    """set_audio needs the voiceover guide for narration and the music guide for a music prompt."""
    names = []
    if args.get("lines") or str(args.get("voiceover_text") or "").strip():
        names.append("voice-performance-director")
    if str(args.get("music_prompt") or "").strip():
        names.append("music-gen-usage")
    return tuple(names)


# Creative output the agent may only write with the matching OpenMontage skill in context
# (the model reliably skips "please read the guide" instructions otherwise).
REQUIRED_SKILLS: dict[str, tuple[Any, Callable[[dict[str, Any]], bool]]] = {
    "update_brief": (("idea-director",), lambda a: bool(a.get("summary"))),
    "set_concepts": (("idea-director",), lambda a: True),
    "write_script": (("script-director",), lambda a: True),
    "upsert_element": (("image-gen-usage",), lambda a: True),
    "set_shots": (("seedance-official-generation", "scene-director"), lambda a: True),
    "update_shot": (("seedance-official-generation",), lambda a: bool(a.get("frame_prompt") or a.get("video_prompt"))),
    "set_audio": (_audio_skills, lambda a: True),
    "set_audio_options": (("voice-performance-director", "music-gen-usage"), lambda a: True),
}



def missing_skills(call: dict[str, Any], skills_read: set[str]) -> list[str]:
    rule = REQUIRED_SKILLS.get(call["name"])
    if not rule or not rule[1](_args(call)):
        return []
    names = rule[0](_args(call)) if callable(rule[0]) else rule[0]
    return [name for name in names if name not in skills_read]


# Which board card to show in the chat after a turn that changed it.
CARD_FOR_TOOL = {
    "update_brief": "brief", "set_concepts": "concepts", "choose_concept": "concepts", "write_script": "script",
    "upsert_element": "assets", "remove_element": "assets", "set_scenes": "shots", "set_shots": "shots",
    "update_shot": "shots", "remove_shot": "shots", "web_research": "research", "set_audio": "audio", "set_audio_options": "audio",
}
CARD_ORDER = ("brief", "concepts", "research", "script", "assets", "shots", "audio")


MAX_NUDGES = 2


def _call_key(call: dict[str, Any]) -> str:
    target = _args(call).get("id")
    return f"{call['name']}:{target}" if target else call["name"]


def _call_label(call: dict[str, Any]) -> str:
    args = _args(call)
    target = args.get("name") or args.get("title") or args.get("id")
    return f"{call['name']}({target})" if target else call["name"]


def run_turn(project_id: str) -> str:
    """Answer the latest user message, using tools as needed. Returns the reply text."""
    input_items: list[dict[str, Any]] = build_history(project_id)
    skills_read: set[str] = set()
    cards: set[str] = set()
    refused: dict[str, str] = {}  # calls held back for a skill and not yet redone: key -> label
    nudges = 0
    previous_id = None

    def show_cards() -> None:
        for card in CARD_ORDER:
            if card in cards:
                append_chat(project_id, "assistant", card, kind="card", meta={"card": card})

    # The instructions (with the board as it was when the turn began) stay identical for every step of the turn: the
    # model's prompt cache then covers everything already sent, which is most of each step's input. Changes made during
    # the turn reach the model through the tool results.
    instructions = _instructions(project_id)
    for _ in range(MAX_STEPS):
        short = billing.balance_short(project_id, billing.MIN_STEP_CREDITS)
        if short is not None:
            show_cards()
            reply = (f"Kredit kamu tinggal {short:g}, belum cukup untuk langkah berikutnya (butuh sekitar "
                     f"{billing.MIN_STEP_CREDITS:g}). Aku berhenti di sini dulu; yang sudah jadi tetap tersimpan. "
                     "Top up kredit, lalu bilang \"lanjut\".")
            append_chat(project_id, "assistant", reply, kind="message")
            return reply
        step = llm.respond(input_items, instructions=instructions, tools=TOOLS,
                           previous_response_id=previous_id, on_text=lambda text: live.draft(project_id, text))
        # No "clear" event here: the browser keeps the draft on screen until the saved message replaces it, so the
        # reply never blinks out between the two.
        if step["text"]:
            live.draft(project_id, step["text"], force=True)  # the full text (the last streamed piece may have been throttled)
        _bill(project_id, "agent", step["usage"])
        if not step["calls"] and refused and nudges < MAX_NUDGES:
            # The model is about to wrap up (often claiming the work is done) while calls it made were
            # held back for their skill guide. Drop that reply and have it redo them first.
            nudges += 1
            input_items = [{"role": "user", "content": (
                "[system] Not done yet: these calls were NOT applied because their guide had to load first: "
                + "; ".join(refused.values()) + ". The guides are loaded now. Call them again now, then reply.")}]
            previous_id = step["id"]
            continue
        if not step["calls"] and FAKE_TOOL_LOG.match(step["text"] or "") and nudges < MAX_NUDGES:
            # It wrote a tool log line instead of calling the tool: nothing was done. Have it do the work.
            nudges += 1
            live.draft(project_id, "", force=True)
            input_items = [{"role": "user", "content": (
                "[system] Your last reply was only a tool log line; no tool was called and nothing was done. "
                "Do the work now by calling the tools, then reply to the user in normal words.")}]
            previous_id = step["id"]
            continue
        if not step["calls"]:
            show_cards()
            reply = step["text"].strip() or "Oke."
            append_chat(project_id, "assistant", reply, kind="message")
            return reply
        if step["text"].strip():
            append_chat(project_id, "assistant", step["text"].strip(), kind="message")
        outputs = []
        for call in step["calls"]:
            missing = missing_skills(call, skills_read)
            if missing:
                # Load the guide for the model instead of only refusing: it then retries with it in
                # context, rather than ending the turn with "I'll read the guide first".
                loaded = {}
                for name in missing:
                    skill_result = _execute(project_id, {"name": "read_skill", "arguments": json.dumps({"name": name})})
                    if skill_result.get("ok"):
                        skills_read.add(name)
                        loaded[name] = skill_result["content"]
                result = {"ok": False,
                          "error": f"not applied yet: {call['name']} needs the {', '.join(missing)} guide, loaded below. "
                                   f"Apply it and call {call['name']} again in this turn.",
                          "skill_content": loaded}
                refused[_call_key(call)] = _call_label(call)
            else:
                result = _execute(project_id, call)
                if call["name"] == "read_skill" and result.get("ok"):
                    skills_read.add(result["skill"])
                if result.get("ok") and call["name"] in CARD_FOR_TOOL:
                    cards.add(CARD_FOR_TOOL[call["name"]])
                if result.get("ok"):
                    refused.pop(_call_key(call), None)
            outputs.append({"type": "function_call_output", "call_id": call["call_id"],
                            "output": json.dumps(result, ensure_ascii=False)})
        input_items = outputs
        previous_id = step["id"]
    show_cards()
    reply = "Aku berhenti dulu di sini supaya tidak kebablasan. Cek board-nya, lalu bilang mau lanjut ke mana."
    append_chat(project_id, "assistant", reply, kind="message")
    return reply


def _execute(project_id: str, call: dict[str, Any]) -> dict[str, Any]:
    handler = HANDLERS.get(call["name"])
    if handler is None:
        return {"ok": False, "error": f"unknown tool {call['name']}"}
    try:
        args = json.loads(call["arguments"] or "{}")
        if not isinstance(args, dict):
            raise ToolError("arguments must be an object")
        result, label = handler(Ctx(project_id, "agent"), args)
    except (ToolError, json.JSONDecodeError, TypeError, ValueError, llm.LLMError, nexoclip.BridgeError) as exc:
        return {"ok": False, "error": str(exc)}
    meta = {"tool": call["name"]}
    if call["name"] == "request_generation" and result.get("request_id"):
        meta["request_id"] = result["request_id"]
        append_chat(project_id, "assistant", label, kind="request", meta=meta)
    else:
        append_chat(project_id, "assistant", label, kind="activity", meta=meta)
    return result
