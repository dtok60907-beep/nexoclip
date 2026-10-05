import test from 'node:test';
import assert from 'node:assert/strict';
import { POST as imagePost } from '../../app/api/openrouter/images/route.js';
import { POST as videoPost } from '../../app/api/openrouter/videos/route.js';

// These routes generated on the platform key without charging credits.
for (const [name, post] of [['images', imagePost], ['videos', videoPost]]) {
  test(`/api/openrouter/${name} no longer generates`, async () => {
    const response = await post(new Request(`http://localhost/api/openrouter/${name}`, { method: 'POST', body: '{"model":"m","prompt":"p"}' }));
    assert.equal(response.status, 410);
    assert.equal((await response.json()).error.code, 'ENDPOINT_RETIRED');
  });
}
