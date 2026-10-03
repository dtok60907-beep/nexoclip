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


// Generator konsep kampanye kreatif multi-sudut komersial
const getInitialCampaigns = (title = 'Commercial Product', details = '') => [
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

  // AI Product Agent Intelligence
  const [agentInfo, setAgentInfo] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAgentDrawerOpen, setIsAgentDrawerOpen] = useState(false);
  const [copiedBrief, setCopiedBrief] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState('');
  const [editedPrice, setEditedPrice] = useState('');
  const [isEditingPrice, setIsEditingPrice] = useState(false);

  // Creative Commercial Director Agent State
  const [creativeCampaigns, setCreativeCampaigns] = useState([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
  const [creativeDirectorVision, setCreativeDirectorVision] = useState('');
  const [referenceMode, setReferenceMode] = useState('creative_3d'); // 'creative_3d' | 'guided'
  const [isBrainstorming, setIsBrainstorming] = useState(false);
  const [brainstormInput, setBrainstormInput] = useState('');

  // Konfigurasi Photoshoot
  const [selectedModel, setSelectedModel] = useState(BYTEPLUS_MODELS[0]);
  const [selectedSceneId, setSelectedSceneId] = useState('minimalist_podium');
  const [customPrompt, setCustomPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState('1:1');
  const [imageCount, setImageCount] = useState(1); // 1, 2, 4 foto
  const [isWatermarkEnabled, setIsWatermarkEnabled] = useState(false); // default: false (bersih tanpa watermark)

  // Status Generate & Galeri
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [generatedResults, setGeneratedResults] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('nexoclip_product_studio_history');
        if (saved) return JSON.parse(saved);
      } catch {}
    }
    return [];
  });
  const [generationElapsed, setGenerationElapsed] = useState(0);

  useEffect(() => {
    let timer;
    if (isGenerating) {
      setGenerationElapsed(0);
      timer = setInterval(() => {
        setGenerationElapsed((sec) => sec + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isGenerating]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem('nexoclip_product_studio_history', JSON.stringify(generatedResults));
      } catch {}
    }
  }, [generatedResults]);

  const formatTimer = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const getStageMessage = (sec) => {
    if (sec < 10) return 'Menganalisis proporsi geometri & tekstur produk...';
    if (sec < 25) return 'Mensimulasikan tata cahaya softbox studio komersial...';
    if (sec < 42) return 'Merender detail pencahayaan & material 2048x2048 Ultra HD...';
    return 'Menyelesaikan sentuhan akhir & kompresi studio shot...';
  };
  const [fullscreenImage, setFullscreenImage] = useState(null);

  // Popover State: 'model' | 'scene' | 'ar' | 'linkModal' | null
  const [activePopover, setActivePopover] = useState(null);
  const dropdownRef = useRef(null);
  const textareaRef = useRef(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!activePopover || activePopover === 'linkModal') return;
    const handler = (e) => {
      if (dropdownRef.current && e?.target instanceof Node && !dropdownRef.current.contains(e.target)) {
        setActivePopover(null);
      }
    };
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [activePopover]);

  // Ekstraksi AI Agent Intelligence menggunakan BytePlus VLM (mendukung multiple image angles)
  const runProductAgentAnalysis = async (imgInput, existingTitle = '', existingUrl = '') => {
    let imagesToSend = [];
    if (Array.isArray(imgInput)) {
      imagesToSend = imgInput.filter(Boolean);
    } else if (imgInput) {
      imagesToSend = [imgInput];
    } else if (productData?.images && productData.images.length > 0) {
      imagesToSend = productData.images;
    } else if (selectedImage) {
      imagesToSend = [selectedImage];
    }

    const targetTitle = existingTitle || productData?.title || '';
    const targetUrl = existingUrl || marketplaceUrl || '';

    if (imagesToSend.length === 0 && !targetTitle && !targetUrl) return;

    setIsAnalyzing(true);
    try {
      const res = await fetch('/api/marketplace/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: imagesToSend[0] || '',
          images: imagesToSend,
          title: targetTitle,
          url: targetUrl,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setAgentInfo(data);
        setEditedTitle(data.name || targetTitle);
        if (data.price) setEditedPrice(data.price);
        if (Array.isArray(data.creative_campaigns) && data.creative_campaigns.length > 0) {
          setCreativeCampaigns(data.creative_campaigns);
        }
        if (data.creative_director_vision) {
          setCreativeDirectorVision(data.creative_director_vision);
        }
        setProductData((prev) => {
          const prevTitle = prev?.title || '';
          const isGeneric = !prevTitle || prevTitle.includes('Clipboard') || prevTitle === 'Foto Produk';
          return {
            ...(prev || {}),
            platform: prev?.platform || 'Shopee / Marketplace',
            title: isGeneric ? (data.name || prevTitle) : prevTitle,
            brand: data.brand || prev?.brand,
            category: data.category || prev?.category,
            price: data.price || prev?.price || null,
            images: prev?.images && prev.images.length > 0 ? prev.images : (imagesToSend.length > 0 ? imagesToSend : []),
          };
        });
      }
    } catch (err) {
      console.warn('Agent analysis warning:', err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Minta Creative Director Agent merancang ide sudut & kampanye baru
  const handleBrainstormConcepts = async (customDirection = '') => {
    setIsBrainstorming(true);
    try {
      const res = await fetch('/api/marketplace/creative-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productTitle: editedTitle || agentInfo?.name || productData?.title || 'Commercial Product',
          visualDetails: agentInfo?.visual_details || '',
          category: agentInfo?.category || '',
          price: editedPrice || agentInfo?.price || '',
          userDirection: customDirection || brainstormInput,
          existingImage: selectedImage,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.campaigns) && data.campaigns.length > 0) {
        setCreativeCampaigns(data.campaigns);
        if (data.creative_director_vision) {
          setCreativeDirectorVision(data.creative_director_vision);
        }
        setBrainstormInput('');
      }
    } catch (err) {
      console.warn('Creative brainstorm error:', err);
    } finally {
      setIsBrainstorming(false);
    }
  };

  // Terapkan Konsep dari Creative Director Agent
  const applyCreativeConcept = (campaign, autoGenerate = false) => {
    if (!campaign) return;
    setSelectedCampaignId(campaign.id);
    setCustomPrompt(campaign.prompt);
    setSelectedSceneId('custom');
    if (campaign.recommended_mode) {
      setReferenceMode(campaign.recommended_mode);
    }
    if (autoGenerate) {
      setTimeout(() => {
        handleGenerate(campaign.prompt);
      }, 50);
    }
  };

  // Terapkan Prompt Rekomendasi dari AI Agent ke Studio
  const applyAgentPrompt = () => {
    if (agentInfo?.suggested_prompt) {
      setCustomPrompt(agentInfo.suggested_prompt);
      setSelectedSceneId('custom');
      setIsAgentDrawerOpen(false);
    }
  };

  // Salin Product Brief ke Clipboard untuk Agent lain
  const copyAgentBrief = () => {
    if (!agentInfo && !productData) return;
    const name = editedTitle || agentInfo?.name || productData?.title || 'Produk E-Commerce';
    const price = editedPrice || agentInfo?.price || productData?.price || '-';
    const brief = `# 🛍️ Product Intelligence Brief for AI Agent
**Nama Produk**: ${name}
**Estimasi Harga**: ${price}
**Merk**: ${agentInfo?.brand || '-'}
**Kategori**: ${agentInfo?.category || '-'}
**Visual & Material Specs**: ${agentInfo?.visual_details || '-'}

### 🌟 Fitur Utama:
${(agentInfo?.features || []).map((f) => `- ${f}`).join('\n') || '-'}

### 💎 Keunggulan Komersial (Selling Points):
${(agentInfo?.selling_points || []).map((s) => `- ${s}`).join('\n') || '-'}

### 📢 Tagline Marketing:
"${agentInfo?.marketing_tagline || ''}"

### 📸 Rekomendasi Prompt Photoshoot Studio (BytePlus SeaDream):
${agentInfo?.suggested_prompt || ''}
`;
    if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(brief).catch(() => {}); }
    setCopiedBrief(true);
    setTimeout(() => setCopiedBrief(false), 2500);
  };

  // Listener Paste Global (Cmd+V / Ctrl+V)
  useEffect(() => {
    const handlePaste = (e) => {
      // 1. Cek file gambar langsung dari clipboard
      const items = e.clipboardData?.items;
      if (items) {
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
              const reader = new FileReader();
              reader.onerror = () => {};
              reader.onload = () => {
                const dataUrl = reader.result;
                setSelectedImage(dataUrl);
                const currentTitle = (productData?.title && !productData.title.includes('Clipboard')) ? productData.title : '';
                setProductData((prev) => ({
                  platform: prev?.platform || 'Shopee / Clipboard',
                  title: currentTitle || 'Foto Produk Marketplace',
                  price: prev?.price || null,
                  images: [dataUrl],
                }));
                setActivePopover(null);
                setExtractError('');
                // Panggil AI Agent untuk menganalisis produk
                runProductAgentAnalysis(dataUrl, currentTitle, marketplaceUrl);
              };
              reader.readAsDataURL(file);
              return;
            }
          }
        }
      }

      // 2. Cek teks tautan gambar atau URL Shopee CDN di clipboard
      const text = e.clipboardData?.getData('text')?.trim();
      if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
        if (text.includes('susercontent.com') || text.includes('tokopedia.net') || text.includes('ibyteimg.com') || /\.(png|jpe?g|webp|gif|avif)/i.test(text)) {
          setMarketplaceUrl(text);
          handleExtract(text);
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [productData, marketplaceUrl]);

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
      if (data.title) {
        setEditedTitle(data.title);
      }
      if (data.price) {
        setEditedPrice(data.price);
      }
      if (data.images && data.images.length > 0) {
        setSelectedImage(data.images[0]);
        setActivePopover(null);
        runProductAgentAnalysis(data.images[0], data.title, urlToUse);
      } else if (data.title) {
        runProductAgentAnalysis('', data.title, urlToUse);
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
    reader.onerror = () => {};
    reader.onload = () => {
      const dataUrl = reader.result;
      setSelectedImage(dataUrl);
      const fileTitle = file.name.replace(/\.[^/.]+$/, '');
      setProductData({
        platform: 'Foto Produk',
        title: fileTitle,
        price: null,
        images: [dataUrl],
      });
      setEditedTitle(fileTitle);
      setActivePopover(null);
      setExtractError('');
      runProductAgentAnalysis(dataUrl, fileTitle, '');
    };
    reader.readAsDataURL(file);
  };

  // Handler generate photoshoot AI via BytePlus
  const handleGenerate = async (overridePrompt = null) => {
    const promptToUse = (typeof overridePrompt === 'string' ? overridePrompt : customPrompt).trim();
    if (!selectedImage && !marketplaceUrl.trim() && !promptToUse) {
      setActivePopover('linkModal');
      return;
    }

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
          productTitle: editedTitle || agentInfo?.name || productData?.title || 'Commercial Product',
          productImage: currentProdImg || 'https://images.unsplash.com/photo-1541643600914-78b084683601?w=800&q=80',
          scenePreset: selectedSceneId,
          customPrompt: promptToUse,
          visualDetails: agentInfo?.visual_details || '',
          aspectRatio,
          model: selectedModel.id,
          referenceMode,
          preserveSilhouette: referenceMode === 'guided',
          count: imageCount,
          watermark: isWatermarkEnabled,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal memproses foto produk');

      const outputs = data.outputs || [];
      const formattedOutputs = outputs.map((out, idx) => ({
        ...out,
        id: out.id || `byteplus-${Date.now()}-${idx}`,
        title: editedTitle || agentInfo?.name || productData?.title || 'Product Photoshoot',
        scene: currentScene.title,
        aspectRatio,
        modelName: selectedModel.name,
      }));

      setGeneratedResults((prev) => [...formattedOutputs, ...prev]);

      if (onGenerationComplete) {
        onGenerationComplete(formattedOutputs);
      }
    } catch (err) {
      const msg = err.message || 'Terjadi kesalahan saat membuat foto produk';
      setGenerateError(msg);
      if (onGenerationError) onGenerationError(msg);
    } finally {
      setIsGenerating(false);
      if (onGenerationEnd) onGenerationEnd();
    }
  };

  // Batch generate semua 5 sudut kampanye dari Creative Director sekaligus
  const handleBatchGenerateAllCampaigns = async () => {
    const campaignsToRun = (creativeCampaigns.length > 0 ? creativeCampaigns : getInitialCampaigns(editedTitle || agentInfo?.name || productData?.title, agentInfo?.visual_details)).slice(0, 5);
    if (!campaignsToRun.length) return;

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
      const tasks = campaignsToRun.map(async (camp) => {
        try {
          const res = await fetch('/api/marketplace/generate', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(workspaceId ? { 'x-workspace-id': workspaceId } : {}),
            },
            body: JSON.stringify({
              productTitle: editedTitle || agentInfo?.name || productData?.title || 'Commercial Product',
              productImage: currentProdImg || 'https://images.unsplash.com/photo-1541643600914-78b084683601?w=800&q=80',
              scenePreset: 'custom',
              customPrompt: camp.prompt,
              visualDetails: agentInfo?.visual_details || '',
              aspectRatio,
              model: selectedModel.id,
              referenceMode: camp.recommended_mode || 'creative_3d',
              preserveSilhouette: false,
              count: 1,
              watermark: isWatermarkEnabled,
            }),
          });
          const data = await res.json();
          return (data.outputs || []).map((out, idx) => ({
            ...out,
            id: out.id || `byteplus-${Date.now()}-${camp.id}-${idx}`,
            title: `${editedTitle || agentInfo?.name || 'Produk'} • ${camp.title}`,
            scene: camp.title,
            aspectRatio,
            modelName: selectedModel.name,
          }));
        } catch {
          return [];
        }
      });

      const batchResults = await Promise.all(tasks);
      const allNewOutputs = batchResults.flat();
      if (allNewOutputs.length > 0) {
        setGeneratedResults((prev) => [...allNewOutputs, ...prev]);
        if (onGenerationComplete) onGenerationComplete(allNewOutputs);
      } else {
        throw new Error('Gagal menghasilkan foto kampanye batch');
      }
    } catch (err) {
      setGenerateError(err.message || 'Gagal memproses batch foto produk');
      if (onGenerationError) onGenerationError(err.message);
    } finally {
      setIsGenerating(false);
      if (onGenerationEnd) onGenerationEnd();
    }
  };


  const isUrlInPrompt = customPrompt.trim().startsWith('http://') || customPrompt.trim().startsWith('https://');

  return (
    <div className="w-full h-full flex flex-col items-center justify-between bg-[#FCEED1] text-[#110C2A] relative overflow-hidden">
      
      {/* ── MAIN CONTENT AREA ── */}
      <div className="flex-1 w-full max-w-7xl mx-auto overflow-y-auto custom-scrollbar pb-48 pt-4 px-4 sm:px-6 flex flex-col items-center justify-center">
        {isGenerating ? (
          <div className="flex flex-col items-center justify-center p-8 bg-white/85 backdrop-blur-2xl rounded-3xl border border-[#A175FF]/30 shadow-2xl max-w-lg w-full text-center animate-fade-in my-auto">
            <div className="relative mb-5">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-[#A175FF] to-[#22d3ee] p-0.5 shadow-xl animate-pulse">
                <div className="w-full h-full bg-[#110C2A] rounded-2xl flex items-center justify-center overflow-hidden">
                  {selectedImage ? (
                    <img src={selectedImage} alt="" className="w-full h-full object-cover opacity-85" />
                  ) : (
                    <span className="text-3xl">✨</span>
                  )}
                </div>
              </div>
              <div className="absolute -bottom-2 -right-2 w-7 h-7 bg-[#22d3ee] rounded-full flex items-center justify-center shadow-md animate-spin">
                <span className="text-[12px] text-black font-bold">⚡</span>
              </div>
            </div>

            <h3 className="text-base font-extrabold text-[#110C2A] mb-1">
              BytePlus SeaDream 5.0 Studio
            </h3>
            <p className="text-xs text-[#110C2A]/70 font-medium mb-4 max-w-sm h-8 flex items-center justify-center">
              {getStageMessage(generationElapsed)}
            </p>

            {/* Progress Bar */}
            <div className="w-full bg-[#110C2A]/10 h-2.5 rounded-full overflow-hidden mb-3 relative">
              <div
                className="bg-gradient-to-r from-[#A175FF] via-purple-500 to-[#22d3ee] h-full rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${Math.min(96, Math.max(8, (generationElapsed / 45) * 100))}%` }}
              ></div>
            </div>

            {/* Timer & Details */}
            <div className="flex items-center justify-between w-full text-[11px] font-semibold text-[#110C2A]/60 px-1">
              <span className="flex items-center gap-1 text-[#6c3df4] font-bold">
                <span>⏱️</span>
                <span>{formatTimer(generationElapsed)}</span>
              </span>
              <span>Perkiraan: ~35-45 detik</span>
              <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-800 font-bold text-[10px]">
                2048x2048 HD
              </span>
            </div>
          </div>
        ) : generatedResults.length > 0 ? (
          <div className="w-full flex flex-col gap-4 animate-fade-in">
            <div className="flex items-center justify-between border-b border-[#110C2A]/10 pb-3">
              <div>
                <h2 className="text-lg font-bold text-[#110C2A]">Galeri Hasil Photoshoot</h2>
                <p className="text-xs text-[#110C2A]/60">Ditenagai oleh BytePlus SeaDream 5.0 Studio</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2.5 py-1 rounded-full bg-[#A175FF]/15 text-[#110C2A] font-semibold">
                  {generatedResults.length} foto dihasilkan
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Bersihkan semua hasil foto di galeri?')) {
                      setGeneratedResults([]);
                      try { localStorage.removeItem('nexoclip_product_studio_history'); } catch {}
                    }
                  }}
                  className="text-xs text-[#110C2A]/50 hover:text-red-500 font-semibold px-2 py-1 rounded-lg hover:bg-black/5 transition-colors"
                  title="Hapus riwayat galeri"
                >
                  Bersihkan
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {generatedResults.map((entry) => (
                <div
                  key={entry.id}
                  className="group relative rounded-2xl overflow-hidden bg-black/5 border border-[#110C2A]/10 shadow-sm hover:shadow-xl transition-all duration-300"
                >
                  <div
                    className="relative aspect-square w-full overflow-hidden bg-neutral-900 cursor-pointer"
                    onClick={() => setFullscreenImage(entry)}
                  >
                    <img
                      src={entry.url}
                      alt={entry.title || "Studio Commercial Shot"}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />

                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-3">
                      <button
                        type="button"
                        title="Salin Tautan"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(entry.url).catch(() => {}); }
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
          <div className="flex flex-col items-center justify-center h-full animate-fade-in-up transition-all duration-700 min-h-[50vh] mt-4">
            
            <div className="flex items-center justify-center gap-1.5 md:gap-3 mb-10 select-none scale-90 sm:scale-100">
              <div className="w-18 h-22 sm:w-24 sm:h-28 rounded-2xl border border-white/20 shadow-2xl -rotate-[12deg] transform hover:rotate-0 hover:scale-110 hover:z-20 transition-all duration-300 overflow-hidden bg-white/[0.01] flex-shrink-0">
                <img
                  src="https://images.unsplash.com/photo-1541643600914-78b084683601?w=300&q=80"
                  alt="Luxury Perfume Photoshoot"
                  className="w-full h-full object-cover"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              </div>

              <div className="w-18 h-22 sm:w-24 sm:h-28 rounded-2xl border border-white/20 shadow-2xl -rotate-[4deg] transform hover:rotate-0 hover:scale-110 hover:z-20 transition-all duration-300 overflow-hidden bg-white/[0.01] -ml-3 sm:-ml-4 flex-shrink-0">
                <img
                  src="https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=300&q=80"
                  alt="Cosmetic Cream Podium"
                  className="w-full h-full object-cover"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              </div>

              <div className="w-18 h-18 sm:w-24 sm:h-24 rounded-full border border-white/20 shadow-2xl rotate-[6deg] transform hover:rotate-0 hover:scale-110 hover:z-20 transition-all duration-300 overflow-hidden bg-white/[0.01] -ml-3 sm:-ml-4 flex-shrink-0">
                <img
                  src="https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=300&q=80"
                  alt="Sneakers Studio Shot"
                  className="w-full h-full object-cover"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              </div>

              <div className="w-18 h-22 sm:w-24 sm:h-28 rounded-2xl border border-white/20 shadow-2xl rotate-[12deg] transform hover:rotate-0 hover:scale-110 hover:z-20 transition-all duration-300 overflow-hidden bg-white/[0.01] -ml-3 sm:-ml-4 flex-shrink-0">
                <img
                  src="https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=300&q=80"
                  alt="Tech Product Studio"
                  className="w-full h-full object-cover"
                  onError={(e) => { e.currentTarget.style.display = "none"; }}
                />
              </div>
            </div>

            <h1 className="text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-4 text-center px-4 flex flex-col items-center">
              <span className="text-[#110C2A]/90 font-black uppercase text-xl sm:text-3xl tracking-wide mb-1 opacity-90">
                START CREATING WITH
              </span>
              <span className="text-[#22d3ee] font-black uppercase text-2xl sm:text-4xl sm:mt-1 tracking-tight">
                BYTEPLUS SEADREAM
              </span>
            </h1>

            <p className="text-[#110C2A]/50 text-xs sm:text-sm font-medium tracking-wide text-center max-w-lg leading-relaxed px-4">
              Paste a marketplace product link or photo — generate commercial studio shots with BytePlus AI
            </p>

            {generateError && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 text-red-700 text-xs rounded-xl max-w-md text-center">
                {generateError}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── FLOATING PROMPT COMPOSER DOCK ── */}
      <PromptComposer positionClassName="absolute bottom-6 sm:bottom-8 left-0 right-0 mx-auto w-full max-w-[95%] xl:max-w-5xl z-30 animate-fade-in-up">
        <div className="flex flex-col gap-3">
          
          {/* Active Extracted Product Chip / Bar */}
          {productData && selectedImage && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between bg-white/80 backdrop-blur-md rounded-2xl p-2 px-3 border border-[#110C2A]/10 animate-fade-in shadow-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="relative w-11 h-11 rounded-xl overflow-hidden border border-[#110C2A]/15 shrink-0 bg-white shadow-xs">
                    <img src={selectedImage} alt="Selected Product" className="w-full h-full object-cover" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] uppercase font-bold text-[#A175FF] tracking-wider">
                        {productData.platform || 'Product'}
                      </span>
                      {agentInfo?.brand && (
                        <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-[#A175FF]/15 text-[#6c3df4]">
                          {agentInfo.brand}
                        </span>
                      )}
                      {agentInfo?.category && (
                        <span className="text-[10px] font-medium px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-900 hidden sm:inline">
                          {agentInfo.category}
                        </span>
                      )}
                      <div className="flex items-center">
                        {isEditingPrice ? (
                          <input
                            type="text"
                            value={editedPrice}
                            onChange={(e) => setEditedPrice(e.target.value)}
                            onBlur={() => setIsEditingPrice(false)}
                            onKeyDown={(e) => e.key === 'Enter' && setIsEditingPrice(false)}
                            autoFocus
                            placeholder="Rp 0"
                            className="text-[11px] font-bold text-emerald-800 bg-white border border-emerald-400 rounded px-1.5 py-0.5 outline-none w-28 shadow-xs"
                          />
                        ) : (
                          <span
                            onClick={() => {
                              setEditedPrice(editedPrice || agentInfo?.price || productData?.price || 'Rp 0');
                              setIsEditingPrice(true);
                            }}
                            className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-800 border border-emerald-500/30 cursor-pointer hover:bg-emerald-500/25 transition-colors flex items-center gap-1 shadow-xs"
                            title="Klik untuk mengubah harga produk"
                          >
                            <span>💰</span>
                            <span>{editedPrice || agentInfo?.price || productData?.price || 'Set Harga'}</span>
                            <span className="text-[9px] text-emerald-700/60">✏️</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Editable Title */}
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {isEditingTitle ? (
                        <input
                          type="text"
                          value={editedTitle}
                          onChange={(e) => setEditedTitle(e.target.value)}
                          onBlur={() => setIsEditingTitle(false)}
                          onKeyDown={(e) => e.key === 'Enter' && setIsEditingTitle(false)}
                          autoFocus
                          className="text-xs font-bold text-[#110C2A] bg-white border border-[#A175FF] rounded px-1.5 py-0.5 outline-none shadow-xs"
                        />
                      ) : (
                        <p
                          onClick={() => {
                            setEditedTitle(editedTitle || agentInfo?.name || productData.title || '');
                            setIsEditingTitle(true);
                          }}
                          className="text-xs font-bold text-[#110C2A] truncate max-w-xs sm:max-w-md cursor-pointer hover:text-[#A175FF] transition-colors flex items-center gap-1"
                          title="Klik untuk mengubah nama produk"
                        >
                          <span>{editedTitle || agentInfo?.name || productData.title}</span>
                          <span className="text-[10px] text-[#110C2A]/40 hover:text-[#A175FF]">✏️</span>
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Status AI Agent Analyzing */}
                  {isAnalyzing && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/10 text-[#6c3df4] text-[11px] font-semibold animate-pulse">
                      <span className="w-2 h-2 rounded-full bg-[#A175FF] animate-ping"></span>
                      <span className="hidden sm:inline">Menganalisis...</span>
                    </div>
                  )}

                  {/* Button Toggle Agent Intelligence Drawer */}
                  <button
                    type="button"
                    onClick={() => setIsAgentDrawerOpen((prev) => !prev)}
                    className={`px-3 py-1.5 text-[11px] font-bold rounded-xl border transition-all flex items-center gap-1.5 shadow-xs ${
                      isAgentDrawerOpen
                        ? 'bg-[#110C2A] text-white border-[#110C2A]'
                        : 'bg-white hover:bg-[#A175FF]/10 text-[#6c3df4] border-[#A175FF]/30'
                    }`}
                  >
                    <span>🤖</span>
                    <span>Info & Prompt Agent</span>
                    {agentInfo && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    )}
                  </button>

                  {/* Quick Apply Agent Prompt */}
                  {agentInfo?.suggested_prompt && (
                    <button
                      type="button"
                      onClick={applyAgentPrompt}
                      className="hidden md:flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-bold text-amber-900 bg-amber-400/20 hover:bg-amber-400/30 rounded-xl border border-amber-500/30 transition-colors shadow-xs"
                      title="Terapkan prompt rekomendasi dari AI Agent"
                    >
                      <span>✨</span>
                      <span>Pakai Prompt AI</span>
                    </button>
                  )}

                  {productData.images && productData.images.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setActivePopover('linkModal')}
                      className="px-2.5 py-1 text-[11px] font-semibold text-[#110C2A]/70 hover:text-[#110C2A] bg-white rounded-lg border border-[#110C2A]/10 shadow-xs transition-colors"
                    >
                      Foto ({productData.images.length})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setProductData(null);
                      setSelectedImage('');
                      setAgentInfo(null);
                      setIsAgentDrawerOpen(false);
                      setEditedTitle('');
                      setEditedPrice('');
                      setCreativeCampaigns([]);
                      setSelectedCampaignId(null);
                      setCreativeDirectorVision('');
                    }}
                    className="w-6 h-6 rounded-full bg-[#110C2A]/10 hover:bg-red-500 hover:text-white text-[#110C2A]/60 flex items-center justify-center text-xs transition-colors"
                    title="Hapus Produk"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* ── CREATIVE DIRECTOR CONCEPTS STRIP ── */}
              {(creativeCampaigns.length > 0 || productData) && (
                <div className="bg-white/95 backdrop-blur-md rounded-2xl p-2.5 px-3 border border-[#A175FF]/30 shadow-sm flex flex-col gap-2 animate-fade-in text-[#110C2A]">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🎨</span>
                      <span className="font-black text-xs text-[#6c3df4] uppercase tracking-wide flex items-center gap-1.5">
                        <span>Creative Director Agent</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#A175FF]/15 text-[#6c3df4] border border-[#A175FF]/30">
                          5 Variasi Sudut 3D
                        </span>
                      </span>
                      <span className="text-[11px] text-[#110C2A]/40 hidden md:inline">•</span>
                      <span className="text-[11px] text-[#110C2A]/75 font-medium hidden lg:inline">
                        Pilih sudut kamera dinamis untuk mengatasi foto statis:
                      </span>
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                      {/* Toggle Mode Sudut Kamera 3D vs Kunci Siluet */}
                      <div className="flex items-center bg-[#110C2A]/5 p-0.5 rounded-xl border border-[#110C2A]/10 text-[10px]">
                        <button
                          type="button"
                          onClick={() => setReferenceMode('creative_3d')}
                          style={referenceMode === 'creative_3d' ? { backgroundColor: '#110C2A', color: '#ffffff' } : { color: '#110C2A' }}
                          className={`px-2.5 py-1 rounded-lg font-extrabold transition-all ${
                            referenceMode === 'creative_3d'
                              ? 'bg-[#110C2A] text-white shadow-xs'
                              : 'text-[#110C2A]/70 hover:text-[#110C2A]'
                          }`}
                          title="Sudut Bebas 3D: AI merender perspektif baru dari berbagai sudut (low-angle, macro, splash) tanpa terkunci siluet foto 2D depan"
                        >
                          🚀 Sudut Bebas 3D
                        </button>
                        <button
                          type="button"
                          onClick={() => setReferenceMode('guided')}
                          style={referenceMode === 'guided' ? { backgroundColor: '#110C2A', color: '#ffffff' } : { color: '#110C2A' }}
                          className={`px-2.5 py-1 rounded-lg font-extrabold transition-all ${
                            referenceMode === 'guided'
                              ? 'bg-[#110C2A] text-white shadow-xs'
                              : 'text-[#110C2A]/70 hover:text-[#110C2A]'
                          }`}
                          title="Kunci Siluet: Pertahankan bentuk dan posisi foto asli 1:1"
                        >
                          🔒 Kunci Siluet
                        </button>
                      </div>

                      {/* Tombol Acak / Regenerate Concepts */}
                      <button
                        type="button"
                        onClick={() => handleBrainstormConcepts()}
                        disabled={isBrainstorming}
                        className="text-[11px] font-bold px-2.5 py-1 rounded-xl bg-purple-50 hover:bg-purple-100 text-[#6c3df4] border border-[#A175FF]/30 transition-all flex items-center gap-1 shadow-xs cursor-pointer active:scale-95"
                        title="Minta Creative Agent merancang ide sudut baru"
                      >
                        <span>🎲</span>
                        <span>{isBrainstorming ? 'Merancang...' : 'Ide Baru'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Horizontal Scrollable Pills of Creative Angles */}
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 custom-scrollbar w-full">
                    {/* VIP Batch Action Card: Generate Semua 5 Sudut (1 Klik) */}
                    <button
                      type="button"
                      onClick={handleBatchGenerateAllCampaigns}
                      disabled={isGenerating}
                      style={{ backgroundColor: '#110C2A', color: '#ffffff', borderColor: '#110C2A' }}
                      className="px-3.5 py-1.5 rounded-xl text-left shrink-0 transition-all border border-[#110C2A] bg-[#110C2A] hover:bg-black text-white shadow-md flex items-center gap-2.5 cursor-pointer active:scale-95 disabled:opacity-50"
                      title="Jalankan pemotretan untuk kelima sudut komersial secara paralel"
                    >
                      <span className="text-base shrink-0">🎬</span>
                      <div className="flex flex-col">
                        <span style={{ color: '#ffffff' }} className="text-xs font-black leading-tight block">
                          Generate 5 Sudut Sekaligus
                        </span>
                        <span style={{ color: '#fcd34d' }} className="text-[10px] font-bold bg-white/10 px-1.5 py-0.2 rounded mt-0.5 inline-block leading-tight">
                          ⚡ Paket Lengkap (1 Klik)
                        </span>
                      </div>
                    </button>
                    {(creativeCampaigns.length > 0 ? creativeCampaigns : getInitialCampaigns(editedTitle || agentInfo?.name || productData?.title, agentInfo?.visual_details)).map((camp) => {
                      const isSelected = selectedCampaignId === camp.id;
                      const icon = camp.id.includes('splash') ? '🌊' : camp.id.includes('low') || camp.id.includes('hero') ? '🚀' : camp.id.includes('macro') ? '🔍' : camp.id.includes('hand') || camp.id.includes('life') ? '🖐️' : '🌌';
                      return (
                        <button
                          key={camp.id}
                          type="button"
                          onClick={() => applyCreativeConcept(camp)}
                          style={isSelected ? { backgroundColor: '#110C2A', color: '#ffffff', borderColor: '#110C2A' } : {}}
                          className={`px-3 py-1.5 rounded-xl text-left shrink-0 transition-all border flex items-center gap-2.5 cursor-pointer ${
                            isSelected
                              ? 'bg-[#110C2A] text-white border-[#110C2A] shadow-md ring-2 ring-[#A175FF]/40 scale-[1.02]'
                              : 'bg-white hover:bg-purple-50/70 text-[#110C2A] border-[#110C2A]/15 hover:border-[#A175FF]/40 shadow-xs'
                          }`}
                        >
                          <span className="text-base shrink-0">{icon}</span>
                          <div className="flex flex-col">
                            <span
                              style={isSelected ? { color: '#ffffff' } : { color: '#110C2A' }}
                              className="text-xs font-bold leading-tight block"
                            >
                              {camp.title}
                            </span>
                            <span
                              style={isSelected ? { color: '#fcd34d' } : { color: '#6c3df4' }}
                              className={`text-[10px] font-bold px-1.5 py-0.2 rounded mt-0.5 inline-block leading-tight ${
                                isSelected ? 'bg-white/10' : 'bg-[#A175FF]/15'
                              }`}
                            >
                              {camp.badge}
                            </span>
                          </div>
                          {isSelected && (
                            <span className="w-2 h-2 rounded-full bg-emerald-400 ml-1 shrink-0"></span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── EXPANDED AI PRODUCT AGENT INTELLIGENCE DRAWER ── */}
              {isAgentDrawerOpen && (
                <div className="bg-white/95 backdrop-blur-xl rounded-2xl p-4 border border-[#A175FF]/25 shadow-xl text-[#110C2A] flex flex-col gap-3 animate-fade-in text-xs max-h-[60vh] overflow-y-auto custom-scrollbar">
                  <div className="flex items-center justify-between pb-2 border-b border-[#110C2A]/10">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🤖</span>
                      <span className="font-extrabold text-sm text-[#110C2A]">
                        AI Product Agent Intelligence
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-500/20">
                        BytePlus VLM Multi-Modal
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsAgentDrawerOpen(false)}
                      className="text-xs font-semibold text-[#110C2A]/50 hover:text-[#110C2A]"
                    >
                      Tutup ✕
                    </button>
                  </div>

                  {agentInfo ? (
                    <div className="flex flex-col gap-3">
                      {/* 🎨 Creative Commercial Director Matrix Hub */}
                      <div className="bg-gradient-to-br from-purple-50/80 via-white to-amber-50/50 p-4 rounded-2xl border border-[#A175FF]/30 flex flex-col gap-3 shadow-sm text-[#110C2A]">
                        <div className="flex items-center justify-between pb-2 border-b border-[#110C2A]/10 flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-base">🎨</span>
                            <span className="font-black text-sm text-[#110C2A]">
                              Creative Commercial Director Matrix
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#A175FF]/15 text-[#6c3df4] border border-[#A175FF]/30">
                              5 Sudut Kamera 3D
                            </span>
                          </div>
                          <span className="text-xs text-[#110C2A]/60">
                            Mengatasi foto statis dengan variasi sudut & aksi sinematik
                          </span>
                        </div>

                        {creativeDirectorVision && (
                          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-xs italic text-amber-950 flex items-start gap-2">
                            <span className="text-sm shrink-0">💡</span>
                            <span>"{creativeDirectorVision}"</span>
                          </div>
                        )}

                        {/* Interactive Custom Brainstorm Bar */}
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            handleBrainstormConcepts(brainstormInput);
                          }}
                          className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-[#110C2A]/15 shadow-inner"
                        >
                          <input
                            type="text"
                            value={brainstormInput}
                            onChange={(e) => setBrainstormInput(e.target.value)}
                            placeholder="Instruksi Creative Director (cth: tema badai salju es, flatlay di ranjang satin, dll)..."
                            className="flex-1 bg-transparent px-2.5 py-1 text-xs text-[#110C2A] placeholder:text-[#110C2A]/40 outline-none"
                          />
                          <button
                            type="submit"
                            disabled={isBrainstorming}
                            style={{ backgroundColor: '#110C2A', color: '#ffffff' }}
                            className="px-3.5 py-1.5 rounded-lg bg-[#110C2A] hover:bg-black text-white font-bold text-xs shrink-0 transition-colors flex items-center gap-1 shadow-xs"
                          >
                            <span>✨</span>
                            <span>{isBrainstorming ? 'Merancang...' : 'Rombak Konsep'}</span>
                          </button>
                        </form>

                        {/* 5 Concept Cards Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {(creativeCampaigns.length > 0 ? creativeCampaigns : getInitialCampaigns(editedTitle || agentInfo?.name || productData?.title, agentInfo?.visual_details)).map((camp) => {
                            const isSelected = selectedCampaignId === camp.id;
                            const icon = camp.id.includes('splash') ? '🌊' : camp.id.includes('low') || camp.id.includes('hero') ? '🚀' : camp.id.includes('macro') ? '🔍' : camp.id.includes('hand') || camp.id.includes('life') ? '🖐️' : '🌌';
                            return (
                              <div
                                key={camp.id}
                                className={`p-3 rounded-xl border flex flex-col justify-between gap-2.5 transition-all text-[#110C2A] ${
                                  isSelected
                                    ? 'bg-purple-50/90 border-[#A175FF] ring-2 ring-[#A175FF]/30 shadow-sm'
                                    : 'bg-white border-[#110C2A]/15 hover:border-[#A175FF]/40 shadow-xs'
                                }`}
                              >
                                <div className="flex flex-col gap-1.5">
                                  <div className="flex items-center justify-between">
                                    <span className="font-black text-xs text-[#110C2A] flex items-center gap-1.5">
                                      <span>{icon}</span>
                                      <span>{camp.title}</span>
                                    </span>
                                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-900 border border-amber-500/30">
                                      {camp.badge}
                                    </span>
                                  </div>
                                  <p className="text-[11px] text-[#110C2A]/80 leading-relaxed font-normal">
                                    {camp.description}
                                  </p>
                                </div>

                                <div className="flex items-center gap-2 pt-2 border-t border-[#110C2A]/10">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      applyCreativeConcept(camp);
                                      setIsAgentDrawerOpen(false);
                                    }}
                                    className="flex-1 py-1.5 px-2.5 rounded-xl bg-white hover:bg-purple-100 text-[#6c3df4] border border-[#A175FF]/30 font-bold text-xs transition-colors flex items-center justify-center gap-1 shadow-xs"
                                  >
                                    <span>{isSelected ? '✓ Terpilih' : 'Gunakan Sudut Ini'}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      applyCreativeConcept(camp, true);
                                      setIsAgentDrawerOpen(false);
                                    }}
                                    style={{ backgroundColor: '#A175FF', color: '#ffffff' }}
                                    className="py-1.5 px-3 rounded-xl bg-[#A175FF] hover:bg-[#8e5af8] text-white font-extrabold text-xs transition-colors flex items-center justify-center gap-1 shadow-xs"
                                    title="Langsung generate sudut ini dengan BytePlus SeaDream"
                                  >
                                    <span>⚡ Generate</span>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      {/* Grid Brand, Kategori & Tagline */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-[#FFF6DE]/70 p-3 rounded-xl border border-[#110C2A]/10">
                        <div>
                          <span className="text-[10px] text-[#110C2A]/60 uppercase font-bold block mb-0.5">
                            🏷️ Brand & Kategori
                          </span>
                          <p className="font-bold text-[#110C2A] truncate">
                            {agentInfo.brand || 'Produk Komersial'} • {agentInfo.category || 'E-Commerce'}
                          </p>
                        </div>
                        <div>
                          <span className="text-[10px] text-emerald-800/80 uppercase font-bold block mb-0.5">
                            💰 Estimasi Harga Pasar
                          </span>
                          <p
                            onClick={() => {
                              setEditedPrice(editedPrice || agentInfo?.price || 'Rp 0');
                              setIsEditingPrice(true);
                            }}
                            className="font-extrabold text-sm text-emerald-800 cursor-pointer hover:underline flex items-center gap-1 truncate"
                            title="Klik untuk mengubah harga"
                          >
                            <span>{editedPrice || agentInfo.price || productData?.price || 'Rp -'}</span>
                            <span className="text-[10px] text-emerald-700/60">✏️</span>
                          </p>
                        </div>
                        {agentInfo.marketing_tagline && (
                          <div>
                            <span className="text-[10px] text-[#110C2A]/60 uppercase font-bold block mb-0.5">
                              📢 Tagline Marketing
                            </span>
                            <p className="font-medium italic text-[#6c3df4]">
                              "{agentInfo.marketing_tagline}"
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Visual & Material Details */}
                      {agentInfo.visual_details && (
                        <div className="bg-purple-50/60 p-2.5 rounded-xl border border-[#A175FF]/20">
                          <span className="text-[10px] text-[#6c3df4] uppercase font-bold block mb-1">
                            🔍 Karakteristik Visual & Material
                          </span>
                          <p className="text-[11px] leading-relaxed text-[#110C2A]/85">
                            {agentInfo.visual_details}
                          </p>
                        </div>
                      )}

                      {/* Fitur & Selling Points */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {agentInfo.features && agentInfo.features.length > 0 && (
                          <div className="bg-white p-2.5 rounded-xl border border-[#110C2A]/10">
                            <span className="text-[10px] text-[#110C2A]/60 uppercase font-bold block mb-1.5">
                              ⚡ Fitur Utama
                            </span>
                            <ul className="space-y-1">
                              {agentInfo.features.map((f, i) => (
                                <li key={i} className="text-[11px] text-[#110C2A]/85 flex items-start gap-1.5">
                                  <span className="text-[#A175FF] font-bold">•</span>
                                  <span>{f}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {agentInfo.selling_points && agentInfo.selling_points.length > 0 && (
                          <div className="bg-white p-2.5 rounded-xl border border-[#110C2A]/10">
                            <span className="text-[10px] text-[#110C2A]/60 uppercase font-bold block mb-1.5">
                              💎 Nilai Jual / Keunggulan (USP)
                            </span>
                            <ul className="space-y-1">
                              {agentInfo.selling_points.map((sp, i) => (
                                <li key={i} className="text-[11px] text-emerald-800 flex items-start gap-1.5 font-medium">
                                  <span className="text-emerald-500 font-bold">✓</span>
                                  <span>{sp}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {/* Prompt Rekomendasi Photoshoot */}
                      {agentInfo.suggested_prompt && (
                        <div className="bg-[#110C2A] text-white p-3 rounded-xl flex flex-col gap-2">
                          <div className="flex items-center justify-between text-[11px] text-white/70">
                            <span className="font-bold flex items-center gap-1.5 text-amber-300">
                              <span>✨</span>
                              <span>Rekomendasi Prompt Studio AI</span>
                            </span>
                            <span className="text-[10px] text-white/50">BytePlus SeaDream 5.0</span>
                          </div>
                          <p className="text-[11px] font-mono leading-relaxed text-white/90 bg-white/5 p-2 rounded-lg border border-white/10 select-all">
                            {agentInfo.suggested_prompt}
                          </p>
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1 border-t border-[#110C2A]/10">
                        <button
                          type="button"
                          onClick={copyAgentBrief}
                          className="px-3.5 py-2 rounded-xl bg-white hover:bg-purple-50 border border-[#A175FF]/30 text-[#6c3df4] font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs"
                        >
                          <span>{copiedBrief ? '✓' : '📋'}</span>
                          <span>{copiedBrief ? 'Brief Tersalin ke Clipboard!' : 'Salin Brief Lengkap untuk Agent'}</span>
                        </button>

                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => runProductAgentAnalysis(selectedImage, editedTitle || productData?.title, marketplaceUrl)}
                            disabled={isAnalyzing}
                            className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-[#110C2A]/70 text-xs font-semibold transition-colors"
                          >
                            {isAnalyzing ? 'Menganalisis...' : '🔄 Analisis Ulang'}
                          </button>
                          {agentInfo.suggested_prompt && (
                            <button
                              type="button"
                              onClick={applyAgentPrompt}
                              style={{ backgroundColor: '#A175FF', color: '#ffffff' }}
                              className="px-4 py-2 rounded-xl bg-[#A175FF] hover:bg-[#8e5af8] text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-1.5"
                            >
                              <span>✨</span>
                              <span style={{ color: '#ffffff' }}>Gunakan Prompt Ini</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-6 flex flex-col items-center justify-center text-center gap-2">
                      <div className="w-8 h-8 rounded-full border-2 border-[#A175FF] border-t-transparent animate-spin"></div>
                      <p className="text-xs font-semibold text-[#110C2A]/70">
                        AI Agent sedang membaca detail visual dan spesifikasi produk Anda...
                      </p>
                    </div>
                  )}
                </div>
              )}
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

                  {/* Multi-URL Input Form */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleExtract();
                    }}
                    className="mt-3 flex flex-col gap-2.5"
                  >
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-[#110C2A] flex items-center gap-1.5">
                          <span>🔗</span>
                          <span>Tempel Link Produk / Link Gambar (Bisa Banyak Sekaligus)</span>
                        </label>
                        <span className="text-[10px] text-[#110C2A]/50">Pisahkan baris baru untuk multiple link</span>
                      </div>
                      <div className="flex gap-2 items-stretch">
                        <textarea
                          rows={2}
                          placeholder="Tempel 1 atau banyak link Shopee, Tokopedia, atau alamat gambar (Copy Image Address)...&#10;Contoh:&#10;https://down-id.img.susercontent.com/file/...&#10;https://shopee.co.id/product/..."
                          value={marketplaceUrl}
                          onChange={(e) => setMarketplaceUrl(e.target.value)}
                          className="flex-1 rounded-xl border border-[#110C2A]/20 bg-white px-3 py-2 text-xs text-[#110C2A] placeholder:text-[#110C2A]/40 focus:outline-none focus:ring-2 focus:ring-[#A175FF] shadow-inner resize-none custom-scrollbar leading-relaxed"
                        />
                        <button
                          type="submit"
                          disabled={isExtracting || !marketplaceUrl.trim()}
                          style={{ backgroundColor: '#A175FF', color: '#ffffff' }}
                          className="px-4 py-2 rounded-xl text-xs font-black shadow-md shadow-[#A175FF]/30 hover:brightness-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0 flex flex-col items-center justify-center gap-1 cursor-pointer"
                        >
                          {isExtracting ? (
                            <>
                              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
                              <span style={{ color: '#ffffff' }} className="text-[11px]">Proses...</span>
                            </>
                          ) : (
                            <>
                              <span className="text-base">🔍</span>
                              <span style={{ color: '#ffffff' }} className="text-[11px] font-bold">Ambil Semua</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-[#110C2A]/50 font-medium">Didukung:</span>
                      {['Multiple Shopee Images', 'Tokopedia', 'TikTok Shop', 'Direct Image URLs'].map((plat) => (
                        <span key={plat} className="text-[10px] px-2 py-0.5 rounded-full bg-white/80 border border-[#110C2A]/10 text-[#110C2A]/70 font-medium">
                          {plat}
                        </span>
                      ))}
                    </div>

                    {/* Clipboard & Multiple File Upload Options */}
                    <div className="mt-1 pt-2.5 border-t border-[#110C2A]/10 flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const clipboardItems = await navigator.clipboard.read();
                            const pastedImages = [];
                            for (const item of clipboardItems) {
                              const imageType = item.types.find((t) => t.startsWith('image/'));
                              if (imageType) {
                                const blob = await item.getType(imageType);
                                const reader = new FileReader();
                                reader.onload = () => {
                                  pastedImages.push(reader.result);
                                  setProductData((prev) => {
                                    const merged = Array.from(new Set([...(prev?.images || []), reader.result]));
                                    return {
                                      platform: prev?.platform || 'Shopee / Clipboard',
                                      title: prev?.title || 'Foto Produk Marketplace',
                                      images: merged,
                                    };
                                  });
                                  setSelectedImage((curr) => curr || reader.result);
                                  runProductAgentAnalysis([reader.result], 'Foto Produk Marketplace', marketplaceUrl);
                                };
                                reader.readAsDataURL(blob);
                              }
                            }
                            const text = await navigator.clipboard.readText();
                            if (text) {
                              setMarketplaceUrl(text);
                              handleExtract(text);
                            }
                          } catch {
                            alert('Silakan tekan tombol keyboard Cmd+V (Mac) atau Ctrl+V (Windows) untuk menempelkan foto.');
                          }
                        }}
                        className="flex-1 py-2 px-3 rounded-xl bg-purple-50 hover:bg-purple-100 border border-[#A175FF]/30 text-[#6c3df4] text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs active:scale-[0.99] cursor-pointer"
                      >
                        <span>📋</span>
                        <span>Tempel Clipboard (Cmd+V)</span>
                      </button>

                      <label className="flex-1 cursor-pointer py-2 px-3 rounded-xl bg-white hover:bg-[#A175FF]/10 border border-[#110C2A]/15 text-[#110C2A] text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs active:scale-[0.99]">
                        <span>📁</span>
                        <span>Unggah Banyak Foto Sekaligus</span>
                        <input
                          type="file"
                          multiple
                          accept="image/*"
                          onChange={handleFileUpload}
                          className="hidden"
                        />
                      </label>
                    </div>

                    <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3 text-[11px] text-amber-900 leading-relaxed">
                      <div className="font-bold flex items-center gap-1.5 mb-1 text-amber-950">
                        <span>💡</span>
                        <span>Tips Khusus Shopee (Sistem Anti-Bot):</span>
                      </div>
                      <p className="text-[10px] text-amber-900/90 leading-normal">
                        Shopee memproteksi halaman web dengan sistem keamanan bot. Cara termudah:
                      </p>
                      <ol className="list-decimal list-inside text-[10px] mt-1 space-y-0.5 text-amber-900/90 font-medium">
                        <li>Buka tab Shopee produk Anda.</li>
                        <li><b>Klik kanan</b> foto produk ➔ pilih <b>"Salin Alamat Gambar"</b> atau <b>"Salin Gambar"</b>.</li>
                        <li>Tekan <b>Cmd+V</b> di sini atau klik tombol <b>"Tempel Gambar"</b> di atas.</li>
                      </ol>
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

                  {/* Thumbnail Selector / Image Pool */}
                  {productData?.images && productData.images.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-[#110C2A]/10 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-black text-[#110C2A] flex items-center gap-1.5">
                          <span>🖼️ Koleksi Foto Produk ({productData.images.length})</span>
                          <span className="text-[10px] font-normal text-[#110C2A]/60">
                            (Klik untuk ganti foto utama)
                          </span>
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setProductData((prev) => ({ ...prev, images: [] }));
                            setSelectedImage('');
                          }}
                          className="text-[10px] text-red-500 hover:underline font-bold cursor-pointer"
                        >
                          Hapus Semua
                        </button>
                      </div>

                      <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-48 overflow-y-auto custom-scrollbar p-1">
                        {productData.images.map((img, i) => {
                          const isCurrent = selectedImage === img;
                          return (
                            <div
                              key={i}
                              onClick={() => {
                                setSelectedImage(img);
                              }}
                              className={`relative group aspect-square rounded-xl overflow-hidden cursor-pointer border-2 transition-all ${
                                isCurrent
                                  ? 'border-[#A175FF] ring-2 ring-[#A175FF]/40 scale-105 shadow-md'
                                  : 'border-transparent hover:border-[#110C2A]/30'
                              }`}
                            >
                              <img src={img} alt="" className="w-full h-full object-cover" />
                              {isCurrent && (
                                <span className="absolute top-1 left-1 bg-[#A175FF] text-white text-[9px] font-bold px-1.5 py-0.2 rounded-md shadow-xs">
                                  Utama ✓
                                </span>
                              )}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveImage(i);
                                }}
                                className="absolute top-1 right-1 w-4 h-4 rounded-full bg-black/70 hover:bg-red-500 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                title="Hapus foto ini"
                              >
                                ×
                              </button>
                            </div>
                          );
                        })}
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
                  ? `Atur gaya photoshoot untuk "${(editedTitle || agentInfo?.name || productData.title)?.substring(0, 30)}..." atau pilih preset di bawah`
                  : "Deskripsikan suasana foto atau tempel link marketplace di sini..."
              }
            />
          </div>

          {/* Bottom Row: Controls + Generate Action */}
          <PromptFooter className="flex flex-wrap items-center justify-between gap-2.5 pt-3 border-t border-[#110C2A]/10 relative w-full">
            <PromptControls ref={dropdownRef} className="flex flex-wrap items-center gap-1.5 sm:gap-2 relative">
              
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
                    compact: true,
                  })}
                >
                  <div className="w-4 h-4 rounded overflow-hidden shrink-0 flex items-center justify-center bg-cyan-500/10 text-cyan-600 font-bold text-[10px]">
                    ✦
                  </div>
                  <span className={PROMPT_CONTROL_LABEL_CLASS}>
                    {selectedModel.name.replace('BytePlus ', '')}
                  </span>
                  <PromptChevronIcon />
                </button>

                {activePopover === 'model' && (
                  <PromptPopover onClick={(e) => e.stopPropagation()} className="w-72">
                    <PromptPopoverHeader>Model Engine</PromptPopoverHeader>
                    <PromptMenuList>
                      {BYTEPLUS_MODELS.map((model) => (
                        <PromptMenuItem
                          key={model.id}
                          selected={selectedModel.id === model.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedModel(model);
                            setActivePopover(null);
                          }}
                          description={model.desc}
                        >
                          <span className="font-semibold text-xs">{model.name}</span>
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
                    compact: true,
                  })}
                >
                  <span className="text-sm shrink-0">{currentScene.icon}</span>
                  <span className={PROMPT_CONTROL_LABEL_CLASS}>
                    {currentScene.title}
                  </span>
                  <PromptChevronIcon />
                </button>

                {activePopover === 'scene' && (
                  <PromptPopover onClick={(e) => e.stopPropagation()} className="w-80 max-h-80 overflow-y-auto custom-scrollbar">
                    <PromptPopoverHeader>Gaya & Suasana Studio</PromptPopoverHeader>
                    <PromptMenuList>
                      {SCENE_OPTIONS.map((scene) => (
                        <PromptMenuItem
                          key={scene.id}
                          selected={selectedSceneId === scene.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedSceneId(scene.id);
                            setActivePopover(null);
                          }}
                          description={scene.desc}
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-base">{scene.icon}</span>
                            <span className="font-semibold text-xs">{scene.title}</span>
                            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#110C2A]/5 text-[#110C2A]/60 font-normal ml-auto">
                              {scene.badge}
                            </span>
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
                    compact: true,
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
                          onClick={(e) => {
                            e.stopPropagation();
                            setAspectRatio(ar.id);
                            setActivePopover(null);
                          }}
                          description={ar.sub}
                        >
                          {ar.label}
                        </PromptMenuItem>
                      ))}
                    </PromptMenuList>
                  </PromptPopover>
                )}
              </div>

              {/* 4. Multi-Image Output Count Pill (1x, 2x, 4x) */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setActivePopover((p) => (p === 'count' ? null : 'count'));
                  }}
                  className={promptControlClassName({
                    active: activePopover === 'count',
                    compact: true,
                  })}
                  title="Pilih jumlah foto yang dihasilkan sekaligus"
                >
                  <span className="text-xs shrink-0">🖼️</span>
                  <span className={PROMPT_CONTROL_LABEL_CLASS}>
                    {imageCount === 1 ? '1 Foto' : `${imageCount} Variasi`}
                  </span>
                  <PromptChevronIcon />
                </button>

                {activePopover === 'count' && (
                  <PromptPopover onClick={(e) => e.stopPropagation()} className="w-64">
                    <PromptPopoverHeader>Jumlah Foto Dihasilkan</PromptPopoverHeader>
                    <PromptMenuList>
                      <PromptMenuItem
                        selected={imageCount === 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          setImageCount(1);
                          setActivePopover(null);
                        }}
                        description="Standar: 1 foto studio tajam"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs">1 Foto</span>
                          <span className="text-[10px] text-gray-500 ml-auto">1x</span>
                        </div>
                      </PromptMenuItem>
                      <PromptMenuItem
                        selected={imageCount === 2}
                        onClick={(e) => {
                          e.stopPropagation();
                          setImageCount(2);
                          setActivePopover(null);
                        }}
                        description="2 variasi sudut & pencahayaan berbeda"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs">2 Variasi</span>
                          <span className="text-[10px] font-bold text-[#A175FF] ml-auto">2x</span>
                        </div>
                      </PromptMenuItem>
                      <PromptMenuItem
                        selected={imageCount === 4}
                        onClick={(e) => {
                          e.stopPropagation();
                          setImageCount(4);
                          setActivePopover(null);
                        }}
                        description="4 batch photoshoot komersial lengkap"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs">4 Variasi</span>
                          <span className="text-[10px] font-bold text-emerald-600 ml-auto">4x Rekomendasi</span>
                        </div>
                      </PromptMenuItem>
                    </PromptMenuList>
                  </PromptPopover>
                )}
              </div>

              {/* 5. Watermark Toggle Pill (Compact) */}
              <button
                type="button"
                onClick={() => setIsWatermarkEnabled((prev) => !prev)}
                className={`h-[38px] flex items-center gap-1.5 px-2.5 rounded-md transition-all border text-xs font-bold whitespace-nowrap shadow-inner cursor-pointer ${
                  !isWatermarkEnabled
                    ? 'bg-emerald-500/10 text-emerald-800 border-emerald-500/30 hover:bg-emerald-500/20'
                    : 'bg-black/5 text-[#110C2A]/60 border-[#110C2A]/15 hover:bg-black/10'
                }`}
                title={!isWatermarkEnabled ? 'Watermark AI Generated dinonaktifkan (Hasil bersih profesional)' : 'Watermark AI Generated diaktifkan'}
              >
                <span>{!isWatermarkEnabled ? '✨' : '🏷️'}</span>
                <span>{!isWatermarkEnabled ? 'No Watermark' : 'Watermark: ON'}</span>
              </button>

            </PromptControls>

            {/* Right: Generate Action Button - Sleek & compact matching ImageStudio */}
            <PromptAction
              onClick={handleGenerate}
              disabled={isGenerating}
              className="h-[38px] !py-0 px-5 sm:px-6 font-bold text-xs sm:text-sm whitespace-nowrap shrink-0 ml-auto rounded-full bg-[#A175FF] hover:bg-[#9467f4] text-[#110C2A] flex items-center justify-center gap-1.5 shadow-md shadow-[#A175FF]/25 border border-[#A175FF]/20 cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-[#110C2A]/40 border-t-[#110C2A] rounded-full animate-spin"></span>
                  <span className="whitespace-nowrap">Generating ({formatTimer(generationElapsed)})...</span>
                </>
              ) : (
                <span className="whitespace-nowrap">Generate · 2.5 credits ✦</span>
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
                    if (navigator.clipboard?.writeText) { navigator.clipboard.writeText(fullscreenImage.url).catch(() => {}); }
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
