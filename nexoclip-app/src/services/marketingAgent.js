// AI Creative Marketing Agent Orchestrator (Node).
// Adaptive creative marketer that orchestrates Brand Kit, Products, Brand Memory,
// ScrapeAtlas live research, BytePlus visual video watching, and persistent artifacts.
import { createResearchProvider } from './researchProvider.js';
import { createBrandMemory, formatContextForPrompt, loadWorkspaceMarketingContext } from './brandMemoryService.js';
import { createCampaignWithDeliverables, saveArtifact, selectRelevantProducts, updateThread } from './marketingArtifactsService.js';
import { analyzeVideo } from './videoAnalysis.js';
import { formatSkillsForPrompt, pickMarketingSkills } from './marketingSkills.js';
import {
  auditWorkspaceAdAccounts,
  createApproval,
  createRoutine,
  updateMyBrandFromAgent,
} from './marketingExecutionService.js';
import { optimizeSeedancePrompt } from './seedancePromptOptimizer.js';

export const MARKETING_MODEL = process.env.MARKETING_AGENT_MODEL || 'dola-seed-2-1-turbo-260628';
export const DEFAULT_VIDEO_MODEL = 'seedance-2.5';
const ALLOWED_LLM_MODELS = new Set([
  'dola-seed-2-1-turbo-260628',
  'anthropic/claude-sonnet-4',
  'openai/gpt-4o',
  'google/gemini-2.5-pro',
]);
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_BYTEPLUS_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3';
const MAX_STEPS = 10;
const REQUEST_TIMEOUT_MS = 180_000;

function isBytePlusModel(model) {
  return /^(dola-seed-|ep-)/i.test(String(model || '').trim());
}

const toolDef = (name, description, properties, required = []) => ({
  type: 'function',
  function: {
    name,
    description,
    parameters: { type: 'object', properties, required, additionalProperties: false },
  },
});

const str = (description) => ({ type: 'string', description });
const num = (description) => ({ type: 'number', description });
const arrStr = (description) => ({ type: 'array', items: { type: 'string' }, description });

export const MARKETING_TOOLS = [
  toolDef(
    'rename_session',
    'Set a short, clear 3-6 word title for this marketing session based on the user objective.',
    { title: str('Short session title, e.g. "Riset Skincare Acne ID" or "Campaign Launch Serum 7 Hari"') },
    ['title'],
  ),
  toolDef(
    'search_meta_ads',
    'Search active Instagram/Facebook ads in Meta Ads Library via ScrapeAtlas. Great for finding winning competitor ads (runningDays >= 14), ad copy, and video URLs.',
    {
      query: str('Keyword or competitor brand name'),
      country: str('2-letter country code, default "ID"'),
      mediaType: { type: 'string', enum: ['VIDEO', 'IMAGE', 'ALL'], description: 'Filter by media type, default VIDEO' },
      limit: num('Max ads to return (1-12, default 8)'),
    },
    ['query'],
  ),
  toolDef(
    'get_meta_ad_transcript',
    'Transcribe spoken audio from a Meta Ad Library video ad ID (max 3 transcript calls per turn).',
    { adId: str('Meta ad_archive_id from search_meta_ads') },
    ['adId'],
  ),
  toolDef(
    'search_tiktok_videos',
    'Search trending organic TikTok videos by keyword and region via ScrapeAtlas. Returns plays, likes, engagement rate, caption, and video URL.',
    {
      query: str('Search keyword in local language, e.g. "serum jerawat indonesia"'),
      region: str('2-letter region code, default "ID"'),
      limit: num('Max videos to return (1-10, default 8)'),
    },
    ['query'],
  ),
  toolDef(
    'get_tiktok_transcript',
    'Extract timestamped transcript + 0-3 second spoken hook from a TikTok video URL (max 3 transcript calls per turn).',
    { url: str('Full TikTok video URL from search_tiktok_videos') },
    ['url'],
  ),
  toolDef(
    'get_tiktok_top_ads',
    'Fetch top-performing TikTok ads by country with CTR, likes, and campaign objective.',
    {
      country: str('2-letter country code, default "ID"'),
      period: num('Lookback days: 7, 30, or 180 (default 30)'),
      limit: num('Max ads (1-8, default 6)'),
    },
    [],
  ),
  toolDef(
    'search_instagram_posts',
    'Search public Instagram posts and Reels by keyword.',
    {
      query: str('Search keyword'),
      limit: num('Max posts (1-8, default 6)'),
    },
    ['query'],
  ),
  toolDef(
    'search_tiktok_shop',
    'Search TikTok Shop products to inspect competitor positioning, pricing, and top-selling items.',
    {
      query: str('Product keyword'),
      region: str('2-letter region code, default "ID"'),
      limit: num('Max products (1-8, default 6)'),
    },
    ['query'],
  ),
  toolDef(
    'watch_reference_video',
    'Visually watch a competitor video URL frame-by-frame (1 fps) to analyze visual hooks, shot framing, pacing, lighting, and on-screen text (max 2 calls per turn).',
    {
      url: str('Direct MP4 video URL (e.g. videoUrl from search_meta_ads)'),
      focus: str('What specific creative elements to analyze (hook visual, pacing, demo, CTA)'),
    },
    ['url'],
  ),
  toolDef(
    'save_research_report',
    'Save a persistent Research Report artifact so the user can reopen references, winning hooks, and creative opportunities anytime.',
    {
      title: str('Report title'),
      summary: str('Executive summary in 2-3 crisp sentences'),
      marketInsights: arrStr('3-6 key findings backed by real data from research tools'),
      winningHooks: {
        type: 'array',
        description: '3-6 concrete hooks observed in top ads/videos with why they work',
        items: {
          type: 'object',
          properties: {
            hook: str('Exact or adapted 0-3s hook line'),
            format: str('e.g. Problem-Solution UGC, Demo, Educational'),
            whyItWorks: str('Short explanation of psychological trigger'),
          },
          required: ['hook', 'format', 'whyItWorks'],
          additionalProperties: false,
        },
      },
      creativeOpportunities: {
        type: 'array',
        description: '3-5 actionable creative opportunities tailored to the user brand/product',
        items: {
          type: 'object',
          properties: {
            title: str('Opportunity name, e.g. Problem-Solution UGC'),
            angle: str('Core marketing angle'),
            recommendedFormat: str('e.g. Talking UGC, Product Demo, Split-Screen'),
            rationale: str('Why this fits the brand and market gap'),
          },
          required: ['title', 'angle', 'recommendedFormat', 'rationale'],
          additionalProperties: false,
        },
      },
      references: {
        type: 'array',
        description: 'Top 3-8 real reference ads/videos inspected',
        items: {
          type: 'object',
          properties: {
            platform: str('meta_ads | tiktok | instagram | tiktok_shop'),
            title: str('Advertiser or creator name + short label'),
            metric: str('e.g. "Running 45 days", "628K views", "CTR 0.71%"'),
            hookExcerpt: str('Spoken or copy hook preview'),
            url: str('Source URL if available'),
            thumbnailUrl: str('Thumbnail URL if available'),
          },
          required: ['platform', 'title', 'metric'],
          additionalProperties: false,
        },
      },
    },
    ['title', 'summary', 'marketInsights', 'creativeOpportunities'],
  ),
  toolDef(
    'save_creative_strategy',
    'Save a persistent Creative Strategy artifact defining positioning, audience pain points, marketing angles, hook bank, and CTA direction.',
    {
      title: str('Strategy title'),
      summary: str('Core strategic direction in 2-3 sentences'),
      targetAudience: str('Specific audience segment and awareness stage'),
      corePositioning: str('How the brand/product stands out against competitors'),
      painPoints: arrStr('Top 3-5 customer pain points to address'),
      angles: {
        type: 'array',
        description: '3-5 creative angles',
        items: {
          type: 'object',
          properties: {
            name: str('Angle name'),
            promise: str('Key message / promise'),
            proof: str('How to prove it visually'),
            sampleHook: str('Example 0-3s hook'),
            format: str('Best video format'),
          },
          required: ['name', 'promise', 'sampleHook', 'format'],
          additionalProperties: false,
        },
      },
      ctaDirection: arrStr('2-4 recommended CTAs'),
      doAndDonts: arrStr('Brand guardrails & claims to avoid'),
    },
    ['title', 'summary', 'targetAudience', 'corePositioning', 'angles'],
  ),
  toolDef(
    'save_campaign_draft',
    'Create a persistent Marketing Campaign object with a day-by-day list of deliverables (each deliverable can be opened directly in AI Video Canvas!).',
    {
      title: str('Campaign title, e.g. "Product Launch Campaign — Serum Glow"'),
      objective: str('Primary goal, e.g. "Awareness & conversion di TikTok & Instagram"'),
      durationDays: num('Campaign duration in days (e.g. 7, 14, 30)'),
      platforms: arrStr('Target platforms, e.g. ["tiktok", "instagram"]'),
      summary: str('Short overview of campaign phasing'),
      deliverables: {
        type: 'array',
        description: 'Ordered deliverables (Day 1..Day N). Include concrete visualPrompt so Open in Canvas works immediately.',
        items: {
          type: 'object',
          properties: {
            dayIndex: num('Day number (1, 2, 3...)'),
            title: str('Short deliverable title, e.g. "Product Teaser" or "Customer Pain Point UGC"'),
            platform: str('tiktok | instagram | youtube'),
            format: str('e.g. Cinematic video, UGC video, Product demo, Tutorial, Talking avatar, Direct response ad'),
            hook: str('Exact 0-3 second spoken/visual hook'),
            angle: str('Marketing angle for this piece'),
            cta: str('Call to action'),
            visualPrompt: str('Director-grade Seedance 2.5 Omni prompt in 100% vivid English for visuals (GLOBAL STYLE / SUBJECT & PROPS / SHOT 1..3 with timestamps / LIGHTING / AUDIO) with ONLY casual spoken Indonesian inside {...} braces (no speaker label inside braces!). ZERO on-screen text overlays, stickers, charts, certificates, or UI buttons.'),
            voiceover: str('Short spoken script / voiceover lines'),
          },
          required: ['dayIndex', 'title', 'platform', 'format', 'hook', 'angle', 'visualPrompt'],
          additionalProperties: false,
        },
      },
    },
    ['title', 'objective', 'durationDays', 'platforms', 'deliverables'],
  ),
  toolDef(
    'remember_brand_preference',
    'Store a durable preference, creative feedback, or audience insight into Brand Memory when the user expresses a lasting rule (e.g. "jangan pakai avatar kaku", "lebih suka hook pertanyaan").',
    {
      category: {
        type: 'string',
        enum: ['preference', 'creative_history', 'feedback', 'performance', 'audience_insight'],
      },
      content: str('Concise, reusable memory statement in Indonesian or English'),
    },
    ['category', 'content'],
  ),
  toolDef(
    'ask_clarifying_questions',
    'Present 1–3 crisp interactive option-picker questions directly in chat (rendered as a clean white radio-option card with custom input + Continue button) whenever offering next-step choices or clarifying brief direction (e.g. which product, angle, duration, or next action).',
    {
      questions: {
        type: 'array',
        description: '1 to 3 short questions with selectable options',
        items: {
          type: 'object',
          properties: {
            question: str('Short, direct question'),
            options: {
              type: 'array',
              description: '2–4 crisp selectable options (strings or {label, description})',
              items: { type: 'string' },
            },
          },
          required: ['question', 'options'],
          additionalProperties: false,
        },
      },
    },
    ['questions'],
  ),
  toolDef(
    'present_creative_options',
    'Render 2–3 clickable visual Concept Option Cards side-by-side inline in chat (violet / dark / lavender headers with tags & summary) so the user can pick 1 concept, hook, or ad angle with a single click.',
    {
      options: {
        type: 'array',
        description: '2 to 3 distinct creative concepts/options',
        items: {
          type: 'object',
          properties: {
            badge: str('Short badge, e.g. "Option 1" or "UGC Hook"'),
            headline: str('Punchy 0–3s hook or concept headline shown in card header'),
            tags: arrStr('2–3 short tags, e.g. ["UGC", "9:16", "TikTok"]'),
            description: str('Concise 2–3 sentence explanation of the angle & visual proof'),
            prompt: str('Optional follow-up instruction sent if user clicks this card'),
          },
          required: ['headline', 'description'],
          additionalProperties: false,
        },
      },
    },
    ['options'],
  ),
  toolDef(
    'create_storyboard',
    'Render a structured timestamped ad Storyboard table directly inline in chat (Time | Visual / Shot | On-Screen Text | Voiceover) plus full VO script and music notes.',
    {
      title: str('Storyboard concept title, e.g. "Kopi Aren Swap (9:16, 30s)"'),
      aspectRatio: str('e.g. "9:16" or "1:1"'),
      durationSeconds: num('Total target duration in seconds, e.g. 20 or 30'),
      conceptSummary: str('2–3 sentences explaining the core creative idea and why it works'),
      voiceoverScript: str('Full spoken voiceover script ready for ElevenLabs TTS'),
      musicDirection: str('Music mood, genre, BPM, and beat drop timing'),
      shots: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            time: str('Timestamp range, e.g. "0–5s"'),
            visual: str('Concrete visual action & camera framing (SLCT)'),
            onScreenText: str('Exact on-screen text / supers'),
          },
          required: ['time', 'visual', 'onScreenText'],
          additionalProperties: false,
        },
      },
    },
    ['title', 'shots'],
  ),
  toolDef(
    'propose_creative_production',
    'Create a Human-in-the-Loop Approval Card in chat BEFORE spending credits or launching external campaigns. When approved, executes directly inside chat: prepares full Pre-Production Visual Asset Pack (`generate_scene_kit`: Avatar + Background A/B/C Locations + Hero Product Sub-Props like opened tub/scoop + standalone Extra Props ready as Canvas folders & @mentions), generates standalone "Imperfection First" UGC Brand Avatar & auto-saves to My Brand (`generate_brand_avatar`), Keyframe Image (`generate_keyframe`), ElevenLabs Voiceover MP3 (`generate_voiceover`), Background Music MP3 (`generate_music`), REAL playable MP4 Video (`generate_video`), or Paused Meta Ads Campaign (`launch_meta_campaign`).',
    {
      actionType: {
        type: 'string',
        enum: ['generate_scene_kit', 'generate_brand_avatar', 'generate_keyframe', 'generate_voiceover', 'generate_music', 'generate_video', 'launch_meta_campaign'],
      },
      title: str('Short action title, e.g. "Pre-Production Asset Pack: Avatar + Background A/B + Sub-Props Evowhey" or "Render Video Iklan 8s (Seedance 2.5)"'),
      description: str('Brief explanation of what will be generated/executed and why'),
      estimatedCredits: num('Estimated workspace credits (e.g. 8 per image: 32–48 for generate_scene_kit with 4–6 assets, 8 for avatar/keyframe, 3 for voiceover, 6 for music, 120 for 8s 720p video, 0 for Meta paused campaign)'),
      prompt: str('For generate_video: Director-grade Seedance 2.5 Omni prompt (160–240 words) in 100% concrete English for visuals (GLOBAL STYLE / SUBJECT & PROPS / SHOT 1..3 with timestamps / LIGHTING / AUDIO / NEGATIVE / AVOID) with ONLY the spoken words inside {...} curly braces (NEVER put "Voiceover:" or speaker names inside {...}!), diegetic SFX in <...>, optional music in (...), and ZERO on-screen text overlays/stickers/charts/UI buttons. Use ONLY the selected product @tag (never mention unselected products). For generate_brand_avatar: candid smartphone "Imperfection First" portrait prompt in English. For generate_keyframe / generate_music: detailed English prompt.'),
      text: str('Spoken script text (for generate_voiceover)'),
      voiceId: str('Optional ElevenLabs voice name or id (e.g. Liam, Brian, Sarah, Matilda)'),
      aspectRatio: str('e.g. "9:16", "3:4", "4:5", "1:1"'),
      durationSeconds: num('Target duration in seconds (for generate_video: 4–30s on Seedance 2.5, default 8s; for voiceover/music: 10–60s)'),
      resolution: str('Optional video resolution for generate_video: "480p" | "720p" | "1080p" (default "720p")'),
      generateAudio: { type: 'boolean', description: 'For generate_video: true to generate native synced speech/SFX audio (default true)' },
      firstFrameUrl: str('Optional workspace asset URL (/api/assets/<id>/download) from a generated keyframe/avatar to use as the video first frame'),
      referenceImages: arrStr('Optional reference image URLs'),
      sceneKit: {
        type: 'object',
        description: 'Pre-production visual asset pack when actionType is generate_scene_kit (max 6 images total). Each group becomes a real Canvas folder (Characters / Locations / Props) with A/B/C sub-assets for Seedance 2.5 Omni @mentions.',
        properties: {
          avatar: {
            type: 'object',
            description: 'Optional UGC Creator avatar to generate via AI Influencer & auto-save to My Brand (omit if My Brand already has a saved avatar to reuse)',
            properties: {
              name: str('Creator name, e.g. "Raka"'),
              appearance: str('Ordinary relatable Indonesian person, age, hair, visible skin pores (Imperfection First)'),
              wardrobe: str('Casual everyday outfit'),
              voiceStyle: str('Casual Indonesian speaking pace & tone'),
              lighting: str('Natural window daylight'),
              setting: str('Lived-in Indonesian setting'),
            },
            additionalProperties: false,
          },
          location: {
            type: 'object',
            description: 'Background / Location folder (type: location) with 1–3 angles A/B/C (empty lived-in setting, NO people)',
            properties: {
              name: str('Short location folder name, e.g. "Kamar Kosan Jakarta"'),
              description: str('Overall atmosphere & natural lighting'),
              shots: {
                type: 'array',
                description: '1–3 background angles (A: wide, B: near window/desk, C: close detail)',
                items: {
                  type: 'object',
                  properties: {
                    label: str('e.g. "Background A · Wide Kamar" or "Background B · Meja Dekat Jendela"'),
                    prompt: str('Detailed Imperfection First English prompt for this empty background angle (NO people)'),
                  },
                  required: ['label', 'prompt'],
                  additionalProperties: false,
                },
              },
            },
            additionalProperties: false,
          },
          productSubProps: {
            type: 'object',
            description: 'Sub-prop states A/B/C merged into the selected Hero Product Props folder (e.g. opened tub showing powder, scooped powder, poured into shaker)',
            properties: {
              productName: str('Exact name of the selected hero product'),
              shots: {
                type: 'array',
                description: '1–2 tactile sub-prop shots of the hero product (e.g. opened lid, scooping powder)',
                items: {
                  type: 'object',
                  properties: {
                    label: str('e.g. "Prop B · Tutup Dibuka" or "Prop C · Disekop"'),
                    prompt: str('Detailed Imperfection First English close-up prompt preserving the exact product packaging'),
                  },
                  required: ['label', 'prompt'],
                  additionalProperties: false,
                },
              },
            },
            additionalProperties: false,
          },
          extraProps: {
            type: 'array',
            description: '0–2 standalone extra prop folders (e.g. "Skop Whey", "Shaker Bening") so each can be @mentioned separately in Canvas',
            items: {
              type: 'object',
              properties: {
                name: str('Short prop folder name, e.g. "Skop Whey" or "Shaker Bening"'),
                description: str('Brief visual description of the prop'),
                prompt: str('Detailed Imperfection First English close-up prompt of this prop on a lived-in surface'),
              },
              required: ['name', 'prompt'],
              additionalProperties: false,
            },
          },
        },
        additionalProperties: false,
      },
      avatarProfile: {
        type: 'object',
        description: 'Character consistency profile when actionType is generate_brand_avatar (auto-saved to My Brand -> Avatars)',
        properties: {
          name: str('Creator / avatar name, e.g. "Raka" or "Nadia — UGC Host"'),
          appearance: str('Age, hair, natural everyday look, skin texture (Imperfection First)'),
          wardrobe: str('Consistent casual everyday outfit'),
          voiceStyle: str('Speaking pace, Indonesian casual tone, vibe'),
          lighting: str('Consistent natural lighting style, e.g. "Soft side window daylight"'),
          setting: str('Consistent lived-in Indonesian location, e.g. "Modest Jakarta bedroom / gym corner"'),
        },
        additionalProperties: false,
      },
      metaCampaign: {
        type: 'object',
        description: 'Optional Meta Ads paused campaign parameters when actionType is launch_meta_campaign',
        properties: {
          accountId: str('Connected Meta ad account UUID'),
          name: str('Campaign name'),
          objective: str('OUTCOME_TRAFFIC | OUTCOME_ENGAGEMENT'),
          countries: arrStr('ISO country codes e.g. ["ID"]'),
          dailyBudgetMinor: num('Daily budget in currency minor unit'),
        },
        additionalProperties: false,
      },
    },
    ['actionType', 'title', 'description', 'estimatedCredits'],
  ),
  toolDef(
    'update_my_brand',
    'Directly update or enrich My Brand (add/update a Competitor or Product subpage with official website URL, or append verified audience/selling points) and log the update under Ad Agent in My Brand History.',
    {
      summary: str('Short change summary for History drawer, e.g. "Added Optimum Nutrition ad angles & website"'),
      subpage: {
        type: 'object',
        description: 'Optional Product or Competitor subpage to create or update',
        properties: {
          parent: { type: 'string', enum: ['products', 'competitors', 'overview', 'audience', 'messaging'] },
          title: str('Subpage title, e.g. "Muscle First" or "New Evowhey"'),
          subtitle: str('One-line subtitle'),
          url: str('Official HTTPS website URL if known'),
          blocks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                type: { type: 'string', enum: ['heading', 'paragraph', 'bullets'] },
                text: str('Text for heading or paragraph'),
                items: arrStr('Items for bullets block'),
              },
              required: ['type'],
              additionalProperties: false,
            },
          },
        },
        required: ['parent', 'title'],
        additionalProperties: false,
      },
      fieldPatch: {
        type: 'object',
        description: 'Optional top-level My Brand fields to enrich',
        properties: {
          compareAgainst: str('Updated competitor battlecard'),
          leadWith: str('Updated lead product rule'),
          sellingPoints: arrStr('New selling points to append'),
          claimsToAvoid: arrStr('New guardrails to append'),
          competitors: arrStr('New competitors to append'),
        },
        additionalProperties: false,
      },
    },
    ['summary'],
  ),
  toolDef(
    'audit_ad_account_performance',
    'Inspect connected Meta Ads accounts (spend, impressions, clicks, CPC, CPM, CTR, active vs paused campaigns) and connected TikTok accounts to diagnose performance anomalies, CPA spikes, or creative fatigue.',
    {
      period: { type: 'string', enum: ['last_7d', 'last_30d', 'this_month'], description: 'Reporting window, default last_7d' },
    },
    [],
  ),
  toolDef(
    'create_marketing_routine',
    'Create a recurring scheduled Routine (e.g. weekly competitor radar, Monday performance audit, daily brief) that appears in the Routines sidebar and can be run on schedule or on demand.',
    {
      title: str('Short routine name, e.g. "Weekly Competitor Radar"'),
      prompt: str('Plain-language instruction the agent should execute each time this routine runs'),
      cadence: { type: 'string', enum: ['daily', 'weekdays', 'weekly', 'manual'] },
      scheduleLabel: str('Human-readable schedule, e.g. "Every Monday · 09:00"'),
      requireApproval: { type: 'boolean', description: 'True to require approval before paid/external actions (default true)' },
    },
    ['title', 'prompt', 'cadence', 'scheduleLabel'],
  ),
];

function buildSystemPrompt({ contextText, scrapeAtlasReady, videoModel = DEFAULT_VIDEO_MODEL, skillsText = '' }) {
  return [
    'You are **Nexoclip Ad Agent** — a senior Creative Marketer, Performance Strategist, and Ad Producer working directly inside Nexoclip Studio.',
    'Your job is not just to chat, but to run live ad research, build sharp strategies, draft storyboards & campaigns, propose visual pre-production & video renders via Approval Cards, update My Brand, and schedule recurring Routines.',
    '',
    `Current target video model: **${videoModel}** — tailor every \`visualPrompt\` for optimal results on ${videoModel}.`,
    '',
    '### MANDATORY LANGUAGE RULE (STRICT):',
    '- **ALWAYS write 100% of your responses, Markdown tables, callouts, storyboards, campaign plans, approval card titles/descriptions, spoken scripts, and My Brand updates in crisp, natural, strategic ENGLISH** — EVEN IF the brand website, product names, or user message is written in Indonesian or another language!',
    '- Keep exact brand names, product names, certifications (e.g. BPOM, Halal), and local currency prices (e.g. Rp 396.000) verbatim, while writing all copy, strategy, dialogue inside `{...}`, and UI labels in English (only switch `{...}` spoken dialogue to another language if the user explicitly asks for that specific spoken language).',
    '',
    '### Core Operating Principles:',
    '1. **Adaptive & Action-Oriented:** When the user objective is clear (research, strategy, UGC ad, ad clone, campaign, or avatar), execute multi-step tools immediately to produce Persistent Artifacts / Storyboards / Approval Cards. Only call `ask_clarifying_questions` (max 2–3 clickable questions) when the brief is genuinely ambiguous (e.g. "make an ad" with no product or format specified across multiple products).',
    '2. **Grounded in Real Data:** For trend, competitor, or ad research, call ScrapeAtlas tools (`search_meta_ads`, `search_tiktok_videos`, `get_tiktok_top_ads`, `get_tiktok_transcript`, `search_instagram_posts`, `search_tiktok_shop`). For ad account audits, call `audit_ad_account_performance`. When a winning Meta Ad (`runningDays >= 14`) has a `videoUrl`, you may call `watch_reference_video` to dissect its visual hook.',
    scrapeAtlasReady
      ? '   (ScrapeAtlas LIVE is enabled — always ground competitor/ad insights in real tool data; never invent ad metrics.)'
      : '   (Note: SCRAPEATLAS_API_KEY is not configured — be transparent if research tools return a config error, then strategize using Brand & Product context.)',
    '3. **Clean Editorial & Interactive Chat Output (NEVER mention a right-side panel):**',
    '   - Use **Markdown Tables** (`| Column 1 | Column 2 | ... |`) for competitor comparisons, winning hooks, metric benchmarks, or angle breakdowns.',
    '   - Use **Markdown Blockquotes (`> ...`)** for executive summaries, key takeaways, or "Next Steps" callouts (rendered as clean rounded gray insight bubbles).',
    '   - When presenting 2–3 creative concepts/angles/hooks to choose from, CALL **`present_creative_options`** to render clickable option cards inline.',
    '   - At the end of strategy/analysis (or when clarifying), you may call **`ask_clarifying_questions`** to show an interactive Option Picker Card.',
    '   - Finished research? Always call `save_research_report` (rendered inline) and summarize key takeaways with a table + blockquote.',
    '   - Creating a video ad concept (UGC, Launch, Ad Clone, Script)? Call `create_storyboard` so the timestamped storyboard table (`Time | Visual | On-Screen Text`) renders cleanly in chat.',
    '   - Asked for a multi-day campaign (7/14/30 days)? ALWAYS call `save_campaign_draft` with OpenMontage Seedance 2.5 `visualPrompt`s — rendered as an **Inline Campaign Table** with 1-click **Open in Canvas**.',
    '   - **AUTONOMOUS PRE-PRODUCTION FIRST (`generate_scene_kit`) — ZERO TECHNICAL EFFORT FOR THE USER:** The user does NOT need to mention avatars, backgrounds, sub-props, or scoops! Whenever the user simply asks something like *"make a 30s UGC ad for New Evowhey"*, proactively act as a senior Ad Producer and emit **2 sequential Approval Cards** (alongside `create_storyboard`):\n     • **Step 1 (`actionType: "generate_scene_kit"`):** Automatically design the complete visual reference pack tailored to the product category:\n       1) **Avatar (`sceneKit.avatar`)**: If `MY BRAND` has NO saved avatar yet, automatically create 1 relatable everyday creator persona (*Imperfection First*, generated via **AI Influencer `nano-banana-pro`** & auto-saved to My Brand → Avatars). If My Brand already has a saved avatar, reuse it and omit `sceneKit.avatar`.\n       2) **Background / Location (`sceneKit.location` — Angles A/B)**: 2 natural empty lived-in room/setting angles matching the product (e.g. Angle A: wide room/kitchen, Angle B: desk/counter by natural window light — NO people).\n       3) **Product Sub-Props (`sceneKit.productSubProps` — States B/C)**: 1–2 physical usage states of ONLY the user-selected product (e.g. whey protein → lid opened showing powder & powder being scooped; skincare → dropper opened & texture on skin; beverage → opened & poured) — automatically merged into the single `@Product` folder alongside the original product photo!\n       4) **Extra Props (`sceneKit.extraProps`)**: 1 standalone supporting prop needed by the scene (e.g. `@Clear-Shaker` / `@Whey-Scoop`) so it can be `@mentioned` directly in Canvas.\n     • **Step 2 (`actionType: "generate_video"`):** Director-grade Seedance 2.5 Omni prompt referencing the exact `@Avatar`, `@Location`, `@Product`, and `@ExtraProp` from Step 1!\n     (CRITICAL: Use ONLY the product(s) the user selected or named — NEVER include or mention unrelated products from My Brand!)',
    '   - **Standalone Brand Avatar ("Imperfection First" via AI Influencer / Nano Banana Pro):** If the user specifically asks to create a brand avatar only, propose 2–3 relatable creator personas via `present_creative_options` or emit `propose_creative_production` with `actionType: "generate_brand_avatar"` + full `avatarProfile`. Once approved, it generates via **AI Influencer (`nano-banana-pro`)**, auto-saves to **My Brand → Avatars**, and auto-inserts into Canvas **Characters**.',
    '   - **"IMPERFECTION FIRST" REALISM FOR ALL VIDEO PROMPTS (NOT JUST AVATARS):** Every `visualPrompt` (`save_campaign_draft`, `create_storyboard`, `generate_video`) MUST follow: (1) handheld smartphone selfie/POV angle with subtle organic micro-shake & natural window daylight (never stiff studio lighting), (2) strict character & product consistency using `@AvatarName` + `@ProductName`, (3) **Hook → Problem/Solution → Tactile Product Demo → Natural CTA** structure with explicit camera direction & timestamps, (4) spoken dialogue ONLY inside `{...}` with ZERO speaker labels inside `{...}`, and (5) explicit **`NEGATIVE / AVOID:`** rejecting `studio lighting, stock photo, over-polished, airbrushed plastic skin, stiff ad pose, on-screen text overlays`.',
    '   - Before generating paid media (scene kit, avatar, keyframe, ElevenLabs voiceover, BGM, `.mp4` video render) or launching Meta Ads, ALWAYS call `propose_creative_production` so a Human-in-the-Loop **Approval Card** appears. On **Approve & Run**, `generate_video` queues a real render on `' + videoModel + '` with inline `<video>` playback + **Open in Canvas**.',
    '   - Asked for recurring schedules (e.g. "every Monday check competitors")? Call `create_marketing_routine`.',
    '   - User shares a permanent preference? Call `remember_brand_preference`. At the start of a new session, call `rename_session` (in English).',
    '4. **Respect Brand Guardrails:** Strictly follow `Claims to Avoid`, brand tone, target audience, and `Brand Memory` below.',
    '',
    skillsText,
    '',
    '--- WORKSPACE CONTEXT ---',
    contextText || 'No Brand Kit or products configured yet.',
  ].filter(Boolean).join('\n');
}

function toolLabel(name, args = {}) {
  switch (name) {
    case 'rename_session': return `Naming session "${args.title || ''}"`;
    case 'search_meta_ads': return `Searching Meta Ads (${args.country || 'ID'}): "${args.query || ''}"`;
    case 'get_meta_ad_transcript': return `Transcribing Meta Ad #${args.adId || ''}`;
    case 'search_tiktok_videos': return `Researching TikTok videos (${args.region || 'ID'}): "${args.query || ''}"`;
    case 'get_tiktok_transcript': return `Analyzing TikTok transcript & 0–3s hook`;
    case 'get_tiktok_top_ads': return `Fetching TikTok Top Ads & CTR (${args.country || 'ID'})`;
    case 'search_instagram_posts': return `Searching Instagram references: "${args.query || ''}"`;
    case 'search_tiktok_shop': return `Researching TikTok Shop products: "${args.query || ''}"`;
    case 'watch_reference_video': return `Watching competitor video visuals (1 fps)`;
    case 'save_research_report': return `Saving Research Report: "${args.title || ''}"`;
    case 'save_creative_strategy': return `Saving Creative Strategy: "${args.title || ''}"`;
    case 'save_campaign_draft': return `Building Campaign Plan: "${args.title || ''}"`;
    case 'remember_brand_preference': return `Saving to Brand Memory (${args.category || 'preference'})`;
    case 'ask_clarifying_questions': return `Preparing quick clarifying options`;
    case 'present_creative_options': return `Drafting creative concept options`;
    case 'create_storyboard': return `Building Storyboard: "${args.title || ''}"`;
    case 'propose_creative_production': return `Preparing Approval Card: "${args.title || args.actionType || ''}"`;
    case 'update_my_brand': return `Updating My Brand: "${args.summary || ''}"`;
    case 'audit_ad_account_performance': return `Auditing ad account performance (${args.period || 'last_7d'})`;
    case 'create_marketing_routine': return `Creating scheduled Routine: "${args.title || ''}"`;
    default: return `Running ${name}`;
  }
}

async function callMarketingLlm({ system, messages, tools, modelOverride = null, env = process.env, fetchImpl = fetch }) {
  const requested = typeof modelOverride === 'string' && ALLOWED_LLM_MODELS.has(modelOverride.trim())
    ? modelOverride.trim()
    : null;
  const model = requested || env.MARKETING_AGENT_MODEL || MARKETING_MODEL;
  const useBytePlus = isBytePlusModel(model);

  let endpointUrl;
  let apiKey;
  let payload;
  const headers = { 'Content-Type': 'application/json' };

  if (useBytePlus) {
    apiKey = env.BYTEPLUS_API_KEY;
    const baseUrl = String(env.BYTEPLUS_BASE_URL || DEFAULT_BYTEPLUS_URL).replace(/\/+$/, '');
    if (!apiKey) {
      throw Object.assign(new Error('BYTEPLUS_API_KEY belum dikonfigurasi di server.'), { status: 503 });
    }
    endpointUrl = `${baseUrl}/chat/completions`;
    headers.Authorization = `Bearer ${apiKey}`;
    payload = {
      model,
      max_tokens: 6000,
      reasoning_effort: 'low',
      messages: [{ role: 'system', content: system }, ...messages],
      tools,
      tool_choice: 'auto',
    };
  } else {
    apiKey = env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw Object.assign(new Error('OPENROUTER_API_KEY belum dikonfigurasi di server.'), { status: 503 });
    }
    endpointUrl = OPENROUTER_URL;
    headers.Authorization = `Bearer ${apiKey}`;
    headers['X-Title'] = 'Nexoclip AI Creative Marketing';
    payload = {
      model,
      max_tokens: 6000,
      usage: { include: true },
      messages: [
        { role: 'system', content: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] },
        ...messages,
      ],
      tools,
      tool_choice: 'auto',
    };
  }

  const response = await fetchImpl(endpointUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const body = await response.json().catch(() => null);
  if (!response.ok || !body) {
    throw Object.assign(
      new Error(body?.error?.message || `LLM provider returned HTTP ${response.status}`),
      { status: 502 },
    );
  }
  const msg = body.choices?.[0]?.message || {};
  const text = typeof msg.content === 'string' ? msg.content : '';
  const toolCalls = (msg.tool_calls || []).map((tc) => ({
    id: tc.id,
    name: tc.function?.name,
    arguments: tc.function?.arguments || '{}',
  }));
  return {
    text,
    toolCalls,
    rawMessage: {
      role: 'assistant',
      content: text || null,
      ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls } : {}),
    },
    usage: body.usage || {},
  };
}

async function downloadVideoAsDataUrl(rawUrl, fetchImpl = fetch) {
  const MAX_BYTES = 20 * 1024 * 1024;
  const res = await fetchImpl(rawUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      Accept: 'video/mp4,video/*;q=0.9,*/*;q=0.5',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`CDN HTTP ${res.status}`);
  const contentType = (res.headers.get('content-type') || 'video/mp4').split(';')[0].trim();
  if (!contentType.startsWith('video/') && contentType !== 'application/octet-stream') {
    throw new Error(`Not a video (${contentType})`);
  }
  const reader = res.body?.getReader?.();
  if (!reader) {
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new Error('Video terlalu besar (>20MB)');
    return `data:${contentType.startsWith('video/') ? contentType : 'video/mp4'};base64,${buf.toString('base64')}`;
  }
  const chunks = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_BYTES) {
      reader.cancel().catch(() => {});
      throw new Error('Video terlalu besar (>20MB)');
    }
    chunks.push(value);
  }
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  const mime = contentType.startsWith('video/') ? contentType : 'video/mp4';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

export async function runMarketingAgentTurn({
  workspaceId,
  userId,
  thread,
  userMessage,
  mode = 'agent',
  brandContextEnabled = true,
  selectedProductIds = [],
  contextRefs = [],
  llmModel = null,
  videoModel = DEFAULT_VIDEO_MODEL,
  skillId = null,
  onEvent = () => {},
  deps = {},
}) {
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || fetch;
  const research = deps.researchProvider || createResearchProvider({ env, fetchImpl });
  const loadCtx = deps.loadWorkspaceMarketingContext || loadWorkspaceMarketingContext;
  const callModel = deps.callModel || ((opts) => callMarketingLlm({ ...opts, modelOverride: llmModel, env, fetchImpl }));
  const saveArt = deps.saveArtifact || saveArtifact;
  const createCamp = deps.createCampaignWithDeliverables || createCampaignWithDeliverables;
  const createMem = deps.createBrandMemory || createBrandMemory;
  const updThread = deps.updateThread || updateThread;
  const watchVideo = deps.analyzeVideo || analyzeVideo;
  const createAppr = deps.createApproval || createApproval;
  const createRout = deps.createRoutine || createRoutine;
  const updateBrand = deps.updateMyBrandFromAgent || updateMyBrandFromAgent;
  const auditAds = deps.auditWorkspaceAdAccounts || auditWorkspaceAdAccounts;

  const activities = [];
  const emitStep = (step) => {
    const idx = activities.findIndex((a) => a.id === step.id);
    if (idx >= 0) activities[idx] = { ...activities[idx], ...step };
    else activities.push(step);
    onEvent({ type: 'step', step: activities[idx >= 0 ? idx : activities.length - 1] });
  };

  // Step 0: Load Brand, Products, and Memory context
  const cleanContextRefs = Array.isArray(contextRefs)
    ? contextRefs
        .slice(0, 20)
        .map((r) => ({
          id: String(r?.id || '').slice(0, 120),
          label: String(r?.label || '').slice(0, 120),
          path: String(r?.path || r?.label || '').slice(0, 160),
          content: String(r?.content || '').slice(0, 3000),
        }))
        .filter((r) => r.label || r.content)
    : [];

  const ctxStepId = `ctx-${Date.now()}`;
  emitStep({ id: ctxStepId, tool: 'context', label: 'Reading My Brand, Products & Brand Memory', status: 'running' });
  const ctx = await loadCtx({
    workspaceId,
    selectedProductIds,
    includeBrand: brandContextEnabled,
  });
  ctx.contextRefs = cleanContextRefs;
  const ctxDetail = [
    cleanContextRefs.length && !brandContextEnabled
      ? `Partial context: ${cleanContextRefs.map((r) => r.path || r.label).slice(0, 3).join(', ')}${cleanContextRefs.length > 3 ? ` +${cleanContextRefs.length - 3}` : ''}`
      : ctx.brandKit?.brandName
        ? `Brand: ${ctx.brandKit.brandName}`
        : 'Tanpa Brand Kit',
    cleanContextRefs.length && brandContextEnabled ? `${cleanContextRefs.length} context dipin` : null,
    !cleanContextRefs.length
      ? ctx.selectedProducts?.length
        ? `${ctx.selectedProducts.length} produk dipilih`
        : `${ctx.products?.length || 0} produk di katalog`
      : null,
    `${ctx.memories?.length || 0} brand memory`,
  ]
    .filter(Boolean)
    .join(' · ');
  emitStep({ id: ctxStepId, status: 'done', detail: ctxDetail });

  // Build compact history for LLM (last 16 messages)
  const priorMessages = Array.isArray(thread?.messages_json) ? thread.messages_json : [];
  const activeSkills = pickMarketingSkills({ message: userMessage, history: priorMessages, explicitSkillId: skillId });
  if (activeSkills.length) {
    emitStep({
      id: `skills-${Date.now()}`,
      tool: 'skills',
      label: `Activating Skill Playbook`,
      status: 'done',
      detail: activeSkills.map((s) => `${s.name} (${s.badge})`).join(' + '),
    });
  }

  const system = buildSystemPrompt({
    contextText: formatContextForPrompt(ctx),
    scrapeAtlasReady: research.isConfigured(),
    videoModel: String(videoModel || DEFAULT_VIDEO_MODEL).slice(0, 60),
    skillsText: formatSkillsForPrompt(activeSkills),
  });

  const llmMessages = [
    ...priorMessages
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
      .slice(-16)
      .map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];

  const createdArtifacts = [];
  const createdCampaigns = [];
  const createdMemories = [];
  const createdApprovals = [];
  const createdRoutines = [];
  let clarifyingQuestions = [];
  let creativeOptions = [];
  let inlineStoryboard = null;
  let activeCampaignId = thread?.linked_campaign_id || null;
  let updatedTitle = thread?.title || 'New Marketing Session';
  let transcriptCalls = 0;
  let videoWatchCalls = 0;
  let finalReply = '';

  for (let stepIdx = 0; stepIdx < MAX_STEPS; stepIdx += 1) {
    const res = await callModel({ system, messages: llmMessages, tools: MARKETING_TOOLS });
    llmMessages.push(res.rawMessage);

    if (!res.toolCalls.length) {
      finalReply = res.text.trim() || 'Selesai diproses. Cek panel artifact di sebelah kanan ya.';
      break;
    }

    for (const tc of res.toolCalls) {
      let args = {};
      try {
        args = JSON.parse(tc.arguments || '{}');
      } catch {
        args = {};
      }
      const stepId = tc.id || `tool-${stepIdx}-${tc.name}`;
      emitStep({ id: stepId, tool: tc.name, label: toolLabel(tc.name, args), status: 'running' });

      let toolOutput;
      try {
        switch (tc.name) {
          case 'rename_session': {
            updatedTitle = String(args.title || updatedTitle).trim().slice(0, 140) || updatedTitle;
            if (thread?.id) await updThread(workspaceId, thread.id, { title: updatedTitle });
            onEvent({ type: 'title', title: updatedTitle });
            toolOutput = { ok: true, title: updatedTitle };
            emitStep({ id: stepId, status: 'done', detail: updatedTitle });
            break;
          }
          case 'search_meta_ads': {
            const out = await research.searchMetaAds(args);
            toolOutput = out;
            const winners = (out.ads || []).filter((a) => a.likelyWinner).length;
            emitStep({
              id: stepId,
              status: out.ok ? 'done' : 'error',
              detail: out.ok
                ? `${out.ads.length} iklan (${winners} running ≥14 hari)${out.cached ? ' · cache' : ''}`
                : out.error,
            });
            break;
          }
          case 'get_meta_ad_transcript': {
            if (transcriptCalls >= 3) {
              toolOutput = { ok: false, error: 'Batas maksimal 3 transcript per giliran tercapai.' };
              emitStep({ id: stepId, status: 'done', detail: 'Skipped (cap 3/turn)' });
              break;
            }
            transcriptCalls += 1;
            const out = await research.getMetaAdTranscript(args);
            toolOutput = out;
            emitStep({
              id: stepId,
              status: out.ok ? 'done' : 'error',
              detail: out.ok ? (out.transcript ? `${out.transcript.length} karakter` : 'Tidak ada audio bicara') : out.error,
            });
            break;
          }
          case 'search_tiktok_videos': {
            const out = await research.searchTikTokVideos(args);
            toolOutput = out;
            emitStep({
              id: stepId,
              status: out.ok ? 'done' : 'error',
              detail: out.ok ? `${out.videos.length} video ditemukan${out.cached ? ' · cache' : ''}` : out.error,
            });
            break;
          }
          case 'get_tiktok_transcript': {
            if (transcriptCalls >= 3) {
              toolOutput = { ok: false, error: 'Batas maksimal 3 transcript per giliran tercapai.' };
              emitStep({ id: stepId, status: 'done', detail: 'Skipped (cap 3/turn)' });
              break;
            }
            transcriptCalls += 1;
            const out = await research.getTikTokTranscript(args);
            toolOutput = out;
            emitStep({
              id: stepId,
              status: out.ok ? 'done' : 'error',
              detail: out.ok
                ? out.firstThreeSeconds
                  ? `Hook 0–3s: "${out.firstThreeSeconds.slice(0, 60)}"`
                  : 'Transcript terekstrak'
                : out.error,
            });
            break;
          }
          case 'get_tiktok_top_ads': {
            const out = await research.getTikTokTopAds(args);
            toolOutput = out;
            emitStep({
              id: stepId,
              status: out.ok ? 'done' : 'error',
              detail: out.ok ? `${out.ads.length} Top Ads${out.cached ? ' · cache' : ''}` : out.error,
            });
            break;
          }
          case 'search_instagram_posts': {
            const out = await research.searchInstagramPosts(args);
            toolOutput = out;
            emitStep({
              id: stepId,
              status: out.ok ? 'done' : 'error',
              detail: out.ok ? `${out.posts.length} post/Reels${out.cached ? ' · cache' : ''}` : out.error,
            });
            break;
          }
          case 'search_tiktok_shop': {
            const out = await research.searchTikTokShop(args);
            toolOutput = out;
            emitStep({
              id: stepId,
              status: out.ok ? 'done' : 'error',
              detail: out.ok ? `${out.products.length} produk${out.cached ? ' · cache' : ''}` : out.error,
            });
            break;
          }
          case 'watch_reference_video': {
            if (videoWatchCalls >= 2) {
              toolOutput = { ok: false, error: 'Batas maksimal 2 analisis video visual per giliran tercapai.' };
              emitStep({ id: stepId, status: 'done', detail: 'Skipped (cap 2/turn)' });
              break;
            }
            videoWatchCalls += 1;
            const question = [
              'Analyze this ad/reference video for a creative marketing strategist in Indonesian.',
              'Cover: 1) Visual hook in the first 3 seconds, 2) Shot rhythm & camera style, 3) Product demo & visual proof, 4) On-screen text & CTA.',
              args.focus ? `Specific focus: ${args.focus}` : '',
              'Be concrete and concise (max 220 words).',
            ]
              .filter(Boolean)
              .join(' ');
            const isProtectedCdn = /fbcdn\.net|tiktokcdn|cdninstagram|scontent/i.test(String(args.url || ''));
            let targetUrl = args.url;
            let out = null;
            try {
              if (isProtectedCdn) {
                targetUrl = await downloadVideoAsDataUrl(args.url, fetchImpl);
              }
              out = await watchVideo({ url: targetUrl, question, env, fetchImpl });
            } catch (firstErr) {
              if (!isProtectedCdn && !String(targetUrl).startsWith('data:')) {
                try {
                  const inlineDataUrl = await downloadVideoAsDataUrl(args.url, fetchImpl);
                  out = await watchVideo({ url: inlineDataUrl, question, env, fetchImpl });
                } catch {
                  out = null;
                }
              }
              if (!out) {
                toolOutput = {
                  ok: false,
                  error: 'Video CDN tidak dapat diakses (403/expired). Gunakan get_meta_ad_transcript atau ad copy sebagai pengganti.',
                  detail: firstErr?.message || 'CDN unavailable',
                };
                emitStep({ id: stepId, status: 'done', detail: 'CDN video diblokir — lanjut via transcript/copy' });
                break;
              }
            }
            toolOutput = { ok: true, analysis: out.text };
            emitStep({ id: stepId, status: 'done', detail: 'Visual hook & pacing teranalisis' });
            break;
          }
          case 'save_research_report': {
            const artifact = await saveArt({
              workspaceId,
              ownerId: userId,
              campaignId: activeCampaignId,
              threadId: thread?.id || null,
              type: 'research_report',
              title: args.title,
              summary: args.summary,
              data: {
                marketInsights: args.marketInsights || [],
                winningHooks: args.winningHooks || [],
                creativeOpportunities: args.creativeOpportunities || [],
                references: args.references || [],
              },
            });
            createdArtifacts.push(artifact);
            onEvent({ type: 'artifact', artifact });
            toolOutput = { ok: true, artifactId: artifact.id, type: artifact.type, title: artifact.title };
            emitStep({ id: stepId, status: 'done', detail: 'Tersimpan di Artifacts' });
            break;
          }
          case 'save_creative_strategy': {
            const artifact = await saveArt({
              workspaceId,
              ownerId: userId,
              campaignId: activeCampaignId,
              threadId: thread?.id || null,
              type: 'creative_strategy',
              title: args.title,
              summary: args.summary,
              data: {
                targetAudience: args.targetAudience || '',
                corePositioning: args.corePositioning || '',
                painPoints: args.painPoints || [],
                angles: args.angles || [],
                ctaDirection: args.ctaDirection || [],
                doAndDonts: args.doAndDonts || [],
              },
            });
            createdArtifacts.push(artifact);
            onEvent({ type: 'artifact', artifact });
            toolOutput = { ok: true, artifactId: artifact.id, type: artifact.type, title: artifact.title };
            emitStep({ id: stepId, status: 'done', detail: 'Tersimpan di Artifacts' });
            break;
          }
          case 'save_campaign_draft': {
            const campaign = await createCamp({
              workspaceId,
              ownerId: userId,
              title: args.title,
              objective: args.objective,
              productIds: selectedProductIds,
              platforms: args.platforms || ['tiktok', 'instagram'],
              durationDays: args.durationDays || (args.deliverables?.length || 7),
              summary: { overview: args.summary || '' },
              deliverables: (args.deliverables || []).map((d) => ({
                dayIndex: d.dayIndex,
                title: d.title,
                platform: d.platform,
                format: d.format,
                hook: d.hook,
                angle: d.angle,
                cta: d.cta || '',
                script: {
                  visualPrompt: d.visualPrompt || '',
                  voiceover: d.voiceover || '',
                },
              })),
            });
            activeCampaignId = campaign.id;
            createdCampaigns.push(campaign);
            if (thread?.id) await updThread(workspaceId, thread.id, { linkedCampaignId: campaign.id });
            onEvent({ type: 'campaign', campaign });
            toolOutput = {
              ok: true,
              campaignId: campaign.id,
              title: campaign.title,
              deliverableCount: campaign.deliverables.length,
            };
            emitStep({
              id: stepId,
              status: 'done',
              detail: `${campaign.deliverables.length} deliverables siap (Open in Canvas ready)`,
            });
            break;
          }
          case 'remember_brand_preference': {
            const memory = await createMem({
              workspaceId,
              ownerId: userId,
              category: args.category,
              content: args.content,
              sourceType: 'agent',
              sourceId: thread?.id || null,
            });
            createdMemories.push(memory);
            onEvent({ type: 'memory', memory });
            toolOutput = { ok: true, memoryId: memory.id };
            emitStep({ id: stepId, status: 'done', detail: memory.content.slice(0, 70) });
            break;
          }
          case 'ask_clarifying_questions': {
            const qs = Array.isArray(args.questions)
              ? args.questions
                  .slice(0, 3)
                  .map((q) => ({
                    question: String(q?.question || '').trim().slice(0, 200),
                    options: Array.isArray(q?.options)
                      ? q.options.map((o) => String(o || '').trim().slice(0, 80)).filter(Boolean).slice(0, 5)
                      : [],
                  }))
                  .filter((q) => q.question && q.options.length > 0)
              : [];
            clarifyingQuestions = qs;
            onEvent({ type: 'clarifying', questions: qs });
            toolOutput = { ok: true, presentedCount: qs.length };
            emitStep({ id: stepId, status: 'done', detail: `${qs.length} pilihan ditampilkan` });
            break;
          }
          case 'present_creative_options': {
            const opts = Array.isArray(args.options)
              ? args.options
                  .slice(0, 4)
                  .map((o, idx) => ({
                    id: `opt-${idx + 1}`,
                    badge: String(o?.badge || `Option ${idx + 1}`).trim().slice(0, 40),
                    headline: String(o?.headline || o?.title || '').trim().slice(0, 160),
                    title: String(o?.headline || o?.title || '').trim().slice(0, 160),
                    tags: Array.isArray(o?.tags)
                      ? o.tags.map((t) => String(t || '').trim().slice(0, 28)).filter(Boolean).slice(0, 3)
                      : [],
                    description: String(o?.description || '').trim().slice(0, 360),
                    prompt: String(o?.prompt || '').trim().slice(0, 400),
                  }))
                  .filter((o) => o.headline)
              : [];
            creativeOptions = opts;
            onEvent({ type: 'creative_options', options: opts });
            toolOutput = { ok: true, optionCount: opts.length };
            emitStep({ id: stepId, status: 'done', detail: `${opts.length} kartu konsep siap dipilih` });
            break;
          }
          case 'create_storyboard': {
            inlineStoryboard = {
              title: String(args.title || 'Ad Storyboard').trim().slice(0, 140),
              aspectRatio: String(args.aspectRatio || '9:16').slice(0, 12),
              durationSeconds: Number(args.durationSeconds) || 30,
              conceptSummary: String(args.conceptSummary || '').trim().slice(0, 800),
              voiceoverScript: String(args.voiceoverScript || '').trim().slice(0, 2000),
              musicDirection: String(args.musicDirection || '').trim().slice(0, 400),
              shots: Array.isArray(args.shots)
                ? args.shots.slice(0, 12).map((s) => ({
                    time: String(s?.time || '').trim().slice(0, 30),
                    visual: String(s?.visual || '').trim().slice(0, 400),
                    onScreenText: String(s?.onScreenText || '').trim().slice(0, 240),
                  }))
                : [],
            };
            onEvent({ type: 'storyboard', storyboard: inlineStoryboard });
            toolOutput = { ok: true, shotCount: inlineStoryboard.shots.length };
            emitStep({ id: stepId, status: 'done', detail: `${inlineStoryboard.shots.length} shots drafted` });
            break;
          }
          case 'propose_creative_production': {
            const hasSceneKitInHistory = Array.isArray(thread?.messages_json)
              && thread.messages_json.some((m) =>
                Array.isArray(m?.approvalRefs)
                && m.approvalRefs.some((r) => r?.action_type === 'generate_scene_kit' && r?.status !== 'rejected'),
              );
            const hasSceneKitInTurn = createdApprovals.some((a) => a?.action_type === 'generate_scene_kit');
            const userSkippedPreProd = /\b(skip pre-?prod|no pre-?prod|without scene kit|direct render|langsung render|tanpa asset pack)\b/i.test(
              String(userMessage || ''),
            );

            if (
              args.actionType === 'generate_video'
              && !hasSceneKitInHistory
              && !hasSceneKitInTurn
              && !userSkippedPreProd
              && !args.firstFrameUrl
            ) {
              toolOutput = {
                ok: false,
                blocked: true,
                reason: 'PREPRODUCTION_REQUIRED',
                instruction:
                  'STOP: Before proposing generate_video, you MUST FIRST call propose_creative_production with actionType="generate_scene_kit" (Step 1 · Pre-Production Visual Pack) containing: (1) avatar (if My Brand has no saved avatar yet), (2) location with 2 empty natural daylight background angles A/B, (3) productSubProps with 1–2 tactile physical states (e.g. opened lid / scooping / pouring) for ONLY the selected hero product, and (4) 1 standalone extraProp (e.g. Clear Shaker or Whey Scoop) if needed by the shots. Call generate_scene_kit NOW, and then you may immediately call generate_video referencing those exact @Avatar, @Location, @Product, and @ExtraProp tags.',
              };
              emitStep({ id: stepId, status: 'done', detail: 'Enforcing Step 1 Pre-Production Pack first' });
              break;
            }

            let finalPrompt = args.prompt || '';
            const focusedProducts = selectRelevantProducts(ctx.products, {
              selectedProducts: ctx.selectedProducts,
              referenceText: `${args.title || ''} ${args.description || ''} ${finalPrompt} ${args.sceneKit?.productSubProps?.productName || ''}`,
            });
            const heroProd = focusedProducts[0] || null;
            const heroProdImageUrl =
              heroProd?.imageUrl ||
              heroProd?.image ||
              heroProd?.thumbnailUrl ||
              (Array.isArray(heroProd?.media) ? heroProd.media.find((m) => !m?.kind || m.kind === 'image')?.url : '') ||
              '';

            if (args.actionType === 'generate_video' && finalPrompt) {
              const prodTags = focusedProducts
                .map((p) => ({
                  name: p.name,
                  tag: String(p.name || '').trim().replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, ''),
                  type: 'prop',
                  description: p.advantages || p.description || '',
                }))
                .filter((p) => p.tag);
              const avTags = (Array.isArray(ctx.brandKit?.avatars) ? ctx.brandKit.avatars.slice(0, 1) : [])
                .map((a) => ({
                  name: a.name,
                  tag: String(a.name || '').trim().replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, ''),
                  type: 'character',
                  description: a.description || '',
                }))
                .filter((a) => a.tag);
              // Include planned @tags from Step 1 sceneKit if created in this turn
              const turnKit = createdApprovals.find((a) => a?.action_type === 'generate_scene_kit')?.payload_json?.sceneKit;
              const kitTags = [];
              if (turnKit?.avatar?.name && !avTags.length) {
                kitTags.push({
                  name: turnKit.avatar.name,
                  tag: String(turnKit.avatar.name).trim().replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, ''),
                  type: 'character',
                  description: turnKit.avatar.appearance || '',
                });
              }
              if (turnKit?.location?.name) {
                kitTags.push({
                  name: turnKit.location.name,
                  tag: String(turnKit.location.name).trim().replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, ''),
                  type: 'location',
                  description: turnKit.location.description || '',
                });
              }
              for (const ep of Array.isArray(turnKit?.extraProps) ? turnKit.extraProps : []) {
                if (!ep?.name) continue;
                kitTags.push({
                  name: ep.name,
                  tag: String(ep.name).trim().replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, ''),
                  type: 'prop',
                  description: ep.description || '',
                });
              }
              finalPrompt = await optimizeSeedancePrompt({
                rawPrompt: finalPrompt,
                title: args.title || 'Ad Video',
                format: args.description || 'UGC vertical video',
                durationSeconds: args.durationSeconds || 8,
                aspectRatio: args.aspectRatio || '9:16',
                brandKit: ctx.brandKit,
                folderTags: [...avTags, ...kitTags, ...prodTags],
                env,
                fetchImpl,
              });
            }
            const payload = {
              prompt: finalPrompt,
              text: args.text || '',
              voiceId: args.voiceId || '',
              aspectRatio: args.aspectRatio || (args.actionType === 'generate_brand_avatar' ? '3:4' : '9:16'),
              durationSeconds: args.durationSeconds || (args.actionType === 'generate_video' ? 8 : 25),
              duration: args.durationSeconds || (args.actionType === 'generate_video' ? 8 : undefined),
              resolution: args.resolution || '720p',
              generateAudio: args.generateAudio !== false,
              firstFrameUrl: args.firstFrameUrl || '',
              videoModel: String(videoModel || DEFAULT_VIDEO_MODEL),
              referenceImages: Array.isArray(args.referenceImages) ? args.referenceImages : [],
              ...(args.actionType === 'generate_scene_kit'
                ? {
                    sceneKit: args.sceneKit || {},
                    heroProductName: args.sceneKit?.productSubProps?.productName || heroProd?.name || '',
                    heroProductImageUrl: heroProdImageUrl,
                  }
                : {}),
              ...(args.avatarProfile && typeof args.avatarProfile === 'object' ? args.avatarProfile : {}),
              ...(args.metaCampaign && typeof args.metaCampaign === 'object' ? args.metaCampaign : {}),
            };
            const approval = await createAppr({
              workspaceId,
              threadId: thread?.id || null,
              ownerId: userId,
              actionType: args.actionType,
              title: args.title,
              description: args.description,
              estimatedCredits: args.estimatedCredits ?? 0,
              payload,
            });
            createdApprovals.push(approval);
            onEvent({ type: 'approval', approval });
            toolOutput = {
              ok: true,
              approvalId: approval.id,
              status: 'pending',
              estimatedCredits: approval.estimated_credits,
              note: 'Approval Card is now displayed in chat. Wait for the user to click Approve & Run before assets are generated.',
            };
            emitStep({
              id: stepId,
              status: 'done',
              detail: `Awaiting approval (~${approval.estimated_credits} credits)`,
            });
            break;
          }
          case 'update_my_brand': {
            const updated = await updateBrand({
              workspaceId,
              userId,
              summary: args.summary,
              fieldPatch: args.fieldPatch || {},
              subpage: args.subpage || null,
            });
            onEvent({ type: 'brand_updated', updatedPages: updated.updatedPages });
            toolOutput = { ok: true, updatedPages: updated.updatedPages.map((p) => p.title) };
            emitStep({
              id: stepId,
              status: 'done',
              detail: `${updated.updatedPages.length} halaman My Brand diperbarui (tercatat di History)`,
            });
            break;
          }
          case 'audit_ad_account_performance': {
            const audit = await auditAds({ workspaceId, period: args.period || 'last_7d', env });
            toolOutput = { ok: true, ...audit };
            emitStep({
              id: stepId,
              status: 'done',
              detail: `${audit.metaAccounts.length} Meta · ${audit.tiktokAccounts.length} TikTok`,
            });
            break;
          }
          case 'create_marketing_routine': {
            const routine = await createRout({
              workspaceId,
              ownerId: userId,
              title: args.title,
              prompt: args.prompt,
              cadence: args.cadence || 'weekly',
              scheduleLabel: args.scheduleLabel || 'Every Monday · 09:00',
              requireApproval: args.requireApproval !== false,
            });
            createdRoutines.push(routine);
            onEvent({ type: 'routine', routine });
            toolOutput = { ok: true, routineId: routine.id, title: routine.title, scheduleLabel: routine.schedule_label };
            emitStep({ id: stepId, status: 'done', detail: routine.schedule_label });
            break;
          }
          default: {
            toolOutput = { ok: false, error: `Unknown tool: ${tc.name}` };
            emitStep({ id: stepId, status: 'error', detail: 'Unknown tool' });
          }
        }
      } catch (err) {
        toolOutput = { ok: false, error: err?.message || 'Tool execution error' };
        emitStep({ id: stepId, status: 'error', detail: err?.message || 'Gagal' });
      }

      llmMessages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(toolOutput).slice(0, 14_000),
      });
    }
  }

  if (!finalReply) {
    finalReply = 'Riset dan konsep kreatif selesai — silakan pilih salah satu opsi di bawah atau klik lanjut untuk produksi.';
  }

  const now = new Date().toISOString();
  const nextMessages = [
    ...priorMessages,
    {
      id: `u-${Date.now()}`,
      role: 'user',
      content: userMessage,
      ...(cleanContextRefs.length
        ? { contextRefs: cleanContextRefs.map((r) => ({ id: r.id, label: r.label, path: r.path })) }
        : {}),
      createdAt: now,
    },
    {
      id: `a-${Date.now() + 1}`,
      role: 'assistant',
      content: finalReply,
      createdAt: now,
      activities,
      artifactRefs: createdArtifacts.map((a) => ({ id: a.id, type: a.type, title: a.title, summary: a.summary })),
      campaignRefs: createdCampaigns.map((c) => ({
        id: c.id,
        title: c.title,
        durationDays: c.duration_days,
        deliverableCount: c.deliverables?.length || 0,
      })),
      memoryRefs: createdMemories.map((m) => ({ id: m.id, category: m.category, content: m.content })),
      ...(clarifyingQuestions.length ? { clarifyingQuestions } : {}),
      ...(creativeOptions.length ? { creativeOptions } : {}),
      ...(inlineStoryboard ? { storyboard: inlineStoryboard } : {}),
      ...(createdApprovals.length ? { approvalRefs: createdApprovals } : {}),
      ...(createdRoutines.length ? { routineRefs: createdRoutines } : {}),
    },
  ];

  if (thread?.id) {
    await updThread(workspaceId, thread.id, {
      title: updatedTitle,
      mode,
      brandContextEnabled,
      selectedProductIds,
      linkedCampaignId: activeCampaignId,
      messages: nextMessages,
      activity: activities,
      status: 'idle',
    });
  }

  return {
    reply: finalReply,
    title: updatedTitle,
    activities,
    artifacts: createdArtifacts,
    campaigns: createdCampaigns,
    memories: createdMemories,
    approvals: createdApprovals,
    routines: createdRoutines,
    clarifyingQuestions,
    storyboard: inlineStoryboard,
    messages: nextMessages,
  };
}
