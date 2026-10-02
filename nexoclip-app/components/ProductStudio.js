'use client';

import { useState, useRef, useEffect } from 'react';
import {
  PromptComposer,
  PromptTextarea,
  PromptFooter,
  PromptControls,
  PromptAction,
  PromptPopover,
  PromptPopoverHeader,
  PromptMenuList,
  PromptMenuItem,
  PromptChevronIcon,
  PromptAspectRatioIcon,
  promptControlClassName,
  promptMediaButtonClassName,
  PROMPT_CONTROL_LABEL_CLASS,
} from 'studio/src/components/prompt/PromptComposer.jsx';

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

const BYTEPLUS_MODELS = [
  { id: 'byteplus-seadream-5', name: 'BytePlus SeaDream 5.0', desc: 'Commercial studio lighting & product geometry preservation' },
  { id: 'byteplus-commercial-v2', name: 'BytePlus Commercial v2', desc: 'Ultra-sharp textures, luxury materials & reflections' },
];

export default function ProductStudio({
  onGenerationStart,
  onGenerationEnd,
  onGenerationComplete,
  onGenerationError,
}) {
  // Input URL & Ekstraksi Marketplace
  const [marketplaceUrl, setMarketplaceUrl] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  
  // Data produk yang diekstrak
  const [productData, setProductData] = useState(null);
  const [selectedImage, setSelectedImage] = useState('');

  // Konfigurasi Photoshoot
  const [selectedModel, setSelectedModel] = useState(BYTEPLUS_MODELS[0]);
  const [selectedSceneId, setSelectedSceneId] = useState('minimalist_podium');
  const [customPrompt, setCustomPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');

  // Status Generate & Galeri
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [generatedResults, setGeneratedResults] = useState([]);
  const [fullscreenImage, setFullscreenImage] = useState(null);

  // Popover State: 'model' | 'scene' | 'ar' | 'linkModal' | null
  const [activePopover, setActivePopover] = useState(null);
  const dropdownRef = useRef(null);
  const textareaRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        if (activePopover && activePopover !== 'linkModal') {
          setActivePopover(null);
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [activePopover]);

  const currentScene = SCENE_OPTIONS.find((s) => s.id === selectedSceneId) || SCENE_OPTIONS[0];

  // Handler ekstraksi link marketplace
  const handleExtract = async (overrideUrl) => {
    const urlToUse = (typeof overrideUrl === 'string' ? overrideUrl : marketplaceUrl).trim();
    if (!urlToUse) return;

    setIsExtracting(true);
    setExtractError('');

    try {
      const res = await fetch('/api/marketplace/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlToUse }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mengekstrak produk dari tautan');

      if (!data.success && data.message) {
        setExtractError(data.message);
      }

      setProductData(data);
      if (data.images && data.images.length > 0) {
        setSelectedImage(data.images[0]);
      }
      if (data.images && data.images.length > 0) {
        setActivePopover(null);
      }
    } catch (err) {
      setExtractError(err.message || 'Terjadi kesalahan saat memproses tautan marketplace');
    } finally {
      setIsExtracting(false);
    }
  };

  // Handler unggah file gambar lokal langsung
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      setSelectedImage(dataUrl);
      setProductData({
        platform: 'Foto Produk',
        title: file.name.replace(/\.[^/.]+$/, ''),
        price: null,
        images: [dataUrl],
      });
      setActivePopover(null);
      setExtractError('');
    };
    reader.readAsDataURL(file);
  };

  // Handler generate photoshoot AI via BytePlus
  const handleGenerate = async () => {
    if (!selectedImage && !marketplaceUrl.trim() && !customPrompt.trim()) {
      setActivePopover('linkModal');
      return;
    }

    // Auto extract if marketplace URL is pasted in prompt or URL field without extracting first
    let currentProdImg = selectedImage;
    if (!currentProdImg && (marketplaceUrl.startsWith('http://') || marketplaceUrl.startsWith('https://'))) {
      await handleExtract();
      return;
    }

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
          productImage: currentProdImg || 'https://images.unsplash.com/photo-1541643600914-78b084683601?w=800&q=80',
          scenePreset: selectedSceneId,
          customPrompt: customPrompt.trim(),
          aspectRatio,
          model: selectedModel.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memproses foto produk');

      const outputs = data.outputs || [];
      const formattedOutputs = outputs.map((out, idx) => ({
        ...out,
        id: out.id || `byteplus-${Date.now()}-${idx}`,
        title: productData?.title || 'Product Photoshoot',
        scene: currentScene.title,
        aspectRatio,
        modelName: selectedModel.name,
      }));

      setGeneratedResults((prev) => [...formattedOutputs, ...prev]);

      if (onGenerationComplete) onGenerationComplete(outputs);
    } catch (err) {
      setGenerateError(err.message || 'Gagal membuat foto produk dengan BytePlus');
      if (onGenerationError) onGenerationError(err);
    } finally {
      setIsGenerating(false);
      if (onGenerationEnd) onGenerationEnd();
    }
  };

  // Deteksi jika prompt mengandung URL langsung
  const isUrlInPrompt = customPrompt.trim().startsWith('http://') || customPrompt.trim().startsWith('https://');

  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-[#FCEED1] text-[#110C2A] relative p-4 md:p-6 overflow-hidden select-none">
      
      {/* ── CENTRAL STAGE / GALLERY ── */}
      <div className="flex-1 w-full max-w-7xl mx-auto overflow-y-auto custom-scrollbar pb-44 lg:pb-36 px-2">
        {generatedResults.length > 0 ? (
          <div className="w-full pt-4 animate-fade-in-up">
            <div className="flex items-center justify-between mb-4 border-b border-[#110C2A]/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#22d3ee]"></span>
                <h2 className="text-base font-bold text-[#110C2A]">
                  Hasil Photoshoot ({generatedResults.length})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setGeneratedResults([])}
                className="text-xs text-[#110C2A]/50 hover:text-red-500 font-medium transition-colors"
              >
                Bersihkan Galeri
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 w-full">
              {generatedResults.map((entry, idx) => (
                <div
                  key={entry.id || idx}
                  className="relative group rounded-2xl overflow-hidden border border-[#110C2A]/10 bg-[#0a0a0a] shadow-xl hover:border-[#A175FF]/60 transition-all duration-300 flex flex-col cursor-pointer"
                  onClick={() => setFullscreenImage(entry)}
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-black/40">
                    <img
                      src={entry.url}
                      alt={entry.title || "Generated photoshoot"}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />

                    {/* Overlay Buttons */}
                    <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        type="button"
                        title="Salin Link Gambar"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(entry.url);
                          alert("Link gambar berhasil disalin!");
                        }}
                        style={{ color: '#ffffff' }}
                        className="p-2 bg-black/70 backdrop-blur-md rounded-full text-white hover:bg-[#A175FF] transition-all border border-white/10"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                        </svg>
                      </button>
                      <a
                        href={entry.url}
                        target="_blank"
                        rel="noreferrer"
                        title="Download HD"
                        onClick={(e) => e.stopPropagation()}
                        style={{ color: '#000000' }}
                        className="p-2 bg-[#22d3ee] backdrop-blur-md rounded-full text-black hover:bg-cyan-300 transition-all border border-white/10"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                        </svg>
                      </a>
                    </div>
                  </div>

                  {/* Info Card Bar */}
                  <div className="p-3 bg-[#181528] backdrop-blur-sm border-t border-white/5 flex flex-col gap-1.5 text-white">
                    <p className="text-xs font-semibold line-clamp-1 text-white/90">
                      {entry.title || "Studio Commercial Shot"}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-white/50">
                      <span className="px-2 py-0.5 rounded bg-white/10 text-[#22d3ee] font-medium">
                        {entry.scene || 'Minimalist'}
                      </span>
                      <span>{entry.aspectRatio || '1:1'} • BytePlus</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Empty State: Matching ImageStudio Signature Hero */
          <div className="flex flex-col items-center justify-center h-full animate-fade-in-up transition-all duration-700 min-h-[50vh] mt-4">
            
            {/* Overlapping floating product photoshoot cards */}
            <div className="flex items-center justify-center gap-1.5 md:gap-3 mb-10 select-none scale-90 sm:scale-100">
              {/* Card 1: Luxury Perfume */}
              <div className="w-18 h-22 sm:w-24 sm:h-28 rounded-2xl border border-white/20 shadow-2xl -rotate-[12deg] transform hover:rotate-0 hover:scale-110 hover:z-20 transition-all duration-300 overflow-hidden bg-white/[0.01] flex-shrink-0">
                <img
                  src="https://images.unsplash.com/photo-1541643600914-78b084683601?w=300&q=80"
                  alt="Luxury Perfume Photoshoot"
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Card 2: Minimalist Botanical Cosmetics */}
              <div className="w-18 h-22 sm:w-24 sm:h-28 rounded-2xl border border-white/20 shadow-2xl -rotate-[4deg] transform hover:rotate-0 hover:scale-110 hover:z-20 transition-all duration-300 overflow-hidden bg-white/[0.01] -ml-3 sm:-ml-4 flex-shrink-0">
                <img
                  src="https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=300&q=80"
                  alt="Cosmetic Cream Podium"
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Card 3: Modern Sneaker Studio */}
              <div className="w-18 h-18 sm:w-24 sm:h-24 rounded-full border border-white/20 shadow-2xl rotate-[6deg] transform hover:rotate-0 hover:scale-110 hover:z-20 transition-all duration-300 overflow-hidden bg-white/[0.01] -ml-3 sm:-ml-4 flex-shrink-0">
                <img
                  src="https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=300&q=80"
                  alt="Sneakers Studio Shot"
                  className="w-full h-full object-cover"
                />
              </div>

              {/* Card 4: Tech Gadget Watch */}
              <div className="w-18 h-22 sm:w-24 sm:h-28 rounded-2xl border border-white/20 shadow-2xl rotate-[12deg] transform hover:rotate-0 hover:scale-110 hover:z-20 transition-all duration-300 overflow-hidden bg-white/[0.01] -ml-3 sm:-ml-4 flex-shrink-0">
                <img
                  src="https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=300&q=80"
                  alt="Tech Product Studio"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            {/* Headline */}
            <h1 className="text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-4 text-center px-4 flex flex-col items-center">
              <span className="text-[#110C2A]/90 font-black uppercase text-xl sm:text-3xl tracking-wide mb-1 opacity-90">
                START CREATING WITH
              </span>
              <span className="text-[#22d3ee] font-black uppercase text-2xl sm:text-4xl sm:mt-1 tracking-tight">
                BYTEPLUS SEADREAM
              </span>
            </h1>

            {/* Subtitle */}
            <p className="text-[#110C2A]/50 text-xs sm:text-sm font-medium tracking-wide text-center max-w-lg leading-relaxed px-4">
              Paste a marketplace product link or photo — generate commercial studio shots with BytePlus AI
            </p>

            {/* Error Message if Any */}
            {generateError && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 text-red-700 text-xs rounded-xl max-w-md text-center">
                {generateError}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── FLOATING PROMPT COMPOSER DOCK ── */}
      <PromptComposer>
        <div className="flex flex-col gap-3">
          
          {/* Active Extracted Product Chip / Bar */}
          {productData && selectedImage && (
            <div className="flex items-center justify-between bg-white/70 backdrop-blur-md rounded-2xl p-2 px-3 border border-[#110C2A]/10 animate-fade-in shadow-sm">
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative w-11 h-11 rounded-xl overflow-hidden border border-[#110C2A]/15 shrink-0 bg-white">
                  <img src={selectedImage} alt="Selected Product" className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold text-[#A175FF] tracking-wider">
                      {productData.platform || 'Product'}
                    </span>
                    {productData.price && (
                      <span className="text-[11px] font-semibold text-emerald-600">
                        {productData.price}
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-bold text-[#110C2A] truncate max-w-xs sm:max-w-md">
                    {productData.title}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {productData.images && productData.images.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setActivePopover('linkModal')}
                    className="px-2.5 py-1 text-[11px] font-semibold text-[#110C2A]/70 hover:text-[#110C2A] bg-white rounded-lg border border-[#110C2A]/10 shadow-xs transition-colors"
                  >
                    Ganti Foto ({productData.images.length})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setProductData(null);
                    setSelectedImage('');
                  }}
                  className="w-6 h-6 rounded-full bg-[#110C2A]/10 hover:bg-red-500 hover:text-white text-[#110C2A]/60 flex items-center justify-center text-xs transition-colors"
                  title="Hapus Produk"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {/* Quick Trigger: When URL is typed in prompt */}
          {isUrlInPrompt && !productData && (
            <div className="flex items-center justify-between bg-[#A175FF]/10 border border-[#A175FF]/30 rounded-xl px-3 py-1.5 animate-fade-in">
              <span className="text-xs text-[#110C2A]/80 flex items-center gap-1.5 font-medium">
                <span>🛒</span> Terdeteksi link produk
              </span>
              <button
                type="button"
                onClick={() => handleExtract(customPrompt)}
                disabled={isExtracting}
                style={{ backgroundColor: '#A175FF', color: '#ffffff' }}
                className="text-xs font-bold text-white bg-[#A175FF] hover:bg-[#8e5af8] px-3 py-1 rounded-lg transition-colors flex items-center gap-1 shadow-xs"
              >
                {isExtracting ? 'Mengekstrak...' : 'Ekstrak Produk ➔'}
              </button>
            </div>
          )}

          {/* Top Row: + Upload/Link Button & Prompt Textarea */}
          <div className="flex items-center gap-3">
            
            {/* + Button: Marketplace Link / Image Upload Trigger */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setActivePopover((cur) => (cur === 'linkModal' ? null : 'linkModal'))}
                className={promptMediaButtonClassName({
                  active: activePopover === 'linkModal' || Boolean(selectedImage),
                })}
                title="Masukkan Link Marketplace / Foto Produk"
              >
                {selectedImage ? (
                  <img src={selectedImage} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-lg font-light text-[#110C2A]/70 group-hover:text-[#A175FF] transition-colors leading-none">
                    +
                  </span>
                )}
              </button>

              {/* Popover / Modal for Marketplace URL */}
              {activePopover === 'linkModal' && (
                <div
                  className="absolute bottom-[calc(100%+12px)] left-0 z-50 bg-[#FFF6DE] rounded-[24px] p-5 shadow-[0_22px_55px_rgba(17,12,42,0.24)] border border-[#110C2A]/15 backdrop-blur-2xl w-[92vw] sm:w-[480px] animate-fade-in text-[#110C2A]"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between pb-3 border-b border-[#110C2A]/10">
                    <h3 className="text-sm font-extrabold text-[#110C2A] flex items-center gap-2">
                      <span className="text-base">🛍️</span>
                      <span>Link Marketplace / Unggah Foto Produk</span>
                    </h3>
                    <button
                      type="button"
                      onClick={() => setActivePopover(null)}
                      className="w-7 h-7 rounded-full bg-white/60 hover:bg-[#110C2A]/10 text-[#110C2A] text-base flex items-center justify-center leading-none transition-colors"
                    >
                      ×
                    </button>
                  </div>

                  {/* URL Input Form */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleExtract();
                    }}
                    className="mt-4 flex flex-col gap-3"
                  >
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Tempel link Tokopedia, Shopee, TikTok Shop..."
                        value={marketplaceUrl}
                        onChange={(e) => setMarketplaceUrl(e.target.value)}
                        className="flex-1 rounded-xl border border-[#110C2A]/20 bg-white px-3.5 py-2.5 text-xs text-[#110C2A] placeholder:text-[#110C2A]/40 focus:outline-none focus:ring-2 focus:ring-[#A175FF] shadow-inner"
                      />
                      {/* AMBIL FOTO BUTTON - High contrast vibrant purple with pure white text */}
                      <button
                        type="submit"
                        disabled={isExtracting || !marketplaceUrl.trim()}
                        style={{ backgroundColor: '#A175FF', color: '#ffffff' }}
                        className="px-5 py-2.5 rounded-xl text-xs font-black shadow-md shadow-[#A175FF]/30 hover:brightness-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0 flex items-center justify-center gap-1.5"
                      >
                        {isExtracting ? (
                          <>
                            <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
                            <span style={{ color: '#ffffff' }}>Mengekstrak...</span>
                          </>
                        ) : (
                          <>
                            <span>🔍</span>
                            <span style={{ color: '#ffffff' }}>Ambil Foto</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-[#110C2A]/50 font-medium">Didukung:</span>
                      {['Tokopedia', 'Shopee', 'TikTok Shop', 'Amazon'].map((plat) => (
                        <span key={plat} className="text-[10px] px-2 py-0.5 rounded-full bg-white/80 border border-[#110C2A]/10 text-[#110C2A]/70 font-medium">
                          {plat}
                        </span>
                      ))}
                    </div>

                    {/* Quick Direct Upload / Fallback Button */}
                    <div className="mt-1 pt-3 border-t border-[#110C2A]/10 flex flex-col gap-2">
                      <label className="cursor-pointer w-full py-2.5 px-3 rounded-xl bg-white hover:bg-[#A175FF]/10 border border-[#110C2A]/15 text-[#110C2A] text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-xs active:scale-[0.99]">
                        <span>📁</span>
                        <span>Atau Unggah Foto Produk Dari Komputer</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>

                    {extractError && (
                      <div className="text-[11px] leading-relaxed text-amber-900 bg-amber-500/15 p-3 rounded-xl border border-amber-500/30 flex flex-col gap-1.5">
                        <div className="flex items-start gap-1.5 font-bold">
                          <span>⚠️</span>
                          <span>{extractError}</span>
                        </div>
                        <span className="text-[10px] text-amber-800/80">
                          Tip: Anda bisa mengklik tombol <b>"Unggah Foto Produk Dari Komputer"</b> di atas untuk langsung memilih foto produk Anda.
                        </span>
                      </div>
                    )}
                  </form>

                  {/* Thumbnail Selector if images were extracted */}
                  {productData?.images && productData.images.length > 0 && (
                    <div className="mt-4 pt-3 border-t border-[#110C2A]/10">
                      <p className="text-xs font-bold text-[#110C2A] mb-2">
                        Pilih foto produk ({productData.images.length}):
                      </p>
                      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-40 overflow-y-auto custom-scrollbar p-1">
                        {productData.images.map((img, i) => (
                          <div
                            key={i}
                            onClick={() => {
                              setSelectedImage(img);
                              setActivePopover(null);
                            }}
                            className={`aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${
                              selectedImage === img
                                ? 'border-[#A175FF] ring-2 ring-[#A175FF]/40 scale-105 shadow-md'
                                : 'border-transparent hover:border-[#110C2A]/30'
                            }`}
                          >
                            <img src={img} alt="" className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Input Prompt Textarea */}
            <PromptTextarea
              ref={textareaRef}
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder={
                productData
                  ? `Atur gaya photoshoot untuk "${productData.title?.substring(0, 30)}..." atau pilih preset di bawah`
                  : "Deskripsikan suasana foto atau tempel link marketplace di sini..."
              }
            />
          </div>

          {/* Bottom Row: Controls + Generate Action */}
          <PromptFooter>
            <PromptControls ref={dropdownRef}>
              
              {/* 1. Model Selector Pill */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActivePopover((p) => (p === 'model' ? null : 'model'));
                  }}
                  className={promptControlClassName({
                    active: activePopover === 'model',
                  })}
                >
                  <div className="w-4 h-4 rounded overflow-hidden shrink-0 flex items-center justify-center bg-cyan-500/10 text-cyan-600 font-bold text-[10px]">
                    ✦
                  </div>
                  <span className={PROMPT_CONTROL_LABEL_CLASS}>
                    {selectedModel.name}
                  </span>
                  <PromptChevronIcon />
                </button>

                {activePopover === 'model' && (
                  <PromptPopover onClick={(e) => e.stopPropagation()} className="w-72">
                    <PromptPopoverHeader>BytePlus AI Engine</PromptPopoverHeader>
                    <PromptMenuList>
                      {BYTEPLUS_MODELS.map((m) => (
                        <PromptMenuItem
                          key={m.id}
                          selected={selectedModel.id === m.id}
                          onSelect={() => {
                            setSelectedModel(m);
                            setActivePopover(null);
                          }}
                        >
                          <div>
                            <div className="font-bold text-xs">{m.name}</div>
                            <div className="text-[10px] text-[#110C2A]/50">{m.desc}</div>
                          </div>
                        </PromptMenuItem>
                      ))}
                    </PromptMenuList>
                  </PromptPopover>
                )}
              </div>

              {/* 2. Scene / Preset Selector Pill */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActivePopover((p) => (p === 'scene' ? null : 'scene'));
                  }}
                  className={promptControlClassName({
                    active: activePopover === 'scene',
                  })}
                >
                  <span className="text-sm shrink-0">{currentScene.icon}</span>
                  <span className={PROMPT_CONTROL_LABEL_CLASS}>
                    {currentScene.title}
                  </span>
                  <PromptChevronIcon />
                </button>

                {activePopover === 'scene' && (
                  <PromptPopover onClick={(e) => e.stopPropagation()} className="w-80 max-h-72 overflow-y-auto custom-scrollbar">
                    <PromptPopoverHeader>Gaya & Suasana Studio</PromptPopoverHeader>
                    <PromptMenuList>
                      {SCENE_OPTIONS.map((scene) => (
                        <PromptMenuItem
                          key={scene.id}
                          selected={selectedSceneId === scene.id}
                          onSelect={() => {
                            setSelectedSceneId(scene.id);
                            setActivePopover(null);
                          }}
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="text-xl">{scene.icon}</span>
                            <div className="min-w-0">
                              <div className="font-bold text-xs flex items-center gap-2">
                                <span>{scene.title}</span>
                                <span className="text-[9px] px-1.5 py-0.2 rounded-full bg-[#110C2A]/5 text-[#110C2A]/60 font-normal">
                                  {scene.badge}
                                </span>
                              </div>
                              <div className="text-[10px] text-[#110C2A]/50 truncate">{scene.desc}</div>
                            </div>
                          </div>
                        </PromptMenuItem>
                      ))}
                    </PromptMenuList>
                  </PromptPopover>
                )}
              </div>

              {/* 3. Aspect Ratio Pill */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActivePopover((p) => (p === 'ar' ? null : 'ar'));
                  }}
                  className={promptControlClassName({
                    active: activePopover === 'ar',
                  })}
                >
                  <PromptAspectRatioIcon />
                  <span className={PROMPT_CONTROL_LABEL_CLASS}>
                    {aspectRatio}
                  </span>
                  <PromptChevronIcon />
                </button>

                {activePopover === 'ar' && (
                  <PromptPopover onClick={(e) => e.stopPropagation()} className="w-56">
                    <PromptPopoverHeader>Aspect Ratio</PromptPopoverHeader>
                    <PromptMenuList>
                      {ASPECT_RATIOS.map((ar) => (
                        <PromptMenuItem
                          key={ar.id}
                          selected={aspectRatio === ar.id}
                          onSelect={() => {
                            setAspectRatio(ar.id);
                            setActivePopover(null);
                          }}
                        >
                          <div>
                            <div className="font-bold text-xs">{ar.label}</div>
                            <div className="text-[10px] text-[#110C2A]/50">{ar.sub}</div>
                          </div>
                        </PromptMenuItem>
                      ))}
                    </PromptMenuList>
                  </PromptPopover>
                )}
              </div>

              {/* 4. Quick Marketplace Link Button */}
              <button
                type="button"
                onClick={() => setActivePopover('linkModal')}
                className={promptControlClassName({
                  active: activePopover === 'linkModal',
                })}
              >
                <span className="text-xs">🛒</span>
                <span className={PROMPT_CONTROL_LABEL_CLASS}>
                  {productData ? 'Ganti Link' : 'Marketplace Link'}
                </span>
              </button>

            </PromptControls>

            {/* Right: Generate Action Button */}
            <PromptAction
              onClick={handleGenerate}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <>
                  <span className="w-4 h-4 border-2 border-[#110C2A]/40 border-t-[#110C2A] rounded-full animate-spin"></span>
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <span>Generate · 2.5 credits</span>
                  <span>✦</span>
                </>
              )}
            </PromptAction>
          </PromptFooter>
        </div>
      </PromptComposer>

      {/* ── FULLSCREEN LIGHTBOX MODAL ── */}
      {fullscreenImage && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setFullscreenImage(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] bg-[#181528] rounded-3xl overflow-hidden border border-white/10 flex flex-col shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative flex-1 overflow-hidden bg-black flex items-center justify-center min-h-[300px] max-h-[70vh]">
              <img
                src={fullscreenImage.url}
                alt={fullscreenImage.title || 'Product Photoshoot'}
                className="max-h-[70vh] w-auto object-contain"
              />
              <button
                type="button"
                onClick={() => setFullscreenImage(null)}
                className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/60 text-white hover:bg-white hover:text-black flex items-center justify-center font-bold transition-colors border border-white/20"
              >
                ✕
              </button>
            </div>

            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-white">
              <div>
                <h3 className="font-bold text-base text-white">{fullscreenImage.title || 'Product Studio Shot'}</h3>
                <p className="text-xs text-white/50 mt-0.5">
                  Scene: {fullscreenImage.scene} • Rasio: {fullscreenImage.aspectRatio} • Engine: BytePlus SeaDream
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(fullscreenImage.url);
                    alert('Link foto berhasil disalin!');
                  }}
                  style={{ color: '#ffffff' }}
                  className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-colors"
                >
                  Salin Link
                </button>
                <a
                  href={fullscreenImage.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#000000' }}
                  className="px-5 py-2 rounded-xl bg-[#22d3ee] hover:bg-[#06b6d4] text-black text-xs font-black transition-colors"
                >
                  Download HD
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
