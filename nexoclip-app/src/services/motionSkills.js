// The Motion AI director's skill library: playbooks for one kind of video each, picked per request by the words in
// it (like agent skills that load when the prompt matches), so a request carries only the one or two that apply.
// Condensed from iart-ai/motion-skills (https://github.com/iart-ai/motion-skills, MIT License) and the team's own
// ai-motion-studio, vo-explainer-video and paper-craft-voiceover-video skills, rewritten for what the studio can
// make: text and layer scenes, the animation library, styles, a voiceover line per scene and one music track.

export const MAX_SKILLS_PER_REQUEST = 2;

const skill = (id, name, triggers, guide) => ({ id, name, triggers, guide: guide.trim() });

export const MOTION_SKILLS = [
  skill('short-form', 'Short-form (TikTok/Reels/Shorts)', /\b(tiktok|reels?|shorts?|fyp|viral|konten sosmed|instagram|ig)\b/i, `
Retention contract: one idea per video; open a loop in the first second (the hook poses a gap) and close it only at the end. Hook types: open loop ("Alasan X kamu selalu Y..."), direct promise ("3 cara ___ dalam 30 detik"), negation ("Berhenti ___"), pattern interrupt (a bold number or badge in frame 1).
Arc for 15-20 s: hook 0-1 s, setup 1-4 s (why watch), body in beats of one idea each, payoff that closes the loop or loops back to scene 1. No dead air, no greeting intro. Change something every 2-3 s: alternate text and layer scenes, vary entrances within one family.
9:16. Captions matter because most views are muted: keep on-screen text short and big; the vo carries detail.`),

  skill('promo', 'Promo / diskon', /\b(promo|diskon|sale|flash ?sale|potongan|harga|murah|cashback|voucher|kode promo|gratis ongkir|black friday|harbolnas|\d+ ?%)/i, `
One offer, one code, one CTA per video. Arc (6-15 s): hook (brand + occasion, "PROMO AKHIR PEKAN") -> discount reveal (the % is the loudest element: badge or number) -> price layer was->now (strike first, then the new price drops) -> code + real deadline (code chip, timer only for a real deadline, held >= 2 s) -> CTA button with pulse.
Never type prices twice or invent them: use the user's numbers; the price layer computes the %. Frame by percentage for pricier items ("40%"), by amount for cheap ones ("Hemat Rp5 rb"). Energetic but not chaotic: one enter family (scale/spring/elastic), one accent colour. Styles: promo-heboh, pop-ceria, promo-dither.`),

  skill('ad', 'Iklan / ad creative', /\b(iklan|ads?|advert|meta ads|tiktok ads|konversi|conversion|a\/b|variasi iklan|performance)\b/i, `
Ad anatomy (15-30 s): hook 0-3 s (stop the scroll: problem-first, curiosity gap, immediate benefit or direct callout), context (feel the problem), payoff (the product as the fix, one benefit), proof (one concrete number or result, only if the user gave it), CTA in the last 3 s held >= 2 s.
Message-match: the CTA pays off the exact promise of the hook ("Hemat 2 jam sehari" ends on "Coba gratis, hemat 2 jam"), never a generic "Beli sekarang". When the user wants variants, change only one thing (hook, offer or CTA) and keep the rest identical.`),

  skill('launch', 'Launch / teaser produk', /\b(launch|launching|peluncuran|rilis|release|teaser|coming soon|segera hadir|produk baru|new product|grand opening|pembukaan)\b/i, `
Arc (~30 s): hook (striking frame) -> tease (hints, build curiosity: short kicker + heading scenes, blur/wipe entrances) -> reveal (the name lands big: heading with words-pop or scale, a badge "BARU") -> feature montage (one benefit per scene or a list, fast) -> end card (name, tagline, button) held still.
Sound leads picture: the musicPrompt should build and drop at the reveal ("builds tension, drop at 0:10"). A timer layer with 3 makes a launch count. Few flawless scenes beat many busy ones.`),

  skill('testimonial', 'Testimoni', /\b(testimoni|testimonial|review|ulasan|kata pelanggan|kata mereka|feedback pelanggan|rating|bintang)\b/i, `
Trust before motion: quote the customer's words exactly as given, never paraphrase or invent a rating; the author (name + role/city) is the proof. If the user gave no real quote, write an example and say so in "message".
Quote layer with entrance fade or words (reading order, never all at once); rating only with a real score. One quote per scene; 6-9 s each. A number layer before ("4,9 dari 2.000 ulasan") works as proof if the user gave it. Calm styles and soft entrances: fade, blur, slide-up.`),

  skill('explainer', 'Explainer / edukasi', /\b(explainer|jelaskan|penjelasan|cara kerja|how it works|edukasi|edukatif|tutorial|belajar|apa itu|kenapa|mengapa|sains|kesehatan|tips)\b/i, `
An explainer is an argument: one core idea the viewer can repeat. Script-first: the vo is the spine, visuals illustrate the line being spoken. Arc: problem (~20%, "that's me") -> stakes -> solution in one line (~15%) -> how it works in 1-3 concrete steps (~45%, slowest, list layers) -> payoff + one CTA (~20%).
Pick one analogy from the viewer's world and keep it across scenes. "How it works" steps read best as a flow layer (arrows) or a list. Pace vo at ~2.3 words a second (a 60 s video is ~140 words). Text on screen is only the key term or number of each beat, not subtitles. Never add facts, numbers or medical claims the user did not give. Styles: edukasi-kertas, papan-kapur, sketsa-papan, infografis-pop.`),

  skill('infographic', 'Infografis / data', /\b(data|statistik|infografis|infographic|grafik|chart|diagram|survei|survey|riset|laporan|pertumbuhan|growth|angka)\b/i, `
Design the frame first, then reveal in order of importance: title alone -> each item (number counts up, then its label) -> the takeaway held 2-3 s. One central insight with 3-5 data points; never two numbers counting at once (one number layer per scene, or bars for a series).
Ease numbers to settle, label every number with what it means, keep units once. Trends over time: a line layer; steps or causes: a flow layer. Pace: title hold ~1 s, each item 1.2-2 s, final hold 2-3 s. Use only the user's numbers. Layers: number, bars (hero value last), progress, list. Styles: infografis-pop, blueprint, pitch-minimal.`),

  skill('kinetic-type', 'Kinetic typography / quote', /\b(tipografi|typography|kinetic|kata-kata|quotes?|kutipan|motivasi|puisi|lirik|lyric|caption|teks bergerak)\b/i, `
Type first: short lines, one strong word per line where possible. Granularity sets the mood: by line = calm, premium (wipe, blur, slide-up); by word = energetic (words, words-pop); by character = playful, only for very short strings (type, scramble).
Keep each reveal under ~1 s and let the line hold to be read. Break a long sentence into several scenes of 2-6 words rather than one crowded scene; a kicker can carry the setup and the heading the punch. Styles: reel-tegas, pitch-minimal, monochrome-film, garis-tinta.`),

  skill('presentation', 'Presentasi / pitch', /\b(presentasi|presentation|pitch|deck|investor|slide|proposal|company profile|profil perusahaan|rapat|meeting)\b/i, `
The deck is one argument: every scene advances one throughline. Each scene makes exactly one point and its heading states the claim ("Churn menggerus pertumbuhan", not "Churn"). Arc: problem -> insight -> solution -> proof (only real numbers) -> one concrete ask.
Narration owns the clock: vo carries the detail, the screen shows the claim and one supporting element. Calm reveals (fade, slide-up, wipe; no bounce or spin); stagger list items. Formal tone (Anda). 16:9. Styles: pitch-minimal, modern-flat, ui-website.`),

  skill('recap', 'Recap / wrapped', /\b(wrapped|recap|rangkuman|kilas balik|year in review|setahun|pencapaian|milestone|achievement|ulang tahun|anniversary)\b/i, `
Wrapped grammar: intro ("{nama}, {tahun} kamu") -> escalating reveals (top list, stats) -> the big number (largest, counted up, held longest) -> a personal superlative ("Kamu di 1% teratas") -> a shareable outro card. Each scene must read in under 2 s and look good paused: one hero element per scene, big type. Only data the user gave. 9:16. Styles: pop-ceria, neon-game, retro-80an, jejak-cahaya.`),

  skill('story', 'Cerita / sejarah', /\b(sejarah|history|perjalanan|kisah|cerita|story|asal[- ]usul|evolusi|zaman|peradaban|legenda|dokumenter|documentary|biografi)\b/i, `
Documentary voice: start from the familiar (a place, a moment), move through time one era or turning point per scene, end with a resolution or a question that lingers. One visual metaphor per scene: a kicker for the era or year, a heading for the turning point, a number only when it is a known fact the user gave or a widely established one (state approximate dates as "sekitar ... tahun lalu").
The vo carries the narrative (warm, unhurried narrator voice); screen text stays sparse. Calm, cinematic motion: blur, wipe, fade, reveal-3d; no bounce; transitions fade or wipe. Music: ambient or light orchestral that builds slowly. Styles: arsip-kuno, ruang-cerita, siluet-senja, monochrome-film, lanskap-kertas.`),

  skill('chat-story', 'Cerita lewat chat', /\b(chat|percakapan|whatsapp|wa|dm|pesan|sms|texting|curhat|chat story)\b/i, `
One of the highest-retention formats: a story told in chat bubbles that the viewer reads like peeking at someone's phone. One message reveals at a time on a rhythm (the chat layer already adds typing before replies). Hook with the first message (a question or a surprising line), escalate over 3-6 messages, land the punchline or twist in the last bubble, then a text scene with the payoff or CTA.
"me" = the brand or narrator side (right, accent colour), "them" = the other person. Short, natural chat language, no emoji. One chat layer per scene, 8-12 s; split a long conversation into two chat scenes. Keep the contact name generic (a first name), never a real person or a real app's name. 9:16.`),

  skill('countdown', 'Hitung mundur / event', /\b(countdown|hitung mundur|menuju|tinggal \d+|event|acara|webinar|live|konser|deadline|batas waktu)\b/i, `
A countdown must be honest: a real deadline or a launch. A timer layer with hh:mm:ss or mm:ss ticks down; a whole number up to 10 counts 3-2-1. Keep the timer on its own scene or with one heading, held >= 2 s so it can be read; put the date/time and what happens in a kicker or text layer. End on the event name and a button ("Daftar sekarang").`),

  skill('youtube', 'Intro / outro YouTube', /\b(intro|outro|opening|pembuka|penutup|channel|youtube|end ?screen|subscribe)\b/i, `
Intro: 3-5 s total, the name lands in 1-2 s (windup, impact with scale or elastic, settle, short hold), then gets out of the way; one scene, sometimes two. Outro: a calm held layout of >= 20 s is YouTube's end-screen rule: one text scene with the name and "Tonton video berikutnya" on the left third, the rest empty. 16:9.`),

  skill('paper-craft', 'Paper craft', /\b(kertas|paper|craft|kraft|stop ?motion|kolase|collage|handmade)\b/i, `
Paper-craft language: layered paper shapes, soft drop shadows, warm limited palette, slightly jittery stop-motion feel. Use paper styles (paper-cutout, lanskap-kertas, edukasi-kertas) or sketch styles (scribble-2d, scribble-3d). Pops use spring or elastic; moves use slide-up; scenes change with the "paper" transition (torn edge rising); one idea per scene with a short caption-like heading. Friendly narrator vo, light marimba or ukulele music.`),
];

// The core every request carries: from ai-motion-studio, motion-art-direction and animation-principles.
export const MOTION_PRINCIPLES = `
PRINCIPLES
One video, one clear idea, one central visual metaphor; build toward a payoff. Motion serves meaning: move what should be looked at, keep the rest still. Pick one motion personality and keep it: playful (spring, bounce, elastic, words-pop), premium (fade, blur, wipe; no overshoot), corporate (slide-up, fade, wipe), energetic (scale, drop, words-pop, glitch). Keep one visual bible across scenes: one style, one entrance family, one accent. Never invent facts, numbers, testimonials, ratings or logos; mark examples as examples in "message".
`.trim();

// The skills that fit a request: by trigger words in the latest message first, then the recent chat.
export function pickSkills(brief, history = [], max = MAX_SKILLS_PER_REQUEST) {
  const recent = history.filter((message) => message?.role === 'user').slice(-3).map((message) => String(message.content || '')).join(' ');
  const score = (entry) => (entry.triggers.test(String(brief || '')) ? 2 : 0) + (entry.triggers.test(recent) ? 1 : 0);
  return MOTION_SKILLS.map((entry) => ({ entry, points: score(entry) }))
    .filter(({ points }) => points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, max)
    .map(({ entry }) => entry);
}

export const skillsPrompt = (skills) => (skills.length
  ? `SKILLS FOR THIS REQUEST\n${skills.map((entry) => `[${entry.name}]\n${entry.guide}`).join('\n\n')}`
  : '');
