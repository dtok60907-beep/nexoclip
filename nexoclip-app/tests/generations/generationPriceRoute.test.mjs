import test from 'node:test';
import assert from 'node:assert/strict';
import { createGenerationPriceHandler } from '../../app/api/generations/price/route.js';

test('price route passes the pricing inputs through and returns credits', async () => {
  let seen = null;
  const GET = createGenerationPriceHandler({ price: async (input) => { seen = input; return { usd: 1.168, credits: 151.9 }; } });
  const response = await GET(new Request('http://app/api/generations/price?kind=video&model=byteplus/seedance-2.5-unfiltered&resolution=720p&duration=5&draft=1&referenceVideos=1'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { credits: 151.9, usd: 1.168 });
  assert.equal(seen.kind, 'video');
  assert.deepEqual({ ...seen.parameters, referenceVideos: seen.parameters.referenceVideos.length }, { resolution: '720p', duration: 5, draft: true, referenceVideos: 1 });
});

test('price route rejects a missing model and reports unpriced models as null', async () => {
  const GET = createGenerationPriceHandler({ price: async () => null });
  assert.equal((await GET(new Request('http://app/api/generations/price?kind=image'))).status, 400);
  assert.deepEqual(await (await GET(new Request('http://app/api/generations/price?kind=image&model=flux-dev'))).json(), { credits: null });
});
