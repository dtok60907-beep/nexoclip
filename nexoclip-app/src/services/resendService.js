const RESEND_API = 'https://api.resend.com';

function config(env = process.env) {
  if (!env.RESEND_API_KEY) throw Object.assign(new Error('RESEND_API_KEY belum dikonfigurasi'), { status: 503 });
  return {
    key: env.RESEND_API_KEY,
    from: env.RESEND_FROM || 'NexoClip <hello@nexoclip.com>',
    audienceId: env.RESEND_AUDIENCE_ID || '',
  };
}

async function request(path, body, { env = process.env, fetchImpl = fetch } = {}) {
  const { key } = config(env);
  const response = await fetchImpl(`${RESEND_API}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || payload.error || 'Resend request failed');
    error.status = response.status >= 500 ? 502 : response.status;
    throw error;
  }
  return payload;
}

export function createResendService({ env = process.env, fetchImpl = fetch } = {}) {
  return {
    async sendEmail({ to, subject, html, text, replyTo }) {
      const { from } = config(env);
      return request('/emails', { from, to, subject, html, ...(text ? { text } : {}), ...(replyTo ? { reply_to: replyTo } : {}) }, { env, fetchImpl });
    },

    async sendTemplate({ to, templateId, variables = {} }) {
      const { from } = config(env);
      if (!templateId) throw Object.assign(new Error('Resend template belum dikonfigurasi'), { status: 503 });
      return request('/emails', { from, to, template: { id: templateId, variables } }, { env, fetchImpl });
    },

    async createContact({ email, firstName, lastName, unsubscribed = true }) {
      const defaults = config(env);
      if (!defaults.audienceId) throw Object.assign(new Error('RESEND_AUDIENCE_ID belum dikonfigurasi'), { status: 503 });
      return request(`/audiences/${encodeURIComponent(defaults.audienceId)}/contacts`, {
        email,
        ...(firstName ? { first_name: firstName } : {}),
        ...(lastName ? { last_name: lastName } : {}),
        unsubscribed: Boolean(unsubscribed),
      }, { env, fetchImpl });
    },

    async createBroadcast({ audienceId, subject, html, text, scheduledAt }) {
      const defaults = config(env);
      const id = audienceId || defaults.audienceId;
      if (!id) throw Object.assign(new Error('RESEND_AUDIENCE_ID belum dikonfigurasi'), { status: 503 });
      const unsubscribe = '{{{RESEND_UNSUBSCRIBE_URL}}}';
      const content = String(html || '').includes(unsubscribe)
        ? String(html)
        : `${String(html || '')}<p style="font-size:12px;color:#777"><a href="${unsubscribe}">Berhenti berlangganan</a></p>`;
      return request('/broadcasts', {
        audience_id: id,
        from: defaults.from,
        subject,
        html: content,
        ...(text ? { text } : {}),
        ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
      }, { env, fetchImpl });
    },
  };
}

export const resendService = createResendService();
