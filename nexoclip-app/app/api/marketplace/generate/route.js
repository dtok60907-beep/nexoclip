import { createBytePlusImageAdapter } from '../../../../src/providers/direct/imageAdapters.js';

// Prompt Presets Komersial Khusus Fotografi Produk E-Commerce
const SCENE_PRESETS = {
  minimalist_podium: (title, details) =>
    `Commercial studio product photography of ${title}${details ? `, featuring ${details}` : ''}, elegantly displayed on a smooth rounded stone podium, clean neutral beige pastel backdrop, soft diffused softbox lighting, subtle ground shadows, ultra sharp 8k resolution, minimalist high-end advertisement visual.`,
  
  nature_botanical: (title, details) =>
    `Natural organic commercial product photography of ${title}${details ? `, featuring ${details}` : ''}, resting on a flat wet slate stone, surrounded by vibrant fresh green tropical monstera and palm leaves, dappled golden hour morning sunlight streaming through foliage, realistic dew water droplets, premium organic brand campaign.`,
  
  luxury_marble: (title, details) =>
    `Luxury commercial product photography of ${title}${details ? `, featuring ${details}` : ''}, centered on polished black Italian marble with subtle golden veins, dramatic cinematic rim lighting, gentle reflective surface, dark moody luxury atmosphere, high-end commercial ad aesthetic.`,
  
  lifestyle_cafe: (title, details) =>
    `Modern lifestyle product photoshoot of ${title}${details ? `, featuring ${details}` : ''}, styled on a rustic warm oak wooden cafe table beside a small ceramic vase and a warm cup of coffee, soft morning window light, cozy blurry interior background bokeh, realistic authentic commercial visual.`,
  
  festive_promo: (title, details) =>
    `Festive holiday promotional commercial photography of ${title}${details ? `, featuring ${details}` : ''}, surrounded by warm glowing fairy lights, elegant gold and ribbon decorations, gentle celebratory bokeh background, warm festive lighting, award-winning marketing shoot.`,
  
  neon_cyberpunk: (title, details) =>
    `Futuristic tech commercial product photography of ${title}${details ? `, featuring ${details}` : ''}, placed on a sleek reflective acrylic surface with vibrant neon cyan and magenta gradient edge illumination, sleek dark moody atmosphere, crisp edge highlights, modern advertising.`,
  
  custom: (title, details, custom) =>
    custom ? custom : `Professional commercial product photoshoot of ${title}${details ? `, featuring ${details}` : ''}, clean studio backdrop, professional softbox lighting, 8k crisp focus.`,
};

const FALLBACK_SCENE_IMAGES = {
  minimalist_podium: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=1080&q=85',
  nature_botanical: 'https://images.unsplash.com/photo-1571781926291-c477ebfd024b?w=1080&q=85',
  luxury_marble: 'https://images.unsplash.com/photo-1541643600914-78b084683601?w=1080&q=85',
  lifestyle_cafe: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=1080&q=85',
  festive_promo: 'https://images.unsplash.com/photo-1513519245088-0e12902e5a38?w=1080&q=85',
  neon_cyberpunk: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1080&q=85',
  custom: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1080&q=85',
};

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      productTitle = 'Commercial Product',
      productImage,
      scenePreset = 'minimalist_podium',
      customPrompt = '',
      visualDetails = '',
      aspectRatio = '1:1',
      resolution = '2K',
      model = 'byteplus/seedream-5.0-pro-unfiltered',
      referenceMode = 'creative_3d', // 'creative_3d' | 'guided'
      preserveSilhouette = false,
      count = 1,
      watermark = false,
    } = body;

    if (!productImage) {
      return Response.json({ error: 'Gambar produk (productImage) wajib disertakan' }, { status: 400 });
    }

    // Bangun Prompt Berdasarkan Preset atau Custom Creative Direction
    const promptBuilder = SCENE_PRESETS[scenePreset] || SCENE_PRESETS.minimalist_podium;
    let basePrompt = customPrompt ? customPrompt : promptBuilder(productTitle, visualDetails, customPrompt);

    // PENTING: reference image selalu wajib disertakan agar BytePlus SeaDream 5.0
    // dapat melihat kemasan asli, logo brand, dan tipografi teks tanpa berhalusinasi (typo).
    const referenceImages = productImage ? [productImage] : [];

    // Bangun instruksi presisi teks dan akurasi tipografi kemasan
    const cleanTitle = (productTitle || '').trim();
    const brandName = (body.brand || '').trim();
    
    // Mode 'guided' (kunci siluet) vs 'creative_3d' (sudut dinamis)
    const modeInstruction = (referenceMode === 'guided' || preserveSilhouette === true)
      ? 'Strict silhouette lock: Preserve the exact front silhouette, packaging geometry, dimensions, and positioning from the reference image 1:1.'
      : 'Commercial 3D studio staging: Present the product from an engaging advertising perspective while maintaining full physical fidelity to the reference image.';

    const typographyDirective = `CRITICAL PRODUCT TEXT & LABEL ACCURACY: The product packaging, brand logo, and all printed text must match the reference image with 100% fidelity. Accurately preserve the authentic brand and product label: "${cleanTitle}". Flawless spelling, zero typographical errors, razor-sharp readable typography, authentic logo rendering, no garbled letters, no distorted text, and no invented words (such as "Sacheng" or corrupt characters). All text on the product packaging must be crystal clear, perfectly legible, correctly spelled, and faithful to the real product.`;

    let finalPrompt = `${basePrompt}. ${modeInstruction} ${typographyDirective}`;
    if (visualDetails && !basePrompt.toLowerCase().includes(visualDetails.toLowerCase().slice(0, 20))) {
      finalPrompt += `, featuring ${cleanTitle} (${visualDetails})`;
    }

    // Dapatkan konfigurasi BytePlus dari environment
    const apiKey = process.env.BYTEPLUS_API_KEY;
    const baseUrl = process.env.BYTEPLUS_BASE_URL || 'https://ark.ap-southeast.bytepluses.com/api/v3';
    const endpointId = process.env.BYTEPLUS_SEEDREAM_5_ENDPOINT || model;

    // Fallback mode jika belum ada API key BytePlus di environment lokal
    if (!apiKey) {
      const fallbackUrl = (productImage && !productImage.startsWith('data:'))
        ? productImage
        : (FALLBACK_SCENE_IMAGES[scenePreset] || FALLBACK_SCENE_IMAGES.minimalist_podium);

      return Response.json({
        success: true,
        provider: 'byteplus',
        isFallback: true,
        message: 'Kredensial BYTEPLUS_API_KEY belum dikonfigurasi. Menggunakan preview studio komersial.',
        prompt: finalPrompt,
        preset: scenePreset,
        referenceMode: useReferenceImage ? 'guided' : 'creative_3d',
        aspectRatio,
        outputs: [
          {
            url: fallbackUrl,
            prompt: finalPrompt,
            model: endpointId,
            aspect_ratio: aspectRatio,
            id: `byteplus-preview-${Date.now()}`,
          },
        ],
      });
    }

    // Inisialisasi BytePlus Image Adapter
    const bytePlusAdapter = createBytePlusImageAdapter({
      apiKey,
      baseUrl,
    });

    // Panggil adapter BytePlus dengan kontrol reference image dan multi-output (batch count)
    const batchCount = Math.min(Math.max(Number(count) || 1, 1), 4);

    const tasks = Array.from({ length: batchCount }).map(() =>
      bytePlusAdapter.generate({
        model: endpointId,
        prompt: finalPrompt,
        aspectRatio,
        resolution,
        watermark: Boolean(watermark),
        referenceImages,
      })
    );

    const results = await Promise.all(tasks);
    const outputImages = results.flatMap((r) => r?.outputs || []);
    if (!outputImages.length) {
      return Response.json({ error: 'BytePlus tidak mengembalikan hasil gambar' }, { status: 502 });
    }

    // Simpan gambar ke workspace assets jika user terautentikasi (opsional)
    let persistedOutputs = outputImages;
    try {
      const workspaceId = request.headers.get('x-workspace-id');
      const cookiesHeader = request.headers.get('cookie') || '';
      if (workspaceId && cookiesHeader) {
        const { resolveTenantContext } = await import('../../../../src/services/tenantContext.js');
        const { persistGeneratedImage } = await import('../../../../src/services/generatedImageService.js');
        const { SESSION_COOKIE } = await import('../../../../src/lib/auth/session.js');

        const token = request.cookies?.get ? request.cookies.get(SESSION_COOKIE)?.value : null;
        if (token) {
          const tenant = await resolveTenantContext({ token, workspaceId });
          if (tenant?.workspace?.id) {
            persistedOutputs = await Promise.all(
              outputImages.map(async (img) => {
                try {
                  const cleanTitle = (productTitle || 'product').replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase().slice(0, 35);
                  const persisted = await persistGeneratedImage({
                    workspaceId: tenant.workspace.id,
                    dataUrl: img.url,
                    filename: `product-studio-${cleanTitle}`,
                  });
                  return { ...img, ...persisted };
                } catch {
                  return img;
                }
              })
            );
          }
        }
      }
    } catch {
      // Best effort saving
    }

    return Response.json({
      success: true,
      provider: 'byteplus',
      prompt: finalPrompt,
      preset: scenePreset,
      referenceMode: useReferenceImage ? 'guided' : 'creative_3d',
      aspectRatio,
      outputs: persistedOutputs,
    });
  } catch (error) {
    console.error('Marketplace generate error:', error);
    return Response.json({
      error: error.message || 'Terjadi kesalahan saat memproses gambar dengan BytePlus',
      code: error.code || 'GENERATION_FAILED',
    }, { status: 500 });
  }
}
