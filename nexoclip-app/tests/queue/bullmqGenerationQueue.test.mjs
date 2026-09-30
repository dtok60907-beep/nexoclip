import test from 'node:test';
import assert from 'node:assert/strict';
import { Job } from 'bullmq';
import { bullMqJobId, createBullMqGenerationQueue } from '../../src/queue/bullmqGenerationQueue.js';

class FakeQueue {
  static added = [];

  constructor(name, options) {
    this.name = name;
    this.options = options;
  }

  async add(name, data, options) {
    FakeQueue.added.push({ name, data, options });
    return { async getState() { return 'waiting'; } };
  }

  async close() {}
}

class FakeWorker {}

test('maps publisher idempotency keys to deterministic BullMQ-safe job ids and enqueues them', async () => {
  FakeQueue.added = [];
  const queue = createBullMqGenerationQueue({ Queue: FakeQueue, Worker: FakeWorker, connection: {}, queueName: 'test' });
  const idempotencyKey = 'generation:g1';
  const jobId = bullMqJobId(idempotencyKey);

  await queue.enqueue(
    { type: 'generation', generationId: 'g1', workspaceId: 'w1' },
    { idempotencyKey },
  );

  assert.equal(jobId, bullMqJobId(idempotencyKey));
  assert.equal(jobId.includes(':'), false);
  assert.doesNotThrow(() => Job.prototype.validateOptions.call({ opts: { jobId } }));
  assert.deepEqual(FakeQueue.added[0], {
    name: 'generation',
    data: { type: 'generation', generationId: 'g1', workspaceId: 'w1' },
    options: { jobId, removeOnComplete: true, removeOnFail: false },
  });
});

test('does not swallow Redis errors that resemble duplicate job errors', async () => {
  class FailingQueue extends FakeQueue {
    async add() { throw new Error('Redis job exists connection lost'); }
  }
  const queue = createBullMqGenerationQueue({ Queue: FailingQueue, Worker: FakeWorker, connection: {}, queueName: 'test' });

  await assert.rejects(
    queue.enqueue({ type: 'generation', generationId: 'g1' }, { idempotencyKey: 'generation:g1' }),
    /Redis job exists connection lost/,
  );
});

test('does not expose a polling dequeue method', () => {
  const queue = createBullMqGenerationQueue({ Queue: FakeQueue, Worker: FakeWorker, connection: {}, queueName: 'test' });

  assert.equal('dequeue' in queue, false);
});

test('re-running a failed delivery for the same attempt makes it runnable again', async () => {
  let state = 'failed';
  let retried = null;
  class FailedQueue {
    constructor() {}
    async add() {
      return {
        async getState() { return state; },
        async retry(from) { retried = from; state = 'waiting'; },
      };
    }
    async close() {}
  }
  class NoopWorker {}
  const queue = createBullMqGenerationQueue({ Queue: FailedQueue, Worker: NoopWorker, connection: {}, queueName: 'generation-video' });
  const delivery = await queue.enqueue({ type: 'generation', generationId: 'job-1' }, { idempotencyKey: 'generation:job-1:attempt:1' });
  assert.equal(retried, 'failed');
  assert.deepEqual(delivery, { runnable: true });
});
