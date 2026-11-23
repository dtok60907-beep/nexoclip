"use client";
import { confirmDialog } from "./confirmDialog.jsx";

import { useState, useEffect, useRef, useCallback } from "react";
import toast, { Toaster } from "react-hot-toast";
import { generateSaasVideo, uploadFile } from "../generationClient.js";
import { formatErrorMessage } from "../utils/formatError.js";
import { scopedPersistKey, migrateLegacyPersistKey } from "../persistKey.js";
import DrawModal from "./DrawModal.jsx";
import MobileGenerationActions, {
  GenerationCopyButtons,
} from "./MobileGenerationActions.jsx";
import {
  t2vModels,
  i2vModels,
  v2vModels,
  openRouterT2VModels,
  openRouterI2VModels,
  openRouterV2VModels,
  getAspectRatiosForVideoModel,
  getDurationsForModel,
  getResolutionsForVideoModel,
  getAspectRatiosForI2VModel,
  getDurationsForI2VModel,
  getResolutionsForI2VModel,
  getEffectsForI2VModel,
  getDefaultEffectForI2VModel,
  getModesForModel,
  getMaxImagesForI2VModel,
  OPENROUTER_VIDEO_MODEL_MAP,
  OPENROUTER_V2V_MODEL_MAP,
} from "../models.js";
import { formatCredits, useGenerationPrice } from "../lib/useGenerationPrice.js";
import { mergeHistory, useServerHistory } from "../lib/serverHistory.js";
import {
  PROMPT_CONTROL_LABEL_CLASS,
  PROMPT_MEDIA_PREVIEW_CLASS,
  PromptAspectRatioIcon,
  PromptAction,
  PromptChevronIcon,
  PromptComposer,
  PromptControls,
  PromptFooter,
  PromptMenuItem,
  PromptMenuList,
  PromptPopover,
  PromptPopoverHeader,
  PromptDurationIcon,
  PromptQualityIcon,
  PromptTextarea,
  promptControlClassName,
  promptMediaButtonClassName,
} from "./prompt/PromptComposer.jsx";

// ── tiny helpers ──────────────────────────────────────────────────────────────

function getQualitiesForModel(modelList, modelId) {
  const model = modelList.find((m) => m.id === modelId);
  return model?.inputs?.quality?.enum || [];
}

async function downloadFile(url, filename) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, "_blank");
  }
}

// ── SVG icons (kept inline to avoid extra deps) ───────────────────────────────

const CheckSvg = () => (
  <svg
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#5b45f2"
    strokeWidth="3"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const VideoIconSvg = ({ className }) => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    className={className}
  >
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
  </svg>
);

const VideoReadySvg = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    className="text-[#5b45f2]"
  >
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    <polyline points="7 10 10 13 15 8" stroke="#5b45f2" strokeWidth="2.5" />
  </svg>
);

// ── Dropdown components ───────────────────────────────────────────────────────

const PROVIDER_LOGOS = {
  openai: "https://cdn.muapi.ai/models/openai.png",
  google: "https://cdn.muapi.ai/models/gemini.png",
  kling: "https://cdn.muapi.ai/models/kling.png",
  alibaba: "https://cdn.muapi.ai/models/alibaba.png",
  berry: "https://cdn.muapi.ai/models/berry.png",
  qwen: "https://cdn.muapi.ai/models/qwen.png",
  zai: "https://cdn.muapi.ai/models/zai.png",
  bytedance: "https://cdn.muapi.ai/models/bytedance.png",
  blackforest: "https://cdn.muapi.ai/models/bfl.png",
  minimax: "https://cdn.muapi.ai/models/minimax.png",
  suno: "https://cdn.muapi.ai/models/suno.png",
  anthropic: "https://cdn.muapi.ai/models/claude.png",
  meshy: "https://cdn.muapi.ai/models/meshy-3.png",
  tripo3d: "https://cdn.muapi.ai/models/tripo3d.png",
  grok: "https://cdn.muapi.ai/models/xai.png",
  muapi: "https://cdn.muapi.ai/models/muapi.png",
  midjourney: "https://cdn.muapi.ai/models/midjourney.png",
  vidu: "https://cdn.muapi.ai/models/vidu.png",
  runway: "https://cdn.muapi.ai/models/runway.png",
  luma: "https://cdn.muapi.ai/models/luma.png",
  ideogram: "https://cdn.muapi.ai/models/ideogram.png",
  leonardoai: "https://cdn.muapi.ai/models/leonardoai.png",
  hunyuan: "https://cdn.muapi.ai/models/hunyuan.png",
  hidream: "https://cdn.muapi.ai/models/hidream.png",
  lightricks: "https://cdn.muapi.ai/models/lightricks.png",
  pixverse: "https://cdn.muapi.ai/models/pixverse.png",
  reve: "https://cdn.muapi.ai/models/reve.png",
  stability: "https://cdn.muapi.ai/models/stability.png"
};

const invertLogos = ['openai', 'blackforest', 'runway', 'ideogram', 'lightricks', 'grok'];

function ModelDropdown({ selectedModel, onSelect, onClose }) {
  const [search, setSearch] = useState("");
  const modelCategories = [
    {
      id: "all",
      label: "All",
      entries: [
        ...openRouterT2VModels.map((model) => ({ model, category: "t2v" })),
        ...openRouterI2VModels.map((model) => ({ model, category: "i2v" })),
        ...openRouterV2VModels.map((model) => ({ model, category: "v2v" })),
      ],
    },
    {
      id: "t2v",
      label: "Text to Video",
      entries: openRouterT2VModels.map((model) => ({ model, category: "t2v" })),
    },
    {
      id: "i2v",
      label: "Image to Video",
      entries: openRouterI2VModels.map((model) => ({ model, category: "i2v" })),
    },
    {
      id: "v2v",
      label: "Video Tools",
      entries: openRouterV2VModels.map((model) => ({ model, category: "v2v" })),
    },
  ];
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedProvider, setSelectedProvider] = useState("all");
  const activeCategory = modelCategories.find((category) => category.id === selectedCategory) || modelCategories[0];
  const modelEntries = activeCategory.entries;

  const activeItemRef = useRef(null);

  useEffect(() => {
    // Automatically scroll the active model into view when opening
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ block: "nearest" });
    }
  }, []);

  const getProviderStyle = (provider) => {
    switch (provider) {
      case "grok":
        return { text: "xI", bg: "bg-orange-500/10 text-orange-400 border-orange-500/25" };
      case "openai":
        return { text: "O", bg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/25" };
      case "google":
        return { text: "G", bg: "bg-blue-500/10 text-blue-400 border-blue-500/25" };
      case "blackforest":
        return { text: "BF", bg: "bg-amber-500/10 text-amber-400 border-amber-500/25" };
      case "bytedance":
        return { text: "BD", bg: "bg-purple-500/10 text-purple-400 border-purple-500/25" };
      case "midjourney":
        return { text: "MJ", bg: "bg-indigo-500/10 text-indigo-400 border-indigo-500/25" };
      case "kling":
        return { text: "KL", bg: "bg-rose-500/10 text-rose-400 border-rose-500/25" };
      case "vidu":
        return { text: "VD", bg: "bg-cyan-500/10 text-cyan-400 border-cyan-500/25" };
      case "minimax":
        return { text: "MX", bg: "bg-pink-500/10 text-pink-400 border-pink-500/25" };
      case "ideogram":
        return { text: "ID", bg: "bg-yellow-500/10 text-yellow-400 border-yellow-500/25" };
      case "luma":
        return { text: "LM", bg: "bg-teal-500/10 text-teal-400 border-teal-500/25" };
      case "alibaba":
        return { text: "AL", bg: "bg-sky-500/10 text-sky-400 border-sky-500/25" };
      case "wan":
        return { text: "W", bg: "bg-sky-500/10 text-sky-400 border-sky-500/25" };
      case "berry":
        return { text: "B", bg: "bg-pink-500/10 text-pink-400 border-pink-500/25" };
      case "qwen":
        return { text: "Q", bg: "bg-violet-500/10 text-violet-400 border-violet-500/25" };
      case "zai":
        return { text: "Z", bg: "bg-cyan-500/10 text-cyan-400 border-cyan-500/25" };
      case "leonardoai":
        return { text: "LE", bg: "bg-violet-500/10 text-violet-400 border-violet-500/25" };
      case "stability":
        return { text: "SD", bg: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/25" };
      default:
        const name = provider ? provider.toUpperCase() : "AI";
        return { text: name.substring(0, 2), bg: "bg-primary/10 text-primary border-primary/25" };
    }
  };

  // Dynamically compute list of providers from the input models lists
  const availableProviders = [];
  const seenProviders = new Set();
  
  modelEntries.forEach(({ model: m }) => {
    const pId = m.provider || 'muapi';
    const pName = m.provider_name || 'Muapi';
    if (!seenProviders.has(pId)) {
      seenProviders.add(pId);
      availableProviders.push({ id: pId, name: pName });
    }
  });

  const lf = search.toLowerCase();

  const filterFn = ({ model: m }) => {
    // 1. Filter by provider tab
    if (selectedProvider !== "all") {
      const pId = m.provider || 'muapi';
      if (pId !== selectedProvider) return false;
    }
    // 2. Filter by search query
    return (
      m.name.toLowerCase().includes(lf) ||
      m.id.toLowerCase().includes(lf)
    );
  };

  const filteredMain = modelEntries.filter(filterFn).filter(({ category }) => category !== "v2v");
  const filteredV2V = modelEntries.filter(filterFn).filter(({ category }) => category === "v2v");

  const getIconColor = (m, isV2V) => {
    if (isV2V) return "bg-orange-500/10 text-orange-400 border-orange-500/10";
    if (m.id.includes("kling")) return "bg-blue-500/10 text-blue-400 border-blue-500/10";
    if (m.id.includes("veo")) return "bg-purple-500/10 text-purple-400 border-purple-500/10";
    if (m.id.includes("sora")) return "bg-rose-500/10 text-rose-400 border-rose-500/10";
    return "bg-primary/10 text-primary border-primary/10";
  };

  const renderItem = ({ model: m, category }) => {
    const isV2V = category === "v2v";
    const durations = isV2V ? [] : category === "i2v" ? getDurationsForI2VModel(m.id) : getDurationsForModel(m.id);
    const maxDuration = durations.length ? Math.max(...durations) : null;
    const isActive = selectedModel === m.id;
    return (
    <div
      key={`${category}:${m.id}`}
      ref={isActive ? activeItemRef : null}
      className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all border ${isActive ? "bg-[#f2f0ff] border-[#ddd7fe]" : "border-transparent hover:bg-[#f6f6fa]"}`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(m, category);
        onClose();
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {PROVIDER_LOGOS[m.provider] ? (
          <div className="w-8 h-8 rounded-xl border border-[#e6e7f0] overflow-hidden shrink-0 flex items-center justify-center bg-white">
            <img
              src={PROVIDER_LOGOS[m.provider]}
              alt={m.provider_name}
              className="w-full h-full object-contain p-1"
            />
          </div>
        ) : (
          <div
            className="w-8 h-8 bg-[#f2f0ff] text-[#4c38d6] border border-[#ddd7fe] rounded-xl flex items-center justify-center font-bold text-xs uppercase shrink-0"
          >
            {m.name.charAt(0)}
          </div>
        )}
        <div className="flex flex-col gap-0.5 min-w-0">
          <span className={`text-[12.5px] font-semibold tracking-tight truncate ${isActive ? "text-[#4c38d6]" : "text-[#14141f]"}`}>
            {m.name}
          </span>
          {isV2V ? (
            <span className="text-[10.5px] text-[#a05c07] truncate">
              {m.imageOptional ? "Reference video · optional image" : m.imageField ? "Upload a video and image" : "Upload a video to use"}
            </span>
          ) : (
            selectedProvider === "all" && m.provider_name && (
              <span className="text-[10.5px] text-[#7a7b90] truncate">
                {m.provider_name}
              </span>
            )
          )}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {maxDuration && <span className="rounded-full bg-[#f2f0ff] border border-[#ddd7fe] px-2 py-0.5 text-[10.5px] font-semibold text-[#4c38d6]">Up to {maxDuration}s</span>}
        {isActive && <CheckSvg />}
      </div>
    </div>
    );
  };

  return (
    <div className="flex gap-3.5 h-full max-h-[68vh] min-h-[340px]">
      {/* Left Sidebar: Provider tabs */}
      <div className="flex flex-col gap-2 items-center pr-2.5 border-r border-[#efeff5] shrink-0 select-none overflow-y-auto custom-scrollbar w-12 pt-0.5">
        <button
          type="button"
          onClick={() => setSelectedProvider("all")}
          className={`w-8 h-8 rounded-full flex items-center justify-center border transition-all flex-shrink-0 cursor-pointer ${
            selectedProvider === "all"
              ? "bg-[#f2f0ff] text-[#5b45f2] border-[#c8bffb] shadow-xs scale-105"
              : "bg-[#f6f6fa] text-[#7a7b90] border-[#e6e7f0] hover:bg-[#efeff6] hover:text-[#14141f]"
          }`}
          title="All Providers"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill={selectedProvider === "all" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
        
        {availableProviders.map(p => {
          const style = getProviderStyle(p.id);
          const isSelected = selectedProvider === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedProvider(p.id)}
              className={`w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center font-bold text-[10px] border transition-all cursor-pointer overflow-hidden ${
                isSelected
                  ? "bg-[#f2f0ff] border-[#5b45f2] ring-2 ring-[#5b45f2]/20 scale-105"
                  : "bg-white text-[#5e5e72] border-[#e6e7f0] hover:border-[#c8bffb]"
              }`}
              title={p.name}
            >
              {PROVIDER_LOGOS[p.id] ? (
                <img
                  src={PROVIDER_LOGOS[p.id]}
                  alt={p.name}
                  className="w-full h-full rounded-full object-contain p-1"
                />
              ) : (
                style.text
              )}
            </button>
          );
        })}
      </div>

      {/* Right Pane: Search + Lists */}
      <div className="flex-1 flex flex-col gap-2 min-w-0">
        <div className="pb-2.5 border-b border-[#efeff5] shrink-0 space-y-2">
          <div className="flex gap-1.5 overflow-x-auto custom-scrollbar pb-0.5">
            {modelCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => {
                  setSelectedCategory(category.id);
                  setSelectedProvider("all");
                }}
                className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors border ${
                  selectedCategory === category.id
                    ? "bg-[#f2f0ff] text-[#4c38d6] border-[#c8bffb]"
                    : "bg-[#f6f6fa] text-[#5e5e72] border-[#e6e7f0] hover:bg-[#efeff6] hover:text-[#14141f]"
                }`}
              >
                {category.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2.5 bg-[#f6f6fa] rounded-xl px-3 py-2 border border-[#e6e7f0] focus-within:border-[#5b45f2] focus-within:bg-white transition-colors">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              className="text-[#7a7b90]"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Search models..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="bg-transparent border-none text-[12.5px] text-[#14141f] placeholder:text-[#8a8b9e] focus:ring-0 w-full p-0 outline-none"
            />
          </div>
        </div>
        
        <div className="text-[11.5px] font-semibold text-[#5e5e72] px-1 py-0.5 shrink-0 flex items-center justify-between">
          <span>{activeCategory.label} models</span>
          {selectedProvider !== "all" && (
            <span className="text-[10.5px] bg-[#f2f0ff] text-[#4c38d6] px-2 py-0.5 rounded-md font-medium">
              {availableProviders.find(p => p.id === selectedProvider)?.name || selectedProvider}
            </span>
          )}
        </div>
        
        <div className="flex flex-col gap-1 overflow-y-auto custom-scrollbar pr-1 pb-2 flex-1">
          {filteredMain.length === 0 && filteredV2V.length === 0 ? (
            <div className="text-[12.5px] text-[#7a7b90] text-center py-6">
              No models found
            </div>
          ) : (
            <>
              {filteredMain.map((entry) => renderItem(entry))}
              {filteredV2V.length > 0 && (
                <>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[#a05c07] px-2.5 py-2 mt-1 border-t border-[#efeff5]">
                    Video Tools
                  </div>
                  {filteredV2V.map((entry) => renderItem(entry))}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Control button ────────────────────────────────────────────────────────────

// ── Dropdown panel ─────────────────────────────────────────────────────────────
// Rendered inside a `relative` wrapper div; floats above the anchor button.

// ── Main component ────────────────────────────────────────────────────────────

export default function VideoStudio({
  studioWork, restoredWork, projectWorkspace,
  homeSelection,
  initialPrompt = '',
  apiKey,
  beforeGenerate,
  persistScope,
  onGenerationStart,
  onGenerationEnd,
  onGenerationComplete,
  onGenerationError,
  onPublish,
  historyItems,
  droppedFiles,
  onFilesHandled,
}) {
  const LEGACY_PERSIST_KEY = "hg_video_studio_persistent";
  const PERSIST_KEY = scopedPersistKey(LEGACY_PERSIST_KEY, persistScope || apiKey);
  useEffect(() => {
    if (!persistScope) migrateLegacyPersistKey(LEGACY_PERSIST_KEY, PERSIST_KEY);
  }, [PERSIST_KEY]);

  // ── mode state ──
  const [imageMode, setImageMode] = useState(false); // i2v
  const [v2vMode, setV2vMode] = useState(false);

  // ── model / params ──
  const defaultModel = openRouterT2VModels[0];
  const [selectedModel, setSelectedModel] = useState(defaultModel.id);
  const [selectedModelName, setSelectedModelName] = useState(defaultModel.name);
  const [selectedAr, setSelectedAr] = useState(
    defaultModel.inputs?.aspect_ratio?.default || "16:9",
  );
  const [selectedDuration, setSelectedDuration] = useState(
    defaultModel.inputs?.duration?.default || 5,
  );
  const [selectedResolution, setSelectedResolution] = useState(
    defaultModel.inputs?.resolution?.default || "",
  );
  const [selectedQuality, setSelectedQuality] = useState(
    defaultModel.inputs?.quality?.default || "",
  );
  const [selectedMode, setSelectedMode] = useState("");
  const [selectedEffect, setSelectedEffect] = useState("");

  // ── upload progress ──
  const [imageProgress, setImageProgress] = useState(0);
  const [videoProgress, setVideoProgress] = useState(0);

  // ── control visibility ──
  const [showAr, setShowAr] = useState(true);
  const [showDuration, setShowDuration] = useState(true);
  const [showResolution, setShowResolution] = useState(() => getResolutionsForVideoModel(defaultModel.id).length > 0);
  const [showQuality, setShowQuality] = useState(false);
  const [showMode, setShowMode] = useState(false);
  const [showEffect, setShowEffect] = useState(false);

  // ── uploads ──
  const [uploadedImageUrl, setUploadedImageUrl] = useState(null);
  const [uploadedImageUrls, setUploadedImageUrls] = useState([]);
  const [imageUploading, setImageUploading] = useState(false);
  const [uploadedEndImageUrl, setUploadedEndImageUrl] = useState(null);
  const [endImageUploading, setEndImageUploading] = useState(false);
  const [endImageProgress, setEndImageProgress] = useState(0);
  const [uploadedVideoUrl, setUploadedVideoUrl] = useState(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [uploadedVideoName, setUploadedVideoName] = useState(null);

  // ── generation / canvas ──
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [fullscreenUrl, setFullscreenUrl] = useState(null);
  const [canvasUrl, setCanvasUrl] = useState(null);
  const [canvasModel, setCanvasModel] = useState(null);
  const [showCanvas, setShowCanvas] = useState(false);
  const [isDrawModalOpen, setIsDrawModalOpen] = useState(false);
  const [lastGenerationId, setLastGenerationId] = useState(null);
  const [lastGenerationModel, setLastGenerationModel] = useState(null);


  // ── history ──
  const [localHistory, setLocalHistory] = useState([]);
  const [activeHistoryIdx, setActiveHistoryIdx] = useState(0);
  // Signed-in accounts read their history from the server; deleting hides an entry here.
  const [hiddenHistoryIds, setHiddenHistoryIds] = useState([]);
  const serverHistory = useServerHistory("video", { enabled: !persistScope });

  // ── dropdown ──
  const [openDropdown, setOpenDropdown] = useState(null); // 'model'|'ar'|'duration'|'resolution'|'quality'|'mode'|null

  // ── prompt ──
  const [prompt, setPrompt] = useState(initialPrompt);
  const [promptDisabled, setPromptDisabled] = useState(false);
  useEffect(() => {
    if (initialPrompt) setPrompt(initialPrompt);
  }, [initialPrompt]);

  // Mirrors what Generate submits, priced exactly like the server reservation.
  const pricedResolutions = imageMode ? getResolutionsForI2VModel(selectedModel) : getResolutionsForVideoModel(selectedModel);
  const pricedImageCount = imageMode
    ? Math.max(uploadedImageUrls.length, uploadedImageUrl ? 1 : 0) + (uploadedEndImageUrl ? 1 : 0)
    : 0;
  const videoCredits = useGenerationPrice({
    kind: "video",
    model: OPENROUTER_VIDEO_MODEL_MAP[selectedModel] || OPENROUTER_V2V_MODEL_MAP[selectedModel] || selectedModel,
    parameters: {
      resolution: pricedResolutions.length > 0 ? selectedResolution : /-480p$/.test(selectedModel) ? "480p" : undefined,
      duration: v2vMode ? undefined : selectedDuration,
      referenceImages: pricedImageCount,
      referenceVideos: v2vMode && uploadedVideoUrl ? 1 : 0,
    },
  });

  // ── refs ──
  const containerRef = useRef(null);
  const textareaRef = useRef(null);
  const dropdownRef = useRef(null);
  const imageFileInputRef = useRef(null);
  const endImageFileInputRef = useRef(null);
  const videoFileInputRef = useRef(null);
  const resultVideoRef = useRef(null);
  const hasRestored = useRef(false);

  // ── derived data ──
  const history = historyItems ?? mergeHistory(serverHistory.entries, localHistory, hiddenHistoryIds);
  const removeHistoryEntry = (entry) => {
    const key = entry.id || entry.url;
    setLocalHistory((prev) => prev.filter((e) => (e.id || e.url) !== key));
    setHiddenHistoryIds((prev) => [...new Set([...prev, key])].slice(-500));
  };

  const getCurrentModels = useCallback(() => {
    if (v2vMode) return v2vModels;
    return imageMode ? i2vModels : t2vModels;
  }, [imageMode, v2vMode]);

  const getCurrentAspectRatios = useCallback(
    (id) =>
      imageMode
        ? getAspectRatiosForI2VModel(id)
        : getAspectRatiosForVideoModel(id),
    [imageMode],
  );

  const getCurrentDurations = useCallback(
    (id) =>
      imageMode ? getDurationsForI2VModel(id) : getDurationsForModel(id),
    [imageMode],
  );

  const getCurrentResolutions = useCallback(
    (id) =>
      imageMode
        ? getResolutionsForI2VModel(id)
        : getResolutionsForVideoModel(id),
    [imageMode],
  );

  const getCurrentModel = useCallback(
    () => getCurrentModels().find((m) => m.id === selectedModel),
    [getCurrentModels, selectedModel],
  );

  const isMotionControlSelection = useCallback(
    (modelId, isV2v) => {
      if (!isV2v) return false;
      const m = v2vModels.find((x) => x.id === modelId);
      return !!m?.imageField;
    },
    [],
  );

  // ── update controls when model/mode changes ──────────────────────────────
  const applyControlsForModel = useCallback(
    (modelId, isImageMode, isV2vMode) => {
      if (isV2vMode && !modelId.startsWith('w3.0')) {
        setShowAr(false);
        setShowDuration(false);
        setShowResolution(false);
        setShowQuality(false);
        setShowMode(false);
        setShowEffect(false);
        return;
      }

      const modelList = isImageMode ? i2vModels : t2vModels;
      const model = modelList.find((m) => m.id === modelId);

      const ars = isImageMode
        ? getAspectRatiosForI2VModel(modelId)
        : getAspectRatiosForVideoModel(modelId);
      if (ars.length > 0) {
        setSelectedAr(ars[0]);
        setShowAr(true);
      } else {
        setShowAr(false);
      }

      const durations = isImageMode
        ? getDurationsForI2VModel(modelId)
        : getDurationsForModel(modelId);
      if (durations.length > 0) {
        setSelectedDuration(durations[0]);
        setShowDuration(true);
      } else {
        setShowDuration(false);
      }

      const resolutions = isImageMode
        ? getResolutionsForI2VModel(modelId)
        : getResolutionsForVideoModel(modelId);
      if (resolutions.length > 0) {
        // The model's own default (720p for Seedance), not the cheapest option listed first.
        const preferred = model?.inputs?.resolution?.default;
        setSelectedResolution(resolutions.includes(preferred) ? preferred : resolutions[0]);
        setShowResolution(true);
      } else {
        setShowResolution(false);
      }

      const qualities = getQualitiesForModel(modelList, modelId);
      if (qualities.length > 0) {
        setSelectedQuality(model?.inputs?.quality?.default || qualities[0]);
        setShowQuality(true);
      } else {
        setSelectedQuality("");
        setShowQuality(false);
      }

      const modes = getModesForModel(modelId);
      if (modes.length > 0) {
        setSelectedMode(model?.inputs?.mode?.default || modes[0]);
        setShowMode(true);
      } else {
        setSelectedMode("");
        setShowMode(false);
      }

      const effects = isImageMode ? getEffectsForI2VModel(modelId) : [];
      if (effects.length > 0) {
        setSelectedEffect(getDefaultEffectForI2VModel(modelId) || effects[0]);
        setShowEffect(true);
      } else {
        setSelectedEffect("");
        setShowEffect(false);
      }
    },
    [],
  );

  // ── Persistence: Load ────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PERSIST_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.imageMode !== undefined) setImageMode(data.imageMode);
        if (data.v2vMode !== undefined) setV2vMode(data.v2vMode);
        if (data.selectedModel) setSelectedModel(data.selectedModel);
        if (data.selectedModelName) setSelectedModelName(data.selectedModelName);
        if (data.selectedAr) setSelectedAr(data.selectedAr);
        if (data.selectedDuration) setSelectedDuration(data.selectedDuration);
        if (data.selectedResolution) setSelectedResolution(data.selectedResolution);
        if (data.selectedQuality) setSelectedQuality(data.selectedQuality);
        if (data.selectedMode) setSelectedMode(data.selectedMode);
        if (data.selectedEffect) setSelectedEffect(data.selectedEffect);
        if (data.uploadedImageUrl) setUploadedImageUrl(data.uploadedImageUrl);
        if (data.uploadedImageUrls) {
          setUploadedImageUrls(data.uploadedImageUrls);
        } else if (data.uploadedImageUrl) {
          setUploadedImageUrls([data.uploadedImageUrl]);
        }
        if (data.uploadedVideoUrl) setUploadedVideoUrl(data.uploadedVideoUrl);
        if (data.uploadedVideoName) setUploadedVideoName(data.uploadedVideoName);
        if (data.prompt) setPrompt(data.prompt);
        if (data.localHistory) setLocalHistory(data.localHistory);
        if (Array.isArray(data.hiddenHistoryIds)) setHiddenHistoryIds(data.hiddenHistoryIds);

        // Update control visibility based on restored model/mode
        applyControlsForModel(
          data.selectedModel || defaultModel.id,
          !!data.imageMode,
          !!data.v2vMode
        );
      }
    } catch (err) {
      console.warn("Failed to load VideoStudio persistence:", err);
    } finally {
      hasRestored.current = true;
    }
  }, [applyControlsForModel, defaultModel.id]);

  // ── Persistence: Save ────────────────────────────────────────────────────
  // Kept in a ref so the unmount-flush effect below always sees the latest
  // values, even though it only re-subscribes once (empty deps).
  const persistStateRef = useRef();
  persistStateRef.current = {
    imageMode,
    v2vMode,
    selectedModel,
    selectedModelName,
    selectedAr,
    selectedDuration,
    selectedResolution,
    selectedQuality,
    selectedMode,
    selectedEffect,
    uploadedImageUrl,
    uploadedImageUrls,
    uploadedVideoUrl,
    uploadedVideoName,
    prompt,
    localHistory,
    hiddenHistoryIds,
  };

  const writePersistedState = useCallback(() => {
    try {
      localStorage.setItem(PERSIST_KEY, JSON.stringify(persistStateRef.current));
    } catch (err) {
      console.warn("Failed to save VideoStudio persistence:", err);
    }
  }, [PERSIST_KEY]);

  useEffect(() => {
    const timer = setTimeout(writePersistedState, 500); // 500ms debounce
    return () => clearTimeout(timer);
  }, [
    imageMode,
    v2vMode,
    selectedModel,
    selectedModelName,
    selectedAr,
    selectedDuration,
    selectedResolution,
    selectedQuality,
    selectedMode,
    selectedEffect,
    uploadedImageUrl,
    uploadedImageUrls,
    uploadedVideoUrl,
    uploadedVideoName,
    prompt,
    localHistory,
    hiddenHistoryIds,
    writePersistedState,
  ]);

  // The tab switcher unmounts this component. Without this, switching tabs
  // within the 500ms debounce window above cancels the pending write and
  // silently drops the latest generation history.
  useEffect(() => () => writePersistedState(), [writePersistedState]);

  // ── Derived UI values ────────────────────────────────────────────────────

  const applyImageReferenceUrl = useCallback(
    (url) => {
      if (!url) return;

      setUploadedImageUrl(url);

      // Motion-control models use the image alongside the uploaded video.
      if (isMotionControlSelection(selectedModel, v2vMode)) {
        setUploadedImageUrls([url]);
        setPromptDisabled(false);
        return;
      }

      const currentT2V = t2vModels.find((model) => model.id === selectedModel);

      // Models with native image inputs stay in their current mode.
      if (currentT2V?.inputs?.images_list) {
        const maxImages = currentT2V.inputs.images_list.maxItems || 8;
        setUploadedImageUrls((previousUrls) => {
          if (previousUrls.includes(url)) return previousUrls;
          return [...previousUrls, url].slice(0, maxImages);
        });
        setPromptDisabled(false);
        return;
      }

      setUploadedVideoUrl(null);
      setUploadedVideoName(null);
      setV2vMode(false);

      const sibling = currentT2V?.family
        ? i2vModels.find((model) => model.family === currentT2V.family)
        : null;
      const targetModel = imageMode
        ? i2vModels.find((model) => model.id === selectedModel)
        : i2vModels.find((model) => model.id === `${selectedModel}-frame`) || sibling || i2vModels.find((model) => model.id === 'seedance-2.5-omni-reference');

      if (!targetModel) return;

      if (!imageMode) {
        setImageMode(true);
        setSelectedModel(targetModel.id);
        setSelectedModelName(targetModel.name);
        applyControlsForModel(targetModel.id, true, false);
      }

      const maxImages = getMaxImagesForI2VModel(targetModel.id);
      if (maxImages > 2) {
        setUploadedImageUrls((previousUrls) => {
          if (previousUrls.includes(url)) return previousUrls;
          return [...previousUrls, url].slice(0, maxImages);
        });
      } else {
        setUploadedImageUrls([url]);
      }
      setPromptDisabled(false);
    },
    [
      applyControlsForModel,
      imageMode,
      isMotionControlSelection,
      selectedModel,
      v2vMode,
    ],
  );

  const handleDrawReference = useCallback(
    (entry) => {
      applyImageReferenceUrl(entry?.url);
    },
    [applyImageReferenceUrl],
  );

  const uploadImageReference = useCallback(
    async (file) => {
      if (file.size > 10 * 1024 * 1024) {
        toast.error("Image exceeds 10MB limit.");
        return;
      }

      setImageUploading(true);
      setImageProgress(0);
      try {
        const url = await uploadFile(apiKey, file, setImageProgress);
        applyImageReferenceUrl(url);
      } catch (err) {
        console.error("[VideoStudio] Image upload failed:", err);
        toast.error(`Image upload failed: ${err.message}`);
      } finally {
        setImageUploading(false);
        setImageProgress(0);
      }
    },
    [apiKey, applyImageReferenceUrl],
  );

  const processDroppedVideo = useCallback(
    async (file) => {
      if (file.size > 50 * 1024 * 1024) {
        toast.error("Video exceeds 50MB limit.");
        return;
      }
      setVideoUploading(true);
      setVideoProgress(0);
      try {
        const url = await uploadFile(apiKey, file, setVideoProgress);
        setUploadedVideoUrl(url);
        setUploadedVideoName(file.name);
        if (imageMode) {
          setUploadedImageUrl(null);
          setImageMode(false);
        }
        setV2vMode(true);
        const firstV2V = openRouterV2VModels.find(m => m.id === selectedModel.replace(/-frame$/, '')) || openRouterV2VModels[0];
        setSelectedModel(firstV2V.id);
        setSelectedModelName(firstV2V.name);
        applyControlsForModel(firstV2V.id, false, true);
        if (!firstV2V.hasPrompt) setPrompt("");
        setPromptDisabled(!firstV2V.hasPrompt);
      } catch (err) {
        toast.error(`Video upload failed: ${err.message}`);
      } finally {
        setVideoUploading(false);
        setVideoProgress(0);
      }
    },
    [apiKey, applyControlsForModel, imageMode],
  );

  // ── Handle Dropped Files ────────────────────────────────────────────────
  useEffect(() => {
    if (droppedFiles && droppedFiles.length > 0) {
      const imageFiles = droppedFiles.filter(f => f.type.startsWith('image/'));
      const videoFiles = droppedFiles.filter(f => f.type.startsWith('video/'));
      
      if (videoFiles.length > 0) {
        processDroppedVideo(videoFiles[0]);
      } else if (imageFiles.length > 0) {
        uploadImageReference(imageFiles[0]);
      }
      onFilesHandled?.();
    }
  }, [droppedFiles, onFilesHandled, processDroppedVideo, uploadImageReference]);

  // Initialise controls for default model on mount
  useEffect(() => {
    if (hasRestored.current) return;
    applyControlsForModel(defaultModel.id, false, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── close dropdown on outside click ─────────────────────────────────────
  useEffect(() => {
    if (!openDropdown) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpenDropdown(null);
      }
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [openDropdown]);

  const handlePromptInput = (e) => {
    setPrompt(e.target.value);
  };

  // ── image upload ─────────────────────────────────────────────────────────
  const handleImageFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await uploadImageReference(file);
    } finally {
      if (imageFileInputRef.current) imageFileInputRef.current.value = "";
    }
  };

  const clearImageUpload = () => {
    setUploadedImageUrl(null);
    setUploadedImageUrls([]);
    setUploadedEndImageUrl(null);
    // Motion-control v2v or model with inputs.images_list: keep model, just drop the image
    if (isMotionControlSelection(selectedModel, v2vMode)) return;
    const currentT2V = t2vModels.find((m) => m.id === selectedModel);
    if (currentT2V?.inputs?.images_list) return;
    setImageMode(false);
    const first = openRouterT2VModels[0];
    setSelectedModel(first.id);
    setSelectedModelName(first.name);
    applyControlsForModel(first.id, false, false);
    setPromptDisabled(false);
  };

  const removeImageAtIndex = (idx) => {
    const nextUrls = uploadedImageUrls.filter((_, i) => i !== idx);
    setUploadedImageUrls(nextUrls);
    if (nextUrls.length === 0) {
      setUploadedImageUrl(null);
      // Reset to text-to-video if empty list
      if (isMotionControlSelection(selectedModel, v2vMode)) return;
      setImageMode(false);
      const first = openRouterT2VModels[0];
      setSelectedModel(first.id);
      setSelectedModelName(first.name);
      applyControlsForModel(first.id, false, false);
      setPromptDisabled(false);
    } else {
      setUploadedImageUrl(nextUrls[0]);
    }
  };

  // ── end-frame upload (FLF i2v models) ──────────────────────────────────────
  const handleEndImageFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Image exceeds 10MB limit.");
      return;
    }
    setEndImageUploading(true);
    setEndImageProgress(0);
    try {
      const url = await uploadFile(apiKey, file, (pct) => {
        setEndImageProgress(pct);
      });
      setUploadedEndImageUrl(url);
    } catch (err) {
      toast.error(`End frame upload failed: ${err.message}`);
    } finally {
      setEndImageUploading(false);
      setEndImageProgress(0);
      if (endImageFileInputRef.current) endImageFileInputRef.current.value = "";
    }
  };

  const clearEndImage = () => setUploadedEndImageUrl(null);

  // ── video upload ─────────────────────────────────────────────────────────
  const handleVideoFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast.error("Video exceeds 50MB limit.");
      return;
    }
    setVideoUploading(true);
    setVideoProgress(0);
    try {
      const url = await uploadFile(apiKey, file, (pct) => {
        setVideoProgress(pct);
      });
      setUploadedVideoUrl(url);
      setUploadedVideoName(file.name);

      if (isMotionControlSelection(selectedModel, v2vMode)) {
        // Already in motion-control mode — keep model and image, allow prompt
        setPromptDisabled(false);
      } else {
        // Model-native video reference (e.g. Seedance 2.0 Extend with inputs.video_files):
        // keep the current model & mode; just store the video URL as a reference
        const currentT2VOrExtend = t2vModels.find((m) => m.id === selectedModel);
        if (currentT2VOrExtend?.inputs?.video_files) {
          setPromptDisabled(false);
        } else {
          // Default v2v flow (e.g. watermark remover) — auto-pick the first v2v model
          if (imageMode) {
            setUploadedImageUrl(null);
            setImageMode(false);
          }
          setV2vMode(true);
          const firstV2V = openRouterV2VModels.find(m => m.id === selectedModel.replace(/-frame$/, '')) || openRouterV2VModels[0];
          setSelectedModel(firstV2V.id);
          setSelectedModelName(firstV2V.name);
          applyControlsForModel(firstV2V.id, false, true);
          if (!firstV2V.hasPrompt) setPrompt("");
          setPromptDisabled(!firstV2V.hasPrompt);
        }
      }
    } catch (err) {
      console.error("[VideoStudio] Video upload failed:", err);
      toast.error(`Video upload failed: ${err.message}`);
    } finally {
      setVideoUploading(false);
      setVideoProgress(0);
      if (videoFileInputRef.current) videoFileInputRef.current.value = "";
    }
  };

  const clearVideoUpload = () => {
    setUploadedVideoUrl(null);
    setUploadedVideoName(null);
    setV2vMode(false);
    const first = openRouterT2VModels[0];
    setSelectedModel(first.id);
    setSelectedModelName(first.name);
    applyControlsForModel(first.id, false, false);
    setPromptDisabled(false);
  };

  // ── model selection from dropdown ─────────────────────────────────────────
  const handleModelSelect = useCallback(
    (m, category = imageMode ? "i2v" : "t2v") => {
      const isV2V = category === "v2v";
      if (isV2V) {
        setV2vMode(true);
        setImageMode(false);
        const isMC = !!m.imageField;
        if (!isMC) {
          // Single-input v2v (watermark remover etc.) — drop any image
          setUploadedImageUrl(null);
        }
        setSelectedModel(m.id);
        setSelectedModelName(m.name);
        applyControlsForModel(m.id, false, true);
        if (isMC) {
          // Motion-control: prompt is editable, video+image are needed
          setPromptDisabled(false);
        } else {
          setPrompt("");
          setPromptDisabled(true);
        }
      } else {
        if (v2vMode) {
          setV2vMode(false);
          setUploadedVideoUrl(null);
          setUploadedVideoName(null);
          setPromptDisabled(false);
        }
        const nextImageMode = category === "i2v";
        if (!nextImageMode && imageMode) {
          setUploadedImageUrl(null);
          setUploadedImageUrls([]);
          setUploadedEndImageUrl(null);
        }
        setImageMode(nextImageMode);
        setSelectedModel(m.id);
        setSelectedModelName(m.name);
        applyControlsForModel(m.id, nextImageMode, false);
      }
    },
    [v2vMode, imageMode, applyControlsForModel],
  );

  // ── add to local history ──────────────────────────────────────────────────
  const appliedSelection = useRef(null);
  useEffect(() => {
    if (!homeSelection || appliedSelection.current === homeSelection) return;
    appliedSelection.current = homeSelection;
    const model = openRouterT2VModels.find(item => item.id === homeSelection.modelId);
    if (model) handleModelSelect(model, 't2v');
  }, [homeSelection, handleModelSelect]);

  const addToLocalHistory = useCallback((entry) => {
    setLocalHistory((prev) => [entry, ...prev].slice(0, 30));
    setActiveHistoryIdx(0);
    serverHistory.refresh();
  }, [serverHistory.refresh]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── show result in canvas ─────────────────────────────────────────────────
  const showVideoInCanvas = useCallback((url, model) => {
    setCanvasUrl(url);
    setCanvasModel(model);
    setShowCanvas(true);
  }, []);

  useEffect(() => {
    if (!restoredWork) return;
    const {settings,jobs} = restoredWork;
    const params = jobs[0]?.parameters || {};
    const mode=settings.mode || (params.referenceVideos?.length?'v2v':params.frameImages?.length || params.referenceImages?.length?'i2v':'t2v');
    const models=mode==='v2v'?openRouterV2VModels:mode==='i2v'?openRouterI2VModels:openRouterT2VModels;
    const model=models.find(m=>m.id===settings.selectedModel || (!settings.selectedModel && (OPENROUTER_VIDEO_MODEL_MAP[m.id] || OPENROUTER_V2V_MODEL_MAP[m.id] || m.id)===jobs[0]?.model));
    if (model) {
      setImageMode(mode==='i2v');
      setV2vMode(mode==='v2v');
      setSelectedModel(model.id);
      setSelectedModelName(model.name);
      applyControlsForModel(model.id,mode==='i2v',mode==='v2v');
    }
    setPrompt(settings.prompt);
    if (params.aspectRatio) setSelectedAr(params.aspectRatio);
    if (params.duration) setSelectedDuration(params.duration);
    if (params.resolution) setSelectedResolution(params.resolution);
    const images=params.referenceImages || params.frameImages?.map(frame=>frame.url) || [];
    setUploadedImageUrls(images);
    setUploadedImageUrl(images[0] || null);
    setUploadedVideoUrl(params.referenceVideos?.[0] || null);
    const entries=jobs.filter(j=>j.asset_id).map(j=>({...j,url:'/api/assets/'+j.asset_id+'/download?workspace_id='+projectWorkspace}));
    setLocalHistory(entries);
    if (entries.length) showVideoInCanvas(entries[0].url,model?.id || entries[0].model);
  },[restoredWork,projectWorkspace]);

  // ── generate ──────────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (beforeGenerate && !beforeGenerate()) return;
    const currentModel = getCurrentModel();
    const isExtendMode = currentModel?.requiresRequestId;
    const trimmedPrompt = prompt.trim();

    if (v2vMode) {
      if (!uploadedVideoUrl) {
        toast.error("Please upload a video first.");
        return;
      }
      if (currentModel?.imageField && !currentModel.imageOptional && !uploadedImageUrl) {
        toast.error("Please upload a reference image for motion control.");
        return;
      }
      if (currentModel?.promptRequired && !trimmedPrompt) {
        toast.error("Please describe the motion you want.");
        return;
      }
    } else if (isExtendMode) {
      if (!lastGenerationId) {
        toast.error(
          "No Seedance 2.0 generation found to extend. Generate a video first.",
        );
        return;
      }
    } else if (imageMode) {
      const maxImgs = getMaxImagesForI2VModel(selectedModel);
      if (uploadedImageUrls.length > maxImgs) {
        toast.error(`This model supports at most ${maxImgs} reference images.`);
        return;
      }
      if (maxImgs > 2) {
        if (uploadedImageUrls.length === 0) {
          toast.error("Please upload at least one reference image first.");
          return;
        }
      } else {
        if (!uploadedImageUrl) {
          toast.error("Please upload a start frame image first.");
          return;
        }
      }
    } else {
      if (!trimmedPrompt) {
        toast.error("Please enter a prompt to generate a video.");
        return;
      }
    }

    onGenerationStart?.();
    setGenerating(true);
    setGenerateError(null);

    let hadError = false;

    try {
      let res;

      if (v2vMode) {
        // V2V: dedicated processV2V handles single-input tools (e.g. watermark
        // remover) and motion-control models (which take video + image + prompt)
        const workspaceId = typeof window !== "undefined" ? window.sessionStorage.getItem("nexoclip_workspace_id") : null;
        const v2vParams = {
          model: selectedModel,
          workspace_id: workspaceId,
          video_url: uploadedVideoUrl,
          prompt: trimmedPrompt || "Process the uploaded video",
          ...(currentModel?.inputs?.duration ? { duration: selectedDuration } : {}),
          ...(currentModel?.inputs?.resolution ? { resolution: selectedResolution } : {}),
          ...(currentModel?.inputs?.aspect_ratio ? { aspect_ratio: selectedAr } : {}),
        };
        if (currentModel?.imageField && uploadedImageUrl) {
          v2vParams.image_url = uploadedImageUrl;
        }
        if (currentModel?.hasPrompt && trimmedPrompt) {
          v2vParams.prompt = trimmedPrompt;
        }
        v2vParams.studioWork = studioWork?.({ prompt: trimmedPrompt, selectedModel, selectedModelName, mode: "v2v" });
        res = await generateSaasVideo(v2vParams);
        const outputUrl = res?.outputs?.[0]?.url;
        if (!outputUrl) throw new Error("No video URL returned by API");

        const genId = res.id || Date.now().toString();
        setLastGenerationId(null);
        setLastGenerationModel(null);
        const entry = {
          id: genId,
          url: outputUrl,
          prompt: currentModel?.hasPrompt ? trimmedPrompt : "",
          model: selectedModel,
          timestamp: new Date().toISOString(),
        };
        addToLocalHistory(entry);
        showVideoInCanvas(outputUrl, selectedModel);
        if (onGenerationComplete)
          onGenerationComplete({
            url: outputUrl,
            model: selectedModel,
            prompt: currentModel?.hasPrompt ? trimmedPrompt : "",
            type: "video",
          });
      } else if (imageMode) {
        const maxImgs = getMaxImagesForI2VModel(selectedModel);
        const workspaceId = typeof window !== "undefined" ? window.sessionStorage.getItem("nexoclip_workspace_id") : null;
        const i2vParams = { model: selectedModel, workspace_id: workspaceId };
        if (maxImgs > 2) {
          i2vParams.images_list = uploadedImageUrls;
        } else {
          i2vParams.image_url = uploadedImageUrl;
        }
        if (trimmedPrompt) i2vParams.prompt = trimmedPrompt;
        i2vParams.aspect_ratio = selectedAr;
        const i2vModel = i2vModels.find((m) => m.id === selectedModel);
        if (uploadedEndImageUrl && i2vModel?.lastImageField) {
          i2vParams.last_image = uploadedEndImageUrl;
        }
        const durations = getDurationsForI2VModel(selectedModel);
        if (durations.length > 0) i2vParams.duration = selectedDuration;
        const resolutions = getResolutionsForI2VModel(selectedModel);
        if (resolutions.length > 0) i2vParams.resolution = selectedResolution;
        // "-480p" variants carry their resolution only in the id, which is
        // lost once mapped to the provider model; send it explicitly.
        else if (/-480p$/.test(selectedModel)) i2vParams.resolution = "480p";
        if (selectedQuality) i2vParams.quality = selectedQuality;
        if (selectedMode) i2vParams.mode = selectedMode;
        if (showEffect && selectedEffect) i2vParams.name = selectedEffect;

        i2vParams.studioWork = studioWork?.({ prompt: trimmedPrompt, selectedModel, selectedModelName, mode: "i2v" });
        res = await generateSaasVideo(i2vParams);
        const outputUrl = res?.outputs?.[0]?.url;
        if (!outputUrl) throw new Error("No video URL returned by API");

        const genId = res.id || Date.now().toString();
        if (selectedModel === "seedance-v2.0-i2v") {
          setLastGenerationId(genId);
          setLastGenerationModel(selectedModel);
        } else {
          setLastGenerationId(null);
          setLastGenerationModel(null);
        }
        const entry = {
          id: genId,
          url: outputUrl,
          prompt: trimmedPrompt,
          model: selectedModel,
          aspect_ratio: selectedAr,
          duration: selectedDuration,
          timestamp: new Date().toISOString(),
        };
        addToLocalHistory(entry);
        showVideoInCanvas(outputUrl, selectedModel);
        if (onGenerationComplete)
          onGenerationComplete({
            url: outputUrl,
            model: selectedModel,
            prompt: trimmedPrompt,
            type: "video",
          });
      } else {
        // T2V (including extend mode)
        const workspaceId = typeof window !== "undefined" ? window.sessionStorage.getItem("nexoclip_workspace_id") : null;
        const params = { model: selectedModel, workspace_id: workspaceId };
        if (trimmedPrompt) params.prompt = trimmedPrompt;

        if (isExtendMode) {
          params.request_id = lastGenerationId;
          // Optional reference media for Seedance 2.0 Extend:
          // images map to @image2…@image9 and videos map to @video1…@video3 in the prompt
          if (uploadedImageUrls.length > 0) {
            params.images_list = uploadedImageUrls;
          }
          if (uploadedVideoUrl) {
            params.videos_list = [uploadedVideoUrl];
          }
        } else {
          params.aspect_ratio = selectedAr;
        }

        const durations = getDurationsForModel(selectedModel);
        if (durations.length > 0) params.duration = selectedDuration;
        const resolutions = getResolutionsForVideoModel(selectedModel);
        if (resolutions.length > 0) params.resolution = selectedResolution;
        else if (/-480p$/.test(selectedModel)) params.resolution = "480p";
        if (selectedQuality) params.quality = selectedQuality;
        if (selectedMode) params.mode = selectedMode;

        params.studioWork = studioWork?.({ prompt: trimmedPrompt, selectedModel, selectedModelName, mode: "t2v" });
        res = await generateSaasVideo(params);
        const outputUrl = res?.outputs?.[0]?.url;
        if (!outputUrl) throw new Error("No video URL returned by API");

        const genId = res.id || Date.now().toString();
        if (
          selectedModel === "seedance-v2.0-t2v" ||
          selectedModel === "seedance-v2.0-i2v"
        ) {
          setLastGenerationId(genId);
          setLastGenerationModel(selectedModel);
        } else {
          setLastGenerationId(null);
          setLastGenerationModel(null);
        }
        const entry = {
          id: genId,
          url: outputUrl,
          prompt: trimmedPrompt,
          model: selectedModel,
          aspect_ratio: selectedAr,
          duration: selectedDuration,
          timestamp: new Date().toISOString(),
        };
        addToLocalHistory(entry);
        showVideoInCanvas(outputUrl, selectedModel);
        if (onGenerationComplete)
          onGenerationComplete({
            url: outputUrl,
            model: selectedModel,
            prompt: trimmedPrompt,
            type: "video",
          });
      }
    } catch (e) {
      hadError = true;
      console.error("[VideoStudio]", e);
      const errMsg = formatErrorMessage(e, "Video generation failed");
      if (onGenerationError) onGenerationError(errMsg);
      else toast.error(errMsg);
    } finally {
      setGenerating(false);
      onGenerationEnd?.();
    }
  }, [
    beforeGenerate,
    apiKey,
    prompt,
    v2vMode,
    imageMode,
    selectedModel,
    selectedAr,
    selectedDuration,
    selectedResolution,
    selectedQuality,
    selectedMode,
    selectedEffect,
    showEffect,
    uploadedImageUrl,
    uploadedImageUrls,
    uploadedVideoUrl,
    lastGenerationId,
    getCurrentModel,
    addToLocalHistory,
    showVideoInCanvas,
    onGenerationComplete,
    onGenerationEnd,
    onGenerationError,
    onGenerationStart,
  ]);

  // ── reset to prompt bar ───────────────────────────────────────────────────
  const resetToPromptBar = useCallback(() => {
    setShowCanvas(false);
  }, []);

  const handleNewPrompt = useCallback(() => {
    resetToPromptBar();
    setPrompt("");
    setUploadedImageUrl(null);
    setUploadedImageUrls([]);
    setImageMode(false);
    setUploadedVideoUrl(null);
    setUploadedVideoName(null);
    setV2vMode(false);
    const first = openRouterT2VModels[0];
    setSelectedModel(first.id);
    setSelectedModelName(first.name);
    applyControlsForModel(first.id, false, false);
    setPromptDisabled(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [resetToPromptBar, applyControlsForModel]);

  const handleExtend = useCallback(() => {
    if (!lastGenerationId) return;
    resetToPromptBar();
    setPrompt("");
    setUploadedImageUrl(null);
    setUploadedImageUrls([]);
    setImageMode(false);
    setSelectedModel("seedance-v2.0-extend");
    setSelectedModelName("Seedance 2.0 Extend");
    applyControlsForModel("seedance-v2.0-extend", false, false);
    setPromptDisabled(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [lastGenerationId, resetToPromptBar, applyControlsForModel]);

  // ── derived UI values ────────────────────────────────────────────────────
  const isSeedance2Canvas =
    canvasModel === "seedance-v2.0-t2v" || canvasModel === "seedance-v2.0-i2v";
  const currentModelObj = getCurrentModel();
  const isExtendMode = currentModelObj?.requiresRequestId;
  const canUploadImageReference =
    (!v2vMode || isMotionControlSelection(selectedModel, v2vMode)) &&
    (!isExtendMode || currentModelObj?.inputs?.images_list);

  const promptPlaceholder = v2vMode
    ? currentModelObj?.imageField
      ? currentModelObj?.promptRequired
        ? "Describe the motion"
        : "Describe the motion (optional)"
      : "Video ready — click Generate to remove watermark"
    : imageMode
      ? "Describe the motion or effect (optional)"
      : isExtendMode
        ? "Optional: describe how to continue the video..."
        : "Describe the video you want to create";

  const toggleDropdown = (type) => (e) => {
    e.stopPropagation();
    setOpenDropdown((prev) => (prev === type ? null : type));
  };

  const VIDEO_STARTERS = [
    "Slow-motion macro pour of iced espresso over crystal ice cubes, golden morning light",
    "Smooth handheld tracking shot walking through a rain-lit neon Tokyo alley at dusk",
    "Orbiting studio commercial shot of wireless earbuds levitating with soft reflections",
    "Warm cinematic sunrise over misty Bali rice terraces, slow aerial drone push-in",
  ];

  const modeBadgeLabel = v2vMode
    ? "Video Tools"
    : imageMode
      ? "Image to Video"
      : isExtendMode
        ? "Extend Video"
        : "Text to Video";

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className="w-full h-full flex flex-col items-center justify-center bg-transparent relative px-4 md:px-6 overflow-hidden"
    >
      {/* ── CENTRAL GALLERY AREA ── */}
      <div className="flex-1 w-full max-w-7xl mx-auto overflow-y-auto custom-scrollbar pb-48 lg:pb-44 px-1">
        {history.length === 0 && serverHistory.loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 w-full pt-6" role="status" aria-label="Loading generated videos">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div key={idx} className="rounded-2xl overflow-hidden border border-[#e6e7f0] bg-white shadow-[0_2px_10px_rgba(20,20,31,0.03)]">
                <div className="w-full aspect-video nx-skel" style={{ borderRadius: 0 }} />
                <div className="p-3.5 space-y-2.5">
                  <div className="nx-skel h-3.5 w-4/5" />
                  <div className="flex items-center gap-2">
                    <div className="nx-skel nx-skel--pill h-5 w-24" />
                    <div className="nx-skel h-3 w-12" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : history.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 w-full pt-6 animate-fade-in-up">
            {history.map((entry, idx) => {
              const isSeedance2 = entry.model === "seedance-v2.0-t2v" || entry.model === "seedance-v2.0-i2v";
              return (
                <div
                  key={entry.id || idx}
                  className="relative group rounded-2xl overflow-hidden border border-[#e6e7f0] bg-white shadow-[0_2px_10px_rgba(20,20,31,0.04)] hover:border-[#c8bffb] hover:shadow-[0_14px_30px_rgba(20,20,31,0.08)] transition-all duration-200 flex flex-col cursor-pointer"
                  onClick={() => setFullscreenUrl(entry.url)}
                >
                  <div className="relative w-full aspect-video bg-[#0f1117] overflow-hidden">
                    <video
                      src={entry.url}
                      className="w-full h-full object-cover group-hover:opacity-95 transition-opacity"
                      controls={false}
                      loop
                      muted
                      playsInline
                      onMouseEnter={(e) => {
                        const v = e.currentTarget;
                        const p = v.play();
                        if (p && typeof p.catch === "function") p.catch(() => {});
                      }}
                      onMouseLeave={(e) => {
                        const v = e.currentTarget;
                        try {
                          v.pause();
                          v.currentTime = 0;
                        } catch {
                          /* ignore media reset error */
                        }
                      }}
                    />
                  </div>
                  
                  {/* Overlay actions */}
                  <div className="absolute top-2.5 right-2.5 hidden md:flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <GenerationCopyButtons
                      prompt={entry.prompt}
                      onCopyError={onGenerationError}
                    />
                    <button
                      type="button"
                      title="Publish to TikTok"
                      onClick={(e) => { e.stopPropagation(); onPublish?.(entry); }}
                      className="w-8 h-8 flex items-center justify-center bg-[#14141f]/75 backdrop-blur-md rounded-full text-white hover:bg-[#5b45f2] hover:border-[#5b45f2] transition-all border border-white/15"
                    >
                      <span className="text-[11px] font-bold">TT</span>
                    </button>
                    <button
                      type="button"
                      title="Download"
                      onClick={(e) => {
                        e.stopPropagation();
                        downloadFile(entry.url, `video-${entry.id || idx}.mp4`);
                      }}
                      className="w-8 h-8 flex items-center justify-center bg-[#14141f]/75 backdrop-blur-md rounded-full text-white hover:bg-[#5b45f2] hover:border-[#5b45f2] transition-all border border-white/15"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                      </svg>
                    </button>
                    {isSeedance2 && (
                      <button
                        type="button"
                        title="Extend this video using Seedance 2.0 Extend"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLastGenerationId(entry.id);
                          handleExtend();
                        }}
                        className="w-8 h-8 flex items-center justify-center bg-[#14141f]/75 backdrop-blur-md rounded-full text-white hover:bg-[#5b45f2] hover:border-[#5b45f2] transition-all border border-white/15"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                          <path d="M5 12h14M12 5l7 7-7 7" />
                        </svg>
                      </button>
                    )}
                    <button
                      type="button"
                      title="Delete"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (await confirmDialog({ title: "Delete this generated item?", confirmLabel: "Delete", destructive: true })) {
                          removeHistoryEntry(entry);
                        }
                      }}
                      className="w-8 h-8 flex items-center justify-center bg-[#14141f]/75 backdrop-blur-md rounded-full text-rose-300 hover:bg-[#e11d48] hover:border-[#e11d48] hover:text-white transition-all border border-white/15"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                    </button>
                  </div>
                  <MobileGenerationActions
                    prompt={entry.prompt}
                    onCopyError={onGenerationError}
                    actions={[
                      onPublish && {
                        kind: "publish",
                        label: "Publish to TikTok",
                        onSelect: () => onPublish(entry),
                      },
                      {
                        kind: "download",
                        label: "Download",
                        onSelect: () =>
                          downloadFile(entry.url, `video-${entry.id || idx}.mp4`),
                      },
                      isSeedance2 && {
                        kind: "extend",
                        label: "Extend",
                        onSelect: () => {
                          setLastGenerationId(entry.id);
                          handleExtend();
                        },
                      },
                      {
                        kind: "delete",
                        label: "Delete",
                        danger: true,
                        onSelect: async () => {
                          if (await confirmDialog({ title: "Delete this generated item?", confirmLabel: "Delete", destructive: true })) {
                            removeHistoryEntry(entry);
                          }
                        },
                      },
                    ]}
                  />

                  {/* Prompt & Details */}
                  <div className="p-3.5 bg-white border-t border-[#efeff5] flex-1 flex flex-col justify-between gap-2.5">
                    <p className="text-[#2d2e3f] text-[12.5px] line-clamp-2 leading-relaxed" title={entry.prompt}>
                      {entry.prompt || "No prompt provided"}
                    </p>
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[11px] font-semibold text-[#4c38d6] px-2 py-0.5 bg-[#f2f0ff] rounded-md border border-[#ddd7fe] whitespace-nowrap capitalize truncate">
                          {entry.model?.replace(/-/g, " ") || "Video Studio"}
                        </span>
                        <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#7a7b90]">
                          {entry.resolution && <span>{entry.resolution}</span>}
                          {entry.resolution && entry.duration && <span>·</span>}
                          {entry.duration && <span>{entry.duration}s</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full animate-fade-in-up min-h-[56vh] px-4 py-10">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e4e2f0] bg-white/90 px-3.5 py-1 text-[11.5px] font-semibold text-[#5b45f2] shadow-[0_2px_8px_rgba(20,20,31,0.04)] mb-4">
              Video Studio · {modeBadgeLabel}
            </span>
            <h1 className="text-[30px] sm:text-[40px] font-semibold tracking-[-0.03em] text-[#14141f] text-center leading-tight mb-3">
              {selectedModelName}
            </h1>
            <p className="text-[#5e5e72] text-[14.5px] text-center max-w-lg leading-relaxed mb-7">
              {v2vMode
                ? "Transform, extend, or refine existing clips with precision video tools."
                : imageMode
                  ? "Bring reference images to life with controlled camera motion and cinematic timing."
                  : "Turn text prompts or reference frames into cinematic AI video clips."}
            </p>
            {!v2vMode && (
              <div className="flex flex-wrap items-center justify-center gap-2 max-w-2xl">
                {VIDEO_STARTERS.map((idea) => (
                  <button
                    key={idea}
                    type="button"
                    onClick={() => {
                      setPrompt(idea);
                      setTimeout(() => textareaRef.current?.focus(), 30);
                    }}
                    className="rounded-full border border-[#e6e7f0] bg-white/90 hover:bg-[#f2f0ff] hover:border-[#c8bffb] px-3.5 py-2 text-[12px] font-medium text-[#2d2e3f] hover:text-[#4c38d6] shadow-[0_1px_4px_rgba(20,20,31,0.03)] transition-all text-left max-w-[300px] truncate"
                    title={idea}
                  >
                    {idea}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── BOTTOM PROMPT BAR ── */}
      <PromptComposer>
          <div className="flex flex-col gap-3">
            {/* Inline list of uploaded media files */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {uploadedImageUrl && !(imageMode && getMaxImagesForI2VModel(selectedModel) > 2) && (
                <div className={PROMPT_MEDIA_PREVIEW_CLASS}>
                  <img src={uploadedImageUrl} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={clearImageUpload}
                    className="absolute top-0.5 right-0.5 w-4 h-4 bg-[#14141f]/75 hover:bg-[#14141f] rounded-full flex items-center justify-center text-white text-[9px]"
                  >
                    ×
                  </button>
                </div>
              )}

              {/* End frame image preview */}
              {uploadedEndImageUrl && (
                <div className={PROMPT_MEDIA_PREVIEW_CLASS}>
                  <img src={uploadedEndImageUrl} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={clearEndImage}
                    className="absolute top-0.5 right-0.5 w-4 h-4 bg-[#14141f]/75 hover:bg-[#14141f] rounded-full flex items-center justify-center text-white text-[9px]"
                  >
                    ×
                  </button>
                  <span className="absolute bottom-0.5 left-0.5 px-1 h-3.5 bg-[#5b45f2] rounded text-[7px] font-bold text-white leading-none flex items-center justify-center pointer-events-none">
                    END
                  </span>
                </div>
              )}

              {/* Video preview */}
              {uploadedVideoUrl && (
                <div className={PROMPT_MEDIA_PREVIEW_CLASS}>
                  <video src={uploadedVideoUrl} className="w-full h-full object-cover" muted />
                  <button
                    type="button"
                    onClick={clearVideoUpload}
                    className="absolute top-0.5 right-0.5 w-4 h-4 bg-[#14141f]/75 hover:bg-[#14141f] rounded-full flex items-center justify-center text-white text-[9px]"
                  >
                    ×
                  </button>
                </div>
              )}

              {/* Multiple images layout if supported */}
              {imageMode && getMaxImagesForI2VModel(selectedModel) > 2 && (
                <>
                  {uploadedImageUrls.map((url, idx) => (
                    <div key={url} className={PROMPT_MEDIA_PREVIEW_CLASS}>
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeImageAtIndex(idx)}
                        className="absolute top-0.5 right-0.5 w-4 h-4 bg-[#14141f]/75 hover:bg-[#14141f] rounded-full flex items-center justify-center text-white text-[9px]"
                      >
                        ×
                      </button>
                      <span className="absolute bottom-0.5 right-0.5 px-1 h-3.5 bg-[#5b45f2] rounded-full text-[8px] font-bold text-white leading-none flex items-center justify-center pointer-events-none">
                        {idx + 1}
                      </span>
                    </div>
                  ))}
                </>
              )}

              {/* Image upload trigger */}
              {canUploadImageReference && (
                getMaxImagesForI2VModel(selectedModel) > 2 ? (
                  uploadedImageUrls.length < getMaxImagesForI2VModel(selectedModel) && (
                    <div className="relative">
                      <input
                        ref={imageFileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageFileChange}
                      />
                      <button
                        type="button"
                        title="Upload reference image"
                        onClick={() => imageFileInputRef.current?.click()}
                        className={promptMediaButtonClassName()}
                      >
                        {imageUploading ? (
                          <div className="flex flex-col items-center justify-center w-full h-full absolute inset-0 bg-white/90 z-20 backdrop-blur-[2px]">
                            <svg className="w-8 h-8 -rotate-90">
                              <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2.2" fill="transparent" className="text-[#e6e7f0]" />
                              <circle
                                cx="16"
                                cy="16"
                                r="14"
                                stroke="currentColor"
                                strokeWidth="2.2"
                                fill="transparent"
                                strokeDasharray={88}
                                strokeDashoffset={88 - (88 * imageProgress) / 100}
                                className="text-[#5b45f2] transition-all duration-300"
                              />
                            </svg>
                            <span className="absolute text-[9px] font-bold text-[#5b45f2] leading-none">{imageProgress}%</span>
                          </div>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" className="text-current transition-colors">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                        )}
                      </button>
                    </div>
                  )
                ) : (
                  !uploadedImageUrl && (
                    <div className="relative">
                      <input
                        ref={imageFileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleImageFileChange}
                      />
                      <button
                        type="button"
                        title="Upload reference image"
                        onClick={() => imageFileInputRef.current?.click()}
                        className={promptMediaButtonClassName()}
                      >
                        {imageUploading ? (
                          <div className="flex flex-col items-center justify-center w-full h-full absolute inset-0 bg-white/90 z-20 backdrop-blur-[2px]">
                            <svg className="w-8 h-8 -rotate-90">
                              <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2.2" fill="transparent" className="text-[#e6e7f0]" />
                              <circle
                                cx="16"
                                cy="16"
                                r="14"
                                stroke="currentColor"
                                strokeWidth="2.2"
                                fill="transparent"
                                strokeDasharray={88}
                                strokeDashoffset={88 - (88 * imageProgress) / 100}
                                className="text-[#5b45f2] transition-all duration-300"
                              />
                            </svg>
                            <span className="absolute text-[9px] font-bold text-[#5b45f2] leading-none">{imageProgress}%</span>
                          </div>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" className="text-current transition-colors">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                        )}
                      </button>
                    </div>
                  )
                )
              )}

              {/* End frame image button */}
              {imageMode && i2vModels.find((m) => m.id === selectedModel)?.lastImageField && !uploadedEndImageUrl && (
                <div className="relative">
                  <input
                    ref={endImageFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleEndImageFileChange}
                  />
                  <button
                    type="button"
                    title="Upload end frame (optional)"
                    onClick={() => endImageFileInputRef.current?.click()}
                    className={promptMediaButtonClassName()}
                  >
                    {endImageUploading ? (
                      <div className="flex flex-col items-center justify-center w-full h-full absolute inset-0 bg-white/90 z-20 backdrop-blur-[2px]">
                        <svg className="w-8 h-8 -rotate-90">
                          <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2.2" fill="transparent" className="text-[#e6e7f0]" />
                          <circle
                            cx="16"
                            cy="16"
                            r="14"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            fill="transparent"
                            strokeDasharray={88}
                            strokeDashoffset={88 - (88 * endImageProgress) / 100}
                            className="text-[#5b45f2] transition-all duration-300"
                          />
                        </svg>
                        <span className="absolute text-[9px] font-bold text-[#5b45f2] leading-none">{endImageProgress}%</span>
                      </div>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" className="text-current transition-colors">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    )}
                  </button>
                </div>
              )}

              {/* Video upload button */}
              {!uploadedVideoUrl && (v2vMode || currentModelObj?.inputs?.video_files) && (
                <div className="relative">
                  <input
                    ref={videoFileInputRef}
                    type="file"
                    accept="video/*"
                    className="hidden"
                    onChange={handleVideoFileChange}
                  />
                  <button
                    type="button"
                    title="Upload reference video"
                    onClick={() => videoFileInputRef.current?.click()}
                    className={promptMediaButtonClassName()}
                  >
                    {videoUploading ? (
                      <div className="flex flex-col items-center justify-center w-full h-full absolute inset-0 bg-white/90 z-20 backdrop-blur-[2px]">
                        <svg className="w-8 h-8 -rotate-90">
                          <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2.2" fill="transparent" className="text-[#e6e7f0]" />
                          <circle
                            cx="16"
                            cy="16"
                            r="14"
                            stroke="currentColor"
                            strokeWidth="2.2"
                            fill="transparent"
                            strokeDasharray={88}
                            strokeDashoffset={88 - (88 * videoProgress) / 100}
                            className="text-[#5b45f2] transition-all duration-300"
                          />
                        </svg>
                        <span className="absolute text-[9px] font-bold text-[#5b45f2] leading-none">{videoProgress}%</span>
                      </div>
                    ) : (
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="text-current transition-colors"
                      >
                        <polygon points="23 7 16 12 23 17 23 7" fill="currentColor" />
                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" fill="currentColor" />
                      </svg>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* Prompt textarea */}
            <div className="flex-1 flex flex-col gap-1">
              <PromptTextarea
                ref={textareaRef}
                value={prompt}
                onChange={handlePromptInput}
                placeholder={promptPlaceholder}
                disabled={promptDisabled}
              />
            </div>
          </div>

          {/* Extend banner */}
          {isExtendMode && (
            <div className="flex items-center gap-2 px-3 py-2 bg-[#f2f0ff] border border-[#ddd7fe] rounded-xl text-[12px] text-[#4c38d6] font-medium">
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
              >
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
              <span>Extending previous Seedance 2.0 generation</span>
            </div>
          )}

          {/* Bottom row: controls + generate */}
          <PromptFooter>
            <PromptControls ref={dropdownRef}>
              {/* Model btn */}
              <div className="relative">
                <button
                  type="button"
                  onClick={toggleDropdown("model")}
                  className={promptControlClassName({
                    active: openDropdown === "model",
                  })}
                >
                  <div className="w-4 h-4 rounded overflow-hidden shrink-0 flex items-center justify-center bg-white border border-[#e6e7f0]">
                    {(() => {
                      const allCurrentModels = [...t2vModels, ...i2vModels, ...v2vModels];
                      const selectedModelObj = allCurrentModels.find(m => m.id === selectedModel);
                      const selectedModelProvider = selectedModelObj?.provider || 'muapi';
                      return PROVIDER_LOGOS[selectedModelProvider] ? (
                        <img 
                          src={PROVIDER_LOGOS[selectedModelProvider]} 
                          alt="" 
                          className="w-full h-full object-contain p-0.5" 
                        />
                      ) : (
                        <span className="text-[9px] font-bold text-[#4c38d6] uppercase">V</span>
                      );
                    })()}
                  </div>
                  <span className={PROMPT_CONTROL_LABEL_CLASS}>
                    {selectedModelName}
                  </span>
                  <PromptChevronIcon />
                </button>
                {openDropdown === "model" && (
                  <PromptPopover
                    onClick={(e) => e.stopPropagation()}
                    className="w-[calc(100vw-2rem)] md:w-[480px] max-w-md md:max-w-none max-h-[70vh]"
                  >
                    <PromptPopoverHeader>Model</PromptPopoverHeader>
                    <ModelDropdown
                      selectedModel={selectedModel}
                      onSelect={handleModelSelect}
                      onClose={() => setOpenDropdown(null)}
                    />
                  </PromptPopover>
                )}
              </div>

              {/* Aspect ratio btn */}
              {showAr && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={toggleDropdown("ar")}
                    className={promptControlClassName({
                      active: openDropdown === "ar",
                    })}
                  >
                    <PromptAspectRatioIcon />
                    <span className={PROMPT_CONTROL_LABEL_CLASS}>
                      {selectedAr}
                    </span>
                  </button>
                  {openDropdown === "ar" && (
                    <PromptPopover
                      onClick={(e) => e.stopPropagation()}
                    >
                      <PromptPopoverHeader>
                        Aspect Ratio
                      </PromptPopoverHeader>
                      <PromptMenuList>
                        {getCurrentAspectRatios(selectedModel).map((r) => (
                          <PromptMenuItem
                            key={r}
                            selected={selectedAr === r}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedAr(r);
                              setOpenDropdown(null);
                            }}
                          >
                            {r}
                          </PromptMenuItem>
                        ))}
                      </PromptMenuList>
                    </PromptPopover>
                  )}
                </div>
              )}

              {/* Effect btn */}
              {showEffect && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={toggleDropdown("effect")}
                    className={promptControlClassName({
                      active: openDropdown === "effect",
                    })}
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="opacity-65"
                    >
                      <path d="M5 3l14 9-14 9V3z" />
                    </svg>
                    <span className={`${PROMPT_CONTROL_LABEL_CLASS} max-w-[140px] truncate`}>
                      {selectedEffect || "Effect"}
                    </span>
                  </button>
                  {openDropdown === "effect" && (
                    <PromptPopover
                      onClick={(e) => e.stopPropagation()}
                      className="min-w-[200px]"
                    >
                      <PromptPopoverHeader>
                        Effect Type
                      </PromptPopoverHeader>
                      <PromptMenuList>
                        {getEffectsForI2VModel(selectedModel).map((eff) => (
                          <PromptMenuItem
                            key={eff}
                            selected={selectedEffect === eff}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedEffect(eff);
                              setOpenDropdown(null);
                            }}
                          >
                            {eff}
                          </PromptMenuItem>
                        ))}
                      </PromptMenuList>
                    </PromptPopover>
                  )}
                </div>
              )}

              {imageMode && (
                <span className="text-[11.5px] font-medium text-[#7a7b90]">
                  Images: up to {getMaxImagesForI2VModel(selectedModel)}{currentModelObj?.lastImageField ? ' (first / last frame)' : ''}
                </span>
              )}

              {/* Duration btn */}
              {showDuration && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={toggleDropdown("duration")}
                    className={promptControlClassName({
                      active: openDropdown === "duration",
                    })}
                  >
                    <PromptDurationIcon />
                    <span className={PROMPT_CONTROL_LABEL_CLASS}>
                      {selectedDuration}s{getCurrentDurations(selectedModel).length > 1 ? ` · up to ${Math.max(...getCurrentDurations(selectedModel))}s` : ""}
                    </span>
                  </button>
                  {openDropdown === "duration" && (
                    <PromptPopover
                      onClick={(e) => e.stopPropagation()}
                    >
                      <PromptPopoverHeader>
                        Duration
                      </PromptPopoverHeader>
                      <div className="p-2.5 min-w-56">
                        <input
                          type="range"
                          aria-label="Video duration"
                          aria-valuetext={`${selectedDuration} seconds`}
                          min={0}
                          max={getCurrentDurations(selectedModel).length - 1}
                          step={1}
                          value={Math.max(0, getCurrentDurations(selectedModel).indexOf(selectedDuration))}
                          onChange={(event) => setSelectedDuration(getCurrentDurations(selectedModel)[Number(event.target.value)])}
                          className="w-full accent-[#5b45f2]"
                        />
                        <div className="flex justify-between text-[12px] text-[#5e5e72] mt-1.5">
                          <span>{getCurrentDurations(selectedModel)[0]}s</span>
                          <strong className="text-[#4c38d6] font-semibold">{selectedDuration}s</strong>
                          <span>{getCurrentDurations(selectedModel).at(-1)}s</span>
                        </div>
                      </div>
                    </PromptPopover>
                  )}
                </div>
              )}

              {/* Resolution btn */}
              {showResolution && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={toggleDropdown("resolution")}
                    className={promptControlClassName({
                      active: openDropdown === "resolution",
                    })}
                  >
                    <PromptQualityIcon />
                    <span className={PROMPT_CONTROL_LABEL_CLASS}>
                      {selectedResolution || "720p"}
                    </span>
                  </button>
                  {openDropdown === "resolution" && (
                    <PromptPopover
                      onClick={(e) => e.stopPropagation()}
                    >
                      <PromptPopoverHeader>
                        Resolution
                      </PromptPopoverHeader>
                      <PromptMenuList>
                        {getCurrentResolutions(selectedModel).map((r) => (
                          <PromptMenuItem
                            key={r}
                            selected={selectedResolution === r}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedResolution(r);
                              setOpenDropdown(null);
                            }}
                          >
                            {r}
                          </PromptMenuItem>
                        ))}
                      </PromptMenuList>
                    </PromptPopover>
                  )}
                </div>
              )}

              {canUploadImageReference && (
                <button
                  type="button"
                  className={promptControlClassName()}
                  onClick={() => setIsDrawModalOpen(true)}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    className="opacity-65 transition-colors"
                  >
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                  <span className={PROMPT_CONTROL_LABEL_CLASS}>Draw</span>
                </button>
              )}
            </PromptControls>

            {/* Generate button */}
            <PromptAction
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? (
                <>
                  <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <span>{videoCredits !== null ? `Generate · ${formatCredits(videoCredits)} credits` : 'Generate'}</span>
                </>
              )}
            </PromptAction>
          </PromptFooter>
      </PromptComposer>

      {/* ── FULLSCREEN VIDEO MODAL ── */}
      {fullscreenUrl && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-[#0f1117]/92 backdrop-blur-md animate-fade-in p-4"
          onClick={() => setFullscreenUrl(null)}
        >
          <button
            type="button"
            className="absolute top-5 right-5 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors border border-white/15"
            onClick={(e) => {
              e.stopPropagation();
              setFullscreenUrl(null);
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <video 
            src={fullscreenUrl} 
            controls 
            autoPlay 
            loop 
            className="max-w-[94vw] max-h-[92vh] rounded-2xl shadow-2xl object-contain animate-scale-up" 
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      <DrawModal
        isOpen={isDrawModalOpen}
        onClose={() => setIsDrawModalOpen(false)}
        apiKey={apiKey}
        batchSize={1}
        onAddHistoryItem={handleDrawReference}
      />
      <Toaster position="top-right" containerStyle={{ zIndex: 99999 }} toastOptions={{ duration: 5000, style: { background: '#ffffff', color: '#14141f', border: '1px solid #e6e7f0', fontSize: '13px', borderRadius: '12px', boxShadow: '0 10px 30px rgba(20,20,31,0.12)', maxWidth: '440px', wordBreak: 'break-word', whiteSpace: 'pre-wrap', padding: '12px 16px' } }} />
    </div>
  );
}
