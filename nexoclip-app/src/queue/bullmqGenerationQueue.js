export function bullMqJobId(idempotencyKey) {
  if (typeof idempotencyKey !== 'string' || !idempotencyKey) throw new TypeError('idempotencyKey is required');
  return `id-${Buffer.from(idempotencyKey).toString('base64url')}`;
}

export function createBullMqGenerationQueue({ Queue, Worker, connection, queueName }) {
  if (!Queue || !Worker || !connection || !queueName) throw new TypeError('Queue, Worker, connection, and queueName are required');

  const producer = new Queue(queueName, { connection });
  return {
    async enqueue(message, { idempotencyKey }) {
      const job = await producer.add('generation', message, {
        jobId: bullMqJobId(idempotencyKey),
        removeOnComplete: true,
        removeOnFail: false,
      });
      let state = await job.getState();
      // A delivery for this attempt can already exist as 'failed' — e.g. its
      // worker was killed by a deploy and the stalled redelivery hit a job the
      // database still showed as running. Once recovery re-queues the job in
      // the database, run that delivery again; the database claim still
      // guarantees it is processed only once.
      if (state === 'failed' && typeof job.retry === 'function') {
        await job.retry('failed');
        state = await job.getState();
      }
      return { runnable: !['failed', 'completed'].includes(state) };
    },

    createWorker(handler, options = {}) {
      if (typeof handler !== 'function') throw new TypeError('handler is required');
      return new Worker(queueName, (job) => handler(job.data), { connection, ...options });
    },

    async close() {
      await producer.close();
    },
  };
}
