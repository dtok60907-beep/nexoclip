import assert from 'node:assert/strict'
import test from 'node:test'

import { creditPriceQuery, fetchCreditPrice, formatCredits, formatCreditsShort, nexoclipModelId } from './generation-credits'
import { getModelById } from './fal-models'

test('prices the same model id the submit route sends', () => {
  const model = getModelById('nano-banana-pro')!
  assert.equal(nexoclipModelId('nano-banana-pro', 'image'), `${model.provider}/${model.providerModel}`)
  assert.equal(nexoclipModelId('unknown-model', 'image'), 'unknown-model')
})

test('query carries what changes the price and buckets prompt length', () => {
  const query = new URLSearchParams(creditPriceQuery({ kind: 'video', modelId: 'x', resolution: '1080p', duration: '10s', draft: true, extend: true, promptLength: 1200 })!)
  assert.equal(query.get('duration'), '10')
  assert.equal(query.get('draft'), '1')
  assert.equal(query.get('omniReferenceTaskType'), 'extend')
  assert.equal(query.get('promptLength'), '2000')
  assert.equal(creditPriceQuery({ kind: 'image', modelId: undefined }), null)
})

test('price requests are shared per query and failures are retried later', async () => {
  let calls = 0
  const ok = (async () => { calls += 1; return new Response(JSON.stringify({ credits: 151.9 })) }) as typeof fetch
  const [a, b] = await Promise.all([fetchCreditPrice('q=1', ok), fetchCreditPrice('q=1', ok)])
  assert.deepEqual([a, b, calls], [151.9, 151.9, 1])
  const failing = (async () => { throw new Error('offline') }) as typeof fetch
  assert.equal(await fetchCreditPrice('q=2', failing), null)
  assert.equal(await fetchCreditPrice('q=2', ok), 151.9)
})

test('formats credits for tooltips and buttons', () => {
  assert.equal(formatCredits(1117.1), '1,117.1 credits')
  assert.equal(formatCredits(130), '130 credits')
  assert.equal(formatCreditsShort(372.4), '373 cr')
})
