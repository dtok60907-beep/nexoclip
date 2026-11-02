import { getPool } from '../db/pool.js';
import { resendService } from './resendService.js';

const daysBetween = (date, now) => Math.ceil((new Date(date).getTime() - now.getTime()) / 86_400_000);

export async function sendSubscriptionReminders({ pool = getPool(), env = process.env, now = new Date() } = {}) {
  if (!env.RESEND_API_KEY) return { sent: 0, skipped: 'RESEND_API_KEY missing' };
  const templateId = env.RESEND_TEMPLATE_SUBSCRIPTION_REMINDER || '9ae3c8f5-cd6d-45d0-9976-1ad41e6c43b5';
  const rows = (await pool.query(`SELECT s.id AS subscription_id, s.workspace_id, s.current_period_end, s.plan_code, u.email, u.display_name
    FROM workspace_subscriptions s
    JOIN workspace_memberships wm ON wm.workspace_id = s.workspace_id AND wm.role = 'owner'
    JOIN users u ON u.id = wm.user_id
    WHERE s.status = 'active' AND s.current_period_end > $1 AND s.current_period_end <= $1 + interval '8 days'`, [now.toISOString()])).rows;
  let sent = 0;
  for (const row of rows) {
    const days = daysBetween(row.current_period_end, now);
    if (![7, 3, 1].includes(days)) continue;
    const inserted = (await pool.query(`INSERT INTO subscription_email_reminders (subscription_id, workspace_id, days_before, period_end)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (subscription_id, days_before, period_end) DO UPDATE SET status = 'pending', error = NULL
      WHERE subscription_email_reminders.status = 'failed'
      RETURNING id`, [row.subscription_id, row.workspace_id, days, row.current_period_end])).rows[0];
    if (!inserted) continue;
    try {
      await resendService.sendTemplate({ to: [row.email], templateId, variables: { CUSTOMER_NAME: row.display_name || 'creator', DAYS_LEFT: String(days), PLAN_NAME: row.plan_code, PERIOD_END: new Date(row.current_period_end).toLocaleDateString('id-ID'), BILLING_URL: `${env.PUBLIC_APP_URL || env.APP_ORIGIN || 'http://localhost:3000'}/studio/billing` } });
      await pool.query('UPDATE subscription_email_reminders SET status = \'sent\', sent_at = now() WHERE id = $1', [inserted.id]);
      sent += 1;
    } catch (error) {
      await pool.query('UPDATE subscription_email_reminders SET status = \'failed\', error = $2 WHERE id = $1', [inserted.id, String(error.message).slice(0, 500)]);
    }
  }
  return { sent };
}
