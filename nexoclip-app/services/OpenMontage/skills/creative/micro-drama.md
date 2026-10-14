# Micro-Drama — Idea, Script and Shot Guide

> Sources: patterns of vertical short-drama apps (ReelShort, DramaBox, ShortMax), TikTok/Reels series formats,
> Seedance 2.5 prompt categories 1 (dramatic exterior) and 6 (multi-character, consistent faces), ByteDance's
> Seedance 2.5 prompt optimizer (sd25-pe), OpenMontage `short-form.md`.

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

Multi-character drama is the hardest category for consistency. Write it in the syntax of ByteDance's own optimizer
(seedance-official-generation):

- Every character is an element with a reference sheet; mention them with @id in every prompt.
- Say exactly who is in frame ("exactly two people: @nadia and @arga").
- Place people relative to stable objects (the glass table, the door), and keep it across a dialogue scene.
- Dialogue: `@name's line (emotion), language: {words}`, one line per emotion; the listener keeps their mouth closed.
- Wardrobe and props by state: if a glass shatters or a dress gets wet, it stays so in later shots.

```
Style: glossy vertical TV drama, soft high-key interior light, subtle teal-orange grade. No subtitles.
Camera: medium close-up over @arga's shoulder onto @nadia in @mansion_living_room; exactly two people. @nadia stands
  behind the glass table facing the camera, @arga in front of it with his back to the camera.
Action: @nadia slowly pulls off the engagement ring and puts it on the glass table without looking down.
  At the end: the ring lies alone on the table, @nadia's hands at her sides.
Light: warm lamp from her right on her face, cooler fill from the window behind.
Sound: @nadia's line (quiet, steady, a slight tremble at the end), Indonesian: {Simpan saja. Aku sudah tahu semuanya.}
  @arga keeps his mouth closed. <the small click of the ring on glass>, quiet room tone. No music.
```

## Common Pitfalls

- Spending the first 10 seconds on scenery. Open on conflict.
- Too many characters in one shot: faces drift. Keep two per frame when possible.
- Changing how a character speaks (accent, delivery) between shots.
- Ending on a resolved moment instead of a question.
