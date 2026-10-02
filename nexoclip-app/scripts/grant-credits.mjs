import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { getPool, closePool } from '../src/db/pool.js';
import { appendCreditEntryInTransaction } from '../src/services/creditService.js';

// Manual credit top-up for the period before a payment provider exists.
// An admin verifies payment out-of-band, then grants credits through the normal
// append-only ledger path (appendCreditEntryInTransaction), idempotent by ref.

export const MAX_CREDITS = 1_000_000;
export const REASON = 'manual_topup';
export const SOURCE = 'grant-credits-cli';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REF_RE = /^[A-Za-z0-9._:-]{1,64}$/;
const CREDITS_RE = /^\d+(\.\d)?$/;

export class GrantError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function idempotencyKeyFor(ref) {
  return `${REASON}:${ref}`;
}

export function parseArgs(argv) {
  const out = { dryRun: false, yes: false, note: null, operator: null };
  const valueFlags = { '--workspace': 'workspace', '--credits': 'credits', '--ref': 'ref', '--note': 'note', '--operator': 'operator' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--yes') out.yes = true;
    else if (valueFlags[arg]) {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new GrantError('INVALID_ARGS', `${arg} requires a value`);
      out[valueFlags[arg]] = value;
      i += 1;
    } else throw new GrantError('INVALID_ARGS', `Unknown argument: ${arg}`);
  }

  if (!out.workspace) throw new GrantError('INVALID_ARGS', '--workspace <uuid> is required');
  if (!UUID_RE.test(out.workspace)) throw new GrantError('INVALID_ARGS', '--workspace must be a UUID');
  if (out.credits === undefined) throw new GrantError('INVALID_ARGS', '--credits <number> is required');
  if (!CREDITS_RE.test(out.credits)) throw new GrantError('INVALID_ARGS', '--credits must be a positive number with at most 1 decimal');
  const credits = Number(out.credits);
  if (!(credits > 0)) throw new GrantError('INVALID_ARGS', '--credits must be greater than 0');
  if (credits > MAX_CREDITS) throw new GrantError('INVALID_ARGS', `--credits must not exceed ${MAX_CREDITS}`);
  if (!out.ref) throw new GrantError('INVALID_ARGS', '--ref <payment reference> is required');
  if (!REF_RE.test(out.ref)) throw new GrantError('INVALID_ARGS', '--ref must match [A-Za-z0-9._:-] and be at most 64 characters');

  return { workspaceId: out.workspace.toLowerCase(), credits, ref: out.ref, note: out.note, operator: out.operator, dryRun: out.dryRun, yes: out.yes };
}

const round6 = (n) => Math.round(Number(n) * 1e6) / 1e6;

async function loadContext(client, { workspaceId, idempotencyKey }) {
  const ws = await client.query('SELECT id, name, slug FROM workspaces WHERE id = $1', [workspaceId]);
  const workspace = ws.rows[0];
  if (!workspace) throw new GrantError('WORKSPACE_NOT_FOUND', `Workspace ${workspaceId} does not exist`);

  // Cross-workspace: the repository lookup is per-workspace only.
  const keyed = await client.query(
    `SELECT id, workspace_id, amount, balance_after, reason, idempotency_key, metadata, created_at
     FROM credit_ledger WHERE idempotency_key = $1`,
    [idempotencyKey],
  );
  const account = await client.query('SELECT balance FROM credit_accounts WHERE workspace_id = $1', [workspaceId]);
  const limits = await client.query('SELECT budget_credits FROM workspace_generation_limits WHERE workspace_id = $1', [workspaceId]);
  return {
    workspace,
    entries: keyed.rows,
    balance: account.rows[0] ? Number(account.rows[0].balance) : 0,
    budget: limits.rows[0] ? Number(limits.rows[0].budget_credits) : 0,
  };
}

function evaluate(ctx, { workspaceId, credits, ref, idempotencyKey }) {
  const other = ctx.entries.find((e) => e.workspace_id !== workspaceId);
  if (other) {
    throw new GrantError('REF_USED_ON_OTHER_WORKSPACE', `Ref "${ref}" was already used on another workspace (${other.workspace_id}); refusing`);
  }
  const existing = ctx.entries.find((e) => e.workspace_id === workspaceId);
  if (existing) {
    if (round6(existing.amount) !== round6(credits)) {
      throw new GrantError('AMOUNT_MISMATCH', `Ref "${ref}" was already applied to this workspace with ${round6(existing.amount)} credits, not ${credits}; refusing`);
    }
    return { existing };
  }
  return { existing: null };
}

function budgetWarnings(ctx, balanceAfter) {
  if (ctx.budget > 0 && balanceAfter > ctx.budget) {
    return [`Balance after top-up (${balanceAfter}) exceeds the workspace monthly budget_credits (${ctx.budget}); generations may be blocked once this month's spend reaches the budget, until it is raised. Limits were not changed.`];
  }
  return [];
}

export async function grantCredits({ pool, workspaceId, credits, ref, note = null, operator = null, dryRun = false, confirm = null }) {
  const idempotencyKey = idempotencyKeyFor(ref);
  const params = { workspaceId, credits, ref, idempotencyKey };
  const client = await pool.connect();
  let inTx = false;
  try {
    if (dryRun) {
      const ctx = await loadContext(client, params);
      const { existing } = evaluate(ctx, params);
      if (existing) {
        return { status: 'already_applied', dryRun: true, workspace: ctx.workspace, idempotencyKey, entry: existing, balanceBefore: ctx.balance, balanceAfter: ctx.balance, warnings: [] };
      }
      const balanceAfter = round6(ctx.balance + credits);
      return { status: 'dry_run', dryRun: true, workspace: ctx.workspace, idempotencyKey, entry: null, balanceBefore: ctx.balance, balanceAfter, warnings: budgetWarnings(ctx, balanceAfter) };
    }

    await client.query('BEGIN');
    inTx = true;
    // Serialise concurrent grants of the same ref so the cross-workspace check cannot race.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [idempotencyKey]);
    const ctx = await loadContext(client, params);
    const { existing } = evaluate(ctx, params);
    if (existing) {
      await client.query('ROLLBACK');
      inTx = false;
      return { status: 'already_applied', dryRun: false, workspace: ctx.workspace, idempotencyKey, entry: existing, balanceBefore: ctx.balance, balanceAfter: ctx.balance, warnings: [] };
    }

    const projected = round6(ctx.balance + credits);
    if (confirm && !(await confirm({ workspace: ctx.workspace, credits, ref, idempotencyKey, balanceBefore: ctx.balance, balanceAfter: projected }))) {
      await client.query('ROLLBACK');
      inTx = false;
      return { status: 'cancelled', dryRun: false, workspace: ctx.workspace, idempotencyKey, entry: null, balanceBefore: ctx.balance, balanceAfter: ctx.balance, warnings: [] };
    }

    const entry = await appendCreditEntryInTransaction(client, {
      workspaceId,
      amount: credits,
      reason: REASON,
      idempotencyKey,
      metadata: { credits, ref, note, operator, source: SOURCE },
    });
    await client.query('COMMIT');
    inTx = false;
    const balanceAfter = round6(entry.balance_after);
    return { status: 'granted', dryRun: false, workspace: ctx.workspace, idempotencyKey, entry, balanceBefore: round6(balanceAfter - credits), balanceAfter, warnings: budgetWarnings(ctx, balanceAfter) };
  } catch (error) {
    if (inTx) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

function describe(result) {
  const lines = [
    `Workspace:        ${result.workspace.name} (${result.workspace.slug}) [${result.workspace.id}]`,
    `Idempotency key:  ${result.idempotencyKey}`,
  ];
  if (result.status === 'already_applied') {
    lines.push(`Already applied (ledger entry ${result.entry.id}); no change made.`, `Balance:          ${result.balanceBefore}`);
  } else if (result.status === 'dry_run') {
    lines.push('DRY RUN - nothing written.', `Balance before:   ${result.balanceBefore}`, `Balance after:    ${result.balanceAfter} (projected)`);
  } else if (result.status === 'cancelled') {
    lines.push('Cancelled; nothing written.');
  } else {
    lines.push(`Balance before:   ${result.balanceBefore}`, `Amount:           +${result.entry.amount}`, `Balance after:    ${result.balanceAfter}`, `Ledger entry id:  ${result.entry.id}`);
  }
  for (const warning of result.warnings) lines.push(`WARNING: ${warning}`);
  return lines.join('\n');
}

async function promptConfirm(preview) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(
      `Grant ${preview.credits} credits to ${preview.workspace.name} (${preview.workspace.slug}) ref=${preview.ref}\n` +
      `Balance ${preview.balanceBefore} -> ${preview.balanceAfter}. Proceed? [y/N] `,
    );
    return answer.trim().toLowerCase() === 'y';
  } finally {
    rl.close();
  }
}

export async function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(`${error.message}\nUsage: node scripts/grant-credits.mjs --workspace <uuid> --credits <n> --ref <ref> [--note "<text>"] [--operator <name>] [--dry-run] [--yes]`);
    return 2;
  }
  try {
    const result = await grantCredits({
      pool: getPool(),
      ...args,
      confirm: args.yes ? null : promptConfirm,
    });
    console.log(describe(result));
    return result.status === 'cancelled' ? 1 : 0;
  } catch (error) {
    console.error(`${error.code || 'GRANT_FAILED'}: ${error.message}`);
    return 1;
  } finally {
    await closePool();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
