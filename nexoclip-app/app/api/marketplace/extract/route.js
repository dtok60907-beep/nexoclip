export async function POST(request) {
  try {
    const { url } = await request.json();

    if (!url || typeof url !== 'string') {
      return Response.json({ error: 'URL produk marketplace wajib diisi' }, { status: 400 });
    }

    const trimmedUrl = url.trim();

    let parsedUrl;
    try {
      parsedUrl = new URL(trimmedUrl);
    } catch {
      return Response.json({ error: 'Format URL tidak valid' }, { status: 400 });
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    const pathname = parsedUrl.pathname;

    // 1. Identifikasi Tautan Gambar Langsung / CDN Marketplace (Shopee, Tokopedia, TikTok, dll.)
    const isImageCdn =
      hostname.includes('susercontent.com') ||
      hostname.includes('images.tokopedia.net') ||
      hostname.includes('ibyteimg.com') ||
      hostname.includes('byteimg.com') ||
      (hostname.includes('shopee') && pathname.includes('/file/')) ||
      /\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i.test(pathname);

    if (isImageCdn) {
      let platform = 'Direct Image';
      if (hostname.includes('susercontent') || hostname.includes('shopee')) platform = 'Shopee Image';
      else if (hostname.includes('tokopedia')) platform = 'Tokopedia Image';
      else if (hostname.includes('byteimg') || hostname.includes('tiktok')) platform = 'TikTok Shop Image';

      return Response.json({
        success: true,
        platform,
        title: 'Foto Produk dari Tautan Gambar',
        description: 'Gambar produk berhasil dimuat langsung dari CDN marketplace.',
        images: [trimmedUrl],
      });
    }

    // 2. Identifikasi platform marketplace
    let platform = 'E-Commerce';
    if (hostname.includes('tokopedia')) platform = 'Tokopedia';
    else if (hostname.includes('shopee')) platform = 'Shopee';
    else if (hostname.includes('tiktok')) platform = 'TikTok Shop';
    else if (hostname.includes('amazon')) platform = 'Amazon';
    else if (hostname.includes('lazada')) platform = 'Lazada';
    else if (hostname.includes('blibli')) platform = 'Blibli';
    else if (hostname.includes('bukalapak')) platform = 'Bukalapak';

    // Ekstraksi title awal dari URL slug untuk Shopee / Tokopedia (misal: /GALAXY-WATCH-ULTRA-i.123...)
    let fallbackTitleFromSlug = '';
    const slugMatch = pathname.match(/\/([^/?#]+)(?:-i\.|\/i\.|\?|$)/);
    if (slugMatch && slugMatch[1] && slugMatch[1].length > 2) {
      fallbackTitleFromSlug = decodeURIComponent(slugMatch[1])
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())
        .trim();
    }

    // Fetch halaman marketplace dengan User-Agent browser modern
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    let html = '';
    try {
      const response = await fetch(trimmedUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
          'Referer': `${parsedUrl.origin}/`,
          'Cache-Control': 'no-cache',
        },
      });

      // Cek Content-Type header jika ternyata responnya adalah gambar biner
      const contentType = response.headers.get('content-type') || '';
      if (contentType.startsWith('image/')) {
        return Response.json({
          success: true,
          platform: 'Direct Image',
          title: fallbackTitleFromSlug || 'Foto Produk',
          images: [trimmedUrl],
        });
      }

      html = await response.text();
    } catch (err) {
      if (err.name === 'AbortError') {
        return Response.json({
          error: 'Koneksi ke marketplace timeout. Silakan salin alamat gambar produk (Copy Image Address) atau unggah fotonya langsung.'
        }, { status: 504 });
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

    // 2. Parse JSON-LD Schema (digunakan Tokopedia & e-commerce untuk SEO)
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

    // 3. Fallback jika title belum didapat: dari tag <title> atau URL slug
    if (!title) {
      const titleTagMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
      if (titleTagMatch && titleTagMatch[1]) {
        title = titleTagMatch[1].split('|')[0].split('-')[0].trim();
      }
    }
    if (!title && fallbackTitleFromSlug) {
      title = fallbackTitleFromSlug;
    }

    // Bersihkan title dari boilerplate marketplace (misal "Jual Beli di Tokopedia...", dll.)
    title = title.replace(/\s*\|\s*(Tokopedia|Shopee Indonesia|TikTok Shop|Lazada|Blibli).*/i, '').trim();

    // 4. Cari gambar CDN Shopee langsung di dalam HTML jika ada
    if (platform === 'Shopee') {
      const shopeeCdnRegex = /https:\/\/(?:down-id\.img\.susercontent\.com|cf\.shopee\.co\.id)\/file\/([a-zA-Z0-9_-]+)/g;
      let match;
      while ((match = shopeeCdnRegex.exec(html)) !== null) {
        images.add(match[0]);
      }
    }

    const imageList = Array.from(images).filter(img => {
      // Filter favicon, small icons, tracking pixels
      return !img.includes('favicon') && !img.includes('icon-') && !img.includes('logo') && !img.includes('avatar') && !img.includes('assets/1c8bdaaf45e1fd48');
    });

    if (imageList.length === 0) {
      // Jika anti-scraping Shopee/marketplace memblokir gambar
      return Response.json({
        success: false,
        platform,
        title: title || fallbackTitleFromSlug || 'Produk Marketplace',
        description: description || '',
        message: 'Shopee memproteksi halaman produk dengan sistem anti-bot. Cukup KLIK KANAN foto di Shopee lalu pilih "Salin Alamat Gambar" (Copy Image Address), atau tempel langsung gambar (Cmd+V).',
        images: [],
      });
    }

    return Response.json({
      success: true,
      platform,
      title: title || fallbackTitleFromSlug || 'Produk Marketplace',
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
