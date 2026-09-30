import test from 'node:test'
import assert from 'node:assert/strict'
import { completeGenerationNode } from './generation-node'
import { needsDurableGenerationRecovery } from './durable-generation'

test('keeps durable main-app asset URLs outside the Spite base path', () => {
  process.env.NEXT_PUBLIC_BASE_PATH = '/spite'
  assert.equal(
    completeGenerationNode({}, '/api/assets/asset-1/download?workspace_id=ws').outputUrl,
    '/api/assets/asset-1/download?workspace_id=ws',
  )
})

test('atomically stores completed media while retaining durable generation identity', () => {
  process.env.NEXT_PUBLIC_BASE_PATH = '/spite'
  assert.deepEqual(
    completeGenerationNode({
      label: 'Generator',
      status: 'in_queue',
      generationId: 'generation-1',
      pendingRequestId: 'job-1',
      pendingProvider: 'byteplus',
      pendingProviderModel: 'seedance',
      pendingFalEndpoint: 'fal-ai/seedance',
      pendingStartedAt: 123,
    }, '/api/r2-image/generations/result.png'),
    {
      label: 'Generator',
      status: 'completed',
      generationId: 'generation-1',
      lastGenerationId: 'generation-1',
      generationStatus: 'completed',
      generationError: null,
      outputUrl: '/spite/api/r2-image/generations/result.png',
      error: null,
    },
  )
})

test('client completion ends the durable job like the server patch does', () => {
  const next = completeGenerationNode(
    { generationId: 'gen-1', generationStatus: 'processing', generationError: 'old' },
    '/api/assets/a/download',
  )
  assert.equal(next.generationStatus, 'completed')
  assert.equal(next.generationError, null)
  assert.equal(next.lastGenerationId, 'gen-1')
  assert.equal(needsDurableGenerationRecovery(next), false)
})
