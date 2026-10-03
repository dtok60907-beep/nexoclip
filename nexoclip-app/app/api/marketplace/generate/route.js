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
    } = body;

    if (!productImage) {
      return Response.json({ error: 'Gambar produk (productImage) wajib disertakan' }, { status: 400 });
    }

    // Bangun Prompt Berdasarkan Preset
    const promptBuilder = SCENE_PRESETS[scenePreset] || SCENE_PRESETS.minimalist_podium;
    const finalPrompt = customPrompt ? customPrompt : promptBuilder(productTitle, visualDetails, customPrompt);

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

    // Panggil adapter BytePlus dengan reference image produk
    const result = await bytePlusAdapter.generate({
      model: endpointId,
      prompt: finalPrompt,
      aspectRatio,
      resolution,
      referenceImages: [productImage],
    });

    const outputImages = result?.outputs || [];
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
                  const persisted = await persistGeneratedImage({
                    workspaceId: tenant.workspace.id,
                    dataUrl: img.url,
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
