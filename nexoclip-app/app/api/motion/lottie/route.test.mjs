import test from 'node:test';
import assert from 'node:assert/strict';
import { createLottieUploadHandler } from './route.js';
import { sanitizeLottie } from '../../../../components/motion/lottieLibrary.js';

const WORKSPACE = { id: '11111111-1111-4111-8111-111111111111' };
const ID = '22222222-2222-4222-8222-222222222222';
const lottie = { v: '5.7.0', fr: 30, ip: 0, op: 60, w: 512, h: 512, layers: [{ ks: { p: { a: 1, k: [], x: 'var $bm_rt = alert(1)' } } }] };

function handler() {
  const stored = [];
  const post = createLottieUploadHandler({
    tenant: async () => ({ workspace: WORKSPACE }),
    loadStorage: () => ({ put: async (key, body) => stored.push({ key, body: JSON.parse(body.toString()) }) }),
    newId: () => ID,
  });
  return { post, stored };
}
const request = (body) => ({ text: async () => body, headers: new Headers() });

test('an upload is stored without its expressions and played from the workspace route', async () => {
  const { post, stored } = handler();
  const response = await post(request(JSON.stringify(lottie)));
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { src: `/api/motion/lottie/${ID}?workspace_id=${WORKSPACE.id}` });
  assert.equal(stored[0].key, `${WORKSPACE.id}/motion-lottie/${ID}.json`);
  assert.equal(stored[0].body.layers[0].ks.p.x, undefined);
  assert.equal(stored[0].body.layers[0].ks.p.a, 1);
});

test('files that are not Lottie are refused', async () => {
  const { post, stored } = handler();
  assert.equal((await post(request('not json'))).status, 400);
  assert.equal((await post(request(JSON.stringify({ hello: 1 })))).status, 400);
  assert.equal(stored.length, 0);
  assert.equal(sanitizeLottie([1, 2]), null);
});
