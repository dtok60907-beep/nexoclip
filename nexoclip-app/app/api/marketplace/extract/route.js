export async function POST(request) {
  try {
    const body = await request.json();
    const rawInput = body.url || body.urls || '';

    if (!rawInput) {
      return Response.json({ error: 'URL produk marketplace wajib diisi' }, { status: 400 });
    }

    // Ekstraksi semua URL yang ditemukan dalam teks input (mendukung multiline, spasi, koma)
    let urlList = [];
    if (Array.isArray(rawInput)) {
      urlList = rawInput.map(u => String(u).trim()).filter(Boolean);
    } else if (typeof rawInput === 'string') {
      const matches = rawInput.match(/https?:\/\/[^\s"',]+/g);
      if (matches && matches.length > 0) {
        urlList = matches.map(u => u.trim());
      } else if (rawInput.trim().startsWith('http')) {
        urlList = [rawInput.trim()];
      }
    }

    if (urlList.length === 0) {
      return Response.json({ error: 'Format URL tidak valid. Sertakan tautan yang diawali http:// atau https://' }, { status: 400 });
    }

    const collectedImages = new Set();
    let detectedPlatform = '';
    let detectedTitle = '';
    let detectedPrice = '';
    let detectedDescription = '';

    // Helper untuk mengecek apakah sebuah URL adalah link gambar langsung / CDN
    const isDirectImageCdn = (parsed) => {
      const h = parsed.hostname.toLowerCase();
      const p = parsed.pathname;
      return (
        h.includes('susercontent.com') ||
        h.includes('images.tokopedia.net') ||
        h.includes('ibyteimg.com') ||
        h.includes('byteimg.com') ||
        (h.includes('shopee') && p.includes('/file/')) ||
        /\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i.test(p)
      );
    };

    // Proses setiap URL
    for (const urlStr of urlList) {
      let parsedUrl;
      try {
        parsedUrl = new URL(urlStr);
      } catch {
        continue;
      }

      const hostname = parsedUrl.hostname.toLowerCase();
      const pathname = parsedUrl.pathname;

      // 1. Jika ini link gambar CDN langsung
      if (isDirectImageCdn(parsedUrl)) {
        collectedImages.add(urlStr);
        if (!detectedPlatform) {
          if (hostname.includes('susercontent') || hostname.includes('shopee')) detectedPlatform = 'Shopee Image';
          else if (hostname.includes('tokopedia')) detectedPlatform = 'Tokopedia Image';
          else if (hostname.includes('byteimg') || hostname.includes('tiktok')) detectedPlatform = 'TikTok Shop Image';
          else detectedPlatform = 'Direct Image';
        }
        continue;
      }

      // 2. Jika ini halaman web marketplace (Shopee, Tokopedia, TikTok, Amazon, dll)
      if (!detectedPlatform) {
        if (hostname.includes('tokopedia')) detectedPlatform = 'Tokopedia';
        else if (hostname.includes('shopee')) detectedPlatform = 'Shopee';
        else if (hostname.includes('tiktok')) detectedPlatform = 'TikTok Shop';
        else if (hostname.includes('amazon')) detectedPlatform = 'Amazon';
        else if (hostname.includes('lazada')) detectedPlatform = 'Lazada';
        else if (hostname.includes('blibli')) detectedPlatform = 'Blibli';
      }

      // Ekstraksi title awal dari slug URL
      let fallbackTitle = '';
      const slugMatch = pathname.match(/\/([^/?#]+)(?:-i\.|\/i\.|\?|$)/);
      if (slugMatch && slugMatch[1] && slugMatch[1].length > 2) {
        fallbackTitle = decodeURIComponent(slugMatch[1])
          .replace(/[-_]+/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase())
          .trim();
      }
      if (!detectedTitle && fallbackTitle) detectedTitle = fallbackTitle;

      // Fetch HTML halaman web
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(urlStr, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            'Referer': `${parsedUrl.origin}/`,
            'Cache-Control': 'no-cache',
          },
        });
        clearTimeout(timeout);

        const contentType = response.headers.get('content-type') || '';
        if (contentType.startsWith('image/')) {
          collectedImages.add(urlStr);
          continue;
        }

        const html = await response.text();

        // Cari og:image & twitter:image
        const imgRegex = /<meta\s+(?:property|name)=["'](?:og:image|twitter:image|twitter:image:src)["']\s+content=["'](.*?)["']/gi;
        let imgMatch;
        while ((imgMatch = imgRegex.exec(html)) !== null) {
          if (imgMatch[1] && /^https?:\/\//i.test(imgMatch[1])) {
            collectedImages.add(imgMatch[1]);
          }
        }

        // Cari JSON-LD Schema
        const jsonLdMatches = html.match(/<script\s+type=["']application\/ld\+json["']>([\s\S]*?)<\/script>/gi) || [];
        for (const scriptTag of jsonLdMatches) {
          try {
            const jsonContent = scriptTag.replace(/<script\s+type=["']application\/ld\+json["']>/i, '').replace(/<\/script>/i, '').trim();
            const parsed = JSON.parse(jsonContent);
            const items = Array.isArray(parsed) ? parsed : [parsed];

            for (const item of items) {
              if (item['@type'] === 'Product' || item.name) {
                if (!detectedTitle && item.name) detectedTitle = item.name;
                if (!detectedDescription && item.description) detectedDescription = item.description;

                if (item.image) {
                  if (Array.isArray(item.image)) {
                    item.image.forEach(img => {
                      if (typeof img === 'string') collectedImages.add(img);
                      else if (img?.url) collectedImages.add(img.url);
                    });
                  } else if (typeof item.image === 'string') {
                    collectedImages.add(item.image);
                  } else if (item.image.url) {
                    collectedImages.add(item.image.url);
                  }
                }

                if (item.offers && !detectedPrice) {
                  const offer = Array.isArray(item.offers) ? item.offers[0] : item.offers;
                  if (offer?.price) {
                    const currency = offer.priceCurrency || 'IDR';
                    detectedPrice = `${currency} ${Number(offer.price).toLocaleString('id-ID')}`;
                  }
                }
              }
            }
          } catch {}
        }

        // Cari link CDN Shopee di dalam HTML
        if (hostname.includes('shopee')) {
          const shopeeCdnRegex = /https:\/\/(?:down-id\.img\.susercontent\.com|cf\.shopee\.co\.id)\/file\/([a-zA-Z0-9_-]+)/g;
          let match;
          while ((match = shopeeCdnRegex.exec(html)) !== null) {
            collectedImages.add(match[0]);
          }
        }

        // Open Graph Title jika belum ada
        if (!detectedTitle) {
          const ogTitleMatch = html.match(/<meta\s+(?:property|name)=["'](?:og:title|twitter:title)["']\s+content=["'](.*?)["']/i);
          if (ogTitleMatch && ogTitleMatch[1]) {
            detectedTitle = ogTitleMatch[1].replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim();
          }
        }
      } catch (err) {
        console.warn('Gagal fetch salah satu URL:', urlStr, err.message);
      }
    }

    const filteredImages = Array.from(collectedImages).filter(img => {
      return !img.includes('favicon') && !img.includes('icon-') && !img.includes('logo') && !img.includes('avatar') && !img.includes('assets/1c8bdaaf45e1fd48');
    });

    if (filteredImages.length === 0) {
      return Response.json({
        success: false,
        platform: detectedPlatform || 'Marketplace',
        title: detectedTitle || 'Produk Marketplace',
        message: 'Shopee memproteksi halaman produk dengan sistem anti-bot. Cukup KLIK KANAN beberapa foto di Shopee lalu pilih "Salin Alamat Gambar" (Copy Image Address), dan tempelkan semua link di sini!',
        images: [],
      });
    }

    const platformLabel = urlList.length > 1
      ? `${detectedPlatform || 'Marketplace'} (${filteredImages.length} Foto)`
      : (detectedPlatform || 'E-Commerce');

    return Response.json({
      success: true,
      platform: platformLabel,
      title: detectedTitle || 'Foto Produk Marketplace',
      description: detectedDescription || '',
      price: detectedPrice || '',
      images: filteredImages,
    });
  } catch (error) {
    console.error('Marketplace extract error:', error);
    return Response.json({
      error: error.message || 'Gagal mengekstrak data produk dari tautan yang diberikan.'
    }, { status: 500 });
  }
}
