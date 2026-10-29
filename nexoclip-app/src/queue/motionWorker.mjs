// Runs the Motion studio's AI jobs (src/services/motionJobs.js): plan with Seed, then the voiceover and music the
// user asked for with ElevenLabs, each step charged in credits and written into the project.
import { fileURLToPath } from 'node:url';
import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { getPool, closePool } from '../db/pool.js';
import { MOTION_QUEUE, recoverMotionJobs, runMotionJob } from '../services/motionJobs.js';

export function motionWorkerConfig(env = process.env) {
  if (!env.REDIS_URL) throw new Error('REDIS_URL is required');
  const concurrency = Number(env.MOTION_WORKER_CONCURRENCY || 3);
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) throw new Error('MOTION_WORKER_CONCURRENCY must be an integer between 1 and 16');
  return { redisUrl: env.REDIS_URL, concurrency };
}

export async function createMotionWorker({
  env = process.env, Redis = IORedis, loadPool = getPool, closeDatabasePool = closePool, run = runMotionJob,
  recover = recoverMotionJobs, schedule = globalThis.setInterval, clearSchedule = globalThis.clearInterval, onError = console.error,
  // Called when jobs wait while this worker sits idle (its Redis connection stuck after a network blip): the default
  // exits, and Docker / Railway start a fresh worker that picks them up.
  onStuck = () => process.exit(1), stuckAfterSeconds = 120,
} = {}) {
  const config = motionWorkerConfig(env);
  const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
  const pool = loadPool();
  const queue = new Queue(MOTION_QUEUE, { connection });
  let running = 0;
  await recover({ pool, queue }).catch(onError);
  const check = async () => {
    await recover({ pool, queue });
    if (running > 0) return;
    const waiting = await pool.query(
      "SELECT count(*)::int AS n FROM motion_jobs WHERE status = 'queued' AND created_at < now() - make_interval(secs => $1)",
      [stuckAfterSeconds],
    );
    if (waiting.rows[0]?.n > 0) {
      onError(`motion worker idle while ${waiting.rows[0].n} job(s) wait; restarting`);
      onStuck();
    }
  };
  const interval = schedule(() => check().catch(onError), 60_000);
  interval.unref?.();
  // A job runs for minutes (music): lock long enough that BullMQ does not hand it to another worker meanwhile.
  const worker = new Worker(MOTION_QUEUE, (job) => run(job.data.jobId, { pool }), {
    connection, concurrency: config.concurrency, lockDuration: 10 * 60_000,
  });
  worker.on('active', () => { running += 1; });
  const done = () => { running = Math.max(0, running - 1); };
  worker.on('completed', done);
  worker.on('failed', (job, error) => { done(); onError('motion job crashed', job?.data?.jobId, error); });
  worker.on('error', (error) => onError('motion worker connection error', error));
  let closed = false;
  return { async close() {
    if (closed) return;
    closed = true;
    clearSchedule(interval);
    await worker.close();
    await queue.close();
    await connection.quit();
    await closeDatabasePool();
  } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const service = await createMotionWorker();
  console.log('motion worker ready');
  const shutdown = async () => { await service.close(); process.exit(0); };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}
