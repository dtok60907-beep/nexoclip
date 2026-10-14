# Seedance 2.5 Prompt Optimizer (ByteDance sd25-pe 0.1.1) — part 3/3: editing, extension, output

> Official BytePlus/ByteDance skill, split into parts for the Director (full original: SKILL.md). Part 1 has the principles and workflow; part 2 the generation templates.

## Video Editing Template

An editing task must define one source video as the sole editing master. It cannot merely describe the target visuals and thereby turn into a regeneration task.

For visual edits, first inventory every category of visible subject in the source video, including user-named and unnamed characters, real people, models, animals, props, foreground objects, and background subjects. Explicitly specify whether each category is to be replaced, removed, or kept unchanged. Do not overlook real people, models, props, or background subjects that the user did not name. Objects the user has not requested to modify remain unchanged by default. Include an entire group in the removal or replacement scope only when the user explicitly requests replacing the whole group or asks that the target video retain only specified objects.

If the current Agent cannot view the entire source video or has access only to sparse previews, it must not claim to have exhaustively inventoried every object. After explicitly stating all user-specified replacements, removals, and preserved objects, add this fallback sentence: `Except for the objects explicitly modified above, all other visible characters, props, and background elements in @Video1 remain unchanged and are not to be replaced or removed.` If the user explicitly requests that the target video retain only specified objects, replace this fallback with an instruction to remove all remaining objects as requested.

Every video-editing Prompt must include one of the following two scope-closure statements. The scope closure must not be omitted:

- Local modification: `Except for the objects explicitly modified above, all other visible characters, props, and background elements in @Video1 remain unchanged and are not to be replaced or removed.`
- The user explicitly requests retaining only the target objects: `Except for the objects explicitly retained above, remove all other visible subjects from @Video1; do not add any unspecified objects.`

The source-video subject inventory determines only which objects are replaced, removed, or preserved; it must not be used to change the target asset set already specified by the user. If the user has explicitly assigned @Image3 to an edit object, do not add an unnamed image as an appearance, clothing, group, or auxiliary reference for that object, even if the other image is clearer or contains similar content. Continue to list those assets in `【Unused Assets】`.

```text
【Editing Goal】
Edit @Video1, changing only <original object or region> to <target content>.

【Role of the Source Video】
@Video1 is the sole editing master and governs the original scene, camera position, camera movement, action trajectories, occlusion relationships, and event order.

【Role of the Target Material】
@Image1 is used for the <appearance, structure, or material> of <the target subject, background, or product>; do not use <irrelevant background, characters, or composition>.

【Edit Objects and Scope】
Modify only <explicit objects and regions>. The number of target objects throughout the video is <count>. Do not modify <content that must be preserved>.
Except for the objects explicitly modified above, all other visible characters, props, and background elements in @Video1 remain unchanged and are not to be replaced or removed.

【Timeline Inheritance】
<Target object> inherits the timing, duration, path, and speed changes of every appearance, movement, occlusion, and exit of <original object>.
All other character actions, camera movement, shot changes, and event order remain as in @Video1.
```

When replacing a subject, specify the original and target subjects. When replacing a background, make clear that only the background outside the subject's outline changes. For a local edit, specify the region, attribute, and content to preserve. When adding or removing an object, state its quantity, position, appearance timing, and affected scope.

Completed example of dynamic-subject replacement:

```text
【Editing Goal】
Edit @Video1, replacing only the red bicycle and its rider passing in front of the bench with the dark-gray electric patrol vehicle from @Image1.

【Role of the Source Video】
@Video1 is the sole editing master and governs the park road, the two people on the bench, the camera position, camera movement, the original rider's motion slot, occlusion relationships, and event order.

【Role of the Target Material】
@Image1 is used only for the body structure, color, and transparent windshield of the dark-gray electric patrol vehicle; do not use the image background or driver.

【Edit Objects and Scope】
Remove the red bicycle and its rider from the source video. There must be exactly one electric patrol vehicle throughout the video. The two people on the bench, the trees, the road, and the background remain as in @Video1.

【Timeline Inheritance】
The electric patrol vehicle fills the original rider's motion slot with exactly the same appearance timing, movement path, speed, and occlusion positions. The red bicycle and rider must no longer appear in the final video. All other character actions, camera movement, shot changes, and event order remain as in @Video1.
```

For cross-category dynamic-subject replacement, prefer "motion-slot replacement": explicitly remove the original subject, have the target subject inherit the original subject's exact appearance timing, movement path, speed, and occlusion positions, and state that the original subject no longer appears in the final video. The preservation list should include only areas adjacent to the target that genuinely cannot change. Avoid diluting the editing goal with an overly long list.

```text
Remove <original moving subject> that passes in front of <foreground subject> in @Video1, and replace it with <target moving subject> defined by @Image1 at exactly the same appearance timing, movement path, speed, and occlusion positions. <Original moving subject> must no longer appear in the final video.
```

Use the global master-inheritance requirement by default. Add a small number of observable event conditions only when grabs, handoffs, placements, or entrances and exits in the source video can be observed accurately:

```text
Only after <observable completion state of Event A> occurs may <Event B> begin.
Only after <observable completion state of Event B> occurs may <Event C> begin.
```

Do not rewrite the source video into time segments from memory, and do not invent event conditions from incomplete frame samples. A Prompt can increase the probability that key events follow the original timeline, but it cannot guarantee frame-by-frame alignment after editing.

### Audio Editing

When modifying only dialogue, language, voice timbre, background music, ambience, or action sound effects, still define the source video as the sole editing master. Specify separately the speaker or sound category to modify, the target change, the time range, and whether all other audio and all visuals remain unchanged. Do not redesign character actions, lip-sync timing, shots, or editing rhythm because of an audio edit.

```text
【Editing Goal】
Edit @Video1, applying <removal, replacement, or adjustment> only to <speaker or sound category> in <the entire video or an explicit time segment>.

【Role of the Source Video】
@Video1 is the sole editing master and governs the original visuals, character actions, lip-sync timing, shots, editing rhythm, all other audio, and event order.

【Role of the Target Audio】
@Audio1 is used for the <voice timbre, dialogue, ambience, sound effects, or music> of <target speaker or sound category>; do not use <irrelevant audio>.

【Audio Edit Scope】
Modify only <explicit speaker, sound category, or time segment>.

【Content to Preserve】
Keep <all other dialogue, lip-sync timing, ambience, action sound effects, visuals, shots, and editing rhythm> from @Video1 unchanged.
```

When the user asks only to remove the original background music, do not fabricate a target audio material. State directly that the background music is to be removed while character dialogue, lip-sync, ambience, action sound effects, and all visuals are preserved. When changing the dialogue language or voice timbre, preserve the dialogue content and speaking times from the source video by default unless the user explicitly requests rewriting them as well.

## Video Extension Template

If the user says only "extend" and the direction cannot be determined from context, the direction is high-impact information and must be included in a single consolidated clarification request.

In an extension Prompt, use the user's confirmed name for the subject at the boundary. When the user writes only "person" or "subject," retain that neutral term. Do not infer a profession, performance type, or narrative identity from the subject's actions, posture, or clothing in the source video.

Throughout the extension, the same subject must remain one continuous instance; it must not be duplicated, split, or replaced with a second identical subject. Keep the body structure, number of parts, and topological relationships consistent with the boundary frame. When the subject turns around, becomes occluded, exits the frame, or re-enters, it is still the same continuous object and must not be replaced by a new instance.

The final Prompt must state the single-instance and topology requirements above explicitly; they must not be checked only during internal analysis and then omitted.

### Forward Extension (After the Original Video)

A forward extension continues generation after the source video ends. The first frame of the new segment continues from the source video's final frame.

```text
@Video1 is the source video to extend forward.

Extend @Video1 forward. The first frame of the extended segment directly continues from the final frame of @Video1: maintain continuity in <subject posture and orientation>, <prop positions>, <background and spatial relationships>, <camera position and composition>, <lighting>, <audio state>, and <motion trajectory>.

Then, <new action, event, shot, or sound to add in the extension>.

Throughout the extension, maintain continuity in <character identity and clothing>, <key props>, <background layout>, <camera axis>, and <the original audio environment>.
The same subject must remain the same continuous object throughout, without duplication or splitting; the character's appearance or the number of an object's parts must remain stable.
```

Completed example with additional assets:

```text
@Video1 is the source video to extend forward.
@Image1 is used for the Gardener's facial features, short hair, and light-green work apron; do not use the image background.
@Image2 is used for the structure and material of the woven flower basket; do not use the garden or people from the image.

Extend @Video1 forward. The first frame of the extended segment directly continues from the final frame of @Video1: maintain continuity in the greenhouse workbench, the Gardener's position and orientation, the wooden rack's position, the fixed medium-shot camera position, and the afternoon side lighting. The other reference assets must not replace this boundary frame.

Then, the Gardener picks up the woven flower basket defined by @Image2 from beneath the workbench and places it with both hands on the middle shelf of the wooden rack behind him. At the end, the basket is only on the middle shelf, and the Gardener has released both hands and stepped back half a step.

Throughout the extension, maintain continuity in the Gardener's face and apron, the greenhouse layout, the wooden rack's position, the camera direction, and the greenhouse ambience.
The Gardener and the basket must each remain the same continuous object throughout, without duplication or splitting; the Gardener's body structure and the basket's number of parts must remain stable.
```

### Backward Extension (Before the Original Video)

A backward extension generates content before the source video begins. The final frame of the new segment connects to the source video's first frame.

First describe what happens before the source video begins, and then define the source video's first frame as the explicit end state of the extended segment. Writing only "then connect to the source video" may cause the model to introduce characters, props, or effects from later in the video too early, or to change the image again after reaching the target state.

```text
@Video1 is the source video to extend backward.

Extend @Video1 backward. Before the source video begins, <preceding action, event, shot, or sound>.

The final frame of the extended segment connects naturally to the first frame of @Video1: keep <subject posture and orientation>, <prop positions>, <background and spatial relationships>, <camera position and composition>, <lighting>, <audio state>, and <motion trajectory> consistent.

Throughout the extension, maintain continuity in <character identity and clothing>, <key props>, <background layout>, <camera axis>, and <the original audio environment>.
The same subject must remain the same continuous object throughout, without duplication or splitting; the character's appearance or the number of an object's parts must remain stable.
Characters, props, or effects that belong only to later parts of the source video must not appear early.
```

When additional reference assets are provided, first state each asset's role for characters, clothing, props, or sound, and then state that the source video controls the extension boundary. New assets must not override the source video's control of the boundary image at its final or first frame.

An extension creates only a new segment beyond the boundary; do not edit the source video at the same time. The boundary goal is natural continuity in visuals and sound, not guaranteed pixel-level identity. The volume of the extended segment may differ slightly from that of the source video.

## Output Contract

Match the user's output language. Retain the user's existing asset-reference syntax, such as `@Image1`, `@Image 1`, or an equivalent label in the runtime environment. Do not translate or renumber any reference the user has explicitly established.

### Default Delivery

By default, output only the optimized Prompt body. Do not add Markdown headings, code fences, prefaces, or closing explanations, and do not add outer wrappers such as "Optimized Prompt," "Asset Understanding," or "Optimization Notes." Do not instruct the model to wrap the final result in a code fence.

When the Prompt itself needs structure, it may retain task-internal labels such as `【Generation Goal】`, `【Reference Asset Roles】`, `【Event Script】`, and `【Maintain Consistency】`. These labels are part of the directly submittable Prompt body, not response wrappers.

When the Agent infers asset mappings automatically, do not output a separate reasoning table. Write the final mappings directly into the Prompt's reference-asset-roles section, specifying the adopted scope of every asset actually used. When the Agent can access the complete asset inventory, it must append `【Unused Assets】` inside the Prompt and individually list the reference number of every actually available asset that was not assigned a role; do not describe them only outside the Prompt. When the complete asset inventory is unavailable in the current environment, do not fabricate unused reference numbers.

### Asset Reference Fidelity

When the user's original Prompt already contains explicit asset references, retain the same reference syntax and numbers in the final Prompt, regardless of whether the current Agent can access the corresponding assets. Do not delete or renumber a reference, translate its label, or convert the task into reference-free generation merely because the asset is not attached to the current message, is corrupted, or cannot be accessed.

Inaccessible assets limit only the facts the Agent can confirm and add. They do not alter the asset roles or reference relationships the user has already established, and they do not trigger any missing-asset explanation or supplementary advice outside the Prompt.

### Input and Parameter Notices

When the input assets exceed a hard limit, first output a complete Prompt based on the selected assets, then append one `Asset Note:` listing the asset types or reference numbers that must be reduced before submission. Recommended ranges are not hard limits and do not trigger an asset note.

When the user requests parameters that are automatically locked by video editing, first-frame generation, first-and-last-frame generation, or video extension, or when the first and last frames have mismatched aspect ratios, first output the complete Prompt, then append one `Parameter Note:`. The parameter note states only the conflicting rule and the action required before submission. It does not repeat the Prompt, expand into API documentation, or write the parameters back into the Prompt.

Example: `Parameter Note: Video editing automatically preserves the input video's aspect ratio and basic duration, so these cannot be set separately to 16:9 and 20 seconds. The Prompt above has been written to follow the original video's timeline.`

### Required Capability Boundaries

Exact subtitles, formulas, signs, product parameters, or frame-level timestamps cannot be fully guaranteed by the Prompt alone. Still output the best possible Prompt first. When genuinely necessary, append at most one line beginning with `Additional Note:` after the Prompt, stating that prepared assets or post-production are required. When unnecessary, output no note.

For a hybrid task containing two sequential operations, output separate, submittable Prompts labeled `Step 1:` and `Step 2:`, and state that Step 2 uses the output from Step 1 as its new master. Otherwise, output only one Prompt by default.

In an ordinary generation task, a user-provided duration, aspect ratio, or other generation parameter may guide event density and composition, but must not be written into the Prompt. For video editing, first-frame generation, first-and-last-frame generation, or video extension, apply the task's automatically locked rules first and do not use conflicting parameters to plan the Prompt. List configurable parameters outside the Prompt only when the user asks for an invocation example.

### Complete Input-to-Output Example

User input: `Have the barista from the reference image perform a pour-over in the reference cafe, following the actions in the uploaded video, and finally hand the coffee to the customer.`

After reviewing the three assets, the Agent directly outputs the following Prompt body:

【Generation Goal】
Generate a continuous video of the barista completing a pour-over and handing the coffee to the customer.

【Reference Asset Roles】
Use @Image1 for the barista's facial features, short hair, and brown apron; do not adopt the image's background.
Use @Image2 for the cafe's wooden counter, glass windows, and warm afternoon light; do not adopt the people in the image.
Use @Video1 for the pouring rhythm and wrist movements during the pour-over; do not adopt the identities, clothing, or scene from the video.

【Event Script】
At the start, the barista stands on the inner side of the counter, the customer stands on the outer side, and the dripper and serving carafe are between them. Following the action rhythm in @Video1, the barista slowly pours the water. After finishing the pour, the barista returns the dripper to its holder, then uses both hands to hand the only cup of coffee to the customer. At the end, the coffee is held only by the customer, and both of the barista's hands have moved away from the cup.

【Maintain Consistency】
Maintain the barista's identity and apron, the cafe layout, the positions on the inner and outer sides of the counter, and the number of coffee cups.

## Final Checklist

Before output, confirm each item:

- A single Prompt has exactly one primary task: generation, editing, or extension. An explicit hybrid task has been split into two sequential Prompts, each with exactly one primary task.
- The subjects, counts, identities, scene, prop ownership, spatial relationships, and story outcome have not changed.
- Every required character, prop, and scene in the story contract is covered. Two named characters have not been merged, and inferences from assets have not been written as facts about identity, age, relationships, or plot.
- Every asset actually used has one unique and explicit role.
- Asset references already present in the user's original Prompt remain exactly unchanged. None have been deleted, renumbered, translated, or converted into reference-free generation because the assets were not attached or could not be accessed; no asset reference absent from the user's input has been invented.
- When assets are missing, corrupted, or inaccessible, the Agent has not claimed to have reviewed them and has not added appearance, voice, action, or scene details that could be confirmed only by reviewing those assets.
- Irrelevant assets have not been forced into the output. When the complete asset inventory is available, every actually available asset that was not assigned a role is listed individually under `【Unused Assets】`.
- Inaccessible assets have not been treated as understood.
- Different characters, products, and props are mapped individually, not replaced by a range statement.
- A single-character design image has not been used to define two on-screen characters. When multiple individual or group candidates exist, they have first been assigned as one image per person and one image per group.
- Each stage of a long video has only one primary state change and a clear ending state.
- Event time ranges explicitly requested by the user have not been removed without authorization. When only an external target duration exists, the existing events have been redistributed using stages without numeric timestamps, and the parameter has not been written back as new time ranges.
- An editing task includes a sole master, edit scope, target count, content to preserve, and timeline inheritance. Audio editing also specifies the audio to change, audio to preserve, lip-sync timing, and all visuals.
- The current task's automatically locked aspect-ratio and duration rules have been followed. When a conflict exists, only one parameter note is output outside the Prompt.
- The extension direction and boundary-frame role are correct, and the original video is not rewritten at the same time. The boundary visuals, audio state, movement trend, and continuing subjects are all covered.
- The first frame, last frame, and other reference images are defined individually without overwriting one another's roles. A fixed frame uses the standalone exact role statement `Use @ImageN as the first frame.` or `Use @ImageN as the last frame.` and does not weaken it to a composition reference. The aspect ratios of the first and last frames have been checked or handled under the inaccessible-media boundary.
- Multiple keyframes define key states image by image and in order, without promising frame-by-frame replication or a static hold.
- A storyboard grid specifies the reading order, each panel's shot role, and any sketch, annotation, or placeholder content not to adopt.
- A blockout has been identified as coarse or fine, with subject mapping, inherited information, and excluded content specified accordingly.
- Abstract emotion and cinematography terms have observable results when control is needed.
- At every speaking stage, the speaker, speaking state, dialogue, audio role, language, and on-screen or off-screen position match the input. Speech has not been changed to silence, and Mandarin, a dialect, or a regional accent has not been added without instruction.
- Shot numbers, asset reference numbers, chapter numbers, and step numbers remain identifiers; they have not been misinterpreted as camera angles or other cinematography parameters.
- The Prompt contains no output parameters, internal analysis, evaluation metadata, keys, Endpoints, or reasons for modifications.
- Exactly one `Please note that this is not video editing.` is included only when the compatibility gate is triggered for reference-based generation. It is not added automatically for actual video editing, video extension, first-frame generation, first-and-last-frame generation, or ordinary generation without a specification conflict.
- When reference-video specifications cannot be accessed, the compatibility decision follows the explicit aspect-ratio or duration intent in the original Prompt. Existing video references remain intact, and the Agent does not claim to have read or checked the reference-video specifications.
- No negative constraint unrelated to the user's request has been added automatically.
- All placeholders have been replaced. By default, the output contains one complete Prompt body only, without Markdown headings, code fences, or surrounding explanations.

## Compatibility And Runtime Notes

- **Text-only Agent**: Handles text and explicit reference labels; it must not claim to have viewed attachments or the contents of file paths.
- **Multimodal Agent**: Reads images, videos, and audio within the permissions available at runtime, then performs two-pass asset understanding and automatic mapping.
- **No filesystem access**: Retain the user's existing labels; for inaccessible paths, apply the `Current Agent Cannot Read the Assets` fallback without claiming to have inspected them.
- **No network access**: Do not attempt to inspect the content of remote URLs or infer asset content from URL names.
- **Output only**: This Skill outputs text and does not require file writes, network access, tool calls, or binary-output capabilities.
