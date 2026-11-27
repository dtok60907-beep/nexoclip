import test from 'node:test';
import assert from 'node:assert/strict';
import { createResearchProvider, parseWebVttToPlain } from './researchProvider.js';
import { extractBrandContextTree, formatContextForPrompt } from './brandMemoryService.js';
import { buildCanvasSeedPayload } from './marketingArtifactsService.js';
import { runMarketingAgentTurn } from './marketingAgent.js';

test('parseWebVttToPlain extracts full text and 0-4s opening hook', () => {
  const vtt = [
    'WEBVTT',
    '',
    '00:00:00.080 --> 00:00:02.240',
    'Kalau muka lagi breakout parah,',
    '',
    '00:00:02.400 --> 00:00:03.900',
    'stop pakai 10 step skincare!',
    '',
    '00:00:05.000 --> 00:00:08.000',
    'Cukup fokus ke bahan aktif niacinamide dan salicylic acid.',
  ].join('\n');

  const parsed = parseWebVttToPlain(vtt);
  assert.equal(parsed.firstThreeSeconds, 'Kalau muka lagi breakout parah, stop pakai 10 step skincare!');
  assert.match(parsed.plain, /niacinamide/);
  assert.equal(parsed.cues.length, 3);
});

test('researchProvider degrades gracefully when SCRAPEATLAS_API_KEY is missing', async () => {
  const provider = createResearchProvider({ env: {}, poolFactory: () => null });
  assert.equal(provider.isConfigured(), false);
  const out = await provider.searchMetaAds({ query: 'skincare', country: 'ID' });
  assert.equal(out.ok, false);
  assert.deepEqual(out.ads, []);
  assert.match(out.error, /SCRAPEATLAS_API_KEY/);
});

test('researchProvider ranks long-running Meta Ads as likelyWinner and caches response', async () => {
  const cache = new Map();
  const fakePool = {
    async query(sql, params) {
      if (sql.startsWith('SELECT')) {
        const hit = cache.get(params[0]);
        return { rows: hit ? [{ payload_json: hit, credits_used: 1 }] : [] };
      }
      if (sql.startsWith('INSERT INTO research_cache')) {
        cache.set(params[0], JSON.parse(params[3]));
      }
      return { rows: [] };
    },
  };
  let fetchCalls = 0;
  const fakeFetch = async () => {
    fetchCalls += 1;
    return {
      ok: true,
      status: 200,
      headers: new Map([['x-credits-charged', '1'], ['x-credits-remaining', '99']]),
      async json() {
        return {
          searchResults: [
            {
              ad_archive_id: '111',
              page_name: 'New Brand',
              start_date_string: new Date(Date.now() - 2 * 86_400_000).toISOString(),
              snapshot: { body: { text: 'Promo baru' }, videos: [{ video_hd_url: 'https://cdn/v1.mp4' }] },
            },
            {
              ad_archive_id: '222',
              page_name: 'Winner Brand',
              start_date_string: new Date(Date.now() - 45 * 86_400_000).toISOString(),
              snapshot: { body: { text: 'Iklan pemenang 45 hari' }, videos: [{ video_hd_url: 'https://cdn/v2.mp4' }] },
            },
          ],
        };
      },
    };
  };

  const provider = createResearchProvider({
    env: { SCRAPEATLAS_API_KEY: 'sa_test_key' },
    fetchImpl: fakeFetch,
    poolFactory: () => fakePool,
  });

  const first = await provider.searchMetaAds({ query: 'skincare', country: 'ID' });
  assert.equal(first.ok, true);
  assert.equal(first.cached, false);
  assert.equal(first.ads[0].adId, '222');
  assert.equal(first.ads[0].likelyWinner, true);
  assert.equal(first.ads[1].likelyWinner, false);
  assert.equal(fetchCalls, 1);

  const second = await provider.searchMetaAds({ query: 'skincare', country: 'ID' });
  assert.equal(second.ok, true);
  assert.equal(second.cached, true);
  assert.equal(fetchCalls, 1);
});

test('formatContextForPrompt includes Brand Kit, Selected Products, Memories, and Integrations', () => {
  const txt = formatContextForPrompt({
    brandKit: { brandName: 'Glowria', tone: 'Santai & edukatif', claimsToAvoid: ['Jangan klaim instan 1 hari'] },
    selectedProducts: [{ id: 'p1', name: 'Acne Calm Serum', price: 'Rp129.000', usp: '2% Salicylic + Centella' }],
    products: [],
    memories: [{ category: 'feedback', content: 'User lebih suka hook pertanyaan' }],
    integrations: [{ provider: 'google-sheets', display_name: 'Marketing Sheet' }],
  });
  assert.match(txt, /Glowria/);
  assert.match(txt, /Acne Calm Serum/);
  assert.match(txt, /hook pertanyaan/);
  assert.match(txt, /google-sheets/);
});

test('buildCanvasSeedPayload builds Canvas nodes blueprint with prompt, brief note, and product image', () => {
  const seed = buildCanvasSeedPayload({
    deliverable: {
      id: 'del-1',
      campaign_id: 'camp-1',
      campaign_title: 'Launch Serum 7 Hari',
      day_index: 2,
      title: 'Customer Pain Point UGC',
      platform: 'tiktok',
      format: 'UGC video',
      hook: 'Jerawat mendem nggak hilang-hilang?',
      angle: 'Problem-solution dermatologi ringan',
      cta: 'Klik keranjang kuning sekarang',
      script_json: { visualPrompt: 'Close-up Indonesian woman in bathroom mirror applying serum, natural morning light, 9:16.' },
    },
    brandKit: { brandName: 'Glowria' },
    products: [{ name: 'Acne Calm Serum', imageUrl: 'https://cdn.example.com/serum.png' }],
  });

  assert.equal(seed.aspectRatio, '9:16');
  assert.match(seed.projectName, /Day 2/);
  assert.match(seed.briefNote, /Jerawat mendem/);
  assert.match(seed.visualPrompt, /bathroom mirror/);
  assert.equal(seed.productImages.length, 1);
  assert.equal(seed.productImages[0].url, 'https://cdn.example.com/serum.png');
});

test('runMarketingAgentTurn orchestrates research -> artifact -> campaign -> memory and streams events', async () => {
  const events = [];
  let turnCall = 0;

  const mockCallModel = async () => {
    turnCall += 1;
    if (turnCall === 1) {
      return {
        text: '',
        toolCalls: [
          { id: 'tc1', name: 'rename_session', arguments: JSON.stringify({ title: 'Riset & Launch Serum ID' }) },
          { id: 'tc2', name: 'search_meta_ads', arguments: JSON.stringify({ query: 'serum jerawat', country: 'ID' }) },
        ],
        rawMessage: {
          role: 'assistant',
          content: null,
          tool_calls: [
            { id: 'tc1', type: 'function', function: { name: 'rename_session', arguments: '{"title":"Riset & Launch Serum ID"}' } },
            { id: 'tc2', type: 'function', function: { name: 'search_meta_ads', arguments: '{"query":"serum jerawat","country":"ID"}' } },
          ],
        },
      };
    }
    if (turnCall === 2) {
      return {
        text: '',
        toolCalls: [
          {
            id: 'tc3',
            name: 'save_research_report',
            arguments: JSON.stringify({
              title: 'Riset Skincare Jerawat ID',
              summary: 'Problem-solution UGC mendominasi iklan yang jalan >30 hari.',
              marketInsights: ['Iklan running lama fokus pada close-up tekstur & hasil 7 hari.'],
              creativeOpportunities: [
                {
                  title: 'Problem-Solution UGC',
                  angle: 'Jerawat mendem selesai tanpa purging parah',
                  recommendedFormat: 'UGC video',
                  rationale: 'Cocok dengan audience Gen Z TikTok.',
                },
              ],
            }),
          },
          {
            id: 'tc4',
            name: 'save_campaign_draft',
            arguments: JSON.stringify({
              title: 'Launch Serum 7 Hari',
              objective: 'Awareness & conversion',
              durationDays: 7,
              platforms: ['tiktok', 'instagram'],
              deliverables: [
                {
                  dayIndex: 1,
                  title: 'Product Teaser',
                  platform: 'tiktok',
                  format: 'Cinematic video',
                  hook: 'Akhirnya ada serum jerawat yang nggak bikin perih.',
                  angle: 'Gentle effective',
                  visualPrompt: 'Macro glass dropper pouring clear serum onto glowing skin, 9:16.',
                },
              ],
            }),
          },
        ],
        rawMessage: { role: 'assistant', content: null, tool_calls: [] },
      };
    }
    return {
      text: 'Riset selesai! Research Report dan Campaign 7 Hari sudah tersimpan di panel kanan.',
      toolCalls: [],
      rawMessage: { role: 'assistant', content: 'Riset selesai! Research Report dan Campaign 7 Hari sudah tersimpan di panel kanan.' },
    };
  };

  const result = await runMarketingAgentTurn({
    workspaceId: 'ws-1',
    userId: 'u-1',
    thread: { id: 'th-1', title: 'New Marketing Session', messages_json: [] },
    userMessage: 'Riset skincare jerawat ID dan buatkan campaign 7 hari',
    mode: 'agent',
    onEvent: (ev) => events.push(ev),
    deps: {
      env: { OPENROUTER_API_KEY: 'test', SCRAPEATLAS_API_KEY: 'test' },
      callModel: mockCallModel,
      loadWorkspaceMarketingContext: async () => ({
        brandKit: { brandName: 'Glowria' },
        products: [{ id: 'p1', name: 'Acne Calm Serum' }],
        selectedProducts: [{ id: 'p1', name: 'Acne Calm Serum' }],
        memories: [],
        integrations: [],
      }),
      researchProvider: {
        isConfigured: () => true,
        searchMetaAds: async () => ({
          ok: true,
          cached: false,
          ads: [{ adId: '222', pageName: 'Brand X', runningDays: 40, likelyWinner: true, copy: 'Hook keren' }],
        }),
      },
      saveArtifact: async (input) => ({ id: 'art-1', ...input, data_json: input.data }),
      createCampaignWithDeliverables: async (input) => ({
        id: 'camp-1',
        duration_days: input.durationDays,
        ...input,
        deliverables: input.deliverables.map((d, i) => ({ id: `del-${i + 1}`, ...d })),
      }),
      updateThread: async () => ({}),
    },
  });

  assert.equal(result.title, 'Riset & Launch Serum ID');
  assert.equal(result.artifacts.length, 1);
  assert.equal(result.campaigns.length, 1);
  assert.equal(result.campaigns[0].deliverables.length, 1);
  assert.match(result.reply, /Research Report/);
  assert.ok(events.some((e) => e.type === 'artifact'));
  assert.ok(events.some((e) => e.type === 'campaign'));
});

test('extractBrandContextTree builds dynamic Audience segments, 3-level Competitors, and 7-part Products', () => {
  const tree = extractBrandContextTree(
    {
      brandName: 'Evolene',
      about: 'Fitness supplement Indonesia',
      category: 'Sports Nutrition',
      positioning: 'Lab-tested every batch',
      website: 'https://evolene.co.id',
      language: 'Indonesian',
      headline: 'Diakui Dunia',
      audience: [
        'Bulking lifters — Gym-goers wanting muscle mass',
        'Lean seekers — Cutting fat while keeping muscle',
      ],
      sellingPoints: ['80% protein ratio'],
      tone: 'Direct & motivational',
      claimsToAvoid: ['No instant claims'],
      glossary: ['Evosorption'],
      competitors: ['Optimum Nutrition — Global whey leader'],
      compareAgainst: '22% higher bioavailability',
      products: ['New Evowhey — Flagship whey'],
      leadWith: 'Lead with New Evowhey',
      subpages: [
        {
          id: 'sub-comp-optimum-nutrition',
          parent: 'competitors',
          title: 'Optimum Nutrition',
          url: 'https://www.optimumnutrition.com',
          blocks: [
            { id: '1', type: 'heading', text: 'Positioning' },
            { id: '2', type: 'paragraph', text: 'Global leader' },
            { id: '3', type: 'heading', text: 'Strengths' },
            { id: '4', type: 'bullets', items: ['Strong brand'] },
            { id: '5', type: 'heading', text: 'Weaknesses' },
            { id: '6', type: 'bullets', items: ['Expensive'] },
            { id: '7', type: 'heading', text: 'Ad angles' },
            { id: '8', type: 'bullets', items: ['Compare lab test'] },
          ],
        },
        {
          id: 'sub-prod-crevolene',
          parent: 'products',
          title: 'Crevolene Creapure',
          blocks: [
            { id: 'a', type: 'heading', text: 'What it is' },
            { id: 'b', type: 'paragraph', text: '100% German Creapure creatine' },
            { id: 'c', type: 'heading', text: 'Variants' },
            { id: 'd', type: 'bullets', items: ['Unflavored 330g'] },
            { id: 'e', type: 'heading', text: "How it's used" },
            { id: 'f', type: 'paragraph', text: '1 scoop daily' },
            { id: 'g', type: 'heading', text: 'Pricing' },
            { id: 'h', type: 'paragraph', text: 'Rp 320.000' },
          ],
        },
      ],
    },
    [],
  );

  const aud = tree.sections.find((s) => s.key === 'audience');
  assert.deepEqual(
    aud.children.map((c) => c.label),
    ['Bulking lifters', 'Lean seekers'],
  );

  const comp = tree.sections.find((s) => s.key === 'competitors');
  const onNode = comp.children.find((c) => c.label === 'Optimum Nutrition');
  assert.ok(onNode);
  assert.deepEqual(
    onNode.children.map((c) => c.label),
    ['Positioning', 'Strengths', 'Weaknesses', 'Ad angles'],
  );

  const crev = tree.products.find((p) => p.label === 'Crevolene Creapure');
  assert.ok(crev);
  assert.deepEqual(
    crev.children.map((c) => c.label),
    ['What it is', 'Variants', "How it's used", 'Pricing'],
  );

  const partialPrompt = formatContextForPrompt({
    brandKit: null,
    products: [{ id: 'p1', name: 'Other Unselected Product' }],
    selectedProducts: [],
    contextRefs: [crev.children.find((c) => c.label === 'Pricing')],
    memories: [],
    integrations: [],
  });
  assert.match(partialPrompt, /SELECTED PARTIAL CONTEXT/);
  assert.match(partialPrompt, /Rp 320\.000/);
  assert.doesNotMatch(partialPrompt, /Other Unselected Product/);
});
