import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { image, title = '', url = '' } = await request.json();

    if (!image && !title && !url) {
      return NextResponse.json(
        { error: 'Minimal sertakan gambar, judul, atau tautan produk untuk dianalisis.' },
        { status: 400 }
      );
    }

    const apiKey = process.env.BYTEPLUS_API_KEY;
    const baseUrl = process.env.BYTEPLUS_BASE_URL || 'https://ark.ap-southeast.bytepluses.com/api/v3';

    // Model VLM aktif dari BytePlus Ark
    const model = 'seed-2-0-mini-260428';

    // Bangun pesan untuk VLM Agent
    const content = [];

    let instruction = `Anda adalah E-Commerce Product Intelligence AI Agent profesional.
Tugas Anda adalah menganalisis produk marketplace ini dan mengekstrak informasi lengkap termasuk ESTIMASI HARGA pasar di Indonesia untuk kebutuhan agency kreatif, pembuatan copywriting, dan fotografi studio komersial (BytePlus SeaDream AI).

Kembalikan jawaban HANYA dalam format JSON valid tanpa tag markdown apapun (pure JSON) dengan struktur persis seperti ini:
{
  "name": "Nama lengkap produk yang akurat dan komersial (cth: Samsung Galaxy Watch Ultra)",
  "brand": "Nama merk / produsen (cth: Samsung)",
  "category": "Kategori produk (cth: Smartwatch & Wearable Tech)",
  "price": "Estimasi harga pasar atau harga jual resmi di Indonesia dalam Rupiah (cth: Rp 9.999.000 atau Rp 12.999.000)",
  "visual_details": "Deskripsi visual detail: bentuk bodi, material (titanium, kulit, kaca), warna dominan, tali/strap, dan tekstur",
  "features": ["Fitur unggulan 1", "Fitur unggulan 2", "Fitur unggulan 3", "Fitur unggulan 4"],
  "selling_points": ["Keunggulan komersial 1", "Keunggulan komersial 2", "Keunggulan komersial 3"],
  "suggested_prompt": "Prompt photoshoot komersial studio lengkap dalam bahasa Inggris untuk BytePlus SeaDream 5.0 (jelaskan tata cahaya softbox/rim light, material podium/latar belakang, dan tekstur produk secara tajam)",
  "marketing_tagline": "Satu kalimat tagline marketing yang menarik dan persuasif"
}`;

    if (title || url) {
      instruction += `\n\nKonteks teks tambahan:\n- Judul/Slug: ${title || '-'}\n- Tautan URL: ${url || '-'}`;
    }

    content.push({ type: 'text', text: instruction });

    // Jika ada gambar (data URL base64 atau URL publik)
    if (image) {
      content.push({
        type: 'image_url',
        image_url: {
          url: image,
        },
      });
    }

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
            content: 'You are an expert E-Commerce Product Intelligence Agent that outputs strictly valid JSON.',
          },
          {
            role: 'user',
            content,
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 1000,
        temperature: 0.3,
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
