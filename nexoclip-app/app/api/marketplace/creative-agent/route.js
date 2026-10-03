import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      productTitle = 'Luxury Commercial Product',
      visualDetails = '',
      category = 'E-Commerce',
      price = '',
      userDirection = '',
      existingImage = null,
    } = body;

    const apiKey = process.env.BYTEPLUS_API_KEY;
    const baseUrl = process.env.BYTEPLUS_BASE_URL || 'https://ark.ap-southeast.bytepluses.com/api/v3';
    const model = 'seed-2-0-mini-260428';

    const systemPrompt = `You are an elite, world-class Commercial Creative Director and Advertising Photographer for luxury global brands (such as Dior, Chanel, Apple, Nike, Rolex).
Your mission is to transform flat e-commerce product photos into striking, dynamic, high-converting commercial photoshoot concepts.
CRITICAL MANDATE: Avoid flat 2D frontal cutout placements. Propose radical 3D camera angles, kinetic action (water splashes, mist, frozen movement), intimate macro textures, human editorial interaction, and monumental low-angle scale.
Output strictly valid JSON (pure JSON, no markdown).`;

    const userMessage = `Product Name: ${productTitle}
Category: ${category}
Visual Specs & Details: ${visualDetails || 'Premium commercial packaging with rich texture'}
Estimated Price: ${price || 'Premium'}
${userDirection ? `Custom Direction Request: ${userDirection}` : ''}

Generate 5 DISTINCT, RADICALLY DIFFERENT commercial photoshoot concepts with varied camera angles, kinetic action, and lighting.
Return JSON with this EXACT structure:
{
  "creative_director_vision": "One inspiring sentence summarizing the artistic direction for this campaign",
  "campaigns": [
    {
      "id": "hero_low_angle",
      "title": "Epic Hero Low-Angle 25°",
      "badge": "Sudut Bawah 25°",
      "angle_name": "Low-Angle Worms-Eye",
      "description": "Kamera dari sudut rendah 25° menatap megah ke atas, menonjolkan siluet 3D monumental dan rim-light emas.",
      "prompt": "Ultra-detailed commercial studio billboard photography of ${productTitle}, shot from an extreme low-angle perspective looking upward at a 25-degree pitch, revealing the full 3D bevels, depth, and cylindrical cap. Perched on a monolithic dark volcanic basalt rock, dramatic warm sunset rim lighting highlighting glass contours, subtle rising sea mist, anamorphic lens flare, award-winning commercial ad aesthetic, 8k crisp resolution.",
      "recommended_mode": "creative_3d"
    },
    {
      "id": "dynamic_splash",
      "title": "Dynamic Amber Splash & Wave",
      "badge": "Aksi Kecepatan 1/8000s",
      "angle_name": "High-Speed Dynamic Splash",
      "description": "Botol diterpa gelombang cairan kristal amber dan butiran air membeku di udara berkecepatan 1/8000s.",
      "prompt": "High-speed kinetic advertising photography of ${productTitle} tilted at a dynamic three-quarter 45-degree angle, surrounded by an explosive splash of crystal golden amber liquid waves and suspended micro-droplets frozen mid-air at 1/8000s shutter speed. Hyper-detailed liquid refraction, sharp specular highlights, dark glossy obsidian studio stage, dramatic strobe lighting.",
      "recommended_mode": "creative_3d"
    },
    {
      "id": "macro_detail",
      "title": "Macro Gold Noir & Refraction",
      "badge": "Makro Ekstrem f/1.4",
      "angle_name": "Macro Close-Up Refraction",
      "description": "Fokus super tajam pada detail label marmer emas, tekstur embos, dan pantulan kristal kaca.",
      "prompt": "Extreme macro commercial product shot of ${productTitle}, shallow depth of field f/1.4 with soft cinematic bokeh. Razor-sharp focus on the shimmering gold foil typography and marble texture on the bottle body, warm light caressing the glass bevels with crystalline refraction, rich atmospheric dark moody luxury aesthetic, 8k raw detail.",
      "recommended_mode": "creative_3d"
    },
    {
      "id": "lifestyle_hand",
      "title": "Vogue Editorial Hand Pose",
      "badge": "Model & Human Touch",
      "angle_name": "Editorial Hand In-Situ",
      "description": "Tangan model elegan berbalut cincin mewah sedang memegang botol dan menyemprotkan kabut parfum halus.",
      "prompt": "High-fashion Vogue editorial lifestyle photography featuring an elegant manicured hand with a minimalist gold ring gently holding ${productTitle}, finger poised on the atomizer releasing a delicate luminous fine mist caught in a soft ray of golden hour sunlight. Blurred background of a luxury marble penthouse vanity, warm cinematic ambient lighting, authentic commercial photography.",
      "recommended_mode": "creative_3d"
    },
    {
      "id": "zero_gravity",
      "title": "Zero-Gravity Floating Particles",
      "badge": "Melayang 3D 35°",
      "angle_name": "Zero-Gravity Surrealist",
      "description": "Botol melayang diagonal di udara dikelilingi bahan alami dan serpihan emas yang berkilau.",
      "prompt": "Surreal commercial advertising of ${productTitle} levitating weightlessly at a dynamic 35-degree diagonal tilt in mid-air. Surrounded by floating dark agarwood fragments, raw vanilla pods, and suspended glowing golden embers caught in motion. Volumetric atmospheric studio light beam slicing through subtle smoke, ultra-sharp 3D composition, 8k render.",
      "recommended_mode": "creative_3d"
    }
  ]
}`;

    const content = [{ type: 'text', text: userMessage }];

    if (existingImage && typeof existingImage === 'string') {
      content.push({
        type: 'image_url',
        image_url: { url: existingImage },
      });
    }

    if (!apiKey) {
      return NextResponse.json({
        success: true,
        creative_director_vision: `Arahkan kampanye visual komersial ${productTitle} dengan sudut pandang dinamis dan komposisi kelas atas.`,
        campaigns: getFallbackCampaigns(productTitle, visualDetails),
        isFallback: true,
      });
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 1500,
        temperature: 0.6,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      console.error('BytePlus Creative Agent error:', errData);
      return NextResponse.json({
        success: true,
        creative_director_vision: `Konsep studio komersial premium untuk ${productTitle}.`,
        campaigns: getFallbackCampaigns(productTitle, visualDetails),
        isFallback: true,
      });
    }

    const data = await response.json();
    const rawContent = data?.choices?.[0]?.message?.content || '{}';
    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch {
      const match = rawContent.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : {};
    }

    const campaigns = Array.isArray(parsed?.campaigns) && parsed.campaigns.length > 0
      ? parsed.campaigns
      : getFallbackCampaigns(productTitle, visualDetails);

    return NextResponse.json({
      success: true,
      creative_director_vision: parsed?.creative_director_vision || `Arah visual komersial multi-sudut untuk ${productTitle}`,
      campaigns,
    });
  } catch (error) {
    console.error('Creative Agent API error:', error);
    return NextResponse.json(
      { error: error.message || 'Gagal memproses creative agent' },
      { status: 500 }
    );
  }
}

function getFallbackCampaigns(title, details) {
  return [
    {
      id: 'hero_low_angle',
      title: 'Epic Hero Low-Angle 25°',
      badge: 'Sudut Bawah 25°',
      angle_name: 'Low-Angle Worms-Eye',
      description: 'Kamera dari sudut rendah 25° menatap megah ke atas, menonjolkan siluet 3D monumental dan rim-light emas.',
      prompt: `Ultra-detailed commercial studio billboard photography of ${title}${details ? `, featuring ${details}` : ''}, shot from an extreme low-angle perspective looking upward at a 25-degree pitch, revealing the full 3D bevels and cap depth. Perched on a monolithic dark volcanic basalt rock, dramatic warm sunset rim lighting, rising sea mist, anamorphic lens flare, 8k crisp resolution.`,
      recommended_mode: 'creative_3d'
    },
    {
      id: 'dynamic_splash',
      title: 'Dynamic Amber Splash & Wave',
      badge: 'Aksi Kecepatan 1/8000s',
      angle_name: 'High-Speed Dynamic Splash',
      description: 'Botol diterpa gelombang cairan kristal amber dan butiran air membeku di udara berkecepatan 1/8000s.',
      prompt: `High-speed kinetic advertising photography of ${title}${details ? `, featuring ${details}` : ''}, tilted at a dynamic three-quarter 45-degree angle, surrounded by an explosive splash of crystal golden amber liquid waves and suspended micro-droplets frozen mid-air at 1/8000s shutter speed. Hyper-detailed liquid refraction, dark obsidian base, dramatic strobe lighting.`,
      recommended_mode: 'creative_3d'
    },
    {
      id: 'macro_detail',
      title: 'Macro Gold Noir & Refraction',
      badge: 'Makro Ekstrem f/1.4',
      angle_name: 'Macro Close-Up Refraction',
      description: 'Fokus super tajam pada detail label marmer emas, tekstur embos, dan pantulan kristal kaca.',
      prompt: `Extreme macro commercial product shot of ${title}${details ? `, featuring ${details}` : ''}, shallow depth of field f/1.4 with soft cinematic bokeh. Razor-sharp focus on the shimmering gold foil typography and surface texture, warm light caressing the glass bevels with crystalline refraction, rich dark luxury aesthetic, 8k raw detail.`,
      recommended_mode: 'creative_3d'
    },
    {
      id: 'lifestyle_hand',
      title: 'Vogue Editorial Hand Pose',
      badge: 'Model & Human Touch',
      angle_name: 'Editorial Hand In-Situ',
      description: 'Tangan model elegan berbalut cincin mewah sedang memegang botol dan menyemprotkan kabut parfum halus.',
      prompt: `High-fashion Vogue editorial lifestyle photography featuring an elegant manicured hand with a minimalist gold ring gently holding ${title}${details ? `, featuring ${details}` : ''}, releasing a delicate luminous fine mist caught in a soft ray of golden hour sunlight. Luxury marble penthouse vanity in soft blurred background, warm ambient lighting.`,
      recommended_mode: 'creative_3d'
    },
    {
      id: 'zero_gravity',
      title: 'Zero-Gravity Floating Particles',
      badge: 'Melayang 3D 35°',
      angle_name: 'Zero-Gravity Surrealist',
      description: 'Botol melayang diagonal di udara dikelilingi bahan alami dan serpihan emas yang berkilau.',
      prompt: `Surreal commercial advertising of ${title}${details ? `, featuring ${details}` : ''}, levitating weightlessly at a dynamic 35-degree diagonal tilt in mid-air. Surrounded by floating dark botanical ingredients and suspended glowing golden embers. Volumetric atmospheric studio light beam slicing through subtle smoke, ultra-sharp 3D composition, 8k render.`,
      recommended_mode: 'creative_3d'
    }
  ];
}
