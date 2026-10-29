import test from 'node:test';
import assert from 'node:assert/strict';
import { assertPublicUrl, readWebPage } from './motionWeb.js';

const publicDns = async () => [{ address: '93.184.216.34' }];

test('only public http(s) pages can be read', async () => {
  await assert.rejects(assertPublicUrl('file:///etc/passwd', publicDns), /http/);
  await assert.rejects(assertPublicUrl('http://169.254.169.254/latest', publicDns), /tidak bisa dibuka/);
  await assert.rejects(assertPublicUrl('http://localhost:3000', async () => [{ address: '127.0.0.1' }]), /tidak bisa dibuka/);
  await assert.rejects(assertPublicUrl('http://intranet', async () => [{ address: '10.0.0.5' }]), /tidak bisa dibuka/);
  assert.equal((await assertPublicUrl('https://example.com/a', publicDns)).hostname, 'example.com');
});

test('a page comes back as title, description, text and picture links; a redirect to a private address is refused', async () => {
  const html = '<html><head><title>Kopi Senja</title><meta name="description" content="Kopi susu gula aren"><meta property="og:image" content="/og.jpg"></head><body><script>x()</script><h1>Menu</h1><p>Es kopi susu &amp; roti.</p><img src="https://cdn.example.com/a.png"></body></html>';
  const page = await readWebPage({ url: 'https://kopi.example/', resolve: publicDns, fetchImpl: async () => new Response(html, { headers: { 'content-type': 'text/html' } }) });
  assert.equal(page.title, 'Kopi Senja');
  assert.equal(page.description, 'Kopi susu gula aren');
  assert.match(page.text, /Es kopi susu & roti\./);
  assert.doesNotMatch(page.text, /x\(\)/);
  assert.deepEqual(page.images, ['https://kopi.example/og.jpg', 'https://cdn.example.com/a.png']);
  const dns = async (host) => [{ address: host === 'evil.example' ? '93.184.216.34' : '127.0.0.1' }];
  await assert.rejects(readWebPage({ url: 'https://evil.example/', resolve: dns, fetchImpl: async () => new Response('', { status: 302, headers: { location: 'http://inside.local/' } }) }), /tidak bisa dibuka/);
});
