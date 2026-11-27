import { validateBrandKit } from './brandKitService.js';
import { assertPublicUrl } from './motionWeb.js';
import { createResearchProvider } from './researchProvider.js';

// Unified on BytePlus Seed 2.1 Turbo (high quality, Indonesian-native, 3-min timeout),
// with automatic fallback to OpenRouter Gemini 2.5 Flash only if BytePlus fails.
export const BRAND_ANALYSIS_MODEL = process.env.BRAND_ANALYSIS_MODEL || 'dola-seed-2-1-turbo-260628';
const BYTEPLUS_FALLBACK_MODEL = 'dola-seed-2-1-turbo-260628';
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_BYTEPLUS_URL = 'https://ark.ap-southeast.bytepluses.com/api/v3';

function isBytePlusModel(model) {
  return /^(dola-seed-|ep-)/i.test(String(model || '').trim());
}
const MAX_HTML_BYTES = 1.5 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 18_000;
const SUBPAGE_TIMEOUT_MS = 8_000;
const SCRAPEATLAS_ENRICH_TIMEOUT_MS = 6_000;
const OPENROUTER_FALLBACK_MODEL = 'google/gemini-2.5-flash';
const MAX_SUBPAGES = 4;
const MAX_STYLESHEETS = 3;

const emptyBrandKit = {
  brandName: '', about: '', category: '', mission: '', positioning: '', headline: '', slogans: [],
  language: 'English', pronunciation: '', tone: '', audience: [], products: [], sellingPoints: [],
  claimsToAvoid: [], disclaimer: '', competitors: [], plans: [], phone: '', email: '', website: '', app: '',
  instagram: '', tiktok: '', youtube: '', address: '', legalEntity: '', colors: [], fonts: [],
  bannerColor: '#5B45F2', logoDataUrl: '', logoNote: '', glossary: [], deals: [], compareAgainst: '',
  leadWith: '', avatars: [], voices: [], customPages: [], subpages: [], history: [], sectionBlocks: {},
};

const OPTIONAL_TEXT_SET = new Set(['logoNote', 'compareAgainst', 'leadWith']);
const LOGO_URL_RE = /^(data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,[a-z0-9+/=]+|https?:\/\/\S+|\/\S+)$/i;

const NEUTRAL_HEXES = new Set([
  '#FFFFFF', '#FEFEFE', '#FDFDFD', '#FCFCFC', '#FAFAFA', '#F9F9F9', '#F8F8F8', '#F5F5F5', '#F4F4F4', '#F2F2F2', '#F0F0F0',
  '#EEEEEE', '#EAEAEA', '#E5E5E5', '#E0E0E0', '#DDDDDD', '#D9D9D9', '#CCCCCC', '#BBBBBB', '#AAAAAA', '#A0A0A0', '#999999',
  '#888888', '#777777', '#666666', '#555555', '#444444', '#333333', '#222222', '#1A1A1A', '#111111', '#000000',
]);

const decodeHtml = (text) =>
  String(text || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));

const readMeta = (html, name) =>
  decodeHtml(
    (html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']`, 'i')) ||
      html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`, 'i')) ||
      [])[1] || '',
  ).trim();

function unwrapNextImageUrl(rawUrl, baseUrl) {
  if (!rawUrl || rawUrl.startsWith('data:')) return '';
  try {
    const abs = new URL(decodeHtml(rawUrl), baseUrl);
    if (abs.pathname.startsWith('/_next/image')) {
      const inner = abs.searchParams.get('url');
      if (inner) return new URL(inner, baseUrl).href;
    }
    return /^https?:$/i.test(abs.protocol) ? abs.href : '';
  } catch {
    return '';
  }
}

function normalizeHex(raw) {
  const s = String(raw || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toUpperCase();
  }
  return '';
}

function isNearGrey(hex) {
  if (NEUTRAL_HEXES.has(hex)) return true;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return spread < 18 && (r > 235 || r < 25 || (r > 120 && r < 215));
}

function stripHtmlToText(html, maxChars = 6000) {
  const body = String(html || '')
    .replace(/<(script|style|noscript|svg|iframe|template)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|section|article|br|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decodeHtml(body)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 2)
    .join('\n')
    .slice(0, maxChars);
}

async function safeFetchText(rawUrl, { fetchImpl = fetch, resolve, timeoutMs = FETCH_TIMEOUT_MS, allowCss = false } = {}) {
  let url = await assertPublicUrl(rawUrl, resolve);
  let response;
  for (let hop = 0; hop <= 4; hop += 1) {
    response = await fetchImpl(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: allowCss ? 'text/css,*/*;q=0.5' : 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      url = await assertPublicUrl(new URL(response.headers.get('location'), url), resolve);
      continue;
    }
    break;
  }
  if (!response?.ok) throw Object.assign(new Error(`Halaman menjawab HTTP ${response?.status || 502}.`), { status: 400 });
  const type = response.headers.get('content-type') || '';
  if (!allowCss && !/html|text\/plain|xml/i.test(type)) {
    throw Object.assign(new Error('Itu bukan halaman web (mungkin file).'), { status: 400 });
  }
  const reader = response.body?.getReader?.();
  if (!reader) return { url: url.href, body: await response.text() };
  const chunks = [];
  let size = 0;
  while (size < MAX_HTML_BYTES) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  reader.cancel().catch(() => {});
  return { url: url.href, body: new TextDecoder().decode(Buffer.concat(chunks.map((c) => Buffer.from(c)))) };
}

function extractVisualAndContactAssets(html, pageUrl) {
  // 1. Logo candidates (prefer explicit logo <img>, then apple-touch-icon, then icon, then og:image)
  const imgTags = [...html.matchAll(/<img[^>]+>/gi)].map((m) => m[0]);
  const logoImgUrl = imgTags
    .filter((tag) => /logo/i.test(tag))
    .map((tag) => tag.match(/(?:src|data-src)=["']([^"']+)["']/i)?.[1])
    .map((src) => unwrapNextImageUrl(src, pageUrl))
    .find(Boolean) || '';
  const touchIcon = unwrapNextImageUrl(
    html.match(/rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i)?.[1] || '',
    pageUrl,
  );
  const siteIcon = unwrapNextImageUrl(
    html.match(/rel=["'](?:shortcut icon|icon)["'][^>]*href=["']([^"']+)["']/i)?.[1] || '',
    pageUrl,
  );
  const ogImage = unwrapNextImageUrl(readMeta(html, 'og:image'), pageUrl);
  const logoUrl = logoImgUrl || touchIcon || siteIcon || ogImage || '';

  // 2. Google Fonts & declared font families
  const fonts = new Set();
  for (const m of html.matchAll(/fonts\.googleapis\.com\/css2?\?[^"'\s)]+/gi)) {
    for (const fam of m[0].matchAll(/family=([^&:;]+)/gi)) {
      const clean = decodeURIComponent(fam[1]).replace(/\+/g, ' ').trim();
      if (clean) fonts.add(clean);
    }
  }
  for (const m of html.matchAll(/font-family\s*:\s*([^;}{"']+)/gi)) {
    const first = m[1].split(',')[0].replace(/["']/g, '').trim();
    if (first && !/^(inherit|initial|sans-serif|serif|monospace|system-ui|-apple-system|ui-sans-serif|var\()/i.test(first) && first.length <= 48) {
      fonts.add(first);
    }
  }

  // 3. Contacts & social handles (scan raw HTML including __NEXT_DATA__ and footer links)
  const igMatch = html.match(/https?:\/\/(?:www\.)?instagram\.com\/([a-zA-Z0-9_.]{2,30})/i);
  const ttMatch = html.match(/https?:\/\/(?:www\.)?tiktok\.com\/@([a-zA-Z0-9_.]{2,30})/i);
  const ytMatch = html.match(/https?:\/\/(?:www\.)?youtube\.com\/(@[a-zA-Z0-9_.-]{2,40}|channel\/[a-zA-Z0-9_-]+)/i);
  const waMatch = html.match(/(?:wa\.me\/|api\.whatsapp\.com\/send\?phone=)(\d{9,15})/i);
  const mailMatch = html.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/i);
  const themeColor = normalizeHex(readMeta(html, 'theme-color'));

  const socials = {
    instagram: igMatch && !['p', 'reel', 'explore', 'accounts'].includes(igMatch[1].toLowerCase()) ? `@${igMatch[1]}` : '',
    tiktok: ttMatch ? `@${ttMatch[1]}` : '',
    youtube: ytMatch ? (ytMatch[1].startsWith('@') ? ytMatch[1] : `https://youtube.com/${ytMatch[1]}`) : '',
    phone: waMatch ? `+${waMatch[1]}` : '',
    email: mailMatch ? mailMatch[1] : '',
  };

  // 4. Stylesheet URLs for color extraction
  const origin = new URL(pageUrl).origin;
  const stylesheets = [...new Set([...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi)].map((m) => m[1]))]
    .map((href) => { try { return new URL(decodeHtml(href), pageUrl).href; } catch { return ''; } })
    .filter((u) => u && u.startsWith(origin))
    .slice(0, MAX_STYLESHEETS);

  // 5. Key internal links for multi-page product/about crawl
  const allHrefs = [...new Set([...html.matchAll(/href=["']([^"'#]+)["']/gi)].map((m) => m[1]))];
  const candidateLinks = allHrefs
    .map((href) => { try { return new URL(decodeHtml(href), pageUrl); } catch { return null; } })
    .filter((u) => u && u.origin === origin && u.pathname !== '/' && u.pathname !== new URL(pageUrl).pathname)
    .filter((u) => !/\.(pdf|jpg|jpeg|png|webp|svg|css|js|xml|ico)$/i.test(u.pathname))
    .map((u) => u.origin + u.pathname);

  const uniqueLinks = [...new Set(candidateLinks)];
  const productLinks = uniqueLinks.filter((u) => /\/(produk|product|products|shop|katalog|catalog|item|menu)\b/i.test(u));
  const aboutLinks = uniqueLinks.filter((u) => /\/(about|tentang|promo|pricing|harga|contact|kontak)\b/i.test(u));
  const subPageUrls = [...productLinks.slice(0, 3), ...aboutLinks.slice(0, 1)].slice(0, MAX_SUBPAGES);
  if (subPageUrls.length < MAX_SUBPAGES && productLinks.length > 3) {
    for (const extra of productLinks.slice(3)) {
      if (subPageUrls.length >= MAX_SUBPAGES) break;
      if (!subPageUrls.includes(extra)) subPageUrls.push(extra);
    }
  }

  return { logoUrl, fonts: [...fonts].slice(0, 8), socials, themeColor, stylesheets, subPageUrls };
}

function extractTopBrandColors(sources = [], themeColor = '') {
  const counts = new Map();
  if (themeColor && !isNearGrey(themeColor)) counts.set(themeColor, 50);
  for (const text of sources) {
    if (!text) continue;
    for (const m of text.matchAll(/#([0-9a-f]{6})\b/gi)) {
      const hex = `#${m[1].toUpperCase()}`;
      if (isNearGrey(hex)) continue;
      counts.set(hex, (counts.get(hex) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([hex], idx) => ({
      name: idx === 0 ? 'Primary Brand' : idx === 1 ? 'Secondary' : `Accent ${idx}`,
      hex,
    }));
}

export async function extractDeepBrandBundle({ url: rawUrl, fetchImpl = fetch, resolve } = {}) {
  const home = await safeFetchText(rawUrl, { fetchImpl, resolve, timeoutMs: FETCH_TIMEOUT_MS });
  const title = decodeHtml((home.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim() || readMeta(home.body, 'og:title');
  const description = readMeta(home.body, 'description') || readMeta(home.body, 'og:description');
  const homeText = stripHtmlToText(home.body, 5500);
  const assets = extractVisualAndContactAssets(home.body, home.url);

  // Fetch stylesheets & up to 4 key sub-pages in parallel (fast, ~2s total)
  const [cssTexts, subPages] = await Promise.all([
    Promise.all(
      assets.stylesheets.map((cssUrl) =>
        safeFetchText(cssUrl, { fetchImpl, resolve, timeoutMs: 6000, allowCss: true })
          .then((r) => r.body)
          .catch(() => ''),
      ),
    ),
    Promise.all(
      assets.subPageUrls.map((subUrl) =>
        safeFetchText(subUrl, { fetchImpl, resolve, timeoutMs: SUBPAGE_TIMEOUT_MS })
          .then((r) => {
            const subTitle = decodeHtml((r.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim();
            const subText = stripHtmlToText(r.body, 1800);
            const prices = [...new Set([...subText.matchAll(/Rp\.?\s?[\d.,]+/gi)].map((m) => m[0]))].slice(0, 6);
            const imgs = [...r.body.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)]
              .map((m) => unwrapNextImageUrl(m[1], r.url))
              .filter(
                (u) =>
                  u &&
                  !/icon|logo|avatar|pixel|flag|facebook\.com\/tr|doubleclick|google-analytics|googletagmanager|bat\.bing|analytics|noscript/i.test(u),
              )
              .slice(0, 3);
            const subAssets = extractVisualAndContactAssets(r.body, r.url);
            return { url: r.url, title: subTitle, text: subText, prices, imageUrl: imgs[0] || '', socials: subAssets.socials };
          })
          .catch(() => null),
      ),
    ),
  ]);

  const validSubPages = subPages.filter(Boolean);
  const colors = extractTopBrandColors([home.body, ...cssTexts], assets.themeColor);

  // Merge socials discovered on sub-pages if homepage missed them
  const mergedSocials = { ...assets.socials };
  for (const sp of validSubPages) {
    for (const k of Object.keys(mergedSocials)) {
      if (!mergedSocials[k] && sp.socials?.[k]) mergedSocials[k] = sp.socials[k];
    }
  }

  // Infer a clean brand name hint for Meta Ads enrichment (e.g. "evolene.co.id" -> "evolene")
  const hostParts = new URL(home.url).hostname.replace(/^www\./i, '').split('.');
  const brandHint = (hostParts[0] || title.split(/[|\-–]/)[0] || '').trim();

  return {
    url: home.url,
    title,
    description,
    text: homeText,
    brandHint,
    logoUrl: assets.logoUrl,
    colors,
    fonts: assets.fonts,
    socials: mergedSocials,
    subPages: validSubPages,
  };
}

function flattenListItem(item) {
  if (typeof item === 'string') return item.trim();
  if (typeof item === 'number' || typeof item === 'boolean') return String(item);
  if (item && typeof item === 'object' && !Array.isArray(item)) {
    const primary = item.name || item.title || item.segment || item.label || item.product || '';
    const rest = Object.entries(item)
      .filter(([k, v]) => !['name', 'title', 'segment', 'label', 'product'].includes(k) && v !== null && v !== undefined && String(v).trim())
      .map(([, v]) => (Array.isArray(v) ? v.map(flattenListItem).filter(Boolean).join(', ') : String(v).trim()));
    if (primary && rest.length) return `${String(primary).trim()} — ${rest.join('; ')}`;
    if (primary) return String(primary).trim();
    return rest.join(' — ');
  }
  return '';
}

function coerceStringList(value, maxItems = 40, maxLen = 490) {
  const arr = Array.isArray(value)
    ? value
    : typeof value === 'string' && value.trim()
      ? value.split(/\r?\n/).map((line) => line.replace(/^[-•*]\s*/, ''))
      : [];
  return arr
    .map(flattenListItem)
    .map((s) => s.replace(/\s+/g, ' ').trim().slice(0, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

function coerceString(value, maxLen = 4800) {
  if (typeof value === 'string') return value.trim().slice(0, maxLen);
  if (typeof value === 'number') return String(value).slice(0, maxLen);
  if (Array.isArray(value)) return coerceStringList(value, 10, 400).join('; ').slice(0, maxLen);
  if (value && typeof value === 'object') return flattenListItem(value).slice(0, maxLen);
  return '';
}

function repairTruncatedJson(str) {
  let s = String(str || '').trim();
  const start = s.indexOf('{');
  if (start < 0) return s;
  s = s.slice(start);
  // Remove trailing incomplete key/comma/colon fragments after last complete value
  let inStr = false;
  let escaped = false;
  const stack = [];
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\' && inStr) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inStr = !inStr;
      continue;
    }
    if (!inStr) {
      if (ch === '{' || ch === '[') stack.push(ch);
      else if (ch === '}' && stack[stack.length - 1] === '{') stack.pop();
      else if (ch === ']' && stack[stack.length - 1] === '[') stack.pop();
    }
  }
  if (inStr) s += '"';
  // Strip trailing comma or dangling property colon before closing brackets
  s = s.replace(/,\s*"[^"]*"\s*:\s*$/, '').replace(/[,:\s]+$/, '');
  while (stack.length > 0) {
    const open = stack.pop();
    s += open === '{' ? '}' : ']';
  }
  return s;
}

function parseModelJson(content) {
  const raw = String(content || '').trim();
  if (!raw) throw new Error('Empty model response');
  const unfenced = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    const start = unfenced.indexOf('{');
    const end = unfenced.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(unfenced.slice(start, end + 1));
      } catch {
        // Fall through to truncated-JSON repair
      }
    }
    try {
      return JSON.parse(repairTruncatedJson(unfenced));
    } catch (repairErr) {
      throw new Error(`Model returned invalid JSON: ${repairErr.message}`);
    }
  }
}

function buildDeepPrompt(bundle, metaAds = []) {
  const subSection = (bundle.subPages || []).length
    ? bundle.subPages
        .map(
          (sp, i) =>
            `[Page ${i + 1}: ${sp.url}]\nTitle: ${sp.title}\nDetected prices: ${sp.prices.join(', ') || '-'}\nProduct image: ${sp.imageUrl || '-'}\nSummary:\n${sp.text.slice(0, 1400)}`,
        )
        .join('\n\n')
    : 'No additional sub-pages crawled.';

  const adsSection = metaAds.length
    ? metaAds
        .map(
          (ad, i) =>
            `${i + 1}. [${ad.pageName} · running ${ad.runningDays ?? '?'} days] CTA="${ad.ctaText || '-'}" Copy: "${ad.copy.slice(0, 220)}"`,
        )
        .join('\n')
    : 'No active Meta Ads data found.';

  const colorsText = (bundle.colors || []).map((c) => `${c.name}: ${c.hex}`).join(', ') || '-';
  const fontsText = (bundle.fonts || []).join(', ') || '-';

  return `You are a Senior Brand Strategist & Performance Creative Director.
Your task: synthesize a **sharp, specific, ad-ready Brand Kit** (NOT a generic template summary!) grounded in real evidence from the website, product sub-pages, active brand ads (if any), and sharp market reasoning.

### MANDATORY OUTPUT LANGUAGE RULE (CRITICAL):
- Write **100% of every field in clear, natural, strategic ENGLISH** — EVEN IF the source website, sub-pages, or Meta Ads are written in Bahasa Indonesia or another language!
- Preserve exact proper nouns, brand names, product names, certifications (e.g. BPOM, Halal MUI), local currency prices (e.g. Rp 396.000), and official slogans verbatim, while explaining everything around them in crisp English.

### Quality Principles:
1. **Grounded in Real Evidence:** Products, prices, nutrition/features, certifications, CSS colors, contacts, and active ad insights must stay faithful to the scraped data. Do not invent addresses, emails, or legal entities if not present.
2. **Sharp Strategic AI Reasoning (NEVER leave empty):**
   - **competitors**: Identify 3–5 direct relevant competitors in the brand's actual market (format each string as: "Competitor Name — brief positioning reason (https://official-website.com)" when known).
   - **compareAgainst**: Write a concrete battlecard explaining how this brand beats both budget competitors and premium/imported competitors.
   - **audience**: Write 3–4 actionable ad personas (format each string as: "Persona Name & Age — Core pain point | Main objection | Winning hook angle").
   - **tone**: Describe the real communication voice (pronouns/register, pacing, hook patterns seen on the site/ads), not clichés like "professional & friendly".
   - **sellingPoints**: 4–6 strongest proof points (specific numbers, certifications, lab tests, technical differentiators).
   - **claimsToAvoid**: 3–5 industry-specific ad compliance guardrails (e.g. health/BPOM rules, no instant-result claims, usage disclaimers).
   - **plans / deals**: Summarize real price ranges, pack sizes, or promos detected on the product pages.
   - **leadWith**: 1–2 punchy sentences on the strongest angle to lead the first 3 seconds of an ad.
   - **colors**: Use the actual CSS HEX colors detected (${colorsText}) with contextual role names (e.g. "Evolene Crimson Red", "Clinical Green").
3. **detectedProducts** (for auto-importing into Products Library & 7-part product subpages):
   Output an array of real products found on the site (written in English):
   [{ "name": "...", "category": "...", "price": "...", "usp": "...", "description": "...", "variants": ["Flavor / size 1", "Variant 2"], "howItsUsed": "Brief usage / serving instructions in English", "imageUrl": "...", "url": "..." }]
4. **competitorProfiles** (for Competitor subpages & official website links):
   Output an array for each direct competitor (written in English):
   [{ "name": "Competitor Brand Name", "website": "https://official-competitor-domain.com", "subtitle": "1-sentence summary in English", "positioning": "Market position & strategy in English", "strengths": ["Strength 1", "Strength 2"], "weaknesses": ["Weakness 1", "Weakness 2"], "adAngles": ["Winning ad angle to beat them in English"] }]
   Fill "website" with the competitor's real official URL (https://...); leave "" if unsure — never invent fake domains.

### WEBSITE DATA
URL: ${bundle.url}
Title: ${bundle.title || ''}
Description: ${bundle.description || ''}
Detected Logo URL: ${bundle.logoUrl || '-'}
Detected CSS Colors: ${colorsText}
Detected Fonts: ${fontsText}
Detected Contacts/Socials: ${JSON.stringify(bundle.socials || {})}

--- HOMEPAGE TEXT ---
${String(bundle.text || '').slice(0, 4500)}

--- PRODUCT & ABOUT SUB-PAGES ---
${subSection.slice(0, 5000)}

--- ACTIVE META ADS (REAL DATA) ---
${adsSection}`;
}

export function sanitizeAnalyzedBrandKit(parsed, pageUrl, extracted = {}) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw Object.assign(new Error('Model returned invalid Brand Kit'), { status: 502 });
  }
  // Unwrap if LLM nested Brand Kit fields under `{ brandKit: { ... }, detectedProducts: [...] }`
  const nested =
    (parsed.brandKit && typeof parsed.brandKit === 'object' && !Array.isArray(parsed.brandKit) && parsed.brandKit) ||
    (parsed.brand_kit && typeof parsed.brand_kit === 'object' && !Array.isArray(parsed.brand_kit) && parsed.brand_kit) ||
    (parsed.brand && typeof parsed.brand === 'object' && !Array.isArray(parsed.brand) && parsed.brand) ||
    null;
  const source = nested ? { ...parsed, ...nested } : parsed;

  const result = { ...emptyBrandKit };
  for (const [key, fallback] of Object.entries(emptyBrandKit)) {
    if (['colors', 'bannerColor', 'logoDataUrl', 'avatars', 'voices', 'customPages', 'subpages', 'history', 'sectionBlocks'].includes(key)) continue;
    const value = source[key];
    if (Array.isArray(fallback)) {
      result[key] = coerceStringList(value);
    } else {
      const maxLen = OPTIONAL_TEXT_SET.has(key) ? 2800 : 4800;
      const text = coerceString(value, maxLen);
      result[key] = text || (key === 'language' ? fallback : '');
    }
  }

  result.website = String(pageUrl || result.website || '').trim().slice(0, 500);
  if (!result.brandName && extracted?.title) {
    result.brandName = String(extracted.title).split(/[|\-–—]/)[0].trim().slice(0, 120);
  }
  if (!result.about && extracted?.description) {
    result.about = String(extracted.description).trim().slice(0, 1000);
  }

  // Preserve real extracted socials/contacts when LLM left them blank
  const socials = extracted.socials || {};
  for (const k of ['instagram', 'tiktok', 'youtube', 'phone', 'email']) {
    if (!result[k] && socials[k]) result[k] = String(socials[k]).trim().slice(0, 200);
  }

  // Merge LLM-named colors with real CSS extracted colors (never leave empty if CSS had brand colors!)
  const parsedColors = (Array.isArray(source.colors) ? source.colors : [])
    .map((color) => {
      if (!color || typeof color !== 'object') return null;
      const hex = normalizeHex(color.hex);
      const name = String(color.name || '').trim().slice(0, 80);
      return hex && name ? { name, hex } : null;
    })
    .filter(Boolean);
  const fallbackColors = Array.isArray(extracted.colors) ? extracted.colors : [];
  result.colors = (parsedColors.length ? parsedColors : fallbackColors).slice(0, 24);

  // Merge real detected fonts if LLM left them blank
  if (!result.fonts.length && Array.isArray(extracted.fonts) && extracted.fonts.length) {
    result.fonts = extracted.fonts.slice(0, 8);
  }

  result.bannerColor = normalizeHex(source.bannerColor) || result.colors[0]?.hex || '#5B45F2';

  const candidateLogo =
    (typeof source.logoDataUrl === 'string' && source.logoDataUrl.trim()) ||
    (typeof extracted.logoUrl === 'string' && extracted.logoUrl.trim()) ||
    '';
  result.logoDataUrl = candidateLogo && candidateLogo.length <= 350000 && LOGO_URL_RE.test(candidateLogo) ? candidateLogo : '';

  result.avatars = [];
  result.voices = [];
  result.customPages = [];
  result.subpages = Array.isArray(source.subpages) ? source.subpages : [];
  result.sectionBlocks = source.sectionBlocks && typeof source.sectionBlocks === 'object' ? source.sectionBlocks : {};

  try {
    return validateBrandKit(result);
  } catch (error) {
    throw Object.assign(new Error(`Model returned an invalid Brand Kit: ${error.message}`), { status: 502, cause: error });
  }
}

function normalizeOfficialUrl(raw) {
  const s = String(raw || '').trim().replace(/[),.;]+$/, '');
  if (!s) return '';
  try {
    const withProto = /^https?:\/\//i.test(s) ? s : /^[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(s) ? `https://${s}` : '';
    if (!withProto) return '';
    const u = new URL(withProto);
    if (!['http:', 'https:'].includes(u.protocol) || !u.hostname.includes('.')) return '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function buildAutoSubpages({ brandKit, detectedProducts = [], subPages = [], competitorProfiles = [] }) {
  const existing = Array.isArray(brandKit.subpages) ? [...brandKit.subpages] : [];
  const seen = new Set(existing.map((p) => String(p.title || '').toLowerCase()));

  const slugOf = (name) =>
    String(name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'page';

  const firstProductTitle = detectedProducts[0]?.name || '';

  // 1. Rich Product Subpages (matches "My Brand / Products / New Evowhey" reference!)
  for (const prod of detectedProducts) {
    const title = String(prod.name || '').trim();
    if (!title || seen.has(title.toLowerCase())) continue;
    seen.add(title.toLowerCase());
    const matchedSub = (subPages || []).find(
      (sp) => sp.url === prod.url || sp.title?.toLowerCase().includes(title.toLowerCase().split(' ')[0]),
    );
    const blocks = [];
    if (prod.description || prod.usp || prod.url) {
      blocks.push({ id: 'what-h', type: 'heading', text: 'What it is' });
      blocks.push({
        id: 'what-p',
        type: 'paragraph',
        text: [prod.description || prod.usp, prod.url ? `Page: ${prod.url}` : ''].filter(Boolean).join('\n'),
      });
    }
    const featurePoints = [prod.usp, ...(matchedSub?.prices?.length ? [`Detected price range: ${matchedSub.prices.join(' · ')}`] : [])]
      .filter(Boolean);
    if (featurePoints.length) {
      blocks.push({ id: 'feat-h', type: 'heading', text: 'Key features' });
      blocks.push({ id: 'feat-b', type: 'bullets', items: featurePoints });
    }
    const variantItems = coerceStringList(prod.variants, 10, 240);
    if (variantItems.length) {
      blocks.push({ id: 'var-h', type: 'heading', text: 'Variants' });
      blocks.push({ id: 'var-b', type: 'bullets', items: variantItems });
    }
    if (prod.howItsUsed) {
      blocks.push({ id: 'how-h', type: 'heading', text: "How it's used" });
      blocks.push({ id: 'how-p', type: 'paragraph', text: prod.howItsUsed });
    }
    if (prod.price) {
      blocks.push({ id: 'price-h', type: 'heading', text: 'Pricing' });
      blocks.push({ id: 'price-p', type: 'paragraph', text: prod.price });
    }
    blocks.push({ id: 'who-h', type: 'heading', text: "Who it's for" });
    blocks.push({
      id: 'who-p',
      type: 'paragraph',
      text: `[[Audience]] looking for quality ${prod.category || title} from ${brandKit.brandName || 'this brand'}.`,
    });
    if (prod.imageUrl) {
      blocks.push({ id: 'media-h', type: 'heading', text: 'Media' });
      blocks.push({ id: 'media-img', type: 'image', url: prod.imageUrl, caption: title });
    }

    existing.push({
      id: `sub-prod-${slugOf(title)}`,
      slug: slugOf(title),
      parent: 'products',
      title,
      subtitle: (prod.usp || prod.category || '').slice(0, 180),
      url: prod.url || '',
      imageUrl: prod.imageUrl || '',
      blocks,
    });
  }

  // 2. Rich Competitor Subpages (prefer structured competitorProfiles with official website URLs)
  const profileMap = new Map();
  for (const cp of Array.isArray(competitorProfiles) ? competitorProfiles : []) {
    if (!cp || typeof cp !== 'object') continue;
    const name = String(cp.name || '').trim();
    if (!name) continue;
    profileMap.set(name.toLowerCase(), cp);
  }

  const pushCompetitorPage = ({ title, subtitle, website, positioning, strengths = [], weaknesses = [], adAngles = [] }) => {
    const cleanTitle = String(title || '').trim();
    if (!cleanTitle || seen.has(cleanTitle.toLowerCase())) return;
    seen.add(cleanTitle.toLowerCase());
    const cleanUrl = normalizeOfficialUrl(website);
    const blocks = [
      { id: 'c-pos-h', type: 'heading', text: 'Positioning' },
      {
        id: 'c-pos-p',
        type: 'paragraph',
        text: [
          positioning || subtitle || `${cleanTitle} is a direct competitor in the ${brandKit.category || 'same'} category.`,
          cleanUrl ? `Website: ${cleanUrl}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ];
    const cleanStrengths = coerceStringList(strengths, 6, 300);
    if (cleanStrengths.length) {
      blocks.push({ id: 'c-str-h', type: 'heading', text: 'Strengths' });
      blocks.push({ id: 'c-str-b', type: 'bullets', items: cleanStrengths });
    }
    const cleanWeaknesses = coerceStringList(weaknesses, 6, 300);
    if (cleanWeaknesses.length) {
      blocks.push({ id: 'c-weak-h', type: 'heading', text: 'Weaknesses' });
      blocks.push({ id: 'c-weak-b', type: 'bullets', items: cleanWeaknesses });
    }
    const cleanAngles = coerceStringList(adAngles, 6, 360);
    const defaultAngles = [
      brandKit.compareAgainst || 'Highlight core product advantages & verified customer proof.',
      firstProductTitle
        ? `Compare directly against [[${firstProductTitle}]] in the first 3 seconds to win [[Audience]] attention.`
        : brandKit.leadWith || 'Lead with hero [[Products]] in the first 3 seconds to capture attention.',
    ].filter(Boolean);
    blocks.push({ id: 'c-beat-h', type: 'heading', text: 'Ad angles' });
    blocks.push({ id: 'c-beat-b', type: 'bullets', items: cleanAngles.length ? cleanAngles : defaultAngles });

    existing.push({
      id: `sub-comp-${slugOf(cleanTitle)}`,
      slug: slugOf(cleanTitle),
      parent: 'competitors',
      title: cleanTitle,
      subtitle: String(subtitle || positioning || '').slice(0, 180),
      url: cleanUrl,
      imageUrl: '',
      blocks,
    });
  };

  for (const cp of profileMap.values()) {
    pushCompetitorPage({
      title: cp.name,
      subtitle: cp.subtitle,
      website: cp.website || cp.url,
      positioning: cp.positioning,
      strengths: cp.strengths,
      weaknesses: cp.weaknesses,
      adAngles: cp.adAngles,
    });
  }

  for (const compLine of (brandKit.competitors || []).slice(0, 6)) {
    const rawLine = String(compLine || '');
    const urlMatch = rawLine.match(/https?:\/\/[^\s)]+/i);
    const extractedUrl = urlMatch ? normalizeOfficialUrl(urlMatch[0]) : '';
    const cleanedLine = rawLine.replace(/\s*\(?\s*https?:\/\/[^\s)]+\s*\)?/gi, '').trim();
    const [namePart, ...rest] = cleanedLine.split(/\s+[—–-]\s+/);
    const title = (namePart || '').trim();
    const note = rest.join(' — ').trim();
    const matchedProfile = profileMap.get(title.toLowerCase());
    pushCompetitorPage({
      title,
      subtitle: note || matchedProfile?.subtitle || '',
      website: extractedUrl || matchedProfile?.website || '',
      positioning: note || matchedProfile?.positioning || '',
    });
  }

  return existing.slice(0, 30);
}

export function sanitizeDetectedProducts(rawProducts, fallbackStrings = [], subPages = []) {
  const out = [];
  const seen = new Set();
  const list = Array.isArray(rawProducts) ? rawProducts : [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const name = String(item.name || '').trim().slice(0, 150);
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    const matchedSub = (subPages || []).find(
      (sp) => sp.url === item.url || sp.title?.toLowerCase().includes(name.toLowerCase().split(' ')[0]),
    );
    const imageUrl = String(item.imageUrl || matchedSub?.imageUrl || '').trim();
    out.push({
      name,
      category: String(item.category || '').trim().slice(0, 80),
      price: String(item.price || matchedSub?.prices?.[0] || '').trim().slice(0, 100),
      usp: String(item.usp || '').trim().slice(0, 320),
      description: String(item.description || '').trim().slice(0, 600),
      variants: coerceStringList(item.variants, 10, 240),
      howItsUsed: coerceString(item.howItsUsed || item.usage || '', 400),
      imageUrl: /^https?:\/\//i.test(imageUrl) ? imageUrl : '',
      url: /^https?:\/\//i.test(String(item.url || '')) ? String(item.url) : matchedSub?.url || '',
    });
    if (out.length >= 16) break;
  }

  // Fallback: if LLM didn't populate detectedProducts, parse from brandKit.products string list
  if (!out.length && Array.isArray(fallbackStrings)) {
    for (const line of fallbackStrings.slice(0, 12)) {
      const [namePart, ...rest] = String(line || '').split(/\s+[—–-]\s+/);
      const name = (namePart || '').trim().slice(0, 150);
      if (!name || seen.has(name.toLowerCase())) continue;
      seen.add(name.toLowerCase());
      out.push({
        name,
        category: '',
        price: '',
        usp: rest.join(' — ').trim().slice(0, 320),
        description: rest.join(' — ').trim().slice(0, 600),
        imageUrl: '',
        url: '',
      });
    }
  }
  return out;
}

const LLM_BRAND_KEYS = Object.keys(emptyBrandKit).filter(
  (k) => !['avatars', 'voices', 'customPages', 'subpages', 'history', 'sectionBlocks', 'logoDataUrl'].includes(k),
);

async function requestBrandAnalysisJson({ endpointUrl, headers, model, useBytePlus, systemContent, userContent, timeoutMs, fetchImpl }) {
  const response = await fetchImpl(endpointUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      temperature: 0.3,
      ...(useBytePlus
        ? { thinking: { type: 'disabled' } }
        : { response_format: { type: 'json_object' }, reasoning: { effort: 'none' } }),
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userContent },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw Object.assign(new Error(`${useBytePlus ? 'BytePlus' : 'OpenRouter'} HTTP ${response.status}`), { status: 502 });
  }
  const content = data?.choices?.[0]?.message?.content;
  try {
    return parseModelJson(content);
  } catch (error) {
    throw Object.assign(new Error(error?.message || 'Model returned invalid JSON'), { status: 502, cause: error });
  }
}

export async function analyzeBrandWebsite(bundleOrPage, { env = process.env, fetchImpl = fetch, poolFactory } = {}) {
  const primaryModel = env.BRAND_ANALYSIS_MODEL || BRAND_ANALYSIS_MODEL;
  const primaryIsBytePlus = isBytePlusModel(primaryModel);
  const hasBytePlus = Boolean(env.BYTEPLUS_API_KEY);
  const hasOpenRouter = Boolean(env.OPENROUTER_API_KEY);

  if (!hasBytePlus && !hasOpenRouter) {
    throw Object.assign(new Error('OPENROUTER_API_KEY / BYTEPLUS_API_KEY belum dikonfigurasi.'), { status: 503 });
  }

  // Optional low-cost ScrapeAtlas enrichment: capped at 6s so it can never cause a timeout
  let metaAds = [];
  const brandHint = bundleOrPage.brandHint || '';
  if (brandHint && brandHint.length >= 3 && env.SCRAPEATLAS_API_KEY) {
    try {
      const research = createResearchProvider({ env, fetchImpl, poolFactory, ttlHours: 24 });
      const adRes = await Promise.race([
        research.searchMetaAds({ query: brandHint, country: 'ID', status: 'ACTIVE', mediaType: 'ALL', limit: 6 }),
        new Promise((resolve) => setTimeout(() => resolve(null), SCRAPEATLAS_ENRICH_TIMEOUT_MS)),
      ]);
      if (adRes?.ok && Array.isArray(adRes.ads)) metaAds = adRes.ads;
    } catch {
      // Non-blocking enrichment
    }
  }

  const systemContent = `Return ONLY a single FLAT JSON object written 100% in clear, strategic ENGLISH (EVEN IF the source website is in Indonesian or another language). DO NOT wrap fields inside a "brandKit" key — all of the following keys MUST sit directly at the JSON root level: ${LLM_BRAND_KEYS.join(', ')}, plus "detectedProducts" (max 8 products: {name, category, price, usp, description, variants, howItsUsed, imageUrl, url}) and "competitorProfiles" (max 4 competitors: {name, website, subtitle, positioning, strengths, weaknesses, adAngles} with official https://... website). Every list field MUST be a flat array of strings (never nested objects). colors is an array of valid {name, hex} #RRGGBB objects. bannerColor is a #RRGGBB hex.`;
  const userContent = buildDeepPrompt(bundleOrPage, metaAds);

  // Build ordered attempts: fast primary first, automatic fallback to the secondary provider
  const attempts = [];
  const openRouterAttempt = (m) => ({
    model: m,
    useBytePlus: false,
    endpointUrl: OPENROUTER_URL,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      'X-Title': 'NexoClip Deep Brand Setup',
    },
    timeoutMs: 45_000,
  });
  const bytePlusAttempt = (m) => ({
    model: m,
    useBytePlus: true,
    endpointUrl: `${String(env.BYTEPLUS_BASE_URL || DEFAULT_BYTEPLUS_URL).replace(/\/+$/, '')}/chat/completions`,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.BYTEPLUS_API_KEY}` },
    timeoutMs: 180_000,
  });

  if (primaryIsBytePlus) {
    if (hasBytePlus) attempts.push(bytePlusAttempt(primaryModel));
    if (hasOpenRouter) attempts.push(openRouterAttempt(OPENROUTER_FALLBACK_MODEL));
  } else {
    if (hasOpenRouter) attempts.push(openRouterAttempt(primaryModel));
    if (hasBytePlus) attempts.push(bytePlusAttempt(BYTEPLUS_FALLBACK_MODEL));
  }

  let parsed = null;
  let usedModel = primaryModel;
  let lastError = null;
  for (const attempt of attempts) {
    try {
      parsed = await requestBrandAnalysisJson({
        ...attempt,
        systemContent,
        userContent,
        fetchImpl,
      });
      usedModel = attempt.model;
      break;
    } catch (err) {
      lastError = err;
      console.warn(`[brand-analyze] ${attempt.model} failed (${err?.message || err}), trying fallback if available...`);
    }
  }
  if (!parsed) {
    throw lastError || Object.assign(new Error('Analisis AI gagal diproses.'), { status: 502 });
  }
  const model = usedModel;

  const baseKit = sanitizeAnalyzedBrandKit(parsed, bundleOrPage.url, bundleOrPage);
  const rawDetectedProducts = parsed.detectedProducts || parsed.brandKit?.detectedProducts || parsed.brand_kit?.detectedProducts || [];
  const rawCompetitorProfiles = parsed.competitorProfiles || parsed.brandKit?.competitorProfiles || parsed.brand_kit?.competitorProfiles || [];
  const detectedProducts = sanitizeDetectedProducts(rawDetectedProducts, baseKit.products, bundleOrPage.subPages);
  const subpages = buildAutoSubpages({
    brandKit: baseKit,
    detectedProducts,
    subPages: bundleOrPage.subPages,
    competitorProfiles: rawCompetitorProfiles,
  });
  const agentHistoryEntry = {
    id: `hist-agent-${Date.now()}`,
    actorType: 'agent',
    actorName: 'Ad Agent',
    source: 'Website',
    createdAt: new Date().toISOString(),
    pages: [
      ...subpages.map((sp) => ({
        targetType: 'subpage',
        targetId: sp.id,
        title: sp.title,
        summary: (sp.blocks || []).filter((b) => b.type === 'heading').map((b) => b.text).slice(0, 4).join(', ') || sp.subtitle || 'Subpage',
      })),
      { targetType: 'section', targetId: 'competitors', title: 'Competitors', summary: 'Landscape, Compare against' },
      { targetType: 'section', targetId: 'products', title: 'Products', summary: 'Lineup, Lead with' },
      { targetType: 'section', targetId: 'messaging', title: 'Messaging', summary: 'Selling points, Tone, Claims to avoid, Glossary' },
      { targetType: 'section', targetId: 'audience', title: 'Audience', summary: 'Target segments' },
      { targetType: 'section', targetId: 'brand-kit', title: 'Brand Kit', summary: 'Logo, Colors, Language, Name and slogans' },
      { targetType: 'section', targetId: 'overview', title: 'Overview', summary: 'About, Category, Positioning, Contact' },
    ],
  };
  const brandKit = validateBrandKit({ ...baseKit, subpages, history: [agentHistoryEntry] });

  return {
    brandKit,
    detectedProducts,
    meta: {
      model,
      pagesCrawled: 1 + (bundleOrPage.subPages?.length || 0),
      metaAdsInspected: metaAds.length,
      colorsDetected: brandKit.colors.length,
    },
  };
}
