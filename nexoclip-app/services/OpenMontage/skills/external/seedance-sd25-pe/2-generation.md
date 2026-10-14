# Seedance 2.5 Prompt Optimizer (ByteDance sd25-pe 0.1.1) — part 2/3: generation templates

> Official BytePlus/ByteDance skill, split into parts for the Director (full original: SKILL.md). Part 1 has the principles and workflow; part 3 the output contract and checklist.

## Video Generation Templates

### Basic Generation

Suitable for text-only generation or tasks with few references and a simple event:

```text
<Subject> <performs the main action or event> in <scene and environment>.
The visuals present <visual style or mood>.
The camera uses <shot size, camera position, camera movement, or cuts>.
The sound includes <dialogue, ambient sound, sound effects, or music>.
```

Delete any unnecessary visual, camera, or sound line, but the subject and main action or event must be explicit.

Completed example:

```text
A young ceramicist shapes clay on a pottery wheel in a studio at dawn, holding the spinning clay steady with both hands until it forms a narrow-necked vase.
Soft morning light enters through the window on the left, keeping the wooden table and clay in natural warm tones.
The camera begins in a medium shot observing the hand movements, then slowly pushes in toward the mouth of the vase.
The sound preserves the low hum of the wheel, palms rubbing against wet clay, and distant birdsong outside the window.
```

### Generation with Reference Assets

```text
【Generation Goal】
Generate <video type or core event>. The core subject is <subject>, and the principal event is <summary>.

【Reference Asset Roles】
@Image1 is used for <subject>'s <appearance, clothing, structure, or material>.
@Video1 is used for <action, camera movement, or pacing>; do not use <identity, clothing, or scene that could be unintentionally carried over>.
@Audio1 is used for <character or sound type>'s <voice quality, dialogue, ambient sound, or music>.

【Unused Assets】
@Image2, @Video2, and @Audio2 are not used in this task or for people, scenes, props, actions, camera, or sound.

【Subjects and Relationships】
<Subject A> maps to @Image1 and always retains <fixed features>.
The spatial, prop, or identity relationship between <Subject A> and <Subject B> is <relationship>.

【Event Script】
At the start: <state of people, props, and scene>.
Principal event: <continuous action or event>.
At the end: <character positions, prop ownership, or final visual state>.

【Maintain Consistency】
Keep <character identities and count, clothing, prop ownership, spatial directions, and sound relationships> stable.
```

Do not invent a visual style, camera movement, or sound merely to fill the template when the user did not request it. Simple tasks may merge adjacent sections, but must not omit the roles of assets that are actually used.

Completed example:

```text
【Generation Goal】
Generate a video of an old wooden chair being repaired. A carpenter first inspects the loose backrest, then applies wood glue and secures the joint. At the end, the chair is stable again.

【Reference Asset Roles】
@Image1 is used for the carpenter's facial features, short hair, and dark blue work apron; do not use the image background.
@Image2 is used for the old chair's curved backrest, dark wood grain, and worn areas; do not use the person in the image.
@Video1 is used for the hand movements when applying glue and pressing the joint together; do not use the character identity, clothing, or workbench from the video.

【Subjects and Relationships】
The carpenter always wears the dark blue apron defined by @Image1. There is only one old wooden chair, defined by @Image2, throughout the video. The tools remain on the right side of the wooden table.

【Event Script】
At the start, the chair is centered on the wooden table and the backrest joint is loose. The carpenter inspects the joint, applies wood glue, and uses both hands to press the backrest into place and secure it. At the end, the carpenter releases the chair, the backrest remains stable, and the chair's count and appearance remain unchanged.

【Maintain Consistency】
Keep the carpenter's identity and clothing, the chair's structure and count, the tool positions, and the studio's spatial orientation stable.
```

## Organizing Multiple Reference Assets

Organize multiple reference assets in the following order:

```text
role of each asset → subject mapping → grouping by type → subject definitions → scene-by-scene activation
```

Having many reference assets does not mean that all of them should be included in the Prompt. Use only the assets relevant to the current story and scene. Put assets that are available but have not been assigned a role in `【Unused Assets】` within the Prompt, list every unused reference number, and prohibit their activation. Unused assets may be consolidated into one compact line for images, one for videos, and one for audio, but no reference number may be omitted or expressed as a subject-range mapping.

Seedance 2.5 accepts up to 50 reference assets. Even when approaching this limit, classify every asset individually by character, prop, scene, action, or sound, and activate it scene by scene. Do not use a catch-all sentence that leaves allocation to the model, and do not make all assets appear simultaneously merely to demonstrate their quantity.

### Grouping by Type

```text
【Characters】
<Character A> corresponds to @Image1; use only the appearance, hairstyle, and clothing.
<Character B> corresponds to @Image2; use only the appearance, hairstyle, and clothing.
Do not swap the two characters' appearances, clothing, actions, positions, or dialogue.

【Props】
<Prop A> corresponds to @Image3 and belongs only to <Character A>.
<Prop B> corresponds to @Image4 and belongs only to <Character B>.

【Scenes】
<Scene A> references @Image5; use only the space, materials, and lighting.
<Scene B> references @Image6; use only the space, materials, and lighting.

【Actions and Sound】
@Video1 is used for <Character A>'s <action or camera movement>; do not use the characters or scene from the video.
@Audio1 is used for <Character B>'s <voice timbre and specified dialogue>.
```

### Subject Definitions and Scene-by-Scene Activation

```text
【Subject Definition: Character A】
Appearance and clothing: @Image1.
Fixed prop: <Prop A> from @Image3.
Allowed scenes: <Scene A> and <Scene B>.
Action reference: <action> from @Video1.
Do not use: <another subject's clothing, props, or voice>.

Scene 1 | <Scene Name>
Use: <the subjects, props, scene, actions, and sounds activated for this scene>.
Event: <one main event>.
At the end: <observable state>.

Scene 2 | <Scene Name>
Use: <the subjects, props, scene, actions, and sounds activated for this scene>.
Event: <one main event>.
At the end: <observable state>.
```

Multi-angle references for the same subject should assign a role to each image. For example, front, left-side, right-side, and back views jointly define the same entity, and the number of entities in the final video must be stated explicitly.

### Spatial Relationships and Positions

Describe inside/outside, front/back, orientation, distance, and separation relative to stable objects such as doors, tables, vehicles, counters, and roads. Do not rely only on screen-left or screen-right. For example:

```text
The <Clerk> always stands on the inside of the glass display counter, facing outward. <Customer A> and <Customer B> stand side by side on the outside of the counter and speak with the <Clerk> across it.
```

When the user provides a clean blocking diagram, use it for composition, character positions, orientation, and spatial relationships. Do not treat arrows, annotation boxes, or explanatory text in the image as content for the final video.

Completed example with multiple assets:

```text
【Characters】
The Inspector corresponds to @Image1; use only the facial features, short hair, and orange windbreaker.
The Archivist corresponds to @Image2; use only the facial features, glasses, and gray knit cardigan.
Do not swap the two characters' appearances, clothing, actions, or dialogue.

【Props】
The portable recorder corresponds to @Image3, belongs only to the Inspector, and remains the only one throughout.

【Scenes】
The mountaintop observation station references @Image4; use only the building structure, metal platform, and overcast lighting.
The records room references @Image5; use only the bookshelf layout, wooden table, and warm indoor lighting.

【Actions and Sound】
@Video1 is used for the Inspector's action of opening the equipment bay and removing the memory card; do not use the characters or scene from the video.
@Audio1 is used for the Inspector's voice timbre and dialogue.

【Event Script】
Stage 1: The Inspector stands alone in front of the equipment bay at the mountaintop observation station, with the portable recorder hanging at his waist. He opens the equipment bay and removes the single memory card. At the end, the memory card is only in the Inspector's right hand.
Stage 2: Inside the observation station, the Inspector inserts the memory card into the portable recorder. At the end, the recorder's screen shows that data reading is complete, and the memory card remains inside the device.
Stage 3: The shot cuts to the records room. The Archivist stands on the inner side of the wooden table, and the Inspector stands on the outer side. The Inspector places the recorder at the center of the table and says naturally in Mandarin: {This week's observation data has been exported.}
Stage 4: The Archivist picks up the recorder to inspect the data, while the Inspector naturally closes his mouth and waits. At the end, the recorder is only in the Archivist's hands.
Stage 5: The Archivist places the recorder back on the table, and both characters look at the completed status on its screen. End on a medium shot that clearly shows their identities, the number of props, and their positions.

【Maintain Consistency】
Keep both characters' identities and clothing, the recorder's quantity and ownership, the spatial orientation of both scenes, and the speaker relationship consistent.
```

## Long Videos and Time Segments

Seedance 2.5 supports videos up to 30 seconds long. The total duration is set through generation parameters; the Prompt is responsible only for organizing events within that duration.

Event time segments explicitly provided by the user are part of the creative content and must be preserved. Parameter separation removes only interface settings such as "generate an N-second video" or "output in a 16:9 aspect ratio." If the user's original numerical time segments conflict with the target total duration on the page or in the API, prioritize preserving event order, relative pacing, and the story outcome, and switch to unnumbered "stages." Preserve the numbers and ask the user to resolve the parameter conflict only when the user explicitly states that the original time segments are hard constraints.

For long videos, prefer "stages." Assign only one major state change to each stage and clearly state its end state:

```text
【Stage 1】
At the start: <initial state>.
Main event: <one main action or event>.
At the end: <observable state>.

【Stage 2】
Continuing from the previous stage: <state that must be maintained>.
Main event: <one main action or event>.
At the end: <observable state>.

【Stage 3】
Main event: <concluding event>.
At the end: <final visual state>.
```

The number of stages is determined by the number of events and may be increased or decreased; it is not fixed at three. When the Prompt is long, prioritize subject mappings, asset roles, events, and end states. Compress repeated style terms, repeated constraints, and inactive assets. Do not impose a fixed word limit.

### Target-Duration Override

When the target duration provided by the generation page or API context is longer than the user's original event timeline, first preserve the characters, event order, causal relationships, and story outcome, and then redistribute the pacing of the existing events. When the target duration is provided only by the page or API, organize the Prompt into stages without numerical timestamps so that the stages collectively cover the narrative capacity of the target duration. Do not create numerical time segments such as `0-8 seconds` or `8-18 seconds` in the Prompt merely to align with that parameter.

You may lengthen only action processes, reactions, pauses, or scene transitions. For example, allow shifts in gaze, changes in breathing, the process of picking something up, and reactions after entering to unfold naturally. Do not add characters, main-plot events, or story outcomes, and do not mechanically fill time with repeated actions or empty shots. The target total duration still must not be written into the Prompt as an interface parameter sentence.

For handoffs, grabs, and placement tasks, state the ownership change of the single object. For example, after handing it over, the original holder no longer has it; at the end, it is only in the recipient's hands.

Use continuous whole-number time segments only when the user has already provided numerical time segments or explicitly requests time-segment control over handoffs, entrances and exits, or beats. When there are fewer events, do not split them merely to reach a segment count. When there are more events, merge secondary events first:

```text
0-5 seconds: <starting state>; <main event>; at the end, <observable state>.
5-10 seconds: Continue from <state> in the previous segment; <main event>; at the end, <observable state>.
10-15 seconds: <concluding event>; at the end, <final state>.
```

When the user requests numerical time segments, the segments must be continuous and non-overlapping. They represent event budgets, not frame-level edit points. Do not claim precision to 0.5 seconds, and do not give an unverified maximum number of time segments. When events are too dense, reduce the number of stages instead of subdividing them further.

The overall output duration is still set through generation parameters. Do not separately write "generate an N-second video."

## Keyframe Anchors

Keyframe images are still provided as ordinary reference images; assign each image a specific role in the Prompt. Do not combine the first-frame and last-frame roles into a single range statement.

When fixing the first frame, write `Use @ImageN as the first frame.` as a standalone sentence. When fixing the last frame, write `Use @ImageN as the last frame.` as a standalone sentence. Do not weaken these statements to "use only as a first-frame reference," "reference the opening composition," or "first-frame composition reference." Do not compress the role statement and the subsequent action into the same sentence. The exact role statement must remain verbatim in the final Prompt. Add a separate sentence describing the composition, subject positions, poses, prop states, scene, and camera direction defined by that frame.

The first frame locks the output aspect ratio. The first and last frames should use the same aspect ratio to avoid stretching the last frame; duration is still set on the generation page or through the API. This rule is only for input preflight and must not be written into the Prompt as an output parameter.

### First Frame Plus Other References

```text
Use @Image1 as the first frame.
This first frame defines the composition at the start of the video, subject positions, poses, prop states, scene, and camera direction.
Use @Image2 for the <appearance, clothing, structure, or material> of <the subject> without changing the first-frame composition defined by @Image1.
Use @Image3 for <the scene, props, or lighting> without changing the first-frame composition defined by @Image1.

The shot begins naturally from the first frame defined by @Image1, followed by <a continuous action or event>.
Maintain continuity in <character identities, prop ownership, spatial relationships, and visual style>.
```

### First Frame, Last Frame, and Other References

```text
Use @Image1 as the first frame.
This first frame defines the composition at the start of the video, subject positions, poses, prop states, scene, and camera direction.
Use @Image2 as the last frame.
This last frame defines the composition at the end of the video, subject positions, poses, prop states, scene, and camera direction.
Use @Image3 for <Subject A>'s <appearance, clothing, structure, or material> without changing the first-frame composition in @Image1 or the last-frame composition in @Image2.
Use @Image4 for <the specified attributes> of <Subject B, a prop, or the scene> without changing the first-frame composition in @Image1 or the last-frame composition in @Image2.

<One continuous action or event>.
The shot begins naturally from the first frame defined by @Image1 and, after a continuous action, arrives at the last frame defined by @Image2.
Maintain continuity from first to last in <character identities, prop structure and ownership, scene layout, and camera direction>.
```

Completed example:

```text
Use @Image1 as the first frame.
This first frame defines the baking station, the cake decorator's position, the undecorated cake, tool placement, and a frontal medium-shot camera position.
Use @Image2 as the last frame.
This last frame defines the decorated cake centered on the turntable, the cake decorator's hands away from the cake, and the same frontal medium-shot camera position.
Use @Image3 for the cake decorator's facial features, updo, and white uniform without changing the first-frame composition in @Image1 or the last-frame composition in @Image2.
Use @Image4 for the cake's two-tier structure, white frosting texture, and blueberry decorations without changing the first-frame composition in @Image1 or the last-frame composition in @Image2.

The shot begins naturally from the first frame defined by @Image1. The cake decorator rotates the cake turntable, continuously pipes even cream patterns along the edges of both tiers, and then places the blueberries one by one. Finally, the decorator moves both hands away from the cake and naturally arrives at the last frame defined by @Image2.
Maintain continuity from first to last in the cake decorator's identity and clothing, the number and two-tier structure of the cake, tool positions, the baking-station layout, and camera direction.
```

When the user explicitly requests an intermediate key state, an additional image may define the characters, actions, props, and spatial relationships that must appear at that moment; describe the shot as naturally reaching that state around the specified time. It is a semantic anchor, not a static hold or a pixel-locked frame. When the first-frame and last-frame boundaries take priority, reduce other assets unrelated to the current event.

### Controlling the Order of Multiple Keyframes

When multiple independent images define separate process stages, use the first sentence to declare the keyframe order, then describe each key state image by image. Keyframes control stage order and visible states; they do not promise frame-by-frame replication or require a static hold at any key state.

```text
Use @Image1 through @ImageN as keyframes in that order.

Use @Image1 as the first frame.
This first frame defines <the starting composition, subject positions, poses, prop states, and camera direction>.
@Image2 defines the second keyframe: <the visible state at the end of the first stage>.
@Image3 defines the third keyframe: <the visible state at the end of the second stage>.
Use @ImageN as the last frame.
This last frame defines <the ending composition, subject positions, poses, prop states, and camera direction>.

The shot passes through the states defined by @Image1, @Image2, @Image3, and onward to @ImageN in order, using continuous action to transition naturally between stages.
Throughout the process, maintain continuity in <subject identities, prop structure and ownership, scene layout, lighting, and the camera axis>.
```

### Storyboard Grids and Storyboards

A storyboard grid defines the overall story, shot order, and approximate composition; it does not require strict replication of every panel's details. Prefer clean storyboards with no more than 15 panels and minimal text annotations. Specify the reading order, the shot structure to adopt, and any sketch style, annotations, or placeholder characters not to adopt.

```text
@Image1 provides the shot order and approximate compositions for an <N-panel storyboard grid>. Read it <from left to right and from top to bottom>; do not adopt <the sketch style, text annotations, or placeholder characters> shown in the image.
@Image2 defines <Subject A>'s <appearance and clothing>.
@Image3 defines <the structure, material, or lighting> of <a key prop or scene>.

Shot 1: <shot size, subject action, and scene state>.
Shot 2: <shot size, subject action, and camera movement or transition>.
...
Shot N: <ending action and final visual state>.

The final visuals use <visual style>. The audio includes <dialogue, ambience, action sound effects, or music>.
```

### Blockout References and Rendering

First determine whether the blockout video provides a motion skeleton or a complete structure:

- **Coarse blockout**: Simple geometry mainly provides action paths, direction of movement, subject blocking, entrances and exits, camera position, camera movement, cuts, lighting changes, audio rhythm, or spatial relationships. Map every geometric object individually to a final subject or prop.
- **Fine blockout**: The structure of the subjects, props, or scene is already complete. It is mainly used to replace character appearance, materials, colors, the scene, or the visual style. Preserve the existing structure, actions, spatial relationships, and camera work.

A blockout video is a generation reference; it does not automatically become the editing master merely because it is a video. If the blockout contains trajectory lines, coordinate axes, controllers, camera frustums, or text markers, explicitly exclude those production markers.

#### Coarse Blockout

```text
@Video1 is a coarse-blockout reference. Use it only for <action paths, subject blocking, camera position, camera movement, cuts, lighting changes, audio rhythm, or spatial relationships>; do not adopt its blockout appearance, materials, or scene.
<Blockout Subject A> in @Video1 corresponds to <Subject A>.
<Blockout Subject B or geometric prop> in @Video1 corresponds to <Subject B or a key prop>.
@Image1 defines <Subject A>'s <appearance, clothing, or structure>.
@Image2 defines <the specified attributes> of <Subject B, a key prop, or the scene>.

<The subject> completes <the primary action or event> in <the scene>.
Preserve <the action paths, blocking, camera movement, cuts, lighting, or audio rhythm> from @Video1.
The final visuals use <the characters, scene, materials, and visual style>. The audio includes <dialogue, ambience, or action sound effects>.
```

#### Fine Blockout

```text
@Video1 is a fine-blockout reference. Preserve <subject structure, actions, spatial layout, camera position, camera movement, and cuts>; do not adopt its original gray-blockout materials, blank background, or production markers.
@Image1 defines <the character appearance, material, color, or surface details> of <the subject>.
@Image2 defines <the space, materials, lighting, or visual style> of <the scene>.

Rerender <the subject> in @Video1 as <the final subject>, and rerender the scene as <the final scene>.
Preserve <the structure, actions, camera work, and spatial relationships> from @Video1. The visuals present <materials, colors, and style>. The audio includes <ambience, sound effects, or music>.
```

## Emotion, Cinematography, and Sound

### Emotion and Observable Performance

When only a direction such as tense, warm, or oppressive is given, allow the model to determine the specific performance. When the user needs control over the acting, use:

```text
emotional or atmospheric direction + triggering event + the character's observable performance + observable changes in camera work, lighting, or sound
```

Choose a small number of the clearest cues from the eyes, brows, mouth, breathing, gaze, hand movements, and body posture. Do not pile on every possible microexpression. Divide the performance into stages by triggering event only when the emotion changes multiple times.

```text
The overall emotion shifts from <starting emotion> to <ending emotion>.
After <triggering event>, <the subject> first shows <an immediate observable reaction>.
Then, <the eyes, brows, mouth, breathing, gaze, or hand movements> gradually <change>.
Finally, <the subject> expresses <the target emotion> through <an outwardly observable performance>.
```

Completed example:

```text
The overall emotion shifts from restrained anticipation to trying to stay composed after disappointment.
After seeing the waiter place a returned letter on the table, the woman's fingers tracing the rim of her cup suddenly stop, and her gaze falls on the return mark on the envelope.
Her brows tighten slightly, her faint smile gradually disappears, and after a slow breath in, she turns the envelope face down on the table.
Finally, she looks up at the empty chair across from her, keeps her shoulders straight, and says in a calm but slightly strained voice: {I understand.}
```

### Professional Cinematography

Basic shot language and popular camera movements can be written directly into the Prompt. When the frame contains multiple subjects, still specify which subject the camera centers on, where the move begins, and where it ends. Do not use only a term detached from its subject.

```text
popular camera movement + target subject + starting position or state + direction of movement + arrival position or state
```

Popular camera movements include a continuous one-take shot, dolly zoom, aerial perspective, FPV, bullet time, handheld camera work, and rebound speed ramping. For a continuous one-take shot, specify the sequence of subjects, spaces, and events the camera passes through. For handheld camera work, specify the tracked subject and the degree of shake. For rebound speed ramping, specify the action beat at which the movement accelerates, decelerates, or rebounds, as well as the final hold state.

For highly specialized cinematography terms, terms whose industry meanings are inconsistent, or terms that require precise control over visual changes, retain the term and expand it into observable results:

```text
cinematography term + target subject + visual change + foreground/background relationship + direction or speed
```

For example, shallow depth of field should specify that the subject remains sharp and how the background blurs. A tracking shot should specify that the camera matches the subject's speed and the direction of the background motion blur. A rack focus should specify which object the focus moves from and which object it moves to, and how each object's sharpness changes. A vignette should specify that the four corners gradually darken while the center retains normal brightness. Focal-length, aperture, and shutter values may only supplement these instructions; they cannot replace the final visible result.

### Sound, Dialogue, and Text

Use the following when content types need to be distinguished:

| Content | Symbols | Example |
|---|---|---|
| Music | `()` | `(Soft piano music plays in the background)` |
| Sound effect | `<>` | `<A bell rings in the distance>` |
| Dialogue | `{}` | `{Hello, welcome back}` |
| Subtitle | `【】` | `【Chapter 1: Departure】` |

For dialogue language, use: `language + optional regional variety or accent + delivery + speaker + {dialogue}`. Label each speaker separately; do not make a single blanket declaration at the beginning. If English dialogue is likely to be spoken in Chinese, explicitly write at least "Use English." When the user explicitly specifies a regional variety or accent, or explicitly asks for stronger reinforcement, use a complete instruction such as "natural, conversational American English" or "authentic Los Angeles English." If the user provides only English dialogue, do not add an American, British, or regional accent without instruction. If the user does not specify the dialogue language, do not infer Mandarin, a dialect, or a regional accent from the writing system. When subtitles are unnecessary, also state that no subtitles appear on screen.

For multi-speaker dialogue, bind the speaker and audio at each stage, and state that the other characters keep their mouths naturally closed while listening. Identify the sources of ambience, sound effects, and music separately so unrelated audio is not mistaken for background music.

If the final Prompt uses `<>` to mark sound effects, do not also enclose subject names in angle brackets. Use ordinary character names so the same symbols do not serve two roles.

For tasks without dialogue, constrain speech, lip movement, sound sources, and visible text carriers at the same time. For example, characters keep their mouths naturally closed, there is no narration, only the specified ambience remains, and no subtitles or signs appear on screen.

### Products and Physical Processes

Convert abstract selling points such as efficient, intelligent, or reliable into "initial state -> specific operation -> observable result." Show only one operation or functional result in each stage, and continuously preserve product appearance, component positions, the operator, and scene relationships.

```text
Stage 1: At the start, <the initial state of the product and its components>; <the operator completes one specific operation>; at the end, <a directly visible state>.
Stage 2: Continue from <the previous stage's state>; <the product performs one function>; at the end, <a directly visible result>.
Stage 3: <The operator completes the concluding operation>; at the end, <the final state of the product, its components, and the finished output>.
```

Completed example:

```text
Stage 1: At the start, the desktop humidifier is off, its water tank is empty, and the top cover is placed to the right of the unit. The operator removes the water tank and fills it with clean water. At the end, the water level is below the maximum fill line.
Stage 2: The operator reinstalls the water tank, closes the top cover, and presses the power button once. At the end, the operator's hand has moved away from the button, and the humidifier remains in a fixed position.
Stage 3: A continuous stream of fine white mist emerges from the outlet and rises vertically, with no water accumulating on the desktop. At the end, the unit, water tank, and top cover remain visually intact.
```

Do not write only "show the complete process of installing, operating, and completing the product workflow." Exact on-screen text, formulas, and product parameters remain subject to the capability boundaries in the Output Contract.

