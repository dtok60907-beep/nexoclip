import test from 'node:test';
import assert from 'node:assert/strict';
import { withBasePath } from './base-path.js';

test('prefixes scheduler URLs once', () => {
  assert.equal(withBasePath('/api/posts', '/scheduler'), '/scheduler/api/posts');
  assert.equal(withBasePath('/scheduler/api/posts', '/scheduler'), '/scheduler/api/posts');
  assert.equal(withBasePath('/', '/scheduler'), '/scheduler');
});
