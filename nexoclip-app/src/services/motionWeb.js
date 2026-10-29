// The Motion agent reading a web page the user points it to (a brand site, an article to turn into a video): the
// title, description, main text and image links, fetched by the server. Only public http(s) addresses: private
// networks, localhost and the cloud metadata address are refused, before and after redirects.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const MAX_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 15_000;
const MAX_REDIRECTS = 4;

function privateAddress(ip) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v6 = ip.toLowerCase();
  return v6 === '::1' || v6 === '::' || v6.startsWith('fc') || v6.startsWith('fd') || v6.startsWith('fe80') || v6.startsWith('::ffff:') && privateAddress(v6.slice(7));
}

export async function assertPublicUrl(raw, resolve = lookup) {
  let url;
  try { url = new URL(String(raw)); } catch { throw Object.assign(new Error('Alamat web tidak valid.'), { status: 400 }); }
  if (!['http:', 'https:'].includes(url.protocol)) throw Object.assign(new Error('Hanya alamat http/https.'), { status: 400 });
  if (url.username || url.password) throw Object.assign(new Error('Alamat dengan login tidak didukung.'), { status: 400 });
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = isIP(host) ? [{ address: host }] : await resolve(host, { all: true }).catch(() => []);
  if (!addresses.length) throw Object.assign(new Error('Alamat web tidak ditemukan.'), { status: 400 });
  if (addresses.some((a) => privateAddress(a.address))) throw Object.assign(new Error('Alamat itu tidak bisa dibuka.'), { status: 400 });
  return url;
}

const decode = (text) => text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
const meta = (html, name) => decode((html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i')) || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, 'i')) || [])[1] || '').trim();

// Fetches a page and returns { url, title, description, text, images: [absolute urls] }.
export async function readWebPage({ url: raw, fetchImpl = fetch, resolve = lookup }) {
  let url = await assertPublicUrl(raw, resolve);
  let response;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    response = await fetchImpl(url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NexoClipMotion/1.0)', Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' } });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      url = await assertPublicUrl(new URL(response.headers.get('location'), url), resolve);
      continue;
    }
    break;
  }
  if (!response.ok) throw Object.assign(new Error(`Halaman menjawab HTTP ${response.status}.`), { status: 400 });
  const type = response.headers.get('content-type') || '';
  if (!/html|text\/plain|xml/.test(type)) throw Object.assign(new Error('Itu bukan halaman web (mungkin file).'), { status: 400 });
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  const html = new TextDecoder().decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
  const title = decode((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim() || meta(html, 'og:title');
  const description = meta(html, 'description') || meta(html, 'og:description');
  const body = html
    .replace(/<(script|style|noscript|svg|iframe|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|section|article|br|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const text = decode(body).split('\n').map((line) => line.replace(/\s+/g, ' ').trim()).filter((line) => line.length > 2).join('\n').slice(0, 8000);
  const images = [...new Set([meta(html, 'og:image'), ...[...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1])]
    .filter((src) => src && !src.startsWith('data:'))
    .map((src) => { try { return new URL(src, url).href; } catch { return ''; } })
    .filter((src) => /^https?:/.test(src)))].slice(0, 12);
  return { url: url.href, title, description, text, images };
}

// Downloads a picture from a public address (a page the user pointed to) into the workspace's storage.
export async function importWebImage({ url: raw, fetchImpl = fetch, resolve = lookup }) {
  const url = await assertPublicUrl(raw, resolve);
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NexoClipMotion/1.0)' } });
  if (!response.ok) throw Object.assign(new Error(`Gambar menjawab HTTP ${response.status}.`), { status: 400 });
  const contentType = (response.headers.get('content-type') || '').split(';')[0];
  if (!/^image\/(png|jpeg|webp|gif)$/.test(contentType)) throw Object.assign(new Error('Itu bukan gambar PNG/JPG/WebP/GIF.'), { status: 400 });
  const body = Buffer.from(await response.arrayBuffer());
  if (body.length > 15 * 1024 * 1024) throw Object.assign(new Error('Gambarnya terlalu besar.'), { status: 400 });
  return { body, contentType };
}
