// Marketing Skill Playbooks Engine for AI Creative Marketing.
// Combines battle-tested performance marketing frameworks (SLCT prompting,
// Video Ad Reverse-Engineering, 8-Dimension 3-Persona Ad Creative Evaluation,
// 16-Angle Static Ad Concepts) with OpenMontage / Seedance 2.5 production rules.

export const MAX_SKILLS_PER_TURN = 2;

export const SLCT_CORE_PRINCIPLES = `
### CREATIVE PRODUCTION & PROMPTING STANDARDS (BYTEDANCE SEEDANCE 2.5 OMNI + OPENMONTAGE + SLCT)
- **STRICT LANGUAGE RULE FOR EVERY \`visualPrompt\` & VIDEO PROMPT:**
  - Write **100% vivid, concrete directorial ENGLISH** for ALL visual style, camera, blocking, subject, wardrobe, environment, lighting, physics, and SFX descriptions.
  - Put **ONLY the actual spoken words inside curly braces \`{...}\`** in natural conversational ENGLISH (unless the user explicitly asks for another spoken language), e.g. \`Creator speaks casually in natural everyday English: {Honestly I was super skeptical at first, but after a week my recovery feels way lighter.}\`.
  - **CRITICAL:** NEVER put speaker labels like \`Voiceover:\` or \`Creator:\` INSIDE \`{...}\` — Seedance 2.5 literally speaks everything inside \`{...}\` out loud!
- **STRICT AUDIO DELIMITERS (Seedance 2.5 Official Syntax):**
  - Spoken dialogue: \`{exact natural spoken sentence}\` (max ~2.3 words/sec — for an 8s clip, max 16–19 words total!).
  - Diegetic SFX: \`<crisp plastic lid pop>\`, \`<ice clinking in shaker>\` (in English!).
  - Music: \`(subtle warm lo-fi beat)\` ONLY for commercials; for smartphone UGC talking-head, write \`Quiet room tone. No background music.\`
- **STRICTLY FORBIDDEN IN VIDEO PROMPTS (CAUSES AI GIBBERISH):**
  - NEVER ask Seedance 2.5 to render on-screen text overlays, subtitles, discount stickers ("DISKON 20%"), percentage charts, infographics, bar graphs, certificates/awards, countdown timers, UI buttons ("BELI SEKARANG"), or photo slideshows.
  - Always translate every claim, offer, or comparison into **real, physical, camera-filmable live action** (pouring powder, tactile hand grip on packaging, side-by-side physical liquid dissolve, genuine human facial reaction).
- **REQUIRED SEEDANCE 2.5 STRUCTURE (140–220 words per video prompt, plain text):**
  - \`GLOBAL STYLE:\` genre/texture, 9:16 or 16:9, camera look + explicit exclusions (\`No on-screen text, no subtitles, no UI overlays, no watermarks.\`)
  - \`SUBJECT & PROPS:\` specific creator age/hair/wardrobe lock + exact \`@Product-Name\` prop lock (use hyphens for spaces, e.g. \`@New-Evowhey\`, label crisp & facing lens) + lived-in Indonesian setting.
  - \`SHOT 1 (0–2.5s):\` exact framing, starting position, observable micro-acting or tactile physics.
  - \`SHOT 2 (2.5–5.5s):\` continuous action / product showcase beat (\`Hard cut.\` if camera changes).
  - \`SHOT 3 (5.5–8s):\` closing beat + stable end frame.
  - \`LIGHTING:\` one committed light source & direction held across all shots.
  - \`AUDIO:\` speaker tone/tempo/language + \`{natural spoken words}\` + \`<SFX>\` + room tone / \`(...)\` music.
- **Anti-Hallucination & Guardrail Contract:**
  - NEVER invent prices, percentages, lab test numbers, BPOM codes, customer ratings, or testimonials not present in My Brand / Products / attached references.
  - Respect every rule in \`Claims to Avoid\` & \`Brand Memory\`.
`.trim();

const skill = (id, name, badge, tagline, triggers, guide) => ({
  id,
  name,
  badge,
  tagline,
  triggers,
  guide: guide.trim(),
});

export const MARKETING_SKILLS = [
  skill(
    'ugc-testimonial',
    'UGC Testimonial',
    'OpenMontage UGC',
    'OpenMontage smartphone UGC ad playbook for Seedance 2.5 Omni (ID)',
    /\b(ugc|testimonial|testimoni|review jujur|talking head|creator|ulasan|unboxing|grwm|street interview)\b/i,
    `
SOP SKILL: OPENMONTAGE UGC AD (SEEDANCE 2.5 OMNI PLAYBOOK)
1. **Pick 1 Proven UGC Pattern:**
   - *Problem → Solution:* 1 hook annoyance ("Jujur aku sempet skeptis...") → 2 failed fixes → 3 discovers product → 4 using it close-up → 5 honest reaction → 6 CTA.
   - *Review / Unboxing:* 1 holding package with strong opinion → 2 opening → 3 first touch/smell/taste → 4 close-up → 5 verdict with 1 tiny honest con → 6 CTA.
   - *Before / After:* 1 before state → 2 using product → 3 after in SAME framing → 4 creator verdict → 5 CTA.
   - *Day in My Life:* 3–5 quick real routine moments where product appears naturally in 2 shots.
   - *Street Interview:* off-camera phone filming stranger trying product, quick candid reaction cuts.
2. **Strict Smartphone UGC Realism Rules (NEVER break these):**
   - **Camera:** 9:16 phone selfie (front cam at arm's length) or friend holding phone, natural handheld micro-shake. **FORBIDDEN:** gimbal, dolly, crane, rack focus, lens flares, anamorphic/cinematic color grading, on-screen text, subtitles, or UI stickers.
   - **Creator & Setting:** Ordinary-looking Indonesian person matching target audience (casual clothes, natural skin texture, light/no makeup, NOT model-perfect). Lived-in location: real Jakarta bedroom, bathroom mirror, kos room, car interior, office desk, gym locker, or cafe. Keep ONE creator, ONE sitting/location, consistent framing.
   - **Performance & Dialogue:** Understated, natural blinks, half-beat reactions, glance away and back, small growing smile. Natural conversational English (short everyday phrasing, ~2.3 words/s; only use Indonesian if the user explicitly requests Indonesian speech). Mention product name at most twice; include 1 relatable honest detail. **NEVER** use stiff ad clichés ("revolutionary", "best in class", "20% OFF FOR 24 HOURS ONLY!") or start with a brand logo or "Hey guys, welcome back to my channel".
   - **Sound:** Native audio ON inside Seedance 2.5 using \`{...}\` braces (ONLY spoken words inside \`{...}\`, zero speaker prefix inside braces!) + quiet room tone. NO music bed under speech, and NEVER layer a separate VO over a talking creator.
3. **Seedance 2.5 Director Prompt Format (100% English visuals + \`{natural spoken dialogue}\`):**
   \`\`\`
   GLOBAL STYLE: Authentic 9:16 smartphone UGC shot on a phone front camera, natural skin pores, slight handheld micro-shake, true auto-exposure, no cinematic grading. No on-screen text, no subtitles, no UI overlays, no watermarks.
   SUBJECT & PROPS: Single ordinary creator (age, hair, casual outfit) stays in the same lived-in [room/gym/car] throughout. @Product-Name is the exact product packaging with label sharp, upright, and facing the lens.
   SHOT 1 (0–3s): Medium close-up selfie at arm's length; creator starts mid-thought, natural blink, honest expression.
   SHOT 2 (3–6s): Same handheld selfie framing; creator lifts @Product-Name cleanly at chest height, label facing lens, natural tactile interaction.
   SHOT 3 (6–8s): Slight natural lean-in, understated nod and small genuine smile while holding @Product-Name steady.
   LIGHTING: Soft existing window light from screen-left, warm, slightly uneven indoor shadows.
   AUDIO: Creator speaks casually in natural conversational English (relaxed pace): {Okay honestly, I was super skeptical at first, but after a week I actually felt the difference.} Quiet room tone, <subtle plastic tap on packaging>. No background music.
   NEGATIVE / AVOID: studio lighting, softbox beauty light, ring-light reflections, stock photo aesthetic, over-polished airbrushed plastic skin, stiff commercial ad pose, robotic smile, on-screen text overlays, subtitles, watermarks.
   \`\`\`
4. **ZERO-FRICTION AUTONOMOUS PRE-PRODUCTION (NO TECHNICAL PROMPTING REQUIRED FROM USER):**
   - When the user simply asks something casual like *"make a 30s UGC ad for [product]"*, DO NOT expect them to mention avatars, backgrounds, sub-props, or scoops — **YOU autonomously act as a senior Ad Producer** and design the complete pre-production visual pack tailored to the product category (written in English):
     - **Avatar (\`sceneKit.avatar\`):** Check \`MY BRAND\`. If My Brand has NO saved avatar yet, automatically invent 1 relatable everyday creator persona matching the target audience (age, casual wardrobe, voiceStyle, natural lighting, Imperfection First) so it generates via AI Influencer (\`nano-banana-pro\`) and auto-saves to **My Brand → Avatars**. If My Brand ALREADY has a saved avatar, reuse that saved \`@Avatar-Name\` and omit \`sceneKit.avatar\`!
     - **Background / Location A/B (\`sceneKit.location\`):** Automatically design 1 realistic lived-in location with **2 empty angles** (e.g. Angle A: wide room/corner, Angle B: desk/counter near window daylight — zero people!).
     - **Product Sub-Props B/C (\`sceneKit.productSubProps\`):** Automatically design **1–2 tactile real-world states** of ONLY the selected hero product (e.g. supplement/whey → \`Prop B: Opened Lid (Powder Visible)\`, \`Prop C: Scooping Powder\`; skincare → \`Prop B: Open Dropper\`, \`Prop C: Texture on Hand\`; beverage → \`Prop B: Opened / Pouring\`) — these automatically merge into the single \`@Product\` folder alongside the original product photo!
     - **Extra Props (\`sceneKit.extraProps\`):** Automatically add **1 standalone supporting prop** if the action needs it (e.g. \`Whey Scoop\` or \`Clear Shaker\` for whey; \`Iced Glass\` for drinks) so it can be \`@mentioned\` cleanly.
   - STRICT PRODUCT FOCUS: Include ONLY the product(s) the user selected or named — NEVER pull or mention unselected products from My Brand.
5. **REQUIRED 2-STEP OUTPUT FOR VIDEO REQUESTS (IN ONE TURN):**
   - Call \`create_storyboard\` (timestamped Hook → Problem/Solution → Demo → CTA beats, in English).
   - Call \`propose_creative_production\` **#1 (\`actionType: "generate_scene_kit"\`)** titled e.g. \`Step 1 · Prepare Pre-Production Visual Pack (Avatar, Background & Sub-Props)\` containing the complete \`sceneKit\`.
   - Call \`propose_creative_production\` **#2 (\`actionType: "generate_video"\`)** titled e.g. \`Step 2 · Render UGC Video [Duration]s (Seedance 2.5)\` with the full Imperfection First Seedance 2.5 prompt referencing the exact \`@Avatar\`, \`@Location\`, \`@Product\`, and \`@ExtraProp\` tags + clean \`{spoken dialogue}\` + \`NEGATIVE / AVOID:\`.
   - Briefly tell the user in crisp English: click **Approve & Run** on Step 1 first to generate consistent visual references, then click **Open in Canvas** or **Approve & Run** on Step 2!
`,
  ),

  skill(
    'launch-video',
    'Launch Video',
    'Campaign',
    '7-day product launch campaign + hero reveal storyboard',
    /\b(launch|launching|peluncuran|rilis|teaser|produk baru|campaign \d+ hari|7 hari|14 hari)\b/i,
    `
SOP SKILL: PRODUCT LAUNCH VIDEO & CAMPAIGN
1. Build a phased multi-day launch arc via \`save_campaign_draft\`:
   - Day 1: Curiosity Teaser (no full reveal yet, tension build + sound drop)
   - Day 2: Pain Point UGC (agitate the exact gap this product solves)
   - Day 3: Official Reveal & Hero Demo (SLCT macro product shot + USP proof)
   - Day 4: Comparison / Swap Angle (old habit vs new product)
   - Day 5: How It's Used / Routine Tutorial
   - Day 6: Objection Crusher / FAQ + Proof
   - Day 7: Direct Launch Offer + Strong CTA
2. Pair the hero launch video with \`create_storyboard\` (including music BPM/drop timing) and ensure every deliverable has a concrete SLCT \`visualPrompt\` ready for **Open in Canvas**.
`,
  ),

  skill(
    'creative-insight',
    'Creative Insight',
    'Research',
    'Live Meta Ads + TikTok trend mining with winning hook patterns',
    /\b(creative insight|riset tren|trend|winning ads|lagi rame|viral|insight iklan)\b/i,
    `
SOP SKILL: LIVE CREATIVE INSIGHT MINING
1. Execute live research BEFORE theorizing: call \`search_meta_ads\` (look for \`runningDays >= 14\` longevity winners) + \`search_tiktok_videos\` + \`get_tiktok_top_ads\`.
2. Transcribe 1–2 top videos (\`get_tiktok_transcript\` / \`get_meta_ad_transcript\`) and visually inspect 1 winning video (\`watch_reference_video\`) if a direct video URL is available.
3. Synthesize patterns into \`save_research_report\` with real metrics, exact 0–3s hooks, format breakdown, and 3–5 concrete Creative Opportunities mapped to the user's brand.
`,
  ),

  skill(
    'ad-clone',
    'Ad Clone',
    'Reverse-Engineer',
    'Reverse-engineer a winning competitor ad into a modular brand template',
    /\b(ad clone|clone|tiru|adaptasi iklan|reverse engineer|bedah iklan|conter|tirukan)\b/i,
    `
SOP SKILL: VIDEO AD REVERSE-ENGINEER & AD CLONE
1. If user didn't give a specific reference ad, call \`search_meta_ads\` to find a long-running winner (\`runningDays >= 14\`) in the niche, then call \`get_meta_ad_transcript\` and/or \`watch_reference_video\`.
2. Deconstruct the winning ad into a **Modular Shot Blueprint**:
   - Hook mechanism (visual + verbal trigger in 0–3s)
   - Pacing & cut rhythm (seconds per beat)
   - Proof device (chart, demo, close-up, reaction)
   - Offer & CTA framing
3. Adapt 100% ethically to the user's Brand & Product — zero plagiarism of competitor trademarks; swap in user's exact product visuals, claims, and tone via \`create_storyboard\` + \`save_research_report\`.
4. Offer \`propose_creative_production\` to generate keyframe shots + voiceover + BGM for the cloned concept.
`,
  ),

  skill(
    'fresh-ideas',
    'Fresh Ideas',
    'Ideation',
    '5 anti-mainstream scroll-stopping angles grounded in My Brand',
    /\b(fresh ideas?|ide konten|ide baru|brainstorm|anti[- ]mainstream|angle baru)\b/i,
    `
SOP SKILL: FRESH CREATIVE ANGLES (5 DISTINCT FORMATS)
Generate 5 non-overlapping concepts tailored to My Brand's Audience & Products — each MUST use a DIFFERENT creative vehicle:
1. **Habit Swap / Visual Contrast** (e.g. swapping a familiar Indonesian everyday habit/drink/routine for the product)
2. **Contrarian / Myth-Busting** (challenge a popular industry misconception in frame 1)
3. **Proof-First / Lab / Tactile Demo** (lead immediately with undeniable visual proof)
4. **POV / Day-in-the-Life Micro-Story** (native organic TikTok feel, zero "ad voice")
5. **Us vs. Generic Alternative** (sharp side-by-side comparison without naming banned claims)
For each idea give: Angle Name, 0–3s Hook, Visual Concept, Best Format, and Expected Objection Handled. Save top directions with \`save_creative_strategy\`.
`,
  ),

  skill(
    'review-ads',
    'Review Ads',
    '8-Dim Rubric',
    '3-persona, 8-dimension ad creative audit with rewritten hooks',
    /\b(review ads?|audit iklan|nilai iklan|kritik|evaluasi iklan|score|cek copy|cek script)\b/i,
    `
SOP SKILL: 8-DIMENSION, 3-PERSONA AD CREATIVE EVALUATOR
Evaluate the user's ad script, storyboard, copy, or attached creative through **3 Specialist Personas**:
- **Performance Media Buyer** (scroll-stop thumbstop rate, CPA/ROAS conversion mechanics, platform policy compliance)
- **Direct-Response Copywriter** (hook curiosity gap, specificity, objection handling, CTA message-match)
- **Creative Director** (visual-audio sync, pacing, product visibility, brand tone consistency)

Score **each of 8 dimensions (1–10)** in a crisp Markdown table:
1. Hook Power (0–3s)
2. Message Clarity & Single Big Idea
3. Brand & Guardrail Compliance (check against \`Claims to Avoid\`)
4. Proof & Credibility
5. Pacing & Retention Arc
6. Visual-Audio Synergy
7. CTA Message-Match
8. Platform Native Fit (TikTok/Meta)

Finish with: **Overall Score (/80)**, **Top 3 Bottlenecks to Fix Immediately**, and **3 Rewritten 0–3s Hook Upgrades** ready to test.
`,
  ),

  skill(
    'competitor-analysis',
    'Competitor Analysis',
    'Battlecard',
    'Competitor ads & positioning teardown + optional My Brand update',
    /\b(competitor|kompetitor|pesaing|bandingkan|battlecard|vs\b|lawan)\b/i,
    `
SOP SKILL: COMPETITOR AD & POSITIONING TEARDOWN
1. Run \`search_meta_ads\` + \`search_tiktok_videos\` (and \`search_tiktok_shop\` if e-commerce) on the target competitor(s) from My Brand or user prompt.
2. Identify: their longest-running winning angles, pricing/offer hooks, creative weaknesses/blind spots, and messaging clichés they overuse.
3. Build a concrete **Attack Battlecard** via \`save_creative_strategy\` showing exactly how our brand wins in the first 3 seconds.
4. If new high-value competitor facts or official URLs are discovered, offer (or use \`update_my_brand\`) to enrich the Competitor subpage in My Brand.
`,
  ),

  skill(
    'image-ads',
    'Image Ads',
    '16 Angles',
    '4–6 static DR ad concepts with layout specs & keyframe generation',
    /\b(image ads?|static ads?|banner|carousel|iklan gambar|poster|feed)\b/i,
    `
SOP SKILL: STATIC IMAGE AD CONCEPT GENERATOR (16-ANGLE MATRIX)
Select 4–6 distinct proven static direct-response angles from the 16-angle matrix (e.g. *Us vs. Them Comparison Grid*, *Ingredient/Feature Callout Arrows*, *Problem/Solution Split*, *Lab Proof / Social Proof Badge*, *Habit Swap Visual*, *Founder/Expert Note*, *Direct Offer Stack*, *Ugly/Native Notes-App Ad*).
For every concept provide:
- **Angle & Format** (4:5 Meta Feed / 9:16 Story)
- **Visual Layout Blueprint** (exact placement of product, badges, focal hierarchy)
- **Headline** (<= 6 words, punchy), **Sub-copy**, **CTA Badge**
- **SLCT Image Generation Prompt** (ready for Seedream / Nano Banana)
Offer \`propose_creative_production\` (\`actionType: 'generate_keyframe'\`) so the user can generate the top concept images directly inside chat with 1 click!
`,
  ),

  skill(
    'hook-script',
    'Hook & Script',
    'SLCT',
    '10 high-converting 0–3s hooks + full timestamped 20–30s script',
    /\b(hook|script|skrip|naskah|voiceover|vo|storyboard|copywriting)\b/i,
    `
SOP SKILL: HIGH-RETENTION HOOK BANK & TIMED SCRIPT
1. Produce **10 distinct 0–3s hooks** grouped across 5 psychological triggers (2 each): *Open Loop*, *Contrarian/Negation*, *Specific Problem Callout*, *Visual Proof-First*, and *Relatable Habit Swap*.
2. Write 1–2 complete 20–30s scripts timed at ~2.3 words/sec in natural spoken Bahasa Indonesia (zero stiff corporate wording unless Brand Tone requires it).
3. Always call \`create_storyboard\` for the winning script so the user gets a crisp timestamped table (` + '`Time | Visual | On-Screen Text`' + `), and offer \`propose_creative_production\` to record the ElevenLabs Voiceover MP3 or generate keyframes directly!
`,
  ),
];

export function listPublicMarketingSkills() {
  return MARKETING_SKILLS.map(({ id, name, badge, tagline }) => ({ id, name, badge, tagline }));
}

export function pickMarketingSkills({ message = '', history = [], explicitSkillId = null, max = MAX_SKILLS_PER_TURN } = {}) {
  const picked = [];
  const seen = new Set();

  if (explicitSkillId) {
    const exact = MARKETING_SKILLS.find((s) => s.id === explicitSkillId);
    if (exact) {
      picked.push(exact);
      seen.add(exact.id);
    }
  }

  const recentText = (history || [])
    .filter((m) => m?.role === 'user')
    .slice(-3)
    .map((m) => String(m.content || ''))
    .join(' ');

  const scored = MARKETING_SKILLS.filter((s) => !seen.has(s.id))
    .map((s) => ({
      skill: s,
      score: (s.triggers.test(String(message || '')) ? 2 : 0) + (s.triggers.test(recentText) ? 1 : 0),
    }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  for (const item of scored) {
    if (picked.length >= max) break;
    picked.push(item.skill);
  }
  return picked;
}

export function formatSkillsForPrompt(skills = []) {
  const parts = [SLCT_CORE_PRINCIPLES];
  if (Array.isArray(skills) && skills.length > 0) {
    parts.push(
      `### ACTIVE MARKETING SKILL PLAYBOOKS\n${skills
        .map((s) => `#### [${s.name} · ${s.badge}]\n${s.guide}`)
        .join('\n\n')}`,
    );
  }
  return parts.join('\n\n');
}
