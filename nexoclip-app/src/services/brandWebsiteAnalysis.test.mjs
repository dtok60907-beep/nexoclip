import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeBrandWebsite, buildAutoSubpages, sanitizeAnalyzedBrandKit, sanitizeDetectedProducts } from './brandWebsiteAnalysis.js';

test('sanitizeAnalyzedBrandKit flattens object items, fixes empty bannerColor, and preserves CSS colors & logo', () => {
  const kit = sanitizeAnalyzedBrandKit(
    {
      brandName: 'Evolene',
      about: 'Brand suplemen fitness lokal.',
      bannerColor: '',
      colors: [],
      audience: [{ segment: 'Pemula Gym', painPoint: 'Susah naik BB', angle: 'Surplus kalori' }],
      products: [{ name: 'Evomass', description: '60g protein & 930 kkal' }],
      competitors: ['Muscle First', 'Provus'],
    },
    'https://evolene.co.id/',
    {
      logoUrl: 'https://evolene.co.id/assets/web/apple-touch-icon.png',
      colors: [{ name: 'Primary Brand', hex: '#EA3247' }],
      socials: { instagram: '@evoleneofficial' },
    },
  );

  assert.equal(kit.brandName, 'Evolene');
  assert.equal(kit.bannerColor, '#EA3247');
  assert.equal(kit.colors.length, 1);
  assert.equal(kit.colors[0].hex, '#EA3247');
  assert.equal(kit.logoDataUrl, 'https://evolene.co.id/assets/web/apple-touch-icon.png');
  assert.equal(kit.instagram, '@evoleneofficial');
  assert.match(kit.audience[0], /Pemula Gym/);
  assert.match(kit.products[0], /Evomass/);
  assert.deepEqual(kit.competitors, ['Muscle First', 'Provus']);
});

test('sanitizeDetectedProducts deduplicates and enriches from subPages', () => {
  const items = sanitizeDetectedProducts(
    [
      { name: 'Isolene', price: 'Rp 396.000', usp: '27g protein isolate', url: 'https://evolene.co.id/produk/isolene' },
      { name: 'isolene', price: 'Rp 396.000' },
    ],
    [],
    [{ url: 'https://evolene.co.id/produk/isolene', title: 'Isolene', imageUrl: 'https://evolene.co.id/img/isolene.webp', prices: ['Rp 396.000'] }],
  );

  assert.equal(items.length, 1);
  assert.equal(items[0].name, 'Isolene');
  assert.equal(items[0].imageUrl, 'https://evolene.co.id/img/isolene.webp');
});

test('buildAutoSubpages preserves official competitor website URLs from competitorProfiles and competitor lines', () => {
  const subpages = buildAutoSubpages({
    brandKit: {
      brandName: 'Evolene',
      category: 'Fitness Supplement',
      competitors: [
        'Optimum Nutrition — Global whey leader',
        'Muscle First — Whey lokal terjangkau (https://musclefirst.co.id)',
      ],
      compareAgainst: 'Lab-tested every batch',
      leadWith: '80% protein ratio',
    },
    detectedProducts: [{ name: 'New Evowhey', usp: 'Evosorption whey', url: 'https://evolene.co.id/produk/new-evowhey' }],
    competitorProfiles: [
      {
        name: 'Optimum Nutrition',
        website: 'https://www.optimumnutrition.com',
        subtitle: 'Global whey leader',
        positioning: 'Premium imported gold standard whey',
        strengths: ['High brand awareness'],
        weaknesses: ['Higher price in Indonesia'],
        adAngles: ['Compare against [[New Evowhey]]'],
      },
    ],
  });

  const onPage = subpages.find((p) => p.title === 'Optimum Nutrition');
  const mfPage = subpages.find((p) => p.title === 'Muscle First');
  assert.ok(onPage, 'Optimum Nutrition subpage should exist');
  assert.equal(onPage.parent, 'competitors');
  assert.equal(onPage.url, 'https://www.optimumnutrition.com');
  assert.ok(mfPage, 'Muscle First subpage should exist');
  assert.equal(mfPage.url, 'https://musclefirst.co.id');
});

test('analyzeBrandWebsite uses BytePlus dola-seed-2-1-turbo primary and falls back to OpenRouter on failure, plus repairs truncated JSON', async () => {
  const calledUrls = [];
  const res = await analyzeBrandWebsite(
    {
      url: 'https://evolene.co.id/',
      title: 'Evolene Indonesia',
      description: 'Suplemen fitness lokal teruji lab.',
      text: 'Evolene Whey Protein & Evomass.',
      brandHint: 'evolene',
      colors: [{ name: 'Primary Brand', hex: '#EA3247' }],
      fonts: ['Inter'],
      socials: { instagram: '@evoleneofficial' },
      subPages: [],
    },
    {
      env: { BYTEPLUS_API_KEY: 'bp-key', OPENROUTER_API_KEY: 'or-key' },
      fetchImpl: async (url) => {
        calledUrls.push(String(url));
        if (String(url).includes('bytepluses.com')) {
          throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            choices: [
              {
                message: {
                  // Intentionally truncated JSON at the end to verify repairTruncatedJson
                  content:
                    '{"brandName":"Evolene","about":"Suplemen fitness lokal teruji lab.","category":"Fitness Supplement","colors":[{"name":"Crimson","hex":"#EA3247"}],"bannerColor":"#EA3247","detectedProducts":[{"name":"New Evowhey","usp":"25g protein","description":"Whey protein"',
                },
              },
            ],
          }),
        };
      },
    },
  );

  assert.equal(calledUrls.length, 2);
  assert.match(calledUrls[0], /bytepluses\.com/);
  assert.match(calledUrls[1], /openrouter\.ai/);
  assert.equal(res.brandKit.brandName, 'Evolene');
  assert.equal(res.detectedProducts[0].name, 'New Evowhey');
  assert.equal(res.meta.model, 'google/gemini-2.5-flash');
});

test('sanitizeAnalyzedBrandKit unwraps nested brandKit object returned by Gemini JSON mode', () => {
  const kit = sanitizeAnalyzedBrandKit(
    {
      brandKit: {
        brandName: 'Evolene',
        about: 'Brand suplemen fitness lokal teruji lab.',
        category: 'Sports Nutrition',
        tone: 'Santai & tegas',
        audience: ['Pemula gym'],
        products: ['New Evowhey'],
        competitors: ['Muscle First'],
        sellingPoints: ['Lab-tested setiap batch'],
      },
      detectedProducts: [{ name: 'New Evowhey' }],
    },
    'https://evolene.co.id/',
  );
  assert.equal(kit.brandName, 'Evolene');
  assert.equal(kit.about, 'Brand suplemen fitness lokal teruji lab.');
  assert.equal(kit.category, 'Sports Nutrition');
  assert.deepEqual(kit.audience, ['Pemula gym']);
  assert.deepEqual(kit.products, ['New Evowhey']);
  assert.deepEqual(kit.competitors, ['Muscle First']);
  assert.deepEqual(kit.sellingPoints, ['Lab-tested setiap batch']);
});
