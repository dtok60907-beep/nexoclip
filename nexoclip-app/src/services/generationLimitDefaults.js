// Limits applied to every NEW workspace at signup. Proposed values, pending
// Founder approval. Existing workspaces are untouched (no backfill).
export const DEFAULT_WORKSPACE_GENERATION_LIMITS = Object.freeze({
  rate_limit: 10,
  rate_window_seconds: 60,
  max_concurrent: 2,
  budget_credits: 3000,
  budget_period: 'calendar_month',
});
