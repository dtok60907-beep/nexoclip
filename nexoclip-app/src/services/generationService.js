import { getPool } from '../db/pool.js';
import { createImageGeneration, createVimaxGeneration, findGeneration, findGenerationByIdempotencyKey } from '../repositories/generationRepository.js';
import { createCreditAccount, insertCreditEntry, lockCreditAccount, updateCreditBalance } from '../repositories/creditRepository.js';
import { findPricingRule } from '../repositories/pricingRepository.js';
import { estimateCost } from './pricingService.js';
import { estimateGenerationCredits } from './generationPricing.js';
import { findWorkspaceGenerationLimits, countRecentGenerations, countActiveGenerations, sumBudgetGenerations } from '../repositories/generationLimitsRepository.js';

// Canvas model configurations expose these ratios. Validation must not collapse
// a model-specific choice (for example Nano Banana's 21:9) to a default.
const aspectRatios = new Set(['adaptive', '1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5', '5:4', '8:1', '9:16', '16:9', '21:9']);
const VIMAX_KINDS = new Set(['vimax_narrative_planning', 'vimax_novel_planning', 'vimax_render_video']);
const VIMAX_SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9-]{0,95}$/;
const VIMAX_PROMPTS = {
  vimax_narrative_planning: 'Plan ViMax narrative',
  vimax_novel_planning: 'Plan ViMax novel',
  vimax_render_video: 'Render ViMax storyboard video',
};

export function normalizeSaaSImageGenerationResult(generation) {
  const output = generation?.outputs?.[0]?.download?.url
    || generation?.outputs?.[0]?.url
    || generation?.result?.url
    || generation?.result?.output;
  return {
    ...(output ? { url: output } : {}),
    generationId: generation?.id,
    status: generation?.status,
  };
}

export function validateImageGenerationInput(input) {
  const prompt = String(input?.prompt || '').trim();
  const model = String(input?.model || '').trim();
  const supplied = input?.parameters && Object.getPrototypeOf(input.parameters) === Object.prototype ? input.parameters : {};
  const aspectRatio = String(supplied.aspectRatio || input?.aspectRatio || '1:1').trim();
  if (!prompt || prompt.length > 10000) throw new Error('Generation prompt is required');
  if (!model || model.length > 120) throw new Error('Generation model is required');
  if (!aspectRatios.has(aspectRatio)) throw new Error('Aspect ratio is invalid');
  const parameters = { aspectRatio };
  for (const key of ['resolution', 'quality', 'seed', 'name', 'swap_url']) if (supplied[key] !== undefined) parameters[key] = supplied[key];
  if (Array.isArray(supplied.referenceImages) && supplied.referenceImages.every((url) => typeof url === 'string' && url.length <= 4096)) parameters.referenceImages = supplied.referenceImages.slice(0, 10);
  return { prompt, model, parameters };
}

function validAssetReferences(values, { allowLegacyCanvasReferences = false } = {}) {
  // The app has been served from /spite and, more recently, /canvas
  // (NEXT_PUBLIC_BASE_PATH); either prefix may show up on legacy r2-image
  // reference URLs, so both must be recognized here.
  return Array.isArray(values) && values.every((url) => typeof url === 'string' && (
    /^\/api\/assets\/[^/]+\/download(?:\?|$)/.test(url)
    || (allowLegacyCanvasReferences && /^\/(?:spite\/|canvas\/)?api\/r2-image\/.+/.test(url))
  ));
}

export function validateVideoGenerationInput(input, options = {}) {
  const prompt = String(input?.prompt || '').trim();
  const model = String(input?.model || '').trim();
  const supplied = input?.parameters && Object.getPrototypeOf(input.parameters) === Object.prototype ? input.parameters : {};
  if (input?.kind !== 'video' || !model || model.length > 120) throw new Error('Video generation request is invalid');
  if (!prompt) throw new Error('Video generation request is invalid: prompt is empty');
  // @mentions are expanded into long reference sentences before submit, so
  // the length the user sees in the editor can be much shorter than this.
  if (prompt.length > 15000) throw new Error(`Video generation request is invalid: prompt is too long (${prompt.length}/15000 characters after @mentions are expanded)`);
  const parameters = {};
  if (supplied.canvasProjectId !== undefined) {
    const canvasProjectId = String(supplied.canvasProjectId).trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(canvasProjectId)) {
      throw new Error('Canvas project id is invalid');
    }
    parameters.canvasProjectId = canvasProjectId;
  }
  const isSeedance25 = /seedance-2\.5/i.test(model);
  const isExtend = supplied.omniReferenceTaskType === 'extend';
  const isDraft = supplied.draft === true;
  const isDraftFinal = typeof supplied.draftTaskId === 'string' && supplied.draftTaskId.trim().length > 0;
  if (supplied.aspectRatio !== undefined) {
    if (!aspectRatios.has(supplied.aspectRatio)) throw new Error('Video aspect ratio is invalid');
    parameters.aspectRatio = supplied.aspectRatio;
  }
  if (supplied.duration !== undefined) {
    const duration = Number(supplied.duration);
    const allowsAutoDuration = isSeedance25 && (isExtend || supplied.omniReferenceTaskType === 'edit');
    if (!Number.isInteger(duration) || (duration !== -1 && (duration < (isSeedance25 ? 4 : 1) || duration > (isSeedance25 ? 30 : 60))) || (duration === -1 && !allowsAutoDuration)) throw new Error('Video duration is invalid');
    parameters.duration = Number(supplied.duration);
  }
  if (supplied.draft !== undefined && typeof supplied.draft !== 'boolean') throw new Error('Video draft must be boolean');
  if (supplied.generateAudio !== undefined && typeof supplied.generateAudio !== 'boolean') throw new Error('Video generateAudio must be boolean');
  if (supplied.omniReferenceTaskType !== undefined && !['auto', 'reference', 'edit', 'extend'].includes(supplied.omniReferenceTaskType)) throw new Error('Video task type is invalid');
  if ((isDraft || isDraftFinal || isExtend) && !isSeedance25) throw new Error('Draft and extend are only supported by Seedance 2.5');
  if (isDraft && supplied.resolution !== '480p') throw new Error('Draft mode requires 480p');
  if (isDraftFinal && supplied.resolution !== '1080p') throw new Error('Draft finalization requires 1080p');
  if (isExtend && supplied.aspectRatio !== 'adaptive') throw new Error('Seedance extend requires adaptive aspect ratio');
  for (const key of ['resolution', 'seed', 'draft', 'outputFormat', 'generateAudio', 'omniReferenceTaskType', 'draftTaskId']) if (supplied[key] !== undefined) parameters[key] = supplied[key];
  for (const key of ['referenceImages', 'referenceVideos']) {
    if (supplied[key] !== undefined) {
      if (Array.isArray(supplied[key]) && supplied[key].length > 10) throw new Error(`Video ${key} must be tenant asset references: too many (${supplied[key].length}/10)`);
      if (!validAssetReferences(supplied[key], options)) throw new Error(`Video ${key} must be tenant asset references`);
      parameters[key] = supplied[key];
    }
  }
  if (supplied.frameImages !== undefined) {
    if (!Array.isArray(supplied.frameImages) || supplied.frameImages.length > 2 || !supplied.frameImages.every((frame) => validAssetReferences([frame?.url], options) && ['first_frame', 'last_frame'].includes(frame.frameType))) throw new Error('Video frame images must be tenant asset references');
    parameters.frameImages = supplied.frameImages;
  }
  return { kind: 'video', prompt, model, parameters };
}

export function validateVimaxGenerationInput(input) {
  const allowed = new Set(['kind', 'sessionId', 'input', 'idempotencyKey', 'projectId', 'pricingVersion']);
  if (!input || Object.keys(input).some((key) => !allowed.has(key))) {
    throw new Error('ViMax generation request is invalid');
  }
  const kind = String(input?.kind || '').trim();
  if (!VIMAX_KINDS.has(kind)) throw new Error('ViMax generation kind is invalid');
  const sessionId = String(input?.sessionId || '').trim();
  if (!VIMAX_SESSION_ID.test(sessionId)) throw new Error('ViMax session id is invalid');
  if (!input?.input || Object.getPrototypeOf(input.input) !== Object.prototype) {
    throw new Error('ViMax generation input is invalid');
  }
  return {
    kind, prompt: VIMAX_PROMPTS[kind], model: 'vimax', operation: kind,
    parameters: { sessionId, input: JSON.parse(JSON.stringify(input.input)) },
  };
}

export async function createImageGenerationJob(workspaceId, input) {
  return createImageGeneration(getPool(), { workspaceId, projectId: input?.projectId || null, ...validateImageGenerationInput(input) });
}

function admissionError(code, message, status) {
  return Object.assign(new Error(message), { code, status });
}

function monthStart() {
  const date = new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

async function enforceGenerationLimits(client, workspaceId, cost) {
  const limits = await findWorkspaceGenerationLimits(client, workspaceId);
  if (!limits) return;
  const since = new Date(Date.now() - Number(limits.rate_window_seconds) * 1000);
  if (await countRecentGenerations(client, workspaceId, since) >= Number(limits.rate_limit)) {
    throw admissionError('GENERATION_RATE_LIMITED', 'Generation rate limit exceeded', 429);
  }
  if (await countActiveGenerations(client, workspaceId) >= Number(limits.max_concurrent)) {
    throw admissionError('GENERATION_CONCURRENCY_LIMITED', 'Maximum concurrent generations reached', 429);
  }
  const budget = Number(limits.budget_credits);
  if (budget > 0 && (await sumBudgetGenerations(client, workspaceId, monthStart()) + cost) > budget) {
    throw admissionError('GENERATION_BUDGET_EXCEEDED', 'Generation budget exceeded', 402);
  }
}

export async function createImageGenerationJobWithReservation(pool, workspaceId, input, { userId, allowLegacyCanvasReferences = false, priceGeneration = estimateGenerationCredits } = {}) {
  if (!workspaceId || !input?.idempotencyKey) throw new Error('Generation idempotency key is required');
  if (!userId) throw new Error('Generation user is required');
  const validated = input?.kind === 'video' ? validateVideoGenerationInput(input, { allowLegacyCanvasReferences }) : validateImageGenerationInput(input);
  // Priced per model/resolution/duration before the transaction: it may
  // fetch live OpenRouter prices and must not hold row locks meanwhile.
  // Unknown models fall back to the flat pricing rule below.
  let modelPrice = null;
  try {
    modelPrice = await priceGeneration({ kind: validated.kind === 'video' ? 'video' : 'image', ...validated });
  } catch (error) {
    console.error('[pricing] model price unavailable, using flat rule', validated.model, error?.message);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await findGenerationByIdempotencyKey(client, workspaceId, input.idempotencyKey);
    if (existing) { await client.query('COMMIT'); return existing; }

    const selected = await findPricingRule(client, { operation: input.operation || (validated.kind === 'video' ? 'video_generation' : 'image_generation'), pricingVersion: input.pricingVersion || null });
    if (!selected) throw new Error('Pricing rule not found');
    const ruleEstimate = estimateCost({ ...selected, quantity: 1 });
    const estimate = modelPrice ? { ...ruleEstimate, amount: String(modelPrice.credits) } : ruleEstimate;
    await enforceGenerationLimits(client, workspaceId, Number(estimate.amount));
    await createCreditAccount(client, workspaceId);
    const account = await lockCreditAccount(client, workspaceId);
    const balance = Number(account.balance);
    const cost = Number(estimate.amount);
    if (balance < cost) throw new Error('Insufficient credits');
    const nextBalance = balance - cost;
    await updateCreditBalance(client, workspaceId, nextBalance);
    const ledger = await insertCreditEntry(client, {
      workspaceId, amount: -cost, balanceAfter: nextBalance, reason: 'generation_reservation',
      idempotencyKey: `generation:${input.idempotencyKey}`,
      metadata: { generationIdempotencyKey: input.idempotencyKey, pricingVersionId: estimate.pricingVersionId },
    });
    const job = await createImageGeneration(client, {
      workspaceId, createdByUserId: userId, projectId: input.projectId || null, ...validated, idempotencyKey: input.idempotencyKey,
      estimatedCost: estimate.amount, pricingVersionId: estimate.pricingVersionId, reservationLedgerId: ledger.id,
    });
    await client.query('COMMIT');
    return job;
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
}

export async function createVimaxGenerationJobWithReservation(pool, workspaceId, input, { userId } = {}) {
  if (!workspaceId || !input?.idempotencyKey) throw new Error('Generation idempotency key is required');
  if (!userId) throw new Error('Generation user is required');
  const validated = validateVimaxGenerationInput(input);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const existing = await findGenerationByIdempotencyKey(client, workspaceId, input.idempotencyKey);
    if (existing) { await client.query('COMMIT'); return existing; }

    const selected = await findPricingRule(client, { operation: validated.operation, pricingVersion: input.pricingVersion || null });
    if (!selected) throw new Error('Pricing rule not found');
    const estimate = estimateCost({ ...selected, quantity: 1 });
    const cost = Number(estimate.amount);
    await enforceGenerationLimits(client, workspaceId, cost);
    let ledger = null;
    if (cost !== 0) {
      await createCreditAccount(client, workspaceId);
      const account = await lockCreditAccount(client, workspaceId);
      const balance = Number(account.balance);
      if (balance < cost) throw new Error('Insufficient credits');
      const nextBalance = balance - cost;
      await updateCreditBalance(client, workspaceId, nextBalance);
      ledger = await insertCreditEntry(client, {
        workspaceId, amount: -cost, balanceAfter: nextBalance, reason: 'generation_reservation',
        idempotencyKey: `generation:${input.idempotencyKey}`,
        metadata: { generationIdempotencyKey: input.idempotencyKey, pricingVersionId: estimate.pricingVersionId },
      });
    }
    const job = await createVimaxGeneration(client, {
      workspaceId, createdByUserId: userId, projectId: input.projectId || null, ...validated, idempotencyKey: input.idempotencyKey,
      estimatedCost: estimate.amount, pricingVersionId: estimate.pricingVersionId, reservationLedgerId: ledger?.id || null,
      vimaxSessionId: validated.parameters.sessionId,
    });
    await client.query('COMMIT');
    return job;
  } catch (error) {
    await client.query('ROLLBACK');
    if (error?.code === '23505') {
      const existing = await findGenerationByIdempotencyKey(client, workspaceId, input.idempotencyKey);
      if (existing) return existing;
    }
    throw error;
  } finally { client.release(); }
}

export async function getGenerationJob(workspaceId, generationId, storage = null) {
  const generation = await findGeneration(getPool(), workspaceId, generationId);
  if (!generation || !storage) return generation;
  return {
    ...generation,
    outputs: await Promise.all((generation.outputs || []).map(async (output) => ({
      ...output,
      download: await storage.createDownloadUrl({ key: output.storageKey }),
    }))),
  };
}
