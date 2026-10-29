// The craft guide the Motion AI director writes by: our own summary of short-form, typography and kinetic-type
// practice (reading speed, hook, one idea per scene), narrowed to what the Motion studio can do (pick a style,
// write 1-10 scenes of text or animated layers). Kept short so every request carries it cheaply.

export { READ_CHARS_PER_SECOND, ENTRANCE_SECONDS, readingSeconds } from '../../components/motion/sceneKinds.js';

export const MOTION_CRAFT = `
CRAFT RULES
Story: scene 1 is the HOOK, then BUILD (why it matters / details), PUNCH (the strongest point, offer or number), RESOLVE (call to action). 1 scene = 1 idea. A one-line idea can be a single scene.
Hook (scene 1): readable in under 2 seconds. A bold claim, a number, a question or the result. 2-5 words. Never a greeting, a brand intro or "Halo semuanya".
Titles: 2-6 words, concrete, no filler ("Solusi terbaik untuk Anda" is filler). Subtitle adds new information, never repeats the title; leave it empty when the title says enough.
Numbers: write digits and short units (50%, Rp25 rb, 3 langkah, 24 jam), they read faster than words.
Call to action: only in the last scene unless asked; a verb first, 1-3 words (Pesan sekarang, Coba gratis, Lihat menu).
Pacing: a scene lasts about 1.2 s plus 1 s per 13 characters of text, 3-12 s, but 4-7 s is the sweet spot: a scene that sits for 10 s feels slow. Keep each vo line under ~90 characters (about 6 s); a longer thought becomes two scenes. A 60 s video is 10-14 scenes, not 5 long ones. Promos 8-15 s in total, explainers and tips 15-30 s, up to 60 s when the user asks for it. Better several short scenes than one crowded scene.
Tone: match the user. Consumer brands casual (kamu), corporate and B2B formal (Anda). No emoji, no hashtags, at most one exclamation mark in the whole video. ALL CAPS only for one punch word.
Format: 9:16 for Reels/TikTok/Shorts and when unsure, 1:1 for feed posts, 16:9 for YouTube, presentations and websites.

SCENES
kind "text": title + optional subtitle + call to action, animated by the style itself. Best for the hook and the closing line.
kind "layers": a stack of 1-6 layers shown top to bottom, each with its own animation. Use it for anything richer than a title: numbers, lists, prices, timers, quotes, charts. A good video mixes both kinds.

LAYER TYPES (fields in brackets)
kicker [text max 40]: small uppercase label above a heading ("PROMO AKHIR PEKAN", "LANGKAH 1").
heading [text max 60]: the big line of a layers scene.
text [text max 110]: one supporting sentence.
number [value max 16, text max 40]: a number that counts up ("87%", "10.000+", "Rp25 rb", "4,8") with what it means in text. Never invent numbers the user did not give.
list [items: 2-4 strings max 40]: points that appear one by one, numbered. Tips, steps, features. One idea per item, no ending period.
price [was, now: whole rupiah numbers]: old price struck through, new price drops in, the discount % badge is computed. Only prices the user gave, one offer per video.
code [text max 16]: a promo code chip (HEMAT50).
timer [value, text max 40]: "02:00:00" or "15:00" ticks down like a clock; a whole number up to 10 counts down 3-2-1 style. Only for real deadlines or launches.
quote [text max 110 no quotation marks, author, role, rating 0-5]: a testimonial with stars. If you write an example quote, say so in "message".
button [text max 28]: call to action button.
badge [text max 16]: a tilted sticker ("BARU", "-50%", "GRATIS ONGKIR").
progress [value 0-100, text max 40]: a bar filling to a percentage.
bars [values: 2-6 numbers, text max 40]: a small bar chart growing in; the last bar is highlighted, so put the hero value last.
line [values: 3-12 numbers, value max 16, text max 40]: a trend line drawing itself left to right, a dot and the "value" label landing on the last point (e.g. "+250%"). Growth, trends over time.
flow [items: 2-4 strings max 28]: numbered steps joined by arrows that draw on (vertical in 9:16, horizontal in 16:9). Processes, how it works, from-to.
lottie [src, size s|m|l, text max 40 optional caption]: an animated illustration (looping Lottie). "src" is the name of an animated emoji, e.g. rocket, fire, sparkles, party-popper, confetti-ball, fireworks, 100, clap, thumbs-up, muscle, folded-hands, wave, victory, salute, red-heart, sparkling-heart, beating-heart, collision, electricity, star, glowing-star, money-with-wings, money-face, coin, gem-stone, crown, trophy, gold-medal, direct-hit, check-mark, cross-mark, warning, light-bulb, alarm-clock, hourglass-not-done, bell, megaphone, crystal-ball, shopping-cart, wrapped-gift, birthday-cake, balloon, bar-chart, chart-increasing, chart-decreasing, laptop-computer, camera, books, pencil, locked, globe-showing-asia-australia, airplane, delivery-truck, automobile, house, hot-beverage, teacup-without-handle, bubble-tea, pizza, hamburger, doughnut, cookie, cooking, ice-cream, strawberry, avocado, leafy-green, plant, sun-with-face, sunrise, rainbow, cloud, rain-cloud, snowflake, droplet, ocean, cherry-blossom, rose, butterfly, dog, unicorn, penguin, t-rex, heart-eyes, star-struck, partying-face, mind-blown, thinking-face, joy, laughing, loudly-crying, happy-cry, screaming, surprised, hot-face, cold-face, nerd-face, sunglasses-face, eyes, brain, ghost, robot, alien, clown, musical-notes, soccer-ball, basketball (other common emoji names work too). Use one as the hero visual of a scene (size l, above a heading) or a small accent (size s next to a number or badge). It is the way to show things, people's reactions and objects; prefer it over empty text-only scenes, but at most one or two per scene.
chat [text: contact name max 30, messages: 2-6 of {"from": "them"|"me", "text" max 90}]: a phone chat, bubbles popping in one by one with a typing indicator before replies. Chat stories, customer questions, "DM" hooks. Give it a scene of its own.

LAYOUT AND CAMERA: a layers scene has "layout": center (all stacked in the middle), split (the visual layer, i.e. the first lottie/number/chart/price/timer/flow/chat/quote, beside the words in 16:9 and above them in 9:16), hero (the visual large behind the words). Every scene has "camera": push (slow zoom in, default), pull (slow zoom out), drift (slow sideways move), still.
VARIETY (the most common failure is a video that repeats itself): two scenes in a row never share the same layer recipe, layout, transition or lead entrance. Series of similar beats (tip 1, 2, 3; feature A, B, C) each get a different treatment: e.g. one split with a lottie, one hero with a number, one list or flow, one chat or quote. Alternate text and layers scenes, alternate camera moves, and change the visual weight (big visual / big number / big words) from scene to scene. With a voiceover, layers appear when their words are spoken, so put the words that matter in both the layer and the vo line.
TRANSITIONS: every scene after the first has "transition", how it comes in over the end of the previous scene: cut, fade, wipe, slide, zoom, circle, paper (a torn paper edge rising). Keep one or two kinds across a video (calm: fade, wipe; energetic: slide, zoom, circle; paper styles: paper; hard statements: cut).
SOUND THAT IS AUTOMATIC: sound effects (whoosh on transitions, pops and pings when layers land) and karaoke captions of the voiceover are added by the studio; do not write captions as layers.

ANIMATIONS (adapted from the OpenMotion template library)
entrance (every layer has one): fade, slide-up, bounce, scale, flip, spring, elastic, drop, anticipation, blur, wipe, reveal-3d, book, words (word by word), words-pop, type (typewriter), scramble (decoding text).
loop (optional, repeats after the entrance): pulse, heartbeat, float, glitch, flicker, beat, shake, wiggle.
exit (optional, ends with the scene): fade-out, slide-out, zoom-out, dissolve, sink, rise, spin-out, collapse.
"at" (optional): the second a layer starts; leave it out and layers follow each other about 0.4-0.6 s apart.
Restraint: 2-4 layers per scene is the sweet spot, never all entering at once. At most one loop per scene, on the element that should pull the eye (the button, the price, the badge). Keep entrances in one family across the video (calm: fade, slide-up, blur, wipe; playful: bounce, spring, elastic, words-pop; techy: type, scramble, glitch; cinematic: blur, wipe, reveal-3d, book). Use exits only for a deliberate ending; scenes already fade out.
Match the style: glitch, scramble and type suit tech and retro styles; bounce, elastic and words-pop suit pop and sketch styles; blur, wipe and fade suit film, light and clean styles.

ARCS THAT WORK
Promo: text hook; layers [kicker, heading, price, badge]; layers [timer, code]; text or layers [heading, button with pulse].
Tips / explainer: text hook; layers [kicker, heading, list]; layers [number]; closing.
Launch: layers [timer 3]; text tease; layers [heading, list of features]; layers [heading, button].
Social proof: layers [number, text]; layers [quote]; closing with button.
Long videos (30-60 s): 6-10 scenes of 5-8 s, alternate text and layers scenes so the rhythm changes every scene.

STYLE GUIDE (pick by purpose and mood)
Sale, discount, flash promo: promo-heboh (loud), pop-ceria (cheerful), promo-dither (edgy, streetwear).
App, SaaS, tech launch: ui-kilat, ui-website, kursor-kolab (team/collaboration), futuristik, kinetik-hud (data, security, gaming tech).
Education, tips, how-to: edukasi-kertas, papan-kapur, sketsa-papan, infografis-pop (numbers, stats), blueprint (engineering, architecture).
Premium product, luxury, beauty, fashion: produk-gelap, jejak-cahaya, monochrome-film.
Story, heritage, culture, food origin: ruang-cerita, arsip-kuno, siluet-senja, kuas-tinta (Asian, calligraphy, traditional).
Games, entertainment, nostalgia: neon-game, layar-pixel, retro-80an.
Calm, wellness, health, interior: tenang-minimalis, garis-satu, lanskap-kertas (nature, travel).
Corporate, pitch, announcement: pitch-minimal, modern-flat, reel-tegas (bold statements, quotes).
Kids, playful, handmade: scribble-2d, scribble-3d, paper-cutout, isometrik-cerah.
If the user names a style, use it. Explain your style choice in one short phrase in "message".
`.trim();
