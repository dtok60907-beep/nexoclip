import { getPool } from '../db/pool.js';
import { isPlatformOperator } from '../lib/auth/platformOperator.js';

// Projects produced with an agency partner (Admin > Project & bagi hasil). The AI cost
// is what the providers billed for every generation in the project's workspace while
// it ran; it is paid back first, other costs next, and the rest is profit to share.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const text = (v, max, label, required = false) => {
  const value = typeof v === 'string' ? v.trim() : '';
  if ((required && !value) || value.length > max) throw fail(`${label} tidak valid`);
  return value;
};
const rupiah = (v, label, min = 0) => {
  if (!/^\d{1,13}$/.test(String(v ?? '')) || Number(v) < min) throw fail(`${label} tidak valid`);
  return Number(v);
};
const percent = (v, label) => {
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(String(v ?? '')) || Number(v) > 100) throw fail(`${label} tidak valid`);
  return Number(v);
};
const optionalDate = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) throw fail('Tanggal tidak valid');
  return d.toISOString();
};
const STATUSES = ['active', 'delivered', 'closed', 'canceled'];

// value - AI cost - other costs = profit; the partner gets their share of a positive profit.
export function shareSummary(project, aiCostIdr) {
  const value = Number(project.project_value_idr);
  const ai = Math.round(Number(aiCostIdr) || 0);
  const other = Number(project.other_costs_idr) || 0;
  const profit = value - ai - other;
  const partner = profit > 0 ? Math.round(profit * Number(project.partner_share_percent) / 100) : 0;
  return { value, aiCost: ai, otherCosts: other, profit, partnerShare: partner, ourShare: profit - partner };
}

export function createRevenueShareService({ pool = null, env = process.env } = {}) {
  const db = () => pool || getPool();
  const authorize = (userId) => { if (!isPlatformOperator(userId, env)) throw fail('Forbidden', 403); };

  // Provider spend in rupiah for the project's workspace between its start and close.
  async function aiCosts(projects) {
    const withWorkspace = projects.filter((p) => p.workspace_id);
    if (!withWorkspace.length) return new Map();
    const result = await db().query(
      `SELECT p.id, COALESCE(SUM(COALESCE(o.cost_idr, o.cost_usd * o.usd_idr_rate)), 0) AS cost_idr,
              COUNT(o.*) FILTER (WHERE o.cost_usd IS NULL AND o.event_type = 'succeeded') AS unknown
       FROM revenue_share_projects p
       LEFT JOIN latest_generation_cost_observations o
         ON o.workspace_id = p.workspace_id AND o.created_at >= p.started_at
        AND o.created_at <= COALESCE(p.closed_at, now())
       WHERE p.id = ANY($1::uuid[])
       GROUP BY p.id`,
      [withWorkspace.map((p) => p.id)],
    );
    return new Map(result.rows.map((r) => [r.id, { cost: Number(r.cost_idr), unknown: Number(r.unknown) }]));
  }

  async function withSummaries(projects) {
    const costs = await aiCosts(projects);
    return projects.map((p) => {
      const cost = costs.get(p.id) || { cost: 0, unknown: 0 };
      return { ...p, unknownCostRequests: cost.unknown, summary: shareSummary(p, cost.cost) };
    });
  }

  async function read(userId) {
    authorize(userId);
    const [partners, projects, workspaces] = await Promise.all([
      db().query('SELECT * FROM agency_partners ORDER BY created_at DESC LIMIT 200'),
      db().query(`SELECT p.*, a.name AS partner_name, w.name AS workspace_name
                  FROM revenue_share_projects p JOIN agency_partners a ON a.id = p.partner_id
                  LEFT JOIN workspaces w ON w.id = p.workspace_id
                  ORDER BY p.created_at DESC LIMIT 200`),
      db().query(`SELECT w.id, w.name, u.email AS owner_email FROM workspaces w
                  LEFT JOIN users u ON u.id = (SELECT m.user_id FROM workspace_memberships m WHERE m.workspace_id = w.id AND m.role = 'owner' LIMIT 1)
                  ORDER BY w.created_at DESC LIMIT 500`),
    ]);
    return { partners: partners.rows, projects: await withSummaries(projects.rows), workspaces: workspaces.rows };
  }

  async function mutate(userId, input) {
    authorize(userId);
    if (input?.action === 'create-partner') {
      const row = (await db().query(
        `INSERT INTO agency_partners (name, contact, bank_name, bank_account_number, bank_account_name, default_share_percent, notes, created_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [text(input.name, 160, 'Nama mitra', true), text(input.contact, 300, 'Kontak'), text(input.bankName, 80, 'Bank'),
          text(input.bankAccountNumber, 40, 'Nomor rekening'), text(input.bankAccountName, 160, 'Atas nama'),
          percent(input.defaultSharePercent ?? 50, 'Bagi hasil default'), text(input.notes, 1000, 'Catatan'), userId],
      )).rows[0];
      return { partner: row };
    }
    if (input?.action === 'create-project') {
      if (!UUID.test(input.partnerId || '')) throw fail('Mitra tidak valid');
      if (input.workspaceId && !UUID.test(input.workspaceId)) throw fail('Workspace tidak valid');
      const row = (await db().query(
        `INSERT INTO revenue_share_projects (partner_id, workspace_id, title, client_name, scope, project_value_idr, partner_share_percent, other_costs_idr, started_at, notes, created_by_user_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9::timestamptz, now()),$10,$11) RETURNING *`,
        [input.partnerId, input.workspaceId || null, text(input.title, 200, 'Judul project', true), text(input.clientName, 200, 'Client akhir', true),
          text(input.scope, 4000, 'Lingkup kerja'), rupiah(input.projectValueIdr, 'Nilai project', 1), percent(input.partnerSharePercent, 'Bagi hasil mitra'),
          rupiah(input.otherCostsIdr ?? 0, 'Biaya lain'), optionalDate(input.startedAt), text(input.notes, 2000, 'Catatan'), userId],
      )).rows[0];
      return { project: row };
    }
    if (input?.action === 'update-project') {
      if (!UUID.test(input.projectId || '')) throw fail('Project tidak valid');
      if (!STATUSES.includes(input.status)) throw fail('Status tidak valid');
      const row = (await db().query(
        `UPDATE revenue_share_projects SET status = $2, other_costs_idr = $3, notes = $4,
           delivered_at = COALESCE($5::timestamptz, CASE WHEN $2 IN ('delivered','closed') THEN COALESCE(delivered_at, now()) END),
           client_paid_at = $6::timestamptz, partner_paid_at = $7::timestamptz,
           closed_at = CASE WHEN $2 IN ('closed','canceled') THEN COALESCE(closed_at, now()) ELSE NULL END,
           updated_at = now()
         WHERE id = $1 RETURNING *`,
        [input.projectId, input.status, rupiah(input.otherCostsIdr ?? 0, 'Biaya lain'), text(input.notes, 2000, 'Catatan'),
          optionalDate(input.deliveredAt), optionalDate(input.clientPaidAt), optionalDate(input.partnerPaidAt)],
      )).rows[0];
      if (!row) throw fail('Project tidak ditemukan', 404);
      return { project: row };
    }
    throw fail('Aksi tidak valid');
  }

  async function documentData(userId, projectId) {
    authorize(userId);
    if (!UUID.test(projectId || '')) throw fail('Project tidak ditemukan', 404);
    const row = (await db().query(
      `SELECT p.*, a.name AS partner_name, a.contact AS partner_contact, a.bank_name AS partner_bank_name,
              a.bank_account_number AS partner_bank_account_number, a.bank_account_name AS partner_bank_account_name,
              w.name AS workspace_name
       FROM revenue_share_projects p JOIN agency_partners a ON a.id = p.partner_id
       LEFT JOIN workspaces w ON w.id = p.workspace_id WHERE p.id = $1`,
      [projectId],
    )).rows[0];
    if (!row) throw fail('Project tidak ditemukan', 404);
    const [project] = await withSummaries([row]);
    const company = (await db().query('SELECT * FROM company_profile WHERE id = 1')).rows[0] || {};
    return { project, company };
  }

  return { read, mutate, documentData };
}

export const revenueShareService = createRevenueShareService();
