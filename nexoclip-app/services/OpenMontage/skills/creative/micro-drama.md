# Micro-Drama — Idea, Script and Shot Guide

> Sources: patterns of vertical short-drama apps (ReelShort, DramaBox, ShortMax), TikTok/Reels series formats,
> Seedance 2.5 prompt categories 1 (dramatic exterior) and 6 (multi-character, consistent faces), the Seedance 2.5
> "Locks" and "Voice" sections (`.agents/skills/seedance-2-5/SKILL.md`), OpenMontage `short-form.md`.

## When To Use

Short, vertical, episodic drama: romance, revenge, family conflict, office drama, campus love, CEO/heir tropes,
horror or mystery cliffhangers. Each episode is 30-90 s and must make the viewer want the next one. For a single
self-contained short film or a trailer, use the cinematic guides instead.

## Quick Reference Card

```
FORMAT:     9:16, 30-90 s per episode, 8-16 shots of 3-6 s, 2-4 characters, 1-3 locations
HOOK:       conflict in the first 2 s (a slap, a reveal, a line that hurts, a ring thrown away)
SHAPE:      hook → escalation → turn → cliffhanger. No slow setup, no establishing landscapes.
CAMERA:     close-ups and medium close-ups on faces, over-the-shoulder for dialogue, reaction shots;
            steady, slightly glossy TV look; occasional slow push-in on the big line
DIALOGUE:   in the clip, short lines, one emotion per line; reaction shots carry as much as lines
SOUND:      native dialogue + room tone; tension sting or soft score only between lines
END:        cut on the cliffhanger, on a face, mid-reaction; caption "Bersambung…" optional
```

## Story Rules

- Characters are archetypes the viewer reads in one second (the humiliated heroine, the cold heir, the scheming
  stepsister, the loyal friend). Give each one visual signature (wardrobe colour, accessory) that never changes.
- Every episode answers one small question and opens a bigger one. The cliffhanger is a reveal, a threat, an
  arrival, or a choice, landing in the last 2 seconds.
- Escalate by status: who has power over whom flips at the turn.
- Dialogue is short and quotable. Subtext through faces: write the reaction you want ("her jaw tightens, eyes
  wet but she does not look away").
- In Indonesian, natural spoken register; "gue/lo" or "aku/kamu" consistent per character.

## Shot Planning

| Beat | Typical shots |
|---|---|
| Hook (0-3 s) | extreme close-up of the act or the line; reaction close-up |
| Escalation | over-the-shoulder dialogue pairs, inserts of the object that matters (letter, phone screen, ring) |
| Turn | slow push-in on the character who takes power; wider shot to show who else saw it |
| Cliffhanger | close-up of the shocked face or of the new arrival; hard cut to black |

One action per shot. 3-6 s per shot keeps the rhythm; dialogue lines decide the length.

## Prompting Each Shot (Seedance 2.5)

Multi-character drama is the hardest category for consistency. Use every lock:

- Every character is an element with a reference sheet; mention them with @id in every prompt.
- `COUNT LOCK`: state exactly who is in frame ("exactly two people: @nadia and @arga, no one else visible").
- `SCREEN DIRECTION`: keep who stands screen-left / screen-right fixed across a dialogue scene.
- `VOICE`: one conditioning sentence per character (accent, pitch, tempo, manner), pasted unchanged every time
  that character speaks.
- Wardrobe and props by state: if a glass shatters or a dress gets wet, it stays so in later shots.

```
STYLE: glossy vertical TV drama, 9:16, soft high-key interior light, subtle teal-orange grade, no music.
SHOT: medium close-up over @arga's shoulder onto @nadia, in @mansion_living_room. Exactly two people visible.
  @nadia screen-right, @arga screen-left with his back to camera.
ACTION: @nadia slowly pulls off the engagement ring and puts it on the glass table; she does not look down.
DIALOGUE: @nadia, quiet and steady: "Simpan saja. Aku sudah tahu semuanya."
VOICE (@nadia): young woman, low and controlled, slight tremble at the end of sentences, slow tempo.
LIGHT: warm lamp from screen-right on her face, cooler fill from the window behind.
AUDIO: her voice, the small click of the ring on glass, quiet room tone. No music, no other voices.
```

## Common Pitfalls

- Spending the first 10 seconds on scenery. Open on conflict.
- Too many characters in one shot: faces drift. Keep two per frame when possible.
- Changing a character's voice description between shots.
- Ending on a resolved moment instead of a question.
