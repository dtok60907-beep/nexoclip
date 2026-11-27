// Loads workspace brand kit, products, active brand memories, and connected integrations for AI Creative Marketing.
import { getPool } from '../db/pool.js';
import { getWorkspaceBrandKit } from '../repositories/brandKitRepository.js';

export const MEMORY_CATEGORIES = [
  'preference',
  'creative_history',
  'feedback',
  'performance',
  'audience_insight',
];

export async function listBrandMemories(workspaceId, { category = null, activeOnly = true, limit = 50, db = getPool() } = {}) {
  const params = [workspaceId];
  const clauses = ['workspace_id = $1'];
  if (activeOnly) clauses.push('active = TRUE');
  if (category && MEMORY_CATEGORIES.includes(category)) {
    params.push(category);
    clauses.push(`category = $${params.length}`);
  }
  params.push(Math.min(Math.max(Number(limit) || 50, 1), 200));
  const res = await db.query(
    `SELECT id, workspace_id, owner_id, category, content, source_type, source_id, confidence, active, created_at, updated_at
     FROM brand_memories
     WHERE ${clauses.join(' AND ')}
     ORDER BY updated_at DESC
     LIMIT $${params.length}`,
    params,
  );
  return res.rows;
}

export async function createBrandMemory({
  workspaceId,
  ownerId = null,
  category = 'preference',
  content,
  sourceType = 'agent',
  sourceId = null,
  confidence = 0.85,
  db = getPool(),
}) {
  const cleanCategory = MEMORY_CATEGORIES.includes(category) ? category : 'preference';
  const cleanContent = String(content || '').trim().slice(0, 600);
  if (!cleanContent) throw Object.assign(new Error('Isi memory wajib diisi.'), { status: 400 });

  // Deduplicate exact active memory in the same workspace & category
  const existing = await db.query(
    `SELECT id, workspace_id, owner_id, category, content, source_type, source_id, confidence, active, created_at, updated_at
     FROM brand_memories
     WHERE workspace_id = $1 AND category = $2 AND active = TRUE AND lower(content) = lower($3)
     LIMIT 1`,
    [workspaceId, cleanCategory, cleanContent],
  );
  if (existing.rows[0]) return existing.rows[0];

  const res = await db.query(
    `INSERT INTO brand_memories (workspace_id, owner_id, category, content, source_type, source_id, confidence)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, workspace_id, owner_id, category, content, source_type, source_id, confidence, active, created_at, updated_at`,
    [workspaceId, ownerId, cleanCategory, cleanContent, sourceType, sourceId, Number(confidence) || 0.85],
  );
  return res.rows[0];
}

export async function deleteBrandMemory({ workspaceId, memoryId, db = getPool() }) {
  const res = await db.query(
    `DELETE FROM brand_memories WHERE workspace_id = $1 AND id = $2 RETURNING id`,
    [workspaceId, memoryId],
  );
  return Boolean(res.rows[0]);
}

export async function loadWorkspaceMarketingContext({
  workspaceId,
  selectedProductIds = [],
  includeBrand = true,
  db = getPool(),
}) {
  const [brandKit, productsRes, memories, integrationsRes] = await Promise.all([
    includeBrand ? getWorkspaceBrandKit(db, workspaceId).catch(() => null) : Promise.resolve(null),
    db
      .query(
        'SELECT id, name, data, updated_at FROM workspace_products WHERE workspace_id = $1 ORDER BY updated_at DESC LIMIT 40',
        [workspaceId],
      )
      .catch(() => ({ rows: [] })),
    listBrandMemories(workspaceId, { activeOnly: true, limit: 30, db }).catch(() => []),
    db
      .query(
        `SELECT provider, display_name, status FROM workspace_integrations
         WHERE workspace_id = $1 AND status = 'connected'
         ORDER BY updated_at DESC`,
        [workspaceId],
      )
      .catch(() => ({ rows: [] })),
  ]);

  const allProducts = (productsRes.rows || []).map((row) => ({
    ...(row.data && typeof row.data === 'object' ? row.data : {}),
    id: row.id,
    name: row.name,
  }));

  const selectedSet = new Set((selectedProductIds || []).map(String));
  const selectedProducts = selectedSet.size
    ? allProducts.filter((p) => selectedSet.has(String(p.id)))
    : [];

  return {
    brandKit: brandKit || null,
    products: allProducts,
    selectedProducts,
    memories,
    integrations: integrationsRes.rows || [],
  };
}

function slugify(text) {
  return (
    String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'item'
  );
}

function serializeBlocksToSections(blocks = [], fallbackText = '') {
  const sections = [];
  let current = null;
  const pushCurrent = () => {
    if (!current) return;
    const content = current.lines.filter(Boolean).join('\n').trim();
    if (content) {
      sections.push({
        id: current.id,
        label: current.label,
        content,
      });
    }
  };
  for (let i = 0; i < (blocks || []).length; i += 1) {
    const blk = blocks[i];
    if (!blk || typeof blk !== 'object') continue;
    if (blk.type === 'heading' && String(blk.text || '').trim()) {
      pushCurrent();
      const label = String(blk.text).trim();
      current = { id: `sec-${slugify(label)}-${i}`, label, lines: [] };
      continue;
    }
    if (!current) {
      current = { id: `sec-overview-${i}`, label: 'Overview', lines: [] };
    }
    if (blk.type === 'paragraph' && blk.text) {
      current.lines.push(String(blk.text).trim());
    } else if ((blk.type === 'bullets' || blk.type === 'numbers') && Array.isArray(blk.items)) {
      const items = blk.items.map((x) => String(x || '').trim()).filter(Boolean);
      if (items.length) current.lines.push(items.map((x) => `- ${x}`).join('\n'));
    } else if (blk.type === 'image' && blk.url) {
      current.lines.push(`[Image${blk.caption ? `: ${blk.caption}` : ''}] ${blk.url}`);
    }
  }
  pushCurrent();
  if (!sections.length && fallbackText) {
    sections.push({ id: 'sec-what-it-is', label: 'What it is', content: fallbackText });
  }
  return sections;
}

function serializeFullSubpage(sp, sections) {
  const parts = [];
  if (sp.subtitle) parts.push(sp.subtitle);
  if (sp.url) parts.push(`URL: ${sp.url}`);
  for (const s of sections || []) {
    parts.push(`${s.label}:\n${s.content}`);
  }
  return parts.filter(Boolean).join('\n\n').trim();
}

function splitSegmentTitle(line, idx) {
  const raw = String(line || '').trim();
  const [head] = raw.split(/\s*[—–:|]\s*/);
  const clean = (head || '').trim();
  if (clean && clean.length <= 54) return clean;
  return raw.slice(0, 40).trim() || `Segment ${idx + 1}`;
}

/**
 * Builds the dynamic hierarchical My Brand + Products context tree for the
 * @ mention and + -> My Brand cascading picker in AI Creative Marketing.
 */
export function extractBrandContextTree(brandKit, products = []) {
  const b = brandKit && typeof brandKit === 'object' ? brandKit : null;
  const subpages = Array.isArray(b?.subpages) ? b.subpages : [];

  const nonEmpty = (items) => items.filter((item) => item && String(item.content || '').trim());

  // 1. Overview
  const contactLines = b
    ? [
        b.website ? `Website: ${b.website}` : '',
        b.app ? `App: ${b.app}` : '',
        b.phone ? `Phone: ${b.phone}` : '',
        b.email ? `Email: ${b.email}` : '',
        b.instagram ? `Instagram: ${b.instagram}` : '',
        b.tiktok ? `TikTok: ${b.tiktok}` : '',
        b.youtube ? `YouTube: ${b.youtube}` : '',
        b.address ? `Address: ${b.address}` : '',
        b.legalEntity ? `Legal Entity: ${b.legalEntity}` : '',
      ].filter(Boolean)
    : [];

  const overviewChildren = b
    ? nonEmpty([
        { id: 'overview:about', label: 'About', path: 'Overview › About', content: [b.about, b.mission ? `Mission: ${b.mission}` : ''].filter(Boolean).join('\n') },
        { id: 'overview:category', label: 'Category', path: 'Overview › Category', content: b.category || '' },
        { id: 'overview:positioning', label: 'Positioning', path: 'Overview › Positioning', content: b.positioning || '' },
        { id: 'overview:contact', label: 'Contact', path: 'Overview › Contact', content: contactLines.join('\n') },
      ])
    : [];

  // 2. Brand Kit
  const brandKitChildren = b
    ? nonEmpty([
        {
          id: 'brand-kit:language',
          label: 'Language',
          path: 'Brand Kit › Language',
          content: [b.language, b.pronunciation ? `Pronunciation: ${b.pronunciation}` : ''].filter(Boolean).join('\n'),
        },
        {
          id: 'brand-kit:name-and-slogans',
          label: 'Name and slogans',
          path: 'Brand Kit › Name and slogans',
          content: [
            b.brandName ? `Brand Name: ${b.brandName}` : '',
            b.headline ? `Headline: ${b.headline}` : '',
            ...(Array.isArray(b.slogans) && b.slogans.length ? [`Slogans: ${b.slogans.join(' · ')}`] : []),
          ]
            .filter(Boolean)
            .join('\n'),
        },
        {
          id: 'brand-kit:colors',
          label: 'Colors',
          path: 'Brand Kit › Colors',
          content: Array.isArray(b.colors) && b.colors.length ? b.colors.map((c) => `${c.name}: ${c.hex}`).join(' · ') : '',
        },
        {
          id: 'brand-kit:typography',
          label: 'Typography',
          path: 'Brand Kit › Typography',
          content: Array.isArray(b.fonts) && b.fonts.length ? b.fonts.join(' · ') : '',
        },
      ])
    : [];

  // 3. Audience (dynamic per segment!)
  const audienceChildren = [];
  if (b) {
    const audBlocks = b.sectionBlocks?.audience;
    if (Array.isArray(audBlocks) && audBlocks.some((blk) => blk.type === 'heading')) {
      for (const sec of serializeBlocksToSections(audBlocks)) {
        audienceChildren.push({
          id: `audience:${sec.id}`,
          label: sec.label,
          path: `Audience › ${sec.label}`,
          content: sec.content,
        });
      }
    }
    const seenAud = new Set(audienceChildren.map((a) => a.label.toLowerCase()));
    (Array.isArray(b.audience) ? b.audience : []).forEach((line, idx) => {
      const clean = String(line || '').trim();
      if (!clean) return;
      const label = splitSegmentTitle(clean, idx);
      if (seenAud.has(label.toLowerCase())) return;
      seenAud.add(label.toLowerCase());
      audienceChildren.push({
        id: `audience:seg-${slugify(label)}-${idx}`,
        label,
        path: `Audience › ${label}`,
        content: clean,
      });
    });
  }

  // 4. Messaging
  const messagingChildren = b
    ? nonEmpty([
        {
          id: 'messaging:selling-points',
          label: 'Selling points',
          path: 'Messaging › Selling points',
          content: Array.isArray(b.sellingPoints) && b.sellingPoints.length ? b.sellingPoints.map((x) => `- ${x}`).join('\n') : '',
        },
        { id: 'messaging:tone', label: 'Tone', path: 'Messaging › Tone', content: b.tone || '' },
        {
          id: 'messaging:claims-to-avoid',
          label: 'Claims to avoid',
          path: 'Messaging › Claims to avoid',
          content: [
            ...(Array.isArray(b.claimsToAvoid) ? b.claimsToAvoid.map((x) => `- ${x}`) : []),
            b.disclaimer ? `Disclaimer: ${b.disclaimer}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        },
        {
          id: 'messaging:glossary',
          label: 'Glossary',
          path: 'Messaging › Glossary',
          content: Array.isArray(b.glossary) && b.glossary.length ? b.glossary.map((x) => `- ${x}`).join('\n') : '',
        },
      ])
    : [];

  // 5. Competitors (dynamic: Landscape, Compare against, + each Competitor subpage with its own 3rd-level children!)
  const competitorChildren = [];
  if (b) {
    if (Array.isArray(b.competitors) && b.competitors.length) {
      competitorChildren.push({
        id: 'competitors:landscape',
        label: 'Landscape',
        path: 'Competitors › Landscape',
        content: b.competitors.map((x) => `- ${x}`).join('\n'),
      });
    }
    if (b.compareAgainst) {
      competitorChildren.push({
        id: 'competitors:compare-against',
        label: 'Compare against',
        path: 'Competitors › Compare against',
        content: b.compareAgainst,
      });
    }
    const seenComp = new Set();
    for (const sp of subpages.filter((p) => p.parent === 'competitors')) {
      const title = String(sp.title || '').trim();
      if (!title || seenComp.has(title.toLowerCase())) continue;
      seenComp.add(title.toLowerCase());
      const sections = serializeBlocksToSections(sp.blocks, sp.subtitle);
      competitorChildren.push({
        id: `competitor:${sp.id}`,
        kind: 'competitor',
        label: title,
        path: `Competitors › ${title}`,
        url: sp.url || '',
        content: serializeFullSubpage(sp, sections),
        children: sections.map((sec) => ({
          id: `competitor:${sp.id}:${sec.id}`,
          label: sec.label,
          path: `Competitors › ${title} › ${sec.label}`,
          content: sec.content,
        })),
      });
    }
    for (const line of Array.isArray(b.competitors) ? b.competitors : []) {
      const raw = String(line || '').trim();
      const cleaned = raw.replace(/\s*\(?\s*https?:\/\/[^\s)]+\s*\)?/gi, '').trim();
      const [namePart, ...rest] = cleaned.split(/\s+[—–-]\s+/);
      const title = (namePart || '').trim();
      const note = rest.join(' — ').trim();
      if (!title || seenComp.has(title.toLowerCase())) continue;
      seenComp.add(title.toLowerCase());
      const urlMatch = raw.match(/https?:\/\/[^\s)]+/i);
      const url = urlMatch ? urlMatch[0].replace(/[.,;)]+$/, '') : '';
      const subId = `sub-comp-${slugify(title)}`;
      const fallbackSections = [
        { id: 'pos', label: 'Positioning', content: [note || `${title} adalah kompetitor langsung.`, url ? `Website: ${url}` : ''].filter(Boolean).join('\n') },
        ...(b.compareAgainst ? [{ id: 'angles', label: 'Ad angles', content: b.compareAgainst }] : []),
      ];
      competitorChildren.push({
        id: `competitor:${subId}`,
        kind: 'competitor',
        label: title,
        path: `Competitors › ${title}`,
        url,
        content: serializeFullSubpage({ subtitle: note, url }, fallbackSections),
        children: fallbackSections.map((sec) => ({
          id: `competitor:${subId}:${sec.id}`,
          label: sec.label,
          path: `Competitors › ${title} › ${sec.label}`,
          content: sec.content,
        })),
      });
    }
  }

  // 6. Products overview section (under My Brand)
  const productsOverviewChildren = b
    ? nonEmpty([
        {
          id: 'products-overview:lineup',
          label: 'Lineup',
          path: 'Products › Lineup',
          content:
            Array.isArray(b.products) && b.products.length
              ? b.products.map((x) => `- ${x}`).join('\n')
              : (products || []).map((p) => `- ${p.name}`).join('\n'),
        },
        { id: 'products-overview:lead-with', label: 'Lead with', path: 'Products › Lead with', content: b.leadWith || '' },
      ])
    : [];

  // 7. Individual Products with dynamic subpage headings (What it is, Key features, Variants, How it's used, Pricing, Who it's for, Media)
  const productEntries = [];
  const seenProd = new Set();
  const catalogByName = new Map(
    (products || []).map((p) => [String(p.name || '').trim().toLowerCase(), p]),
  );

  for (const sp of subpages.filter((p) => p.parent === 'products')) {
    const title = String(sp.title || '').trim();
    if (!title || seenProd.has(title.toLowerCase())) continue;
    seenProd.add(title.toLowerCase());
    const catMatch = catalogByName.get(title.toLowerCase()) || null;
    const sections = serializeBlocksToSections(sp.blocks, sp.subtitle);
    const thumb =
      sp.imageUrl ||
      catMatch?.imageUrl ||
      catMatch?.media?.find((m) => m.kind === 'image')?.url ||
      '';
    productEntries.push({
      id: `product:${sp.id}`,
      productId: catMatch?.id || null,
      label: title,
      path: title,
      imageUrl: thumb,
      url: sp.url || catMatch?.url || '',
      content: serializeFullSubpage(sp, sections),
      children: sections.map((sec) => ({
        id: `product:${sp.id}:${sec.id}`,
        productId: catMatch?.id || null,
        label: sec.label,
        path: `${title} › ${sec.label}`,
        content: sec.content,
      })),
    });
  }

  for (const p of products || []) {
    const title = String(p.name || '').trim();
    if (!title || seenProd.has(title.toLowerCase())) continue;
    seenProd.add(title.toLowerCase());
    const thumb =
      p.imageUrl ||
      p.image ||
      p.thumbnailUrl ||
      p.media?.find((m) => m.kind === 'image')?.url ||
      (Array.isArray(p.images) && typeof p.images[0] === 'string' ? p.images[0] : p.images?.[0]?.url || '');
    const sections = nonEmpty([
      {
        id: 'what-it-is',
        label: 'What it is',
        content: [p.description || p.about || p.advantages || p.usp || '', p.url ? `Page: ${p.url}` : ''].filter(Boolean).join('\n'),
      },
      {
        id: 'key-features',
        label: 'Key features',
        content: [p.usp, ...(Array.isArray(p.benefits) ? p.benefits : []), ...(Array.isArray(p.sellingPoints) ? p.sellingPoints : [])]
          .filter(Boolean)
          .map((x) => `- ${x}`)
          .join('\n'),
      },
      {
        id: 'variants',
        label: 'Variants',
        content: Array.isArray(p.variants) && p.variants.length ? p.variants.map((x) => `- ${x}`).join('\n') : '',
      },
      { id: 'how-its-used', label: "How it's used", content: p.howItsUsed || p.usage || '' },
      { id: 'pricing', label: 'Pricing', content: p.price || '' },
      { id: 'who-its-for', label: "Who it's for", content: p.category ? `Audience seeking ${p.category}` : '' },
      { id: 'media', label: 'Media', content: thumb ? `[Product Image] ${thumb}` : '' },
    ]);
    productEntries.push({
      id: `product:${p.id}`,
      productId: p.id,
      label: title,
      path: title,
      imageUrl: thumb,
      url: p.url || '',
      content: serializeFullSubpage({ subtitle: p.advantages || p.usp || '', url: p.url || '' }, sections),
      children: sections.map((sec) => ({
        id: `product:${p.id}:${sec.id}`,
        productId: p.id,
        label: sec.label,
        path: `${title} › ${sec.label}`,
        content: sec.content,
      })),
    });
  }

  const sections = [
    {
      id: 'section:overview',
      key: 'overview',
      label: 'Overview',
      path: 'Overview',
      content: overviewChildren.map((c) => `${c.label}:\n${c.content}`).join('\n\n'),
      children: overviewChildren,
    },
    {
      id: 'section:brand-kit',
      key: 'brand-kit',
      label: 'Brand Kit',
      path: 'Brand Kit',
      content: brandKitChildren.map((c) => `${c.label}:\n${c.content}`).join('\n\n'),
      children: brandKitChildren,
    },
    {
      id: 'section:audience',
      key: 'audience',
      label: 'Audience',
      path: 'Audience',
      content: audienceChildren.map((c) => `${c.label}: ${c.content}`).join('\n'),
      children: audienceChildren,
    },
    {
      id: 'section:messaging',
      key: 'messaging',
      label: 'Messaging',
      path: 'Messaging',
      content: messagingChildren.map((c) => `${c.label}:\n${c.content}`).join('\n\n'),
      children: messagingChildren,
    },
    {
      id: 'section:competitors',
      key: 'competitors',
      label: 'Competitors',
      path: 'Competitors',
      content: competitorChildren.map((c) => `${c.label}:\n${c.content}`).join('\n\n'),
      children: competitorChildren,
    },
    {
      id: 'section:products',
      key: 'products',
      label: 'Products',
      path: 'Products',
      content: productsOverviewChildren.map((c) => `${c.label}:\n${c.content}`).join('\n\n'),
      children: productsOverviewChildren,
    },
    ...(Array.isArray(b?.avatars) && b.avatars.length
      ? [
          {
            id: 'section:avatars',
            key: 'audience',
            label: 'Avatars',
            path: 'Avatars',
            content: b.avatars
              .map((av) => `- ${av.name}${av.description ? `: ${av.description}` : ''}`)
              .join('\n'),
            children: b.avatars.map((av, idx) => ({
              id: `avatar:${av.id || idx}`,
              label: av.name || `Avatar ${idx + 1}`,
              path: `Avatars › ${av.name || `Avatar ${idx + 1}`}`,
              content: [
                `Avatar Name: ${av.name || `Avatar ${idx + 1}`}`,
                av.description ? `Profile: ${av.description}` : '',
                av.wardrobe ? `Wardrobe: ${av.wardrobe}` : '',
                av.voiceStyle ? `Voice Style: ${av.voiceStyle}` : '',
                av.lighting ? `Lighting: ${av.lighting}` : '',
                av.imageUrl ? `Portrait Asset: ${av.imageUrl}` : '',
              ]
                .filter(Boolean)
                .join('\n'),
            })),
          },
        ]
      : []),
  ];

  return {
    brandName: b?.brandName || '',
    configured: Boolean(b?.brandName),
    sections,
    products: productEntries,
  };
}

export function formatContextForPrompt(ctx) {
  const sections = [];
  const contextRefs = Array.isArray(ctx.contextRefs)
    ? ctx.contextRefs.filter((r) => r && (r.content || r.label)).slice(0, 20)
    : [];
  const hasPartialOnly = contextRefs.length > 0 && !ctx.brandKit;

  if (hasPartialOnly) {
    if (ctx.brandNameHint) {
      sections.push(`## BRAND IDENTITY\nBrand Name: ${ctx.brandNameHint}`);
    }
    const refBlocks = contextRefs.map((ref) => {
      const title = String(ref.path || ref.label || 'Context').trim().slice(0, 140);
      const body = String(ref.content || '').trim().slice(0, 3000);
      return `### ${title}\n${body || '(selected reference)'}`;
    });
    sections.push(`## SELECTED PARTIAL CONTEXT (USE ONLY THESE REFERENCED SECTIONS)\n${refBlocks.join('\n\n')}`);
  } else if (ctx.brandKit) {
    const b = ctx.brandKit;
    const lines = [
      b.brandName ? `Brand Name: ${b.brandName}` : null,
      b.category ? `Category: ${b.category}` : null,
      b.about ? `About: ${b.about}` : null,
      b.positioning ? `Positioning: ${b.positioning}` : null,
      b.tone ? `Tone of Voice: ${b.tone}` : null,
      b.language ? `Language: ${b.language}` : null,
      Array.isArray(b.audience) && b.audience.length ? `Target Audience: ${b.audience.join(' | ')}` : null,
      Array.isArray(b.sellingPoints) && b.sellingPoints.length ? `Selling Points: ${b.sellingPoints.join(' | ')}` : null,
      Array.isArray(b.claimsToAvoid) && b.claimsToAvoid.length ? `Claims to Avoid: ${b.claimsToAvoid.join(' | ')}` : null,
      Array.isArray(b.competitors) && b.competitors.length ? `Known Competitors: ${b.competitors.join(', ')}` : null,
      Array.isArray(b.avatars) && b.avatars.length
        ? `Brand Avatars (SAVED in My Brand — use for character consistency & @mentions): ${b.avatars
            .map((a) => `${a.name}${a.description ? ` (${a.description})` : ''}`)
            .join(' | ')}`
        : 'Brand Avatars: NO SAVED AVATAR IN MY BRAND YET (for UGC/creator ads, include sceneKit.avatar in generate_scene_kit or propose generate_brand_avatar so it generates via AI Influencer and auto-saves to My Brand -> Avatars!)',
      b.instagram || b.tiktok || b.youtube ? `Socials: IG=${b.instagram || '-'} TikTok=${b.tiktok || '-'} YT=${b.youtube || '-'}` : null,
    ].filter(Boolean);
    if (lines.length) sections.push(`## MY BRAND\n${lines.join('\n')}`);
    if (contextRefs.length) {
      const refBlocks = contextRefs.map((ref) => {
        const title = String(ref.path || ref.label || 'Context').trim().slice(0, 140);
        const body = String(ref.content || '').trim().slice(0, 3000);
        return `### ${title}\n${body || '(pinned reference)'}`;
      });
      sections.push(`## PINNED CONTEXT FOCUS\n${refBlocks.join('\n\n')}`);
    }
  } else {
    sections.push('## MY BRAND\nBelum diisi atau tidak diaktifkan pada sesi ini.');
  }

  if (!hasPartialOnly) {
    const focusProducts = ctx.selectedProducts?.length ? ctx.selectedProducts : (ctx.products || []).slice(0, 6);
    if (focusProducts.length) {
      const label = ctx.selectedProducts?.length ? 'SELECTED PRODUCTS (FOCUS)' : 'WORKSPACE PRODUCTS CATALOG';
      const pLines = focusProducts.map((p) => {
        const details = [
          p.price ? `harga: ${p.price}` : null,
          p.category ? `kategori: ${p.category}` : null,
          p.description || p.about || p.summary || null,
          Array.isArray(p.benefits) && p.benefits.length ? `manfaat: ${p.benefits.join(', ')}` : null,
          Array.isArray(p.sellingPoints) && p.sellingPoints.length ? `USP: ${p.sellingPoints.join(', ')}` : null,
          p.usp ? `USP: ${p.usp}` : null,
        ].filter(Boolean);
        return `- [${p.id}] ${p.name}${details.length ? ` — ${details.join(' | ')}` : ''}`;
      });
      sections.push(`## ${label}\n${pLines.join('\n')}`);
    }
  }

  if (ctx.memories?.length) {
    const mLines = ctx.memories.map((m) => `- (${m.category}) ${m.content}`);
    sections.push(`## BRAND MEMORY (LEARNED PREFERENCES & INSIGHTS)\n${mLines.join('\n')}`);
  }

  if (ctx.integrations?.length) {
    const iLines = ctx.integrations.map((i) => `${i.provider} (${i.display_name})`);
    sections.push(`## CONNECTED EXTERNAL INTEGRATIONS\n${iLines.join(', ')}`);
  }

  return sections.join('\n\n');
}
