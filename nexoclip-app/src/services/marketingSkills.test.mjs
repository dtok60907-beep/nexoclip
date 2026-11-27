import test from 'node:test';
import assert from 'node:assert/strict';
import { formatSkillsForPrompt, listPublicMarketingSkills, pickMarketingSkills } from './marketingSkills.js';
import { runMarketingAgentTurn } from './marketingAgent.js';

test('pickMarketingSkills matches explicit skillId and auto-triggers by intent', () => {
  const all = listPublicMarketingSkills();
  assert.equal(all.length, 9);

  const explicit = pickMarketingSkills({ message: 'Bantu dong', explicitSkillId: 'review-ads' });
  assert.equal(explicit[0].id, 'review-ads');

  const auto = pickMarketingSkills({ message: 'Tolong ad clone iklan kompetitor lalu buat storyboard 30 detik' });
  const ids = auto.map((s) => s.id);
  assert.ok(ids.includes('ad-clone'));

  const prompt = formatSkillsForPrompt(explicit);
  assert.match(prompt, /SLCT/);
  assert.match(prompt, /8-DIMENSION, 3-PERSONA/);
});

test('runMarketingAgentTurn dispatches storyboard, approval card, routine, and ad account audit tools', async () => {
  const events = [];
  let turn = 0;

  const mockCallModel = async () => {
    turn += 1;
    if (turn === 1) {
      return {
        text: '',
        toolCalls: [
          {
            id: 'tc1',
            name: 'create_storyboard',
            arguments: JSON.stringify({
              title: 'Kopi Aren Swap (30s)',
              aspectRatio: '9:16',
              durationSeconds: 30,
              conceptSummary: 'Swap iced kopi aren with Evolene Aren Latte.',
              voiceoverScript: 'Abis nge-gym masih kopi aren?',
              musicDirection: '95 BPM upbeat hip-hop beat drop at 0:06',
              shots: [
                { time: '0–6s', visual: 'Close-up hand pushes kopi aren aside', onScreenText: 'Abis nge-gym masih kopi aren?' },
                { time: '6–15s', visual: 'Macro push-in on New Evowhey tub', onScreenText: '80% Protein Ratio' },
              ],
            }),
          },
          {
            id: 'tc2',
            name: 'propose_creative_production',
            arguments: JSON.stringify({
              actionType: 'generate_keyframe',
              title: 'Generate Product Keyframe (9:16)',
              description: 'Hero vertical shot of New Evowhey Aren Latte on gym bench',
              estimatedCredits: 8,
              prompt: 'New Evowhey Aren Latte tub on matte black gym bench, natural window rim light, 50mm macro, 9:16',
              aspectRatio: '9:16',
            }),
          },
          {
            id: 'tc3',
            name: 'create_marketing_routine',
            arguments: JSON.stringify({
              title: 'Weekly Competitor Radar',
              prompt: 'Cek iklan Meta Ads kompetitor terbaru',
              cadence: 'weekly',
              scheduleLabel: 'Every Monday · 09:00',
              requireApproval: true,
            }),
          },
          {
            id: 'tc4',
            name: 'audit_ad_account_performance',
            arguments: JSON.stringify({ period: 'last_7d' }),
          },
        ],
        rawMessage: {
          role: 'assistant',
          content: null,
          tool_calls: [
            { id: 'tc1', type: 'function', function: { name: 'create_storyboard', arguments: '{}' } },
            { id: 'tc2', type: 'function', function: { name: 'propose_creative_production', arguments: '{}' } },
            { id: 'tc3', type: 'function', function: { name: 'create_marketing_routine', arguments: '{}' } },
            { id: 'tc4', type: 'function', function: { name: 'audit_ad_account_performance', arguments: '{}' } },
          ],
        },
      };
    }
    return {
      text: 'Storyboard siap! Klik Approve di Approval Card untuk generate keyframe-nya.',
      toolCalls: [],
      rawMessage: { role: 'assistant', content: 'Storyboard siap!' },
    };
  };

  const result = await runMarketingAgentTurn({
    workspaceId: 'ws-1',
    userId: 'u-1',
    thread: { id: 'th-1', title: 'Test', messages_json: [] },
    userMessage: 'Buatkan iklan UGC 30 detik dan set routine mingguan',
    skillId: 'ugc-testimonial',
    onEvent: (ev) => events.push(ev),
    deps: {
      env: { BYTEPLUS_API_KEY: 'test', SCRAPEATLAS_API_KEY: 'test' },
      callModel: mockCallModel,
      loadWorkspaceMarketingContext: async () => ({
        brandKit: { brandName: 'Evolene' },
        products: [],
        selectedProducts: [],
        memories: [],
        integrations: [],
      }),
      researchProvider: { isConfigured: () => true },
      createApproval: async (input) => ({
        id: 'appr-1',
        action_type: input.actionType,
        title: input.title,
        description: input.description,
        estimated_credits: input.estimatedCredits,
        status: 'pending',
        payload_json: input.payload,
        result_json: {},
      }),
      createRoutine: async (input) => ({
        id: 'rt-1',
        title: input.title,
        prompt: input.prompt,
        cadence: input.cadence,
        schedule_label: input.scheduleLabel,
        enabled: true,
      }),
      auditWorkspaceAdAccounts: async () => ({
        period: 'last_7d',
        metaAccounts: [],
        tiktokAccounts: [],
        integrations: [],
        notes: ['No ad account connected'],
      }),
      updateThread: async () => ({}),
    },
  });

  assert.equal(result.storyboard.shots.length, 2);
  assert.equal(result.approvals.length, 1);
  assert.equal(result.routines.length, 1);
  assert.ok(events.some((e) => e.type === 'storyboard'));
  assert.ok(events.some((e) => e.type === 'approval'));
  assert.ok(events.some((e) => e.type === 'routine'));
});

test('runMarketingAgentTurn enforces Pre-Production Scene Kit guardrail before allowing generate_video', async () => {
  const createdTypes = [];
  let turn = 0;

  const mockCallModel = async () => {
    turn += 1;
    if (turn === 1) {
      // Prematurely tries generate_video without Scene Kit -> must be blocked!
      return {
        text: '',
        toolCalls: [
          {
            id: 'tc-vid-early',
            name: 'propose_creative_production',
            arguments: JSON.stringify({
              actionType: 'generate_video',
              title: 'Render Isolene 30s',
              description: 'UGC video',
              estimatedCredits: 120,
              prompt: 'Handheld selfie UGC for Isolene.',
            }),
          },
        ],
        rawMessage: {
          role: 'assistant',
          content: null,
          tool_calls: [{ id: 'tc-vid-early', type: 'function', function: { name: 'propose_creative_production', arguments: '{}' } }],
        },
      };
    }
    if (turn === 2) {
      // Now properly calls generate_scene_kit first, followed by generate_video
      return {
        text: '',
        toolCalls: [
          {
            id: 'tc-kit',
            name: 'propose_creative_production',
            arguments: JSON.stringify({
              actionType: 'generate_scene_kit',
              title: 'Step 1 · Pre-Production Visual Pack',
              description: 'Avatar + Gym Locker Room A/B + Isolene Sub-Props + Clear Shaker',
              estimatedCredits: 40,
              sceneKit: {
                avatar: { name: 'Raka', appearance: '25yo Indonesian gym regular' },
                location: { name: 'Gym Locker Room', shots: [{ label: 'Angle A', prompt: 'Locker bench wide' }] },
                productSubProps: { productName: 'Isolene', shots: [{ label: 'Opened Sachet', prompt: 'Isolene opened' }] },
                extraProps: [{ name: 'Clear Shaker', prompt: 'Clear gym shaker on bench' }],
              },
            }),
          },
          {
            id: 'tc-vid-ok',
            name: 'propose_creative_production',
            arguments: JSON.stringify({
              actionType: 'generate_video',
              title: 'Step 2 · Render Isolene 30s UGC Video',
              description: 'UGC video with @Raka in @Gym-Locker-Room using @Isolene and @Clear-Shaker',
              estimatedCredits: 120,
              prompt: 'Handheld selfie UGC for @Isolene.',
            }),
          },
        ],
        rawMessage: {
          role: 'assistant',
          content: null,
          tool_calls: [
            { id: 'tc-kit', type: 'function', function: { name: 'propose_creative_production', arguments: '{}' } },
            { id: 'tc-vid-ok', type: 'function', function: { name: 'propose_creative_production', arguments: '{}' } },
          ],
        },
      };
    }
    return {
      text: 'Step 1 Pre-Production Pack and Step 2 Video Render are ready!',
      toolCalls: [],
      rawMessage: { role: 'assistant', content: 'Ready!' },
    };
  };

  const result = await runMarketingAgentTurn({
    workspaceId: 'ws-1',
    userId: 'u-1',
    thread: { id: 'th-2', title: 'Isolene', messages_json: [] },
    userMessage: 'Make a 30s UGC ad for Isolene',
    skillId: 'ugc-testimonial',
    deps: {
      env: { BYTEPLUS_API_KEY: 'test' },
      fetchImpl: async () => ({ ok: false }),
      callModel: mockCallModel,
      loadWorkspaceMarketingContext: async () => ({
        brandKit: { brandName: 'Evolene', avatars: [] },
        products: [{ id: 'p-1', name: 'Isolene', imageUrl: 'https://cdn.example.com/isolene.png' }],
        selectedProducts: [{ id: 'p-1', name: 'Isolene', imageUrl: 'https://cdn.example.com/isolene.png' }],
        memories: [],
        integrations: [],
      }),
      researchProvider: { isConfigured: () => false },
      createApproval: async (input) => {
        createdTypes.push(input.actionType);
        return {
          id: `appr-${createdTypes.length}`,
          action_type: input.actionType,
          title: input.title,
          description: input.description,
          estimated_credits: input.estimatedCredits,
          status: 'pending',
          payload_json: input.payload,
          result_json: {},
        };
      },
      updateThread: async () => ({}),
    },
  });

  assert.deepEqual(createdTypes, ['generate_scene_kit', 'generate_video']);
  assert.equal(result.approvals.length, 2);
});
