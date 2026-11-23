export function validateSocialSchedule(scheduledAt, timeZone, now = Date.now()) {
  if (scheduledAt == null || scheduledAt === '') return { scheduledAt: null, timeZone: null };
  if (typeof scheduledAt !== 'string' || !/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(scheduledAt)) {
    throw Object.assign(new Error('Schedule must include a UTC offset'), { status: 400 });
  }
  const timestamp = Date.parse(scheduledAt);
  if (!Number.isFinite(timestamp) || timestamp < now + 60_000 || timestamp > now + 30 * 86400_000) {
    throw Object.assign(new Error('Choose a time between one minute and 30 days from now'), { status: 400 });
  }
  try {
    if (typeof timeZone !== 'string' || !timeZone) throw new Error();
    new Intl.DateTimeFormat('en', { timeZone }).format(timestamp);
  } catch {
    throw Object.assign(new Error('Choose a valid time zone'), { status: 400 });
  }
  return { scheduledAt: new Date(timestamp).toISOString(), timeZone };
}

export function formatSocialSchedule(job) {
  if (!job.scheduled_at) return '';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium', timeStyle: 'short', timeZone: job.schedule_timezone || 'UTC',
  }).format(new Date(job.scheduled_at)) + ` (${job.schedule_timezone || 'UTC'})`;
}
