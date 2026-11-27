import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildImperfectionFirstAvatarPrompt,
  collectThreadVideoReferenceImages,
  executeGenerateBrandAvatar,
  executeGenerateSceneKit,
  executeGenerateVideo,
  resolveMarketingVideoSpec,
  syncApprovalVideoStatus,
} from './marketingExecutionService.js';
import {
  buildApprovalCanvasSeedPayload,
  buildCanvasSeedPayload,
  selectRelevantProducts,
  weaveMentionsIntoPrompt,
} from './marketingArtifactsService.js';
import {
  needsSeedanceOptimization,
  optimizeSeedancePrompt,
  sanitizeSeedancePrompt,
} from './seedancePromptOptimizer.js';

test('resolveMarketingVideoSpec maps UI slugs to real provider models and clamps duration', () => {
  const s25 = resolveMarketingVideoSpec({ videoModel: 'seedance-2.5', duration: 12, aspectRatio: '9:16', resolution: '720p' });
  assert.equal(s25.model, 'bytedance/seedance-2.5');
  assert.equal(s25.parameters.duration, 12);
  assert.equal(s25.parameters.resolution, '720p');
  assert.equal(s25.parameters.aspectRatio, '9:16');
  assert.equal(s25.parameters.generateAudio, true);

  const kling = resolveMarketingVideoSpec({ videoModel: 'kling-3.0-pro', duration: 99, aspectRatio: '16:9' });
  assert.equal(kling.model, 'kwaivgi/kling-v3.0-pro');
  assert.equal(kling.parameters.duration, 15);
  assert.equal(kling.parameters.resolution, undefined);

  const veo = resolveMarketingVideoSpec({ videoModel: 'veo-3', duration: 20 });
  assert.equal(veo.model, 'google/veo-3.1-fast');
  assert.equal(veo.parameters.duration, 8);
  assert.equal(veo.parameters.resolution, '1080p');

  const wan = resolveMarketingVideoSpec({ videoModel: 'wan-2.6', duration: 1 });
  assert.equal(wan.model, 'w3.0-video');
  assert.equal(wan.parameters.duration, 2);
  assert.equal(wan.parameters.generateAudio, undefined);
});

test('resolveMarketingVideoSpec wires tenant firstFrameUrl with adaptive ratio on Seedance 2.5 and ignores external URLs', () => {
  const withFrame = resolveMarketingVideoSpec({
    videoModel: 'seedance-2.5',
    aspectRatio: '9:16',
    firstFrameUrl: '/api/assets/asset-123/download?workspace_id=ws-1',
  });
  assert.deepEqual(withFrame.parameters.frameImages, [
    { url: '/api/assets/asset-123/download?workspace_id=ws-1', frameType: 'first_frame' },
  ]);
  assert.equal(withFrame.parameters.aspectRatio, 'adaptive');

  const externalIgnored = resolveMarketingVideoSpec({
    videoModel: 'seedance-2.5',
    aspectRatio: '9:16',
    firstFrameUrl: 'https://evil.example.com/a.png',
    referenceImages: ['https://evil.example.com/b.png'],
  });
  assert.equal(externalIgnored.parameters.frameImages, undefined);
  assert.equal(externalIgnored.parameters.referenceImages, undefined);
  assert.equal(externalIgnored.parameters.aspectRatio, '9:16');
});

test('executeGenerateVideo reserves a real video job and publishes to BullMQ', async () => {
  let reservedInput = null;
  let published = false;
  const result = await executeGenerateVideo({
    workspaceId: 'ws-1',
    userId: 'usr-1',
    approvalId: 'appr-42',
    prompt: 'Handheld UGC shot of Indonesian gym athlete mixing chocolate whey protein',
    videoModel: 'seedance-2.5',
    durationSeconds: 10,
    aspectRatio: '9:16',
    resolution: '720p',
    db: {},
    deps: {
      reserve: async (_db, _wsId, input) => {
        reservedInput = input;
        return { id: 'gen-999', status: 'queued', progress: 0, estimated_cost: 95 };
      },
      publish: async () => {
        published = true;
        return true;
      },
    },
  });

  assert.equal(reservedInput.kind, 'video');
  assert.equal(reservedInput.model, 'bytedance/seedance-2.5');
  assert.equal(reservedInput.idempotencyKey, 'mkt-vid:appr-42');
  assert.equal(reservedInput.parameters.duration, 10);
  assert.equal(published, true);
  assert.equal(result.mediaType, 'video_job');
  assert.equal(result.generationId, 'gen-999');
  assert.equal(result.jobStatus, 'queued');
  assert.equal(result.estimatedCredits, 95);
});

test('syncApprovalVideoStatus upgrades executing video_job to playable completed video on success', async () => {
  let savedStatus = null;
  let savedResult = null;
  const fakeDb = {
    query: async (sql, params) => {
      if (sql.startsWith('SELECT * FROM marketing_approvals')) {
        return {
          rows: [
            {
              id: 'appr-42',
              workspace_id: 'ws-1',
              thread_id: null,
              status: 'executing',
              result_json: {
                mediaType: 'video_job',
                generationId: 'gen-999',
                jobStatus: 'queued',
                videoModel: 'seedance-2.5',
                videoModelLabel: 'Seedance 2.5',
                duration: 8,
                resolution: '720p',
                aspectRatio: '9:16',
                estimatedCredits: 95,
              },
            },
          ],
        };
      }
      if (sql.startsWith('UPDATE marketing_approvals')) {
        savedStatus = sql.includes("status = 'completed'") ? 'completed' : 'failed';
        savedResult = JSON.parse(params[1]);
        return {
          rows: [
            {
              id: 'appr-42',
              workspace_id: 'ws-1',
              thread_id: null,
              status: savedStatus,
              result_json: savedResult,
            },
          ],
        };
      }
      return { rows: [] };
    },
  };

  const { approval } = await syncApprovalVideoStatus({
    workspaceId: 'ws-1',
    approvalId: 'appr-42',
    db: fakeDb,
    deps: {
      getGenerationJob: async () => ({
        id: 'gen-999',
        status: 'succeeded',
        progress: 100,
        estimated_cost: 88,
        outputs: [
          {
            assetId: 'ast-777',
            filename: 'seedance-ad.mp4',
            contentType: 'video/mp4',
            download: { url: 'https://r2.example.com/signed.mp4' },
          },
        ],
      }),
    },
  });

  assert.equal(approval.status, 'completed');
  assert.equal(savedResult.mediaType, 'video');
  assert.equal(savedResult.assetId, 'ast-777');
  assert.equal(savedResult.url, '/api/assets/ast-777/download?workspace_id=ws-1');
  assert.equal(savedResult.downloadUrl, '/api/assets/ast-777/download?workspace_id=ws-1&download=1');
  assert.equal(savedResult.creditsCharged, 88);
});

test('buildCanvasSeedPayload configures Seedance 2.5 Omni, prop folders from products, and @mentions in prompt', () => {
  const seed = buildCanvasSeedPayload({
    deliverable: {
      id: 'del-1',
      campaign_id: 'camp-1',
      campaign_title: 'Launch Whey',
      day_index: 1,
      title: 'UGC Unboxing',
      platform: 'tiktok',
      format: 'UGC video',
      hook: 'Jujur aku skeptis awalnya...',
      angle: 'Honest review',
      cta: 'Cek keranjang kuning',
      script_json: {
        visualPrompt: 'Creator holds New Evowhey tub in front of bedroom window, casual selfie.',
      },
    },
    brandKit: { brandName: 'Evolene', tone: 'Santai & jujur' },
    products: [
      { id: 'p-1', name: 'New Evowhey', imageUrl: 'https://cdn.example.com/evowhey.png', description: 'Whey protein' },
      { id: 'p-2', name: 'Crevolene', imageUrl: '/api/assets/11111111-1111-4111-8111-111111111111/download' },
    ],
  });

  assert.equal(seed.modelId, 'seedance-2.5');
  assert.equal(seed.enableAudio, true);
  assert.equal(seed.aspectRatio, '9:16');
  assert.equal(seed.folders.length, 2);
  assert.equal(seed.folders[0].type, 'prop');
  assert.equal(seed.folders[0].tag, 'New-Evowhey');
  assert.equal(seed.folders[1].type, 'prop');
  assert.equal(seed.folders[1].assets[0].workspaceAssetId, '11111111-1111-4111-8111-111111111111');
  assert.match(seed.visualPrompt, /@New-Evowhey/);
  assert.match(seed.visualPrompt, /@Crevolene/);
});

test('buildApprovalCanvasSeedPayload combines UGC character keyframe + voiceover + product props into Seedance 2.5 Omni folders', () => {
  const seed = buildApprovalCanvasSeedPayload({
    approval: {
      id: 'appr-1',
      action_type: 'generate_video',
      title: 'UGC Testimonial Video 8s',
      description: 'Render UGC video',
      payload_json: {
        prompt: 'Style: authentic smartphone UGC. Creator speaks casual Indonesian holding product.',
        aspectRatio: '9:16',
        durationSeconds: 8,
      },
      result_json: {
        mediaType: 'video',
        assetId: '22222222-2222-4222-8222-222222222222',
        url: '/api/assets/22222222-2222-4222-8222-222222222222/download',
        duration: 8,
      },
    },
    products: [{ name: 'New Evowhey', imageUrl: 'https://cdn.example.com/evowhey.png' }],
    relatedApprovals: [
      {
        id: 'appr-kf',
        title: 'UGC Creator Keyframe',
        result_json: {
          mediaType: 'image',
          assetId: '33333333-3333-4333-8333-333333333333',
          url: '/api/assets/33333333-3333-4333-8333-333333333333/download',
        },
      },
      {
        id: 'appr-vo',
        title: 'Creator Voice',
        result_json: {
          mediaType: 'audio',
          subtype: 'voiceover',
          voiceName: 'Liam',
          assetId: '44444444-4444-4444-8444-444444444444',
          url: '/api/assets/44444444-4444-4444-8444-444444444444/download',
        },
      },
    ],
  });

  assert.equal(seed.modelId, 'seedance-2.5');
  assert.equal(seed.duration, '8s');
  const charFolder = seed.folders.find((f) => f.type === 'character');
  assert.ok(charFolder, 'should create character folder');
  assert.equal(charFolder.assets.length, 2, 'character folder should hold BOTH face keyframe image AND voiceover MP3 for Seedance Omni');
  const propFolder = seed.folders.find((f) => f.type === 'prop');
  assert.ok(propFolder, 'should create product prop folder');
  assert.match(seed.visualPrompt, /@Creator/);
  assert.match(seed.visualPrompt, /@New-Evowhey/);
});

test('sanitizeSeedancePrompt strips speaker labels inside curly braces and markdown fences', () => {
  const dirty = '```text\nAUDIO: {Voiceover tegas: Ini dia whey protein baru!} <pop>\n```';
  const clean = sanitizeSeedancePrompt(dirty);
  assert.equal(clean, 'AUDIO: {Ini dia whey protein baru!} <pop>');
});

test('needsSeedanceOptimization flags short, Indonesian-mixed, or text-overlay prompts', () => {
  assert.equal(
    needsSeedanceOptimization("Style: bold text overlay. Action: @New-Evowhey botol dengan stiker 'DISKON 20%'."),
    true,
  );
  assert.equal(
    needsSeedanceOptimization('AUDIO: {Pria bicara dengan nada kesal: Latihan udah rutin tapi otot segitu aja.}'),
    true,
  );
});

test('optimizeSeedancePrompt upgrades weak draft into director-grade Seedance 2.5 prompt with clean braces', async () => {
  const upgraded = await optimizeSeedancePrompt({
    rawPrompt: "Style: bold text overlay. Action: botol dengan stiker 'DISKON 20%'.",
    title: 'Pain Point UGC',
    format: 'UGC Selfie',
    durationSeconds: 8,
    aspectRatio: '9:16',
    folderTags: [{ tag: 'New-Evowhey', type: 'prop', name: 'New Evowhey' }],
    env: { BYTEPLUS_API_KEY: 'test-key' },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content:
                'GLOBAL STYLE: Authentic 9:16 smartphone UGC shot on front camera, natural skin texture, slight handheld shake. No on-screen text, no subtitles, no watermarks.\n\nSUBJECT & PROPS: Single 24-year-old Indonesian male creator in a faded grey tee holding @New-Evowhey with crisp legible label facing lens.\n\nSHOT 1 (0–3s): Medium close-up selfie by a bedroom window, he blinks naturally and reacts honestly.\n\nAUDIO: Creator speaks casually in Jakarta Indonesian: {Jujur dulu progresku mentok sampai aku ganti ke whey ini.} Quiet room tone. No background music.',
            },
          },
        ],
      }),
    }),
  });
  assert.match(upgraded, /GLOBAL STYLE:/);
  assert.match(upgraded, /@New-Evowhey/);
  assert.match(upgraded, /\{Jujur dulu progresku mentok sampai aku ganti ke whey ini\.\}/);
  assert.match(upgraded, /NEGATIVE \/ AVOID:.*studio lighting.*stock photo.*over-polished/i);
});

test('optimizeSeedancePrompt enforces Imperfection First negative guardrails even in offline fallback', async () => {
  const fallback = await optimizeSeedancePrompt({
    rawPrompt: 'Handheld smartphone selfie of Indonesian creator showing product by window.',
    env: {},
  });
  assert.match(fallback, /NEGATIVE \/ AVOID:.*studio lighting.*stock photo.*over-polished/i);
  assert.equal(needsSeedanceOptimization('Studio lighting 8k ultra cinematic stock photo of smiling model.'), true);
});

test('buildImperfectionFirstAvatarPrompt enforces smartphone realism and anti-studio negative guardrails', () => {
  const prompt = buildImperfectionFirstAvatarPrompt({
    name: 'Raka',
    appearance: '25yo Indonesian male gym regular, short dark hair, friendly tired eyes',
    wardrobe: 'faded charcoal gym t-shirt',
    setting: 'post-workout Jakarta apartment corner',
    lighting: 'afternoon window daylight',
  });
  assert.match(prompt, /Imperfection First/i);
  assert.match(prompt, /visible pores/i);
  assert.match(prompt, /STRICTLY AVOID:.*studio lighting.*stock photo.*over-polished/i);
  assert.match(prompt, /faded charcoal gym t-shirt/i);
});

test('executeGenerateBrandAvatar generates UGC portrait via AI Influencer model and saves directly to My Brand avatars + Ad Agent history', async () => {
  let savedBrandData = null;
  let capturedPrompt = '';
  let capturedModel = '';
  const result = await executeGenerateBrandAvatar({
    workspaceId: 'ws-1',
    userId: 'usr-1',
    name: 'Raka',
    appearance: '26yo Indonesian male runner & gym regular',
    wardrobe: 'oversized washed olive cotton tee',
    voiceStyle: 'Santai Jakarta, jujur & cepat',
    lighting: 'natural morning window light',
    setting: 'minimalist Jakarta bedroom',
    db: {},
    deps: {
      executeGenerateKeyframe: async ({ prompt, model }) => {
        capturedPrompt = prompt;
        capturedModel = model;
        return {
          assetId: '55555555-5555-4555-8555-555555555555',
          url: '/api/assets/55555555-5555-4555-8555-555555555555/download?workspace_id=ws-1',
          model,
          aspectRatio: '3:4',
          creditsCharged: 15,
        };
      },
      getWorkspaceBrandKit: async () => ({
        brandName: 'Evolene',
        avatars: [],
        history: [],
      }),
      saveWorkspaceBrandKit: async (_db, { data }) => {
        savedBrandData = data;
      },
    },
  });

  assert.equal(capturedModel, 'google/gemini-3-pro-image');
  assert.equal(result.engine, 'ai-influencer');
  assert.match(capturedPrompt, /Imperfection First/i);
  assert.equal(result.mediaType, 'avatar');
  assert.equal(result.savedToMyBrand, true);
  assert.equal(result.url, '/api/assets/55555555-5555-4555-8555-555555555555/download?workspace_id=ws-1');
  assert.equal(result.name, 'Raka');
  assert.equal(savedBrandData.avatars.length, 1);
  assert.equal(savedBrandData.avatars[0].name, 'Raka');
  assert.equal(savedBrandData.avatars[0].imageUrl, '/api/assets/55555555-5555-4555-8555-555555555555/download?workspace_id=ws-1');
  assert.equal(savedBrandData.avatars[0].wardrobe, 'oversized washed olive cotton tee');
  assert.equal(savedBrandData.avatars[0].voiceStyle, 'Santai Jakarta, jujur & cepat');
  assert.equal(savedBrandData.history.length, 1);
  assert.equal(savedBrandData.history[0].actorName, 'Ad Agent');
  assert.equal(savedBrandData.history[0].pages[0].targetId, 'avatars');
});

test('buildCanvasSeedPayload auto-seeds My Brand avatars into Canvas character folders alongside product props', () => {
  const seed = buildCanvasSeedPayload({
    deliverable: {
      id: 'del-2',
      campaign_id: 'camp-1',
      title: 'UGC Testimonial',
      platform: 'tiktok',
      format: 'UGC video',
      hook: 'Baru 2 minggu pakai ini...',
      script_json: {
        visualPrompt: 'Creator talks directly to phone camera holding whey tub in bedroom daylight.',
      },
    },
    brandKit: {
      brandName: 'Evolene',
      avatars: [
        {
          id: 'av-1',
          name: 'Raka',
          description: '26yo Indonesian gym regular',
          imageUrl: '/api/assets/55555555-5555-4555-8555-555555555555/download',
          wardrobe: 'washed olive tee',
        },
      ],
    },
    products: [
      { id: 'p-1', name: 'New Evowhey', imageUrl: 'https://cdn.example.com/evowhey.png' },
    ],
  });

  const charFolder = seed.folders.find((f) => f.type === 'character');
  const propFolder = seed.folders.find((f) => f.type === 'prop');
  assert.ok(charFolder, 'should create character folder from My Brand avatar');
  assert.equal(charFolder.tag, 'Raka');
  assert.equal(charFolder.assets[0].workspaceAssetId, '55555555-5555-4555-8555-555555555555');
  assert.ok(propFolder, 'should create prop folder from product');
  assert.equal(propFolder.tag, 'New-Evowhey');
  assert.match(seed.visualPrompt, /@Raka/);
  assert.match(seed.visualPrompt, /@New-Evowhey/);
});

test('selectRelevantProducts strictly keeps only the user-selected or prompt-referenced product', () => {
  const catalog = [
    { id: 'p-1', name: 'Evomass with Evosorption', imageUrl: 'https://cdn.example.com/evomass.png' },
    { id: 'p-2', name: 'New Evowhey with Evosorption', imageUrl: 'https://cdn.example.com/evowhey.png' },
    { id: 'p-3', name: 'Isolene', imageUrl: 'https://cdn.example.com/isolene.png' },
  ];

  // Explicit 1-product selection -> never leaks others
  const bySelection = selectRelevantProducts(catalog, { selectedProducts: [catalog[1]], referenceText: '' });
  assert.deepEqual(bySelection.map((p) => p.name), ['New Evowhey with Evosorption']);

  // Prompt mentions only New Evowhey -> matches ONLY New Evowhey (not Evomass or Isolene)
  const byPrompt = selectRelevantProducts(catalog, {
    selectedProducts: [],
    referenceText: 'Render Video UGC New Evowhey 30s (IG Reels)',
  });
  assert.deepEqual(byPrompt.map((p) => p.name), ['New Evowhey with Evosorption']);
});

test('weaveMentionsIntoPrompt normalizes shortened @New-Evowhey to exact folder tag and strips dead @mentions', () => {
  const folders = [
    { name: 'New Evowhey with Evosorption', tag: 'New-Evowhey-with-Evosorption', type: 'prop' },
    { name: 'Raka', tag: 'Raka', type: 'character' },
  ];
  const raw = 'SHOT 1: @Raka holds @New-Evowhey close to camera. SHOT 2: @New-Evowhey poured into @GhostCup.';
  const woven = weaveMentionsIntoPrompt(raw, folders);

  assert.equal(woven.includes('@New-Evowhey-with-Evosorption'), true);
  // No shortened unchipped @New-Evowhey remaining
  assert.equal(/@New-Evowhey(?!-with-Evosorption)/.test(woven), false);
  // Dead hallucinated @GhostCup converted to plain text (never unchipped @)
  assert.equal(woven.includes('@GhostCup'), false);
  assert.equal(woven.includes('GhostCup'), true);
  // Should NOT prepend duplicate Product & Props header when already woven into body
  assert.equal(woven.startsWith('SHOT 1:'), true);
});

test('executeGenerateSceneKit + buildApprovalCanvasSeedPayload packs Avatar, Location A/B, Product Sub-Props A/B/C, and Extra Props into Canvas folders', async () => {
  let kfCount = 0;
  const kitResult = await executeGenerateSceneKit({
    workspaceId: 'ws-1',
    userId: 'usr-1',
    heroProductName: 'New Evowhey with Evosorption',
    heroProductImageUrl: 'https://cdn.example.com/evowhey.png',
    sceneKit: {
      avatar: { name: 'Raka', appearance: '24yo Indonesian gym beginner' },
      location: {
        name: 'Kamar Kosan Jakarta',
        shots: [
          { label: 'Background A · Wide Kamar', prompt: 'Wide lived-in Jakarta bedroom with window light' },
          { label: 'Background B · Meja Dekat Jendela', prompt: 'Wooden desk by window with gym bag' },
        ],
      },
      productSubProps: {
        productName: 'New Evowhey with Evosorption',
        shots: [
          { label: 'Prop B · Tutup Dibuka', prompt: 'Opened whey tub showing rich chocolate powder inside' },
          { label: 'Prop C · Disekop', prompt: 'Close-up scoop lifting chocolate whey powder from opened tub' },
        ],
      },
      extraProps: [
        { name: 'Skop Whey', description: 'Black plastic measuring scoop with whey powder', prompt: 'Close-up scoop on wooden table' },
      ],
    },
    db: {},
    deps: {
      executeGenerateKeyframe: async () => {
        kfCount += 1;
        const uuid = `66666666-6666-4666-8666-66666666660${kfCount}`;
        return { assetId: uuid, url: `/api/assets/${uuid}/download`, model: 'bytedance-seed/seedream-4.5', creditsCharged: 8 };
      },
      getWorkspaceBrandKit: async () => ({ brandName: 'Evolene', avatars: [], history: [] }),
      saveWorkspaceBrandKit: async () => {},
    },
  });

  assert.equal(kitResult.mediaType, 'scene_kit');
  assert.equal(kitResult.totalAssets, 6);
  assert.equal(kitResult.location.assets.length, 2);
  assert.equal(kitResult.productSubProps.assets.length, 2);
  assert.equal(kitResult.extraProps.length, 1);

  const seed = buildApprovalCanvasSeedPayload({
    approval: {
      id: 'appr-vid',
      action_type: 'generate_video',
      title: 'Render Video UGC New Evowhey',
      payload_json: {
        prompt: 'SHOT 1: @Raka in @Kamar-Kosan-Jakarta holds @New-Evowhey and uses @Skop-Whey.',
      },
    },
    products: [{ name: 'New Evowhey with Evosorption', imageUrl: 'https://cdn.example.com/evowhey.png' }],
    relatedApprovals: [{ id: 'appr-kit', action_type: 'generate_scene_kit', result_json: kitResult }],
  });

  const charF = seed.folders.find((f) => f.type === 'character');
  const locF = seed.folders.find((f) => f.type === 'location');
  const prodF = seed.folders.find((f) => f.name === 'New Evowhey with Evosorption');
  const scoopF = seed.folders.find((f) => f.name === 'Skop Whey');

  assert.ok(charF && charF.tag === 'Raka');
  assert.ok(locF && locF.tag === 'Kamar-Kosan-Jakarta' && locF.assets.length === 2, 'Location folder holds Background A + B');
  assert.ok(prodF && prodF.assets.length === 3, 'Hero product folder merges original Prop A + opened Prop B + scooped Prop C');
  assert.ok(scoopF && scoopF.tag === 'Skop-Whey', 'Standalone extra prop folder ready for @Skop-Whey');
  assert.match(seed.visualPrompt, /@New-Evowhey-with-Evosorption/);
  assert.match(seed.visualPrompt, /@Kamar-Kosan-Jakarta/);
  assert.match(seed.visualPrompt, /@Skop-Whey/);
});

test('collectThreadVideoReferenceImages auto-attaches Step 1 Scene Kit avatar, backgrounds, sub-props, and extra props for direct chat video render', async () => {
  const refs = await collectThreadVideoReferenceImages({
    workspaceId: 'ws-1',
    approval: { id: 'appr-vid', thread_id: 'th-1' },
    db: {
      query: async () => ({
        rows: [
          {
            action_type: 'generate_scene_kit',
            result_json: {
              mediaType: 'scene_kit',
              avatar: { assetId: 'av-1', url: '/api/assets/av-1/download?workspace_id=ws-1' },
              location: { assets: [{ assetId: 'bg-1', url: '/api/assets/bg-1/download?workspace_id=ws-1' }] },
              productSubProps: { assets: [{ assetId: 'sub-1', url: '/api/assets/sub-1/download?workspace_id=ws-1' }] },
              extraProps: [{ assetId: 'prop-1', url: '/api/assets/prop-1/download?workspace_id=ws-1' }],
            },
          },
        ],
      }),
    },
    deps: {
      getWorkspaceBrandKit: async () => ({ avatars: [] }),
    },
  });

  assert.deepEqual(refs, [
    '/api/assets/av-1/download?workspace_id=ws-1',
    '/api/assets/bg-1/download?workspace_id=ws-1',
    '/api/assets/sub-1/download?workspace_id=ws-1',
    '/api/assets/prop-1/download?workspace_id=ws-1',
  ]);
});
