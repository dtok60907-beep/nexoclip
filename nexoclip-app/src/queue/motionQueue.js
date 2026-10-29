// The BullMQ queue of Motion AI jobs (src/services/motionJobs.js): the app adds, the motion worker runs.
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { MOTION_QUEUE } from '../services/motionJobs.js';

let shared = null;

// One queue per app process.
export function motionQueue(env = process.env) {
  if (shared) return shared;
  if (!env.REDIS_URL) throw Object.assign(new Error('Motion queue is unavailable'), { status: 503 });
  const connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  shared = new Queue(MOTION_QUEUE, { connection });
  return shared;
}
