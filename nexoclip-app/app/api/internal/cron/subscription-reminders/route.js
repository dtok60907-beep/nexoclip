import { NextResponse } from 'next/server.js';
import { sendSubscriptionReminders } from '../../../../../src/services/subscriptionReminderService.js';

export const runtime = 'nodejs';
export async function POST(request) {
  const expected = process.env.CRON_SECRET;
  const authorization = request.headers.get('authorization');
  if (!expected || authorization !== `Bearer ${expected}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try { return NextResponse.json(await sendSubscriptionReminders()); }
  catch (error) { return NextResponse.json({ error: 'Reminder job failed' }, { status: 500 }); }
}
