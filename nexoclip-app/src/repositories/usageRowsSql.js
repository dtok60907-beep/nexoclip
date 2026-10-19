// Where a generation job came from, by the idempotency key its caller set.
export const jobSourceSql = (alias) => `CASE WHEN ${alias}.idempotency_key LIKE 'director:%' THEN 'director'
         WHEN ${alias}.idempotency_key LIKE 'spite:%' THEN 'canvas'
         WHEN ${alias}.idempotency_key LIKE 'storyboard:%' THEN 'storyboard'
         ELSE 'studio' END`;

// Calls billed straight to the credit ledger (no generation job): what they were, their model and their source.
export const LEDGER_USAGE_WHERE = (alias) => `${alias}.amount < 0 AND ${alias}.reason ~ '_(text|audio|video_analysis)$'`;
export const ledgerKindSql = (alias) => `CASE WHEN ${alias}.reason LIKE '%\\_text' THEN 'llm'
         WHEN ${alias}.reason LIKE '%\\_video\\_analysis' THEN 'video_analysis'
         ELSE COALESCE(${alias}.metadata->>'type', 'audio') END`;
// Video analyses from before the model was recorded used seed-2-0-lite.
export const ledgerModelSql = (alias) => `COALESCE(${alias}.metadata->>'model',
             CASE WHEN ${alias}.reason LIKE '%\\_video\\_analysis' THEN 'byteplus/seed-2-0-lite'
                  WHEN ${alias}.metadata->>'type' = 'music' THEN 'elevenlabs/music_v1'
                  ELSE 'elevenlabs/eleven_v3' END)`;
export const ledgerSourceSql = (alias) => `CASE split_part(${alias}.reason, '_', 1) WHEN 'spite' THEN 'canvas' ELSE split_part(${alias}.reason, '_', 1) END`;
// Units shown to the user: tokens for text and video analysis, characters for a voiceover, seconds of music.
export const ledgerUnitsSql = (alias) => `jsonb_strip_nulls(jsonb_build_object(
    'input tokens', (${alias}.metadata->>'inputTokens')::bigint,
    'output tokens', (${alias}.metadata->>'outputTokens')::bigint,
    'tokens', (${alias}.metadata->'usage'->>'total_tokens')::bigint,
    'characters', (${alias}.metadata->>'characters')::bigint,
    'seconds', CASE WHEN ${alias}.metadata->>'type' = 'music' THEN (${alias}.metadata->>'durationSeconds')::numeric END))`;

// Every paid thing a workspace used, one row each: image and video generation jobs, plus the calls that are billed
// straight to the credit ledger without a job (LLM text of the AI Director / Storyboard, ElevenLabs voiceover and
// music, video analysis). Used by the admin Jobs list and the usage analytics.
//
// source: where the work came from, read from the idempotency key the caller set (director:… from the AI Director,
// spite:… from Canvas, storyboard:… from the old AI Storyboard, anything else from Studio) or from the ledger
// reason's prefix (director_audio, storyboard_text, …).
// credits_charged: what the workspace finally paid (a job's capture, after any refund; failed or released: 0).
// provider_cost_usd: what the provider charged us, scaled to the captured part of an estimate for jobs.
export const USAGE_ROWS_SQL = `
  SELECT j.id, j.workspace_id, j.kind, j.model, j.status, j.estimated_cost, j.settlement_status,
    j.attempt_count, j.max_attempts, j.created_at, j.started_at, j.finished_at,
    ${jobSourceSql('j')} AS source,
    COALESCE((cap.metadata->>'actualCost')::numeric,
             CASE WHEN j.settlement_status = 'captured' THEN j.estimated_cost ELSE 0 END) AS credits_charged,
    CASE WHEN j.status = 'succeeded'
         THEN j.estimated_provider_cost_usd * COALESCE((cap.metadata->>'actualCost')::numeric / NULLIF(j.estimated_cost, 0), 1)
         ELSE 0 END AS provider_cost_usd
  FROM generation_jobs j
  LEFT JOIN LATERAL (
    SELECT c.metadata FROM credit_ledger c
    WHERE c.workspace_id = j.workspace_id AND c.reason = 'generation_capture' AND c.metadata->>'generationId' = j.id::text
    LIMIT 1
  ) cap ON true
  UNION ALL
  SELECT c.id, c.workspace_id,
    ${ledgerKindSql('c')} AS kind,
    ${ledgerModelSql('c')} AS model,
    'succeeded' AS status, -c.amount AS estimated_cost, 'captured' AS settlement_status,
    1 AS attempt_count, 1 AS max_attempts, c.created_at, c.created_at AS started_at, c.created_at AS finished_at,
    ${ledgerSourceSql('c')} AS source,
    -c.amount AS credits_charged,
    (c.metadata->>'providerCostUsd')::numeric AS provider_cost_usd
  FROM credit_ledger c
  WHERE ${LEDGER_USAGE_WHERE('c')}
`;
