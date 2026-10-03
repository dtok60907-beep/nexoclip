import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { image, images, title = '', url = '' } = await request.json();
    const imgArray = Array.isArray(images) && images.length > 0
      ? images
      : (Array.isArray(image) ? image : (image ? [image] : []));

    if (imgArray.length === 0 && !title && !url) {
      return NextResponse.json(
        { error: 'Minimal sertakan gambar, judul, atau tautan produk untuk dianalisis.' },
        { status: 400 }
      );
    }

    const apiKey = process.env.BYTEPLUS_API_KEY;
    const baseUrl = process.env.BYTEPLUS_BASE_URL || 'https://ark.ap-southeast.bytepluses.com/api/v3';

    // Model VLM aktif dari BytePlus Ark
    const model = 'seed-2-0-mini-260428';

    // Bangun pesan untuk VLM Creative Director Agent
    const content = [];

    let instruction = `Anda adalah Commercial Creative Director & E-Commerce Product Intelligence AI Agent profesional untuk studio periklanan kelas dunia.
Tugas Anda adalah menganalisis produk marketplace ini, mengekstrak informasi detail produk termasuk ESTIMASI HARGA pasar di Indonesia, serta MERANCANG 5 KONSEP FOTOSHOOT KOMERSIAL KREATIF DENGAN VARIASI SUDUT PENGAMBILAN KAMERA (bukan sekadar foto produk datar 2D di atas podium!).

Variasi sudut kamera wajib mencakup:
1. Sudut Bawah Dramatis 25° (Low-Angle Hero Shot monumental ala billboard komersial)
2. Aksi Kecepatan Tinggi / Cipratan Dinamis (High-speed splash / kinetic water/amber explosion freeze 1/8000s)
3. Detail Makro Ekstrem f/1.4 (Macro noir & refraction menonjolkan tekstur kemewahan dan detail emas/kaca)
4. Editorial Tangan Model / Human Touch (Tangan elegan berbalut perhiasan memegang botol/menyemprot mist)
5. Zero-Gravity Melayang 3D 35° (Botol melayang diagonal di udara dikelilingi bahan alami dan partikel bercahaya)

Kembalikan jawaban HANYA dalam format JSON valid tanpa tag markdown apapun (pure JSON) dengan struktur persis seperti ini:
{
  "name": "Nama lengkap produk yang akurat dan komersial (cth: Parfum Monaco Royale Eau De Parfum 30ML)",
  "brand": "Nama merk / produsen (cth: Monaco Royale / LA Parfume)",
  "category": "Kategori produk (cth: Luxury Fragrance & Parfume)",
  "price": "Estimasi harga pasar atau harga jual resmi di Indonesia dalam Rupiah (cth: Rp 189.000 atau Rp 350.000)",
  "visual_details": "Deskripsi visual detail: bentuk bodi, material (kaca obsidian hitam, emas, akrilik), warna dominan, tutup/nozzle, dan tekstur marmer",
  "features": ["Fitur unggulan 1", "Fitur unggulan 2", "Fitur unggulan 3", "Fitur unggulan 4"],
  "selling_points": ["Keunggulan komersial 1", "Keunggulan komersial 2", "Keunggulan komersial 3"],
  "suggested_prompt": "Prompt photoshoot komersial studio lengkap dalam bahasa Inggris untuk BytePlus SeaDream 5.0",
  "marketing_tagline": "Satu kalimat tagline marketing yang menarik dan persuasif",
  "creative_director_vision": "Satu kalimat visi artistik dari Creative Director untuk kampanye produk ini",
  "creative_campaigns": [
    {
      "id": "hero_low_angle",
      "title": "Epic Hero Low-Angle 25°",
      "badge": "Sudut Bawah 25°",
      "angle_name": "Low-Angle Worms-Eye",
      "description": "Kamera sudut rendah 25° menatap megah ke atas, menonjolkan siluet 3D monumental dan rim-light emas.",
      "prompt": "Ultra-detailed commercial billboard photography of [Product Title], shot from an extreme low-angle perspective looking upward at a 25-degree pitch, revealing full 3D bevels and cap depth. Perched on a monolithic dark volcanic basalt rock, dramatic warm sunset rim lighting, rising sea mist, anamorphic lens flare, 8k crisp resolution.",
      "recommended_mode": "creative_3d"
    },
    {
      "id": "dynamic_splash",
      "title": "Dynamic Amber Splash & Wave",
      "badge": "Aksi Kecepatan 1/8000s",
      "angle_name": "High-Speed Dynamic Splash",
      "description": "Botol diterpa gelombang cairan kristal amber dan butiran air membeku di udara berkecepatan 1/8000s.",
      "prompt": "High-speed kinetic advertising photography of [Product Title] tilted at a dynamic three-quarter 45-degree angle, surrounded by an explosive splash of crystal golden amber liquid waves and suspended micro-droplets frozen mid-air at 1/8000s shutter speed. Hyper-detailed liquid refraction, dark obsidian base, dramatic strobe lighting.",
      "recommended_mode": "creative_3d"
    },
    {
      "id": "macro_detail",
      "title": "Macro Gold Noir & Refraction",
      "badge": "Makro Ekstrem f/1.4",
      "angle_name": "Macro Close-Up Refraction",
      "description": "Fokus super tajam pada detail label marmer emas, tekstur embos, dan pantulan kristal kaca.",
      "prompt": "Extreme macro commercial product shot of [Product Title], shallow depth of field f/1.4 with soft cinematic bokeh. Razor-sharp focus on the shimmering gold foil typography and surface texture, warm light caressing the glass bevels with crystalline refraction, rich dark luxury aesthetic, 8k raw detail.",
      "recommended_mode": "creative_3d"
    },
    {
      "id": "lifestyle_hand",
      "title": "Vogue Editorial Hand Pose",
      "badge": "Model & Human Touch",
      "angle_name": "Editorial Hand In-Situ",
      "description": "Tangan model elegan berbalut cincin mewah sedang memegang botol dan menyemprotkan kabut parfum halus.",
      "prompt": "High-fashion Vogue editorial lifestyle photography featuring an elegant manicured hand with a minimalist gold ring gently holding [Product Title], releasing a delicate luminous fine mist caught in a soft ray of golden hour sunlight. Luxury marble penthouse vanity in soft blurred background, warm ambient lighting.",
      "recommended_mode": "creative_3d"
    },
    {
      "id": "zero_gravity",
      "title": "Zero-Gravity Floating Particles",
      "badge": "Melayang 3D 35°",
      "angle_name": "Zero-Gravity Surrealist",
      "description": "Botol melayang diagonal di udara dikelilingi bahan alami dan serpihan emas yang berkilau.",
      "prompt": "Surreal commercial advertising of [Product Title], levitating weightlessly at a dynamic 35-degree diagonal tilt in mid-air. Surrounded by floating dark botanical ingredients and suspended glowing golden embers. Volumetric atmospheric studio light beam slicing through subtle smoke, ultra-sharp 3D composition, 8k render.",
      "recommended_mode": "creative_3d"
    }
  ]
}`;

    if (title || url) {
      instruction += `\n\nKonteks teks tambahan:\n- Judul/Slug: ${title || '-'}\n- Tautan URL: ${url || '-'}`;
    }

    content.push({ type: 'text', text: instruction });

    // Konversi gambar ke base64 agar Ark VLM tidak gagal download jika URL diproteksi anti-bot
    const processedImages = await Promise.all(
      imgArray.slice(0, 5).map(async (img) => {
        if (!img || typeof img !== 'string') return null;
        if (img.startsWith('data:image/')) return img;
        if (!img.startsWith('http://') && !img.startsWith('https://')) return null;
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 6000);
          const res = await fetch(img, {
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Referer': img.includes('shopee') ? 'https://shopee.co.id/' : 'https://www.google.com/',
            },
          });
          clearTimeout(timer);
          if (!res.ok) return null;
          const arrayBuffer = await res.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const contentType = res.headers.get('content-type') || 'image/jpeg';
          return `data:${contentType};base64,${buffer.toString('base64')}`;
        } catch {
          return null;
        }
      })
    );

    processedImages.filter(Boolean).forEach((imgDataUrl) => {
      content.push({
        type: 'image_url',
        image_url: {
          url: imgDataUrl,
        },
      });
    });

    // Panggil BytePlus Ark Chat Completions dengan mode JSON
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: 'You are an elite Commercial Creative Director and Product Intelligence Agent that outputs strictly valid JSON.',
          },
          {
            role: 'user',
            content,
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 1500,
        temperature: 0.4,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('BytePlus VLM analyze error:', data);
      throw new Error(data?.error?.message || 'Gagal memproses analisis produk dengan BytePlus AI');
    }

    const rawContent = data?.choices?.[0]?.message?.content || '{}';
    let parsedInfo;
    try {
      parsedInfo = JSON.parse(rawContent);
    } catch {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedInfo = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Format respon AI tidak valid');
      }
    }

    // Pastikan creative_campaigns selalu tersedia
    const productName = parsedInfo.name || title || 'Commercial Product';
    const visualDetails = parsedInfo.visual_details || '';

    if (!Array.isArray(parsedInfo.creative_campaigns) || parsedInfo.creative_campaigns.length === 0) {
      parsedInfo.creative_campaigns = generateDefaultCampaigns(productName, visualDetails);
    }

    if (!parsedInfo.creative_director_vision) {
      parsedInfo.creative_director_vision = `Kampanye visual komersial ${productName} dengan variasi sudut kamera 3D dinamis dan tata cahaya studio premium.`;
    }

    return NextResponse.json({
      success: true,
      ...parsedInfo,
    });
  } catch (error) {
    console.error('Marketplace analyze error:', error);
    return NextResponse.json(
      {
        error: error.message || 'Terjadi kesalahan saat menganalisis produk',
      },
      { status: 500 }
    );
  }
}

function generateDefaultCampaigns(title, details) {
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
