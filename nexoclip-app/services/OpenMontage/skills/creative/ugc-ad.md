# UGC Ad — Idea, Script and Shot Guide

> Sources: TikTok Creative Center "Top Ads" patterns, Meta creative best practices for Reels ads, Seedance 2.5
> prompt category 8 ("UGC-style ad · natural movement, no production feel", `.agents/skills/seedance-2-5/reference/techniques.md`),
> OpenMontage `short-form.md`. Written for generated (not filmed) UGC.

## When To Use

The brief asks for content that should look like a real person filmed it on a phone: a creator review, testimonial,
"get ready with me", unboxing, problem→solution demo, day-in-my-life with the product, street interview, reaction.
The goal is trust and sales, not cinema. If the user wants polish, lighting and camera moves, this is a product ad
(use the cinematic guides) instead.

## Quick Reference Card

```
FORMAT:      9:16, 15-45 s, 4-8 shots of 3-8 s, one creator, one location (two at most)
CAMERA:      phone: selfie (front cam, arm's length) or a friend filming; handheld micro-shake, no gimbal,
             no dolly, no crane, no rack focus, no lens flares
LIGHT:       what the place already has: window light, bathroom light, car interior, cafe — slightly uneven
PERFORMANCE: understated; natural blinks, half-beat late reactions, glance away and back, small smile that grows
SOUND:       the creator talks in the clip (native audio on); room tone; no music bed under speech, or very low
HOOK:        the first 1.5 s decides; open on the creator mid-thought or on the product result, never on a logo
CTA:         spoken by the creator + a short caption on the last shot
```

## Structure (pick one)

| Pattern | Beats |
|---|---|
| Problem → solution | 1 hook: the annoyance ("Kulitku kusam banget tiap pagi…") · 2 failed fixes · 3 discovers product · 4 using it (close-up) · 5 result, honest reaction · 6 CTA |
| Review / unboxing | 1 hook: holding the package, a strong opinion · 2 opening it · 3 first touch/smell/taste · 4 detail close-up · 5 verdict with one con · 6 CTA |
| Before / after | 1 "before" state · 2 the moment of using it · 3 "after", same framing as 1 · 4 creator talks to camera · 5 CTA |
| Day in my life | 3-5 quick moments in the creator's routine, product appears naturally in two of them, voice talks over |
| Street interview | asker off-camera holds the phone, stranger reacts to trying the product, quick cuts |

Hook lines that work: a confession ("Aku telat tahu ini…"), a result first ("Ini kulitku setelah 7 hari"), a
contrarian claim, a question to the viewer, or the product doing something visible in the first second.

## Writing The Script

- Write it as speech, in the language and slang of the audience (Indonesian Gen Z: casual, "aku/kamu", light
  code-mixing). Short sentences. No ad words ("revolusioner", "terbaik di kelasnya").
- One claim per shot. Say the product name at most twice. Mention a small con or honest detail: it reads as real.
- Budget: about 2.5 spoken words per second; a 5 s shot holds ~12 words.
- Put the dialogue of each shot in the shot's video prompt in quotes (Seedance speaks it). Do not also put the same
  words in a separate voiceover: either the creator speaks in the clip, or a voiceover tells it over silent action.

## Characters, Locations, Props

- One creator element: an ordinary-looking person matching the target audience (age, style, skin, hair), casual
  clothes, light or no visible makeup. Avoid model-perfect faces.
- The product as its own prop element with exact packaging (colour, logo, shape); upload or describe it precisely.
- Locations look lived-in: a real bedroom, bathroom mirror, kos room, car, office desk, warung, commuter line.

## Prompting Each Shot (Seedance 2.5)

Follow the Seedance 2.5 section order, compressed for one shot. Keep the same STYLE and CAMERA lines in every shot.

```
STYLE: authentic smartphone UGC, vertical 9:16, no cinematic grading, natural phone exposure and slight noise,
  no music. Not an ad, not a commercial shoot.
SHOT: medium close-up selfie, front camera at arm's length, slight handheld shake, @creator in @bedroom.
ACTION: @creator holds @product next to her face, glances at it, then back to the lens, half smile.
DIALOGUE: @creator says, casually and a bit fast: "Oke jujur, aku skeptis banget sama ini awalnya."
VOICE: young Jakarta woman, relaxed, slightly nasal, quick tempo, natural pauses (paste this sentence unchanged
  in every shot she speaks)
LIGHT: soft window light from the left, warm, a little uneven.
AUDIO: her voice close to the phone mic, quiet room tone, no music, no other voices.
```

Locks that matter for UGC (from the Seedance 2.5 guide): keep the framing type fixed for the whole video
(selfie stays selfie), fix the creator's position in the room, state monotonicity for anything consumed or applied
(the cream level only drops, the drink only empties), background people do their own thing and never look at the
lens, "exactly one creator". Product shots: the product label always faces the camera, sharp, correct colours.

## Common Pitfalls

- Cinematic camera language (dolly, crane, golden-hour rim light, shallow anamorphic) kills the UGC feel.
- A perfect, glamorous creator reads as an ad. Imperfection is the performance.
- Too many locations or outfits. UGC is one sitting.
- Music over speech, or a voiceover on top of a talking creator.
- Hook that starts with the brand logo or "Halo guys, balik lagi di channel aku".
