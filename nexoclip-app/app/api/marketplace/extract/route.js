export async function POST(request) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== 'string') {
      return Response.json({ error: 'URL produk marketplace wajib diisi' }, { status: 400 });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url.trim());
    } catch {
      return Response.json({ error: 'Format URL tidak valid' }, { status: 400 });
    }

    // Identifikasi platform marketplace
    const hostname = parsedUrl.hostname.toLowerCase();
    let platform = 'E-Commerce';
    if (hostname.includes('tokopedia')) platform = 'Tokopedia';
    else if (hostname.includes('shopee')) platform = 'Shopee';
    else if (hostname.includes('tiktok')) platform = 'TikTok Shop';
    else if (hostname.includes('amazon')) platform = 'Amazon';
    else if (hostname.includes('lazada')) platform = 'Lazada';
    else if (hostname.includes('blibli')) platform = 'Blibli';
    else if (hostname.includes('bukalapak')) platform = 'Bukalapak';

    // Cek jika URL adalah tautan gambar langsung
    if (/\.(png|jpe?g|webp|gif)(\?.*)?$/i.test(parsedUrl.pathname)) {
      return Response.json({
        success: true,
        platform: 'Direct Image',
        title: 'Produk dari Gambar Langsung',
        description: 'Gambar produk diambil langsung dari URL tautan.',
        images: [url.trim()],
      });
    }

    // Fetch halaman marketplace dengan User-Agent browser modern
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    let html = '';
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cache-Control': 'no-cache',
        },
      });

      html = await response.text();
    } catch (err) {
      if (err.name === 'AbortError') {
        return Response.json({ error: 'Koneksi ke marketplace timeout. Silakan periksa kembali link atau masukkan link gambar langsung.' }, { status: 504 });
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    // Ekstraksi Metadata: Open Graph, Twitter Card, & JSON-LD
    let title = '';
    let description = '';
    const images = new Set();
    let price = '';

    // 1. Regex untuk Open Graph & Twitter Cards
    const ogTitleMatch = html.match(/<meta\s+(?:property|name)=["'](?:og:title|twitter:title)["']\s+content=["'](.*?)["']/i) ||
                         html.match(/<meta\s+content=["'](.*?)["']\s+(?:property|name)=["'](?:og:title|twitter:title)["']/i);
    if (ogTitleMatch && ogTitleMatch[1]) {
      title = ogTitleMatch[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
    }

    const ogDescMatch = html.match(/<meta\s+(?:property|name)=["'](?:og:description|twitter:description)["']\s+content=["'](.*?)["']/i) ||
                        html.match(/<meta\s+content=["'](.*?)["']\s+(?:property|name)=["'](?:og:description|twitter:description)["']/i);
    if (ogDescMatch && ogDescMatch[1]) {
      description = ogDescMatch[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
    }

    // Match all og:image or twitter:image
    const imgRegex = /<meta\s+(?:property|name)=["'](?:og:image|twitter:image|twitter:image:src)["']\s+content=["'](.*?)["']/gi;
    let imgMatch;
    while ((imgMatch = imgRegex.exec(html)) !== null) {
      if (imgMatch[1] && /^https?:\/\//i.test(imgMatch[1])) {
        images.add(imgMatch[1]);
      }
    }

    // 2. Parse JSON-LD Schema (biasanya digunakan Tokopedia & Shopee untuk SEO)
    const jsonLdMatches = html.match(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi) || [];
    for (const scriptTag of jsonLdMatches) {
      try {
        const jsonContent = scriptTag.replace(/<script\s+type=["']application\/ld\+json["']>/i, '').replace(/<\/script>/i, '').trim();
        const parsed = JSON.parse(jsonContent);
        const items = Array.isArray(parsed) ? parsed : [parsed];

        for (const item of items) {
          if (item['@type'] === 'Product' || item.name) {
            if (!title && item.name) title = item.name;
            if (!description && item.description) description = item.description;

            if (item.image) {
              if (Array.isArray(item.image)) {
                item.image.forEach(img => {
                  if (typeof img === 'string') images.add(img);
                  else if (img?.url) images.add(img.url);
                });
              } else if (typeof item.image === 'string') {
                images.add(item.image);
              } else if (item.image.url) {
                images.add(item.image.url);
              }
            }

            if (item.offers) {
              const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
              if (offer?.price) {
                const currency = offer.priceCurrency || 'IDR';
                price = `${currency} ${Number(offer.price).toLocaleString('id-ID')}`;
              }
            }
          }
        }
      } catch {
        // Abaikan parse error di script individual
      }
    }

    // 3. Fallback jika title belum didapat: dari tag <title>
    if (!title) {
      const titleTagMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
      if (titleTagMatch && titleTagMatch[1]) {
        title = titleTagMatch[1].split('|')[0].split('-')[0].trim();
      }
    }

    // Bersihkan title dari boilerplate marketplace (misal "Jual Beli di Tokopedia...", dll.)
    title = title.replace(/\s*\|\s*(Tokopedia|Shopee Indonesia|TikTok Shop|Lazada|Blibli).*/i, '').trim();

    const imageList = Array.from(images).filter(img => {
      // Filter favicon, small icons, tracking pixels
      return !img.includes('favicon') && !img.includes('icon-') && !img.includes('logo') && !img.includes('avatar');
    });

    if (imageList.length === 0) {
      // Jika anti-scraping marketplace memblokir gambar
      return Response.json({
        success: false,
        platform,
        title: title || 'Produk Marketplace',
        description: description || '',
        message: 'Halaman berhasil diakses, namun gambar produk dilindungi sistem proteksi marketplace. Anda bisa menyalin URL gambar produk secara langsung atau mengunggah fotonya.',
        images: [],
      });
    }

    return Response.json({
      success: true,
      platform,
      title: title || 'Produk Marketplace',
      description: description || '',
      price: price || '',
      images: imageList,
    });
  } catch (error) {
    console.error('Marketplace extract error:', error);
    return Response.json({
      error: error.message || 'Gagal mengekstrak data produk dari URL tersebut.'
    }, { status: 500 });
  }
}
