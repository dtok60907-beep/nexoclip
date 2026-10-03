'use client';

import { useEffect, useState, useMemo } from 'react';

function formatDateBucket(dateStr) {
  if (!dateStr) return 'Lainnya';
  const date = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Hari Ini';
  if (diffDays === 1) return 'Kemarin';
  if (diffDays < 7) return '7 Hari Terakhir';
  return 'Lebih Lama';
}

export default function AssetsContent() {
  const [serverAssets, setServerAssets] = useState([]);
  const [productStudioHistory, setProductStudioHistory] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // 'all' | 'product' | 'image' | 'date'
  const [previewAsset, setPreviewAsset] = useState(null);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    // 1. Baca riwayat Product Studio dari localStorage
    try {
      const stored = localStorage.getItem('nexoclip_product_studio_history');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setProductStudioHistory(parsed);
        }
      }
    } catch {}

    // 2. Fetch assets dari server database
    const workspaceId = typeof window !== 'undefined' ? window.sessionStorage.getItem('nexoclip_workspace_id') : null;
    if (!workspaceId) {
      setStatus('ready');
      return;
    }

    fetch('/api/assets', {
      headers: { 'x-workspace-id': workspaceId },
      credentials: 'include',
    })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Gagal memuat assets');
        return body.assets || [];
      })
      .then((items) => {
        setServerAssets(items);
        setStatus('ready');
      })
      .catch((reason) => {
        setError(reason.message);
        setStatus('ready'); // Tetap ready agar item localStorage masih bisa tampil
      });
  }, []);

  // Gabungkan dan kelompokkan aset
  const { allAssets, productAssets, imageAssets, groupedByDate } = useMemo(() => {
    const map = new Map();

    // Masukkan aset dari server
    serverAssets.forEach((asset) => {
      const isProduct =
        asset.filename?.includes('product-studio') ||
        asset.storage_key?.includes('product-studio');
      map.set(asset.url || asset.id, {
        id: asset.id,
        url: asset.url,
        filename: asset.filename || 'Generated Image',
        created_at: asset.created_at || new Date().toISOString(),
        category: isProduct ? 'product' : 'image',
        source: isProduct ? 'Product Studio' : 'Image Studio',
        title: isProduct
          ? (asset.filename?.replace(/^product-studio-/, '').replace(/\.[^/.]+$/, '').replace(/_/g, ' ') || 'Product Shoot')
          : (asset.prompt || asset.filename || 'Generated Image'),
      });
    });

    // Masukkan riwayat lokal Product Studio
    productStudioHistory.forEach((prod) => {
      if (prod.url && !map.has(prod.url)) {
        map.set(prod.url, {
          id: prod.id || `local-prod-${Date.now()}`,
          url: prod.url,
          filename: prod.title ? `${prod.title}.jpg` : 'product-photoshoot.jpg',
          created_at: prod.timestamp ? new Date(prod.timestamp).toISOString() : new Date().toISOString(),
          category: 'product',
          source: 'Product Studio',
          title: prod.title || 'Product Photoshoot',
          scene: prod.scene,
          prompt: prod.prompt,
        });
      }
    });

    const list = Array.from(map.values()).sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );

    const prods = list.filter((a) => a.category === 'product');
    const imgs = list.filter((a) => a.category !== 'product');

    // Grouping by Date
    const byDate = {
      'Hari Ini': [],
      Kemarin: [],
      '7 Hari Terakhir': [],
      'Lebih Lama': [],
    };

    list.forEach((item) => {
      const bucket = formatDateBucket(item.created_at);
      if (byDate[bucket]) {
        byDate[bucket].push(item);
      } else {
        byDate['Lebih Lama'].push(item);
      }
    });

    return {
      allAssets: list,
      productAssets: prods,
      imageAssets: imgs,
      groupedByDate: byDate,
    };
  }, [serverAssets, productStudioHistory]);

  const copyLink = (url, id) => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).catch(() => {});
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const renderAssetCard = (asset) => (
    <article
      key={asset.id || asset.url}
      className="group relative rounded-2xl overflow-hidden bg-white/90 border border-[#110C2A]/10 shadow-xs hover:shadow-xl transition-all duration-300 flex flex-col"
    >
      <div
        className="relative aspect-square w-full overflow-hidden bg-[#110C2A]/5 cursor-pointer"
        onClick={() => setPreviewAsset(asset)}
      >
        <img
          src={asset.url}
          alt={asset.title}
          className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
        />

        {/* Hover Quick Action Buttons */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-3">
          <button
            type="button"
            title="Salin Tautan"
            onClick={(e) => {
              e.stopPropagation();
              copyLink(asset.url, asset.id);
            }}
            style={{ color: '#ffffff', backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
            className="p-2 rounded-full hover:bg-[#A175FF] transition-all border border-white/20 shadow-md cursor-pointer"
          >
            {copiedId === asset.id ? (
              <span className="text-[10px] font-bold">Tersalin</span>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              title="Perbesar Gambar"
              onClick={(e) => {
                e.stopPropagation();
                setPreviewAsset(asset);
              }}
              style={{ color: '#ffffff', backgroundColor: 'rgba(0, 0, 0, 0.7)' }}
              className="p-2 rounded-full hover:bg-[#A175FF] transition-all border border-white/20 shadow-md cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.3-4.3" />
                <path d="M11 8v6M8 11h6" />
              </svg>
            </button>
            <a
              href={asset.url}
              target="_blank"
              rel="noreferrer"
              title="Unduh Resolusi Penuh"
              onClick={(e) => e.stopPropagation()}
              style={{ color: '#110C2A', backgroundColor: '#22d3ee' }}
              className="p-2 rounded-full font-bold hover:bg-cyan-300 transition-all border border-white/25 shadow-md cursor-pointer"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
            </a>
          </div>
        </div>
      </div>

      <div className="p-3 bg-white flex flex-col gap-1.5 border-t border-[#110C2A]/10">
        <p style={{ color: '#110C2A' }} className="truncate text-xs font-bold text-[#110C2A]">
          {asset.title || asset.filename}
        </p>
        <div className="flex items-center justify-between text-[10px]">
          <span
            style={{
              color: asset.category === 'product' ? '#6c3df4' : '#0284c7',
              backgroundColor: asset.category === 'product' ? 'rgba(161, 117, 255, 0.15)' : 'rgba(56, 189, 248, 0.15)',
            }}
            className="px-2 py-0.5 rounded-full font-bold"
          >
            {asset.category === 'product' ? 'Product Studio' : 'Image Studio'}
          </span>
          <span style={{ color: 'rgba(17, 12, 42, 0.5)' }} className="font-medium">
            {new Date(asset.created_at).toLocaleDateString('id-ID', {
              day: 'numeric',
              month: 'short',
            })}
          </span>
        </div>
      </div>
    </article>
  );

  return (
    <section className="min-h-full bg-[#FCEED1] px-5 py-8 text-[#110C2A] md:px-10 pb-28">
      {/* Header */}
      <header className="mx-auto mb-6 flex max-w-7xl flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#110C2A]/10 pb-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[#110C2A] flex items-center gap-2">
            
            <span>Asset Library</span>
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#110C2A]/60 font-medium">
            Koleksi lengkap hasil photoshoot produk & gambar AI yang dikelompokkan dengan rapi.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/studio/product-studio"
            style={{ backgroundColor: '#A175FF', color: '#ffffff' }}
            className="rounded-xl px-4 py-2 text-xs font-bold shadow-md shadow-[#A175FF]/30 hover:brightness-105 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span style={{ color: '#ffffff' }}>Product Studio</span>
          </a>
          <a
            href="/studio"
            className="rounded-xl bg-white/90 border border-[#110C2A]/15 px-4 py-2 text-xs font-bold text-[#110C2A] hover:bg-white transition-all shadow-xs"
          >
            Image Studio
          </a>
        </div>
      </header>

      {/* Filter Tabs */}
      <div className="mx-auto mb-8 max-w-7xl flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'all'
              ? 'bg-[#110C2A] text-white shadow-md'
              : 'bg-white/80 hover:bg-white text-[#110C2A]/70 border border-[#110C2A]/10'
          }`}
        >
          Semua ({allAssets.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('product')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'product'
              ? 'bg-[#6c3df4] text-white shadow-md shadow-[#6c3df4]/25'
              : 'bg-white/80 hover:bg-white text-[#110C2A]/70 border border-[#110C2A]/10'
          }`}
        >
          
          <span>Product Studio ({productAssets.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('image')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'image'
              ? 'bg-sky-600 text-white shadow-md'
              : 'bg-white/80 hover:bg-white text-[#110C2A]/70 border border-[#110C2A]/10'
          }`}
        >
          
          <span>Image Studio ({imageAssets.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('date')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'date'
              ? 'bg-amber-600 text-white shadow-md'
              : 'bg-white/80 hover:bg-white text-[#110C2A]/70 border border-[#110C2A]/10'
          }`}
        >
          
          <span>Kelompokkan per Tanggal</span>
        </button>
      </div>

      {status === 'loading' && (
        <div className="mx-auto max-w-7xl py-12 flex flex-col items-center justify-center gap-3">
          <div className="w-8 h-8 rounded-full border-3 border-[#A175FF]/30 border-t-[#6c3df4] animate-spin"></div>
          <p className="text-xs font-bold text-[#110C2A]/60">Memuat koleksi asset workspace...</p>
        </div>
      )}

      {status === 'ready' && allAssets.length === 0 && (
        <div className="mx-auto max-w-2xl rounded-3xl border border-[#110C2A]/10 bg-white/70 backdrop-blur-md p-12 text-center shadow-sm">
          
          <h3 className="text-base font-extrabold text-[#110C2A]">Belum Ada Aset Dihasilkan</h3>
          <p className="mt-1 text-xs text-[#110C2A]/60 max-w-sm mx-auto">
            Mulai generate foto produk komersial Anda di Product Studio atau gambar kreatif di Image Studio.
          </p>
          <a
            href="/studio/product-studio"
            style={{ backgroundColor: '#A175FF', color: '#ffffff' }}
            className="mt-5 inline-block rounded-xl px-5 py-2.5 text-xs font-bold shadow-md hover:brightness-105 transition-all cursor-pointer"
          >
            Mulai di Product Studio
          </a>
        </div>
      )}

      {/* VIEW: By Category / Studio (Default & Filtered) */}
      {status === 'ready' && (activeTab === 'all' || activeTab === 'product' || activeTab === 'image') && (
        <div className="mx-auto max-w-7xl flex flex-col gap-10">
          {/* Section 1: Product Studio */}
          {(activeTab === 'all' || activeTab === 'product') && productAssets.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-[#110C2A]/10 pb-2">
                <div className="flex items-center gap-2">
                  
                  <h2 className="text-base font-extrabold text-[#110C2A]">Product Studio Photoshoots</h2>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#A175FF]/20 text-[#6c3df4]">
                    {productAssets.length} Foto
                  </span>
                </div>
                <a
                  href="/studio/product-studio"
                  className="text-xs font-bold text-[#6c3df4] hover:underline"
                >
                  Buka Product Studio
                </a>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {productAssets.map(renderAssetCard)}
              </div>
            </div>
          )}

          {/* Section 2: Image Studio */}
          {(activeTab === 'all' || activeTab === 'image') && imageAssets.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-[#110C2A]/10 pb-2">
                <div className="flex items-center gap-2">
                  
                  <h2 className="text-base font-extrabold text-[#110C2A]">Image Studio & Aset Lainnya</h2>
                  <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-800">
                    {imageAssets.length} Gambar
                  </span>
                </div>
                <a
                  href="/studio"
                  className="text-xs font-bold text-sky-700 hover:underline"
                >
                  Buka Image Studio
                </a>
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {imageAssets.map(renderAssetCard)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* VIEW: Grouped by Date */}
      {status === 'ready' && activeTab === 'date' && (
        <div className="mx-auto max-w-7xl flex flex-col gap-8">
          {Object.entries(groupedByDate).map(([bucketName, items]) => {
            if (items.length === 0) return null;
            return (
              <div key={bucketName} className="flex flex-col gap-3">
                <div className="flex items-center gap-2 border-b border-[#110C2A]/10 pb-2">
                  
                  <h2 className="text-sm font-extrabold text-[#110C2A]">{bucketName}</h2>
                  <span className="text-[11px] font-bold px-2 py-0.2 rounded-full bg-[#110C2A]/10 text-[#110C2A]/70">
                    {items.length} item
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {items.map(renderAssetCard)}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Fullscreen Lightbox Modal */}
      {previewAsset && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setPreviewAsset(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-white rounded-3xl overflow-hidden border border-[#110C2A]/10 flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setPreviewAsset(null)}
              className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-black/60 text-white hover:bg-black flex items-center justify-center font-bold transition-colors cursor-pointer"
            >
              ×
            </button>
            <div className="overflow-auto flex-1 flex items-center justify-center p-4 bg-[#110C2A]/5">
              <img
                src={previewAsset.url}
                alt={previewAsset.title}
                className="max-h-[70vh] w-auto object-contain rounded-xl shadow-lg"
              />
            </div>
            <div className="p-5 bg-white border-t border-[#110C2A]/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="min-w-0">
                <span
                  style={{
                    color: previewAsset.category === 'product' ? '#6c3df4' : '#0284c7',
                    backgroundColor: previewAsset.category === 'product' ? 'rgba(161, 117, 255, 0.15)' : 'rgba(56, 189, 248, 0.15)',
                  }}
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full inline-block mb-1"
                >
                  {previewAsset.category === 'product' ? 'Product Studio Shoot' : 'Image Studio'}
                </span>
                <h4 style={{ color: '#110C2A' }} className="text-sm font-extrabold text-[#110C2A] truncate">
                  {previewAsset.title}
                </h4>
                {previewAsset.prompt && (
                  <p style={{ color: 'rgba(17, 12, 42, 0.65)' }} className="text-xs text-[#110C2A]/65 mt-1 line-clamp-2">
                    {previewAsset.prompt}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => copyLink(previewAsset.url, previewAsset.id)}
                  className="px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-[#6c3df4] text-xs font-bold border border-[#A175FF]/30 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  
                  <span>{copiedId === previewAsset.id ? 'Tersalin!' : 'Salin Link'}</span>
                </button>
                <a
                  href={previewAsset.url}
                  target="_blank"
                  rel="noreferrer"
                  download
                  style={{ backgroundColor: '#22d3ee', color: '#110C2A' }}
                  className="px-4 py-2 rounded-xl text-xs font-extrabold hover:bg-cyan-300 transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  
                  <span>Unduh HD</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
