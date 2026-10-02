'use client';

import { useState } from 'react';

const SCENE_OPTIONS = [
  {
    id: 'minimalist_podium',
    title: 'Minimalist Podium',
    icon: '🏛️',
    desc: 'Podium semen halus, pencahayaan softbox, latar pastel netral.',
    badge: 'Popular',
  },
  {
    id: 'nature_botanical',
    title: 'Nature & Botanical',
    icon: '🌿',
    desc: 'Batu alam basah, daun monstera segar, sinar matahari sore.',
    badge: 'Organic',
  },
  {
    id: 'luxury_marble',
    title: 'Luxury Gold & Marble',
    icon: '✨',
    desc: 'Marmer hitam corak emas, rim lighting sinematik, kesan mewah.',
    badge: 'High-End',
  },
  {
    id: 'lifestyle_cafe',
    title: 'Cozy Lifestyle',
    icon: '☕',
    desc: 'Meja kayu hangat, cangkir kopi, interior kafe modern lembut.',
    badge: 'Authentic',
  },
  {
    id: 'festive_promo',
    title: 'Festive & Celebration',
    icon: '🏮',
    desc: 'Lampu hias fairy lights, bokeh emas berkilau, tema perayaan.',
    badge: 'Campaign',
  },
  {
    id: 'neon_cyberpunk',
    title: 'Neon Tech',
    icon: '⚡',
    desc: 'Permukaan akrilik reflektif, aksen neon cyan & magenta modern.',
    badge: 'Futuristic',
  },
  {
    id: 'custom',
    title: 'Custom Prompt',
    icon: '✍️',
    desc: 'Tuliskan deskripsi latar belakang dan suasana khusus sesuai kreasi Anda.',
    badge: 'Bebas',
  },
];

const ASPECT_RATIOS = [
  { id: '1:1', label: '1:1 Square', sub: 'Instagram / Feed Toko' },
  { id: '9:16', label: '9:16 Portrait', sub: 'TikTok / Story / Reels' },
  { id: '16:9', label: '16:9 Landscape', sub: 'Website Banner / Ads' },
];

export default function ProductStudio({
  onGenerationStart,
  onGenerationEnd,
  onGenerationComplete,
  onGenerationError,
}) {
  const [marketplaceUrl, setMarketplaceUrl] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  
  // Data produk yang diekstrak
  const [productData, setProductData] = useState(null);
  const [selectedImage, setSelectedImage] = useState('');

  // Konfigurasi Photoshoot
  const [selectedScene, setSelectedScene] = useState('minimalist_podium');
  const [customPrompt, setCustomPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');

  // Status Generate
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [generatedResults, setGeneratedResults] = useState([]);

  // Handler ekstraksi link marketplace
  const handleExtract = async (e) => {
    e?.preventDefault();
    if (!marketplaceUrl.trim()) return;

    setIsExtracting(true);
    setExtractError('');
    setProductData(null);
    setSelectedImage('');

    try {
      const res = await fetch('/api/marketplace/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: marketplaceUrl.trim() }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengekstrak produk');

      if (!data.success && data.message) {
        setExtractError(data.message);
      }

      setProductData(data);
      if (data.images && data.images.length > 0) {
        setSelectedImage(data.images[0]);
      }
    } catch (err) {
      setExtractError(err.message || 'Terjadi kesalahan saat memproses tautan');
    } finally {
      setIsExtracting(false);
    }
  };

  // Handler generate photoshoot AI via BytePlus
  const handleGenerate = async () => {
    if (!selectedImage) return;

    setIsGenerating(true);
    setGenerateError('');
    if (onGenerationStart) onGenerationStart();

    const workspaceId = typeof window !== 'undefined' ? window.sessionStorage.getItem('nexoclip_workspace_id') : null;

    try {
      const res = await fetch('/api/marketplace/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(workspaceId ? { 'x-workspace-id': workspaceId } : {}),
        },
        body: JSON.stringify({
          productTitle: productData?.title || 'Commercial Product',
          productImage: selectedImage,
          scenePreset: selectedScene,
          customPrompt,
          aspectRatio,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memproses gambar');

      const outputs = data.outputs || [];
      setGeneratedResults((prev) => [...outputs, ...prev]);

      if (onGenerationComplete) onGenerationComplete(outputs);
    } catch (err) {
      setGenerateError(err.message || 'Gagal membuat foto produk dengan BytePlus');
      if (onGenerationError) onGenerationError(err);
    } finally {
      setIsGenerating(false);
      if (onGenerationEnd) onGenerationEnd();
    }
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-[#FCEED1] p-4 md:p-8 text-[#110C2A]">
      <div className="mx-auto max-w-6xl space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#110C2A]/10 pb-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#A175FF]/15 text-[#6c3df4] text-xs font-bold mb-2">
              <span>🛍️</span>
              <span>BytePlus SeaDream AI Powered</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight">Product Studio</h1>
            <p className="text-sm text-[#110C2A]/65 mt-1">
              Ubah link produk Tokopedia, Shopee, TikTok Shop, atau gambar produk menjadi foto katalog studio profesional dalam sekejap.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs font-semibold text-[#110C2A]/60 bg-white/60 px-4 py-2 rounded-2xl border border-[#110C2A]/10">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Adapter: BytePlus AI Engine</span>
          </div>
        </div>

        {/* Step 1: Input URL Marketplace */}
        <section className="bg-white/80 backdrop-blur-md rounded-3xl p-6 border border-[#110C2A]/10 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold flex items-center gap-2">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#A175FF] text-white text-xs">1</span>
              <span>Masukkan Link Produk Marketplace</span>
            </h2>
            <div className="flex gap-2">
              {['Tokopedia', 'Shopee', 'TikTok Shop', 'Amazon'].map((platform) => (
                <span key={platform} className="hidden sm:inline-block px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-[#110C2A]/5 text-[#110C2A]/60">
                  {platform}
                </span>
              ))}
            </div>
          </div>

          <form onSubmit={handleExtract} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              placeholder="Tempel link produk di sini (contoh: https://www.tokopedia.com/... atau link foto)..."
              value={marketplaceUrl}
              onChange={(e) => setMarketplaceUrl(e.target.value)}
              className="flex-1 rounded-2xl border border-[#110C2A]/15 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#A175FF] transition-all shadow-inner"
            />
            <button
              type="submit"
              disabled={isExtracting || !marketplaceUrl.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#110C2A] px-6 py-3 text-sm font-bold text-white hover:bg-black disabled:opacity-50 transition-all shadow-md active:scale-95"
            >
              {isExtracting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  <span>Mengekstrak...</span>
                </>
              ) : (
                <>
                  <span>Ambil Foto Produk</span>
                  <span>➔</span>
                </>
              )}
            </button>
          </form>

          {extractError && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-900 text-xs flex items-start gap-2">
              <span className="text-base leading-none">⚠️</span>
              <span>{extractError}</span>
            </div>
          )}
        </section>

        {/* Step 2: Hasil Ekstraksi Produk & Pilih Foto */}
        {productData && (
          <section className="bg-white/80 backdrop-blur-md rounded-3xl p-6 border border-[#110C2A]/10 shadow-sm space-y-4 animate-fade-in">
            <div className="flex items-center justify-between border-b border-[#110C2A]/10 pb-4">
              <div>
                <span className="text-xs font-bold text-[#A175FF] uppercase tracking-wider">{productData.platform}</span>
                <h3 className="text-lg font-bold text-[#110C2A] line-clamp-1">{productData.title}</h3>
                {productData.price && (
                  <p className="text-sm font-semibold text-emerald-600 mt-0.5">{productData.price}</p>
                )}
              </div>
              <span className="text-xs text-[#110C2A]/50">
                {productData.images?.length || 0} foto ditemukan
              </span>
            </div>

            <div>
              <p className="text-xs font-semibold text-[#110C2A]/70 mb-3">Pilih foto produk yang ingin dipotret dengan AI:</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {productData.images?.map((imgUrl, idx) => {
                  const isSelected = selectedImage === imgUrl;
                  return (
                    <div
                      key={idx}
                      onClick={() => setSelectedImage(imgUrl)}
                      className={`relative aspect-square rounded-2xl overflow-hidden cursor-pointer border-2 transition-all group ${
                        isSelected ? 'border-[#A175FF] ring-4 ring-[#A175FF]/20 scale-102 shadow-md' : 'border-transparent hover:border-[#110C2A]/20'
                      }`}
                    >
                      <img src={imgUrl} alt="Produk" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-5 h-5 bg-[#A175FF] text-white rounded-full flex items-center justify-center text-[10px] font-bold shadow">
                          ✓
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Step 3: Setup Scene & Lighting */}
        <section className="bg-white/80 backdrop-blur-md rounded-3xl p-6 border border-[#110C2A]/10 shadow-sm space-y-6">
          <h2 className="text-base font-bold flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-[#A175FF] text-white text-xs">2</span>
            <span>Pilih Gaya & Suasana Studio</span>
          </h2>

          {/* Preset Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {SCENE_OPTIONS.map((scene) => {
              const isSelected = selectedScene === scene.id;
              return (
                <div
                  key={scene.id}
                  onClick={() => setSelectedScene(scene.id)}
                  className={`p-4 rounded-2xl cursor-pointer border-2 transition-all relative flex flex-col justify-between ${
                    isSelected
                      ? 'border-[#A175FF] bg-[#A175FF]/5 shadow-sm'
                      : 'border-[#110C2A]/10 bg-white/50 hover:bg-white hover:border-[#110C2A]/20'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-2xl">{scene.icon}</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#110C2A]/5 text-[#110C2A]/60">
                        {scene.badge}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-[#110C2A]">{scene.title}</h3>
                    <p className="text-xs text-[#110C2A]/60 mt-1 leading-relaxed">{scene.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Custom Prompt Box */}
          {selectedScene === 'custom' && (
            <div className="space-y-2 animate-fade-in">
              <label className="text-xs font-bold text-[#110C2A]/80">Deskripsi Latar Belakang Kustom:</label>
              <textarea
                rows={2}
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                placeholder="Contoh: diletakkan di atas pasir pantai tropis dengan ombak lembut di latar belakang saat senja..."
                className="w-full rounded-2xl border border-[#110C2A]/15 bg-white p-3 text-xs focus:outline-none focus:ring-2 focus:ring-[#A175FF]"
              />
            </div>
          )}

          {/* Aspect Ratio Selection */}
          <div className="border-t border-[#110C2A]/10 pt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-xs font-bold text-[#110C2A]">Rasio Aspek Gambar:</h3>
              <p className="text-[11px] text-[#110C2A]/55">Sesuaikan format dengan kebutuhan platform jualan Anda.</p>
            </div>

            <div className="flex gap-2">
              {ASPECT_RATIOS.map((ratio) => (
                <button
                  key={ratio.id}
                  type="button"
                  onClick={() => setAspectRatio(ratio.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-bold transition-all border ${
                    aspectRatio === ratio.id
                      ? 'bg-[#110C2A] text-white border-[#110C2A] shadow-sm'
                      : 'bg-white text-[#110C2A]/70 border-[#110C2A]/15 hover:border-[#110C2A]/30'
                  }`}
                >
                  <div>{ratio.label}</div>
                  <div className="text-[9px] opacity-70 font-normal">{ratio.sub}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Action Button */}
          <div className="pt-2">
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !selectedImage}
              className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#A175FF] hover:bg-[#8e5af8] text-white py-4 text-sm font-extrabold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 active:scale-98"
            >
              {isGenerating ? (
                <>
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  <span>BytePlus sedang memotret produk Anda...</span>
                </>
              ) : (
                <>
                  <span>✨ Generate Product Photoshoot</span>
                  <span>(BytePlus SeaDream)</span>
                </>
              )}
            </button>
            {!selectedImage && (
              <p className="text-center text-[11px] text-[#110C2A]/50 mt-2">
                * Silakan masukkan link produk dan pilih foto produk di atas terlebih dahulu.
              </p>
            )}
          </div>

          {generateError && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-900 text-xs">
              <span className="font-bold">Gagal generate:</span> {generateError}
            </div>
          )}
        </section>

        {/* Step 4: Hasil Galeri Photoshoot */}
        {generatedResults.length > 0 && (
          <section className="bg-white/80 backdrop-blur-md rounded-3xl p-6 border border-[#110C2A]/10 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-[#110C2A]/10 pb-4">
              <h2 className="text-base font-bold flex items-center gap-2">
                <span>🖼️</span>
                <span>Hasil Foto Studio Komersial ({generatedResults.length})</span>
              </h2>
              <span className="text-xs text-[#110C2A]/50">Siap digunakan untuk materi iklan / katalog</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {generatedResults.map((result, idx) => (
                <div key={idx} className="group bg-white rounded-2xl border border-[#110C2A]/10 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
                  <div className="relative aspect-square bg-[#050505]">
                    <img src={result.url} alt="Hasil AI" className="w-full h-full object-cover" />
                  </div>
                  <div className="p-4 flex items-center justify-between gap-2">
                    <a
                      href={result.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 text-center py-2 px-3 rounded-xl bg-[#110C2A] hover:bg-black text-white text-xs font-bold transition-colors"
                    >
                      Download HD
                    </a>
                    <a
                      href="/canvas"
                      className="flex-1 text-center py-2 px-3 rounded-xl bg-[#A175FF]/15 hover:bg-[#A175FF]/25 text-[#6c3df4] text-xs font-bold transition-colors"
                    >
                      Buka di Canvas ➔
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

      </div>
    </div>
  );
}
