import { getPool } from '../db/pool.js';
import { normalizeOnboardingAnswers } from '../lib/onboarding/options.js';
import * as repository from '../repositories/onboardingRepository.js';

const STATUSES = new Set(['completed', 'skipped']);

function toPublic(row) {
  return row ? { status: row.status, answers: row.answers || {}, completedAt: row.completed_at } : { status: null, answers: {} };
}

export function createOnboardingService({ pool = getPool() } = {}) {
  return {
    async get(userId) {
      return toPublic(await repository.findOnboarding(pool, userId));
    },
    async save(userId, { status, answers } = {}) {
      if (!STATUSES.has(status)) throw Object.assign(new Error('status must be completed or skipped'), { status: 400 });
      return toPublic(await repository.upsertOnboarding(pool, {
        userId,
        status,
        answers: normalizeOnboardingAnswers(answers),
      }));
    },
  };
}

let defaultService;
export function onboardingService() {
  defaultService ??= createOnboardingService();
  return defaultService;
}
