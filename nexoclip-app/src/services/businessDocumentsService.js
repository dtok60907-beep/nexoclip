import { getPool } from '../db/pool.js';
import { isPlatformOperator } from '../lib/auth/platformOperator.js';
import { contractPricing } from './enterpriseContractPricing.js';

// Documents printed from a business invoice (Admin > Business billing): the quotation,
// the invoice, the receipt and the credit activation notice. Rendered as print-ready
// pages; the browser's print dialog saves them as PDF.
export const DOCUMENT_TYPES = {
  quotation: { title: 'Penawaran Harga', needsPayment: false },
  invoice: { title: 'Invoice', needsPayment: false },
  receipt: { title: 'Kuitansi', needsPayment: true },
  activation: { title: 'Konfirmasi Aktivasi Kredit', needsPayment: true },
};

export const PROFILE_FIELDS = {
  legal_name: ['Nama badan usaha', 160],
  address: ['Alamat', 500],
  npwp: ['NPWP', 40],
  email: ['Email', 160],
  phone: ['Telepon / WhatsApp', 40],
  bank_name: ['Bank', 80],
  bank_account_number: ['Nomor rekening', 40],
  bank_account_name: ['Atas nama rekening', 160],
  signer_name: ['Nama penanda tangan', 160],
  signer_title: ['Jabatan penanda tangan', 80],
};

// Receipts above this amount need a Rp10.000 e-meterai (Indonesian stamp duty).
export const STAMP_DUTY_THRESHOLD_IDR = 5_000_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fail = (message, status = 400) => Object.assign(new Error(message), { status });

export function documentNumber(order, prefix = 'NXB') {
  const created = new Date(order.created_at);
  const month = String(created.getUTCMonth() + 1).padStart(2, '0');
  return `${prefix}/${created.getUTCFullYear()}/${month}/${String(order.document_seq).padStart(4, '0')}`;
}

export function createBusinessDocumentsService({ pool = null, env = process.env } = {}) {
  const db = () => pool || getPool();
  const authorize = (userId) => { if (!isPlatformOperator(userId, env)) throw fail('Forbidden', 403); };

  async function readProfile(userId) {
    authorize(userId);
    return (await db().query('SELECT * FROM company_profile WHERE id = 1')).rows[0] || {};
  }

  async function saveProfile(userId, input) {
    authorize(userId);
    const values = Object.entries(PROFILE_FIELDS).map(([key, [label, max]]) => {
      const value = typeof input?.[key] === 'string' ? input[key].trim() : '';
      if (value.length > max) throw fail(`${label} terlalu panjang (maks ${max})`);
      return value;
    });
    const keys = Object.keys(PROFILE_FIELDS);
    const result = await db().query(
      `INSERT INTO company_profile (id, ${keys.join(', ')}, updated_by_user_id, updated_at)
       VALUES (1, ${keys.map((_, i) => `$${i + 1}`).join(', ')}, $${keys.length + 1}, now())
       ON CONFLICT (id) DO UPDATE SET ${keys.map((k) => `${k} = EXCLUDED.${k}`).join(', ')},
         updated_by_user_id = EXCLUDED.updated_by_user_id, updated_at = now()
       RETURNING *`,
      [...values, userId],
    );
    return result.rows[0];
  }

  async function documentData(userId, orderId, type) {
    authorize(userId);
    if (!UUID.test(orderId || '')) throw fail('Invoice tidak ditemukan', 404);
    const kind = DOCUMENT_TYPES[type];
    if (!kind) throw fail('Jenis dokumen tidak dikenal', 404);
    const order = (await db().query(
      `SELECT o.*, w.name AS workspace_name, u.email AS customer_email, u.display_name AS customer_name
       FROM business_credit_orders o
       JOIN workspaces w ON w.id = o.workspace_id
       JOIN users u ON u.id = o.customer_user_id
       WHERE o.id = $1`,
      [orderId],
    )).rows[0];
    if (!order) throw fail('Invoice tidak ditemukan', 404);
    if (kind.needsPayment && order.status !== 'completed') throw fail(`${kind.title} hanya untuk invoice yang sudah lunas`, 409);
    const company = (await db().query('SELECT * FROM company_profile WHERE id = 1')).rows[0] || {};
    // The workspace balance before this invoice's credits: what it held when they were
    // added, or what it holds now while the invoice is unpaid.
    const before = order.credit_ledger_id
      ? (await db().query('SELECT balance_after - amount AS balance FROM credit_ledger WHERE id = $1', [order.credit_ledger_id])).rows[0]
      : (await db().query('SELECT balance FROM credit_accounts WHERE workspace_id = $1', [order.workspace_id])).rows[0];
    const balanceBefore = Math.max(0, Number(before?.balance || 0));
    return { type, title: kind.title, number: documentNumber(order), order, company, balanceBefore, pricing: contractPricing(env) };
  }

  return { readProfile, saveProfile, documentData };
}

export const businessDocumentsService = createBusinessDocumentsService();
