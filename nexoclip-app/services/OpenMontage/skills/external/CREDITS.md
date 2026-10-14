# Third-party skills used by the AI Director

These guides are copied unchanged from their authors' repositories and read by the Director's agent as craft
references. Each folder keeps its original license file.

## visual-skills/ — CC BY 4.0

Serge Shima — [github.com/smixs/visual-skills](https://github.com/smixs/visual-skills)

Files: `video/SKILL.md`, `video/references/{dramaturgy, universal-rules, seedance, seedance-25, patterns-and-genres, role-modes,
fixes-and-skeletons, camera-lighting-vocabulary}.md`. License: `visual-skills/LICENSE`, attribution notice:
`visual-skills/NOTICE`.

## shortfilm-prompts/ — MIT

jnMetaCode — [github.com/jnMetaCode/ai-shortfilm-prompts](https://github.com/jnMetaCode/ai-shortfilm-prompts)

Files: `templates/*.md` (genre worked examples, camera and atmosphere libraries). License:
`shortfilm-prompts/LICENSE`; the authors' own credits: `shortfilm-prompts/credits.md`.

## seedance-sd25-pe/ — BytePlus / ByteDance (Seedance team)

The official Seedance 2.5 prompt-optimizer skill `sd25-pe` 0.1.1, published with the BytePlus ModelArk docs
([Seedance 2.5 prompt guide](https://ai.byteplus.com/ark/region:ap-southeast-1/docs/seedance-2-5-prompt-guide)), from
`https://arkdocs-en.tos-ap-southeast-1.volces.com/skills/` (sha256 `c9c765aa…7cba`). No license file is published with it.

Files: `SKILL.md` (the original, unchanged) and `1-workflow.md`, `2-generation.md`, `3-edit-extend-output.md`: the
same text split by section so each part fits one skill read, without the "Self-update before triggering" section
(it runs `npx skills update`, which the Director cannot and should not do).
