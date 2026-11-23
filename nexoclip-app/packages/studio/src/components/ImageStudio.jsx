"use client";
import { confirmDialog } from "./confirmDialog.jsx";

import { useState, useEffect, useRef, useCallback } from "react";
import toast, { Toaster } from "react-hot-toast";
import { generateSaasImage, uploadFile } from "../generationClient.js";
import { assetPreviewUrl } from "../assetPreviewUrl.js";
import { formatErrorMessage } from "../utils/formatError.js";
import { scopedPersistKey, migrateLegacyPersistKey } from "../persistKey.js";
import DurableJobHistory from "../../../../components/DurableJobHistory.js";
import DrawModal from "./DrawModal.jsx";
import MobileGenerationActions, {
  GenerationCopyButtons,
} from "./MobileGenerationActions.jsx";
import {
  openRouterT2IModels,
  openRouterI2IModels,
  getAspectRatiosForModel,
  getResolutionsForModel,
  getQualityFieldForModel,
  getAspectRatiosForI2IModel,
  getResolutionsForI2IModel,
  getQualityFieldForI2IModel,
  getMaxImagesForI2IModel,
  getEffectsForI2IModel,
  getDefaultEffectForI2IModel,
  getI2IModelById,
  OPENROUTER_IMAGE_MODEL_MAP,
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
  PromptQualityIcon,
  PromptTextarea,
  promptControlClassName,
  promptMediaButtonClassName,
} from "./prompt/PromptComposer.jsx";

// ─── helpers ────────────────────────────────────────────────────────────────

async function downloadImage(url, filename) {
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

// ─── UploadButton (inline picker) ───────────────────────────────────────────

function UploadButton({ apiKey, maxImages, onSelect, onClear, initialUrls = [], label = null, persistedHistory = null, onHistoryChange = null }) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedEntries, setSelectedEntries] = useState([]); // [{url, thumbnail}]
  const [uploadHistory, setUploadHistory] = useState(persistedHistory || []); // [{id, name, url, thumbnail}]

  // Notify parent whenever uploadHistory changes (for localStorage persistence)
  const onHistoryChangeRef = useRef(onHistoryChange);
  onHistoryChangeRef.current = onHistoryChange;
  useEffect(() => {
    onHistoryChangeRef.current?.(uploadHistory);
  }, [uploadHistory]);

  // Sync if parent provides a new persistedHistory (e.g. on first mount from localStorage)
  useEffect(() => {
    if (persistedHistory && persistedHistory.length > 0) {
      setUploadHistory((prev) => {
        // Merge: add any entries from persistedHistory that aren't already present
        const existingUrls = new Set(prev.map(h => h.url));
        const missing = persistedHistory.filter(h => h.url && !existingUrls.has(h.url));
        return missing.length > 0 ? [...prev, ...missing] : prev;
      });
    }
  }, [persistedHistory]);
  
  const [lastUploadProgress, setLastUploadProgress] = useState(0);
  const fileInputRef = useRef(null);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target)
      ) {
        setPanelOpen(false);
      }
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [panelOpen]);

  // Sync initialUrls from parent (e.g. restored from localStorage)
  useEffect(() => {
    if (initialUrls && initialUrls.length > 0) {
      // Avoid infinite loops by only updating if URLs actually changed
      const currentUrls = selectedEntries.map(e => e.url);
      const isSame = initialUrls.length === currentUrls.length && initialUrls.every(u => currentUrls.includes(u));
      if (isSame) return;

      const newEntries = initialUrls.map(url => ({ url }));
      setSelectedEntries(newEntries);
      
      // Also ensure they are in the history panel
      setUploadHistory(prev => {
        const existingUrls = prev.map(h => h.url);
        const missing = initialUrls
          .filter(u => !existingUrls.includes(u))
          .map(u => ({ id: `restored-${u}`, name: "Restored Image", url: u, progress: 100 }));
        return [...missing, ...prev];
      });
    }
  }, [initialUrls]); // eslint-disable-line react-hooks/exhaustive-deps

  // When maxImages changes, trim excess selections
  useEffect(() => {
    if (selectedEntries.length > maxImages) {
      const trimmed = selectedEntries.slice(0, maxImages);
      setSelectedEntries(trimmed);
      if (trimmed.length === 0) onClear?.();
    }
    if (fileInputRef.current) {
      fileInputRef.current.multiple = maxImages > 1;
    }
  }, [maxImages]); // eslint-disable-line react-hooks/exhaustive-deps

  const fireOnSelect = useCallback(
    (entries) => {
      if (!entries.length) return;
      const urls = entries.map((e) => e.url);
      onSelect({ url: urls[0], urls, thumbnail: entries[0].url });
    },
    [onSelect],
  );

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    e.target.value = "";

    const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
    const tooLarge = files.filter((f) => f.size > MAX_IMAGE_SIZE);
    if (tooLarge.length > 0) {
      toast.error(
        `The following images are too large (max 10MB): ${tooLarge.map((f) => f.name).join(", ")}`,
      );
      return;
    }

    setUploading(true);
    try {
      const toUpload =
        maxImages === 1
          ? files.slice(0, 1)
          : files.slice(0, maxImages - selectedEntries.length || 1);

      await Promise.all(
        toUpload.map(async (file) => {
          const id = Date.now().toString() + Math.random();

          // Add a placeholder to history immediately without local preview
          const placeholder = { id, name: file.name, url: null, progress: 0 };
          setUploadHistory((prev) => [placeholder, ...prev]);

          try {
            const uploadedUrl = await uploadFile(apiKey, file, (pct) => {
              setLastUploadProgress(pct);
              setUploadHistory((prev) =>
                prev.map((h) => (h.id === id ? { ...h, progress: pct } : h)),
              );
            });

            // Update history with real URL and Mark as 100%
            setUploadHistory((prev) =>
              prev.map((h) => {
                if (h.id === id) {
                  return { ...h, url: uploadedUrl, progress: 100 };
                }
                return h;
              }),
            );

            // Auto-select if there's room
            if (selectedEntries.length < maxImages) {
              const newEntry = { url: uploadedUrl };
              setSelectedEntries((prev) => [...prev, newEntry]);

              if (maxImages === 1) {
                fireOnSelect([newEntry]);
                setPanelOpen(false);
              }
            }
          } catch (err) {
            console.error("[UploadButton] Upload failed for", file.name, err);
            setUploadHistory((prev) => prev.filter((h) => h.id !== id));
            throw err;
          }
        }),
      );
    } catch (err) {
      toast.error(`Image upload failed: ${err.message}`);
    } finally {
      setUploading(false);
      setLastUploadProgress(0);
    }
  };

  const handleCellClick = (entry) => {
    const selIdx = selectedEntries.findIndex((e) => e.url === entry.url);
    const isSelected = selIdx !== -1;
    const atMax =
      maxImages > 1 && !isSelected && selectedEntries.length >= maxImages;
    if (atMax) return;

    if (maxImages === 1) {
      const newSelected = [{ url: entry.url, localUrl: entry.localUrl }];
      setSelectedEntries(newSelected);
      fireOnSelect(newSelected);
      setPanelOpen(false);
    } else {
      let next;
      if (isSelected) {
        next = selectedEntries.filter((_, i) => i !== selIdx);
        if (next.length === 0) onClear?.();
      } else {
        next = [
          ...selectedEntries,
          { url: entry.url, localUrl: entry.localUrl },
        ];
      }
      setSelectedEntries(next);
    }
  };

  const handleRemoveFromHistory = (e, entry) => {
    e.stopPropagation();
    if (entry.localUrl) URL.revokeObjectURL(entry.localUrl);
    setUploadHistory((prev) => prev.filter((h) => h.id !== entry.id));

    const next = selectedEntries.filter((s) => s.url !== entry.url);
    if (next.length !== selectedEntries.length) {
      setSelectedEntries(next);
      if (next.length === 0) onClear?.();
    }
  };

  const handleDone = (e) => {
    e.stopPropagation();
    fireOnSelect(selectedEntries);
    setPanelOpen(false);
  };

  const reset = () => {
    setSelectedEntries([]);
    setPanelOpen(false);
  };

  // expose reset via ref pattern — parent calls reset() directly
  // (handled by parent through uploadedImageUrls state reset)

  const isMulti = maxImages > 1;
  const count = selectedEntries.length;
  const hasSelection = count > 0;

  // Trigger icon content
  const triggerContent = uploading ? (
    <div className="flex flex-col items-center justify-center w-full h-full absolute inset-0 bg-white/90 z-20 backdrop-blur-[2px]">
      <svg className="w-8 h-8 -rotate-90">
        <circle
          cx="16"
          cy="16"
          r="14"
          stroke="currentColor"
          strokeWidth="2.2"
          fill="transparent"
          className="text-[#e6e7f0]"
        />
        <circle
          cx="16"
          cy="16"
          r="14"
          stroke="currentColor"
          strokeWidth="2.2"
          fill="transparent"
          strokeDasharray={88}
          strokeDashoffset={88 - (88 * lastUploadProgress) / 100}
          className="text-[#5b45f2] transition-all duration-300"
        />
      </svg>
      <span className="absolute text-[9px] font-bold text-[#5b45f2] leading-none">
        {lastUploadProgress}%
      </span>
    </div>
  ) : label === "Swap Face" ? (
    hasSelection ? (
      <img src={assetPreviewUrl(selectedEntries[0].url)} alt="" className="w-full h-full object-cover" />
    ) : (
      <span className="text-[10.5px] font-semibold text-[#5e5e72]">Face</span>
    )
  ) : (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.3"
      strokeLinecap="round"
      className="text-current transition-colors"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );

  const defaultLabel = isMulti ? `Add up to ${maxImages} images` : "Reference image";
  const triggerTitle = hasSelection
    ? count > 1
      ? `${count} of ${maxImages} images selected — click to manage`
      : isMulti
        ? `1 image selected — click to add more (up to ${maxImages})`
        : label || "Reference image"
    : label || defaultLabel;

  return (
    <div className="relative">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple={isMulti}
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        title={triggerTitle}
        onClick={(e) => {
          e.stopPropagation();
          setPanelOpen((o) => !o);
        }}
        className={promptMediaButtonClassName({
          active: hasSelection,
        })}
      >
        {triggerContent}
      </button>

      {/* Panel */}
      {panelOpen && (
        <PromptPopover
          ref={panelRef}
          onClick={(e) => e.stopPropagation()}
          className="w-96 max-w-[calc(100vw-2rem)]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-1 pb-3 mb-2.5 border-b border-[#efeff5]">
            <div className="flex flex-col gap-0.5">
              <span className="text-[13px] font-semibold text-[#14141f]">
                Reference Images
              </span>
              {isMulti && (
                <span className="text-[11px] text-[#7a7b90]">
                  Select up to {maxImages} images
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isMulti && hasSelection && (
                <button
                  type="button"
                  onClick={handleDone}
                  className="flex items-center gap-1 px-3 py-1.5 bg-[#5b45f2] hover:bg-[#4731d8] text-white rounded-xl text-[12px] font-semibold transition-all"
                >
                  ✓ Done ({count})
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPanelOpen(false);
                  fileInputRef.current?.click();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f2f0ff] hover:bg-[#e7e3ff] text-[#4c38d6] rounded-full text-[12px] font-semibold transition-all border border-[#ddd7fe]"
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                {isMulti ? "Upload files" : "Upload new"}
              </button>
            </div>
          </div>

          {/* Grid or empty state */}
          {uploadHistory.length === 0 ? (
            <div className="py-8 flex flex-col items-center gap-2 text-[#7a7b90]">
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span className="text-[12.5px] font-medium">No uploads yet</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto custom-scrollbar pr-0.5">
              {uploadHistory.map((entry) => {
                const selIdx = selectedEntries.findIndex(
                  (e) => e.url === entry.url,
                );
                const isSelected = selIdx !== -1;
                const atMax =
                  isMulti && !isSelected && selectedEntries.length >= maxImages;

                return (
                  <div
                    key={entry.id}
                    title={entry.name}
                    onClick={() => entry.url && handleCellClick(entry)}
                    className={`relative rounded-xl overflow-hidden border-2 cursor-pointer group/cell aspect-square transition-all bg-[#f3f4f8] ${
                      isSelected
                        ? "border-[#5b45f2] shadow-[0_4px_14px_rgba(91,69,242,0.2)]"
                        : "border-[#e6e7f0] hover:border-[#c8bffb]"
                    } ${atMax ? "opacity-40 cursor-not-allowed" : ""} ${!entry.url ? "cursor-wait" : ""}`}
                  >
                    {entry.url ? (
                      <img
                        src={assetPreviewUrl(entry.url)}
                        alt={entry.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-[#f6f6fa] flex flex-col items-center justify-center">
                        <div className="w-7 h-7 rounded-full border-2 border-[#ddd7fe] border-t-[#5b45f2] animate-spin mb-1" />
                        <span className="text-[10px] font-bold text-[#5b45f2]">
                          {entry.progress}%
                        </span>
                      </div>
                    )}

                    {/* Hover overlay with delete */}
                    {entry.url && (
                      <div className="absolute inset-0 bg-[#14141f]/45 opacity-0 group-hover/cell:opacity-100 transition-opacity flex items-end justify-end p-1.5">
                        <button
                          type="button"
                          title="Remove from history"
                          onClick={(e) => handleRemoveFromHistory(e, entry)}
                          className="w-5 h-5 bg-[#e11d48] hover:bg-[#be123c] rounded-md flex items-center justify-center transition-colors"
                        >
                          <svg
                            width="9"
                            height="9"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="white"
                            strokeWidth="3"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    )}

                    {/* Selection badge */}
                    {isSelected && (
                      <div className="absolute top-1.5 left-1.5 min-w-[20px] h-5 bg-[#5b45f2] rounded-full flex items-center justify-center px-1 shadow-sm ring-2 ring-white">
                        {isMulti ? (
                          <span className="text-[10px] font-bold text-white">
                            {selIdx + 1}
                          </span>
                        ) : (
                          <svg
                            width="10"
                            height="10"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="white"
                            strokeWidth="3.5"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Bottom bar for multi-select */}
          {isMulti && hasSelection && (
            <div className="mt-3 pt-3 border-t border-[#efeff5] flex items-center justify-between">
              <span className="text-[12px] text-[#5e5e72]">
                {count} of {maxImages} selected
              </span>
              <button
                type="button"
                onClick={handleDone}
                className="px-4 py-1.5 bg-[#5b45f2] hover:bg-[#4731d8] text-white rounded-xl text-[12px] font-semibold transition-all"
              >
                Use Selected
              </button>
            </div>
          )}
        </PromptPopover>
      )}
    </div>
  );
}

// ─── ModelDropdown ────────────────────────────────────────────────────────────

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
        ...openRouterT2IModels.map((model) => ({ model, category: "t2i" })),
        ...openRouterI2IModels.map((model) => ({ model, category: "i2i" })),
      ],
    },
    {
      id: "t2i",
      label: "Text to Image",
      entries: openRouterT2IModels.map((model) => ({ model, category: "t2i" })),
    },
    {
      id: "i2i",
      label: "Image to Image",
      entries: openRouterI2IModels.map((model) => ({ model, category: "i2i" })),
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
      case "leonardoai":
        return { text: "LE", bg: "bg-violet-500/10 text-violet-400 border-violet-500/25" };
      case "stability":
        return { text: "SD", bg: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/25" };
      default:
        const name = provider ? provider.toUpperCase() : "AI";
        return { text: name.substring(0, 2), bg: "bg-primary/10 text-primary border-primary/25" };
    }
  };

  // Dynamically compute list of providers from the input models list
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

  const filtered = modelEntries.filter(({ model: m }) => {
    // 1. Filter by provider tab
    if (selectedProvider !== "all") {
      const pId = m.provider || 'muapi';
      if (pId !== selectedProvider) return false;
    }
    // 2. Filter by search query
    const query = search.toLowerCase();
    return (
      m.name.toLowerCase().includes(query) ||
      m.id.toLowerCase().includes(query)
    );
  });

  const invertLogos = ['openai', 'blackforest', 'runway', 'ideogram', 'lightricks', 'grok'];

  return (
    <div className="flex gap-3.5 h-full max-h-[60vh] min-h-[340px] overflow-x-hidden">
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

      {/* Right Pane: Search input + Models list */}
      <div className="flex-1 flex flex-col gap-2 min-w-0">
        <div className="border-b border-[#efeff5] shrink-0 pb-2.5 space-y-2">
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
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-transparent border-none text-[12.5px] text-[#14141f] placeholder:text-[#8a8b9e] focus:ring-0 w-full p-0 focus:outline-none"
            />
          </div>
        </div>
        
        <div className="text-[11.5px] font-semibold text-[#5e5e72] py-0.5 shrink-0 flex items-center justify-between">
          <span>{activeCategory.label} models</span>
          {selectedProvider !== "all" && (
            <span className="text-[10.5px] bg-[#f2f0ff] text-[#4c38d6] px-2 py-0.5 rounded-md font-medium">
              {availableProviders.find(p => p.id === selectedProvider)?.name || selectedProvider}
            </span>
          )}
        </div>
        
        <div className="flex flex-col gap-1 overflow-y-auto custom-scrollbar pr-1 pb-2 flex-1">
          {filtered.length === 0 ? (
            <div className="text-[12.5px] text-[#7a7b90] text-center py-6">
              No models found
            </div>
          ) : (
            filtered.map(({ model: m, category }) => (
              <div
                key={`${category}:${m.id}`}
                ref={selectedModel === m.id ? activeItemRef : null}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(m, category);
                  onClose();
                }}
                className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all border ${
                  selectedModel === m.id
                    ? "bg-[#f2f0ff] border-[#ddd7fe]"
                    : "border-transparent hover:bg-[#f6f6fa]"
                }`}
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
                    <div className="w-8 h-8 bg-[#f2f0ff] text-[#4c38d6] border border-[#ddd7fe] rounded-xl flex items-center justify-center font-bold text-xs uppercase shrink-0">
                      {m.name.charAt(0)}
                    </div>
                  )}
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className={`text-[12.5px] font-semibold tracking-tight truncate ${selectedModel === m.id ? "text-[#4c38d6]" : "text-[#14141f]"}`}>
                      {m.name}
                    </span>
                    {selectedProvider === "all" && m.provider_name && (
                      <span className="text-[10.5px] text-[#7a7b90] truncate">
                        {m.provider_name}
                      </span>
                    )}
                  </div>
                </div>
                {selectedModel === m.id && (
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#5b45f2"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── SimpleDropdown ───────────────────────────────────────────────────────────

function SimpleDropdown({ title, options, selected, onSelect, onClose }) {
  return (
    <>
      <PromptPopoverHeader>{title}</PromptPopoverHeader>
      <PromptMenuList>
        {options.map((opt) => (
          <PromptMenuItem
            key={opt}
            selected={selected === opt}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(opt);
              onClose();
            }}
          >
            {opt}
          </PromptMenuItem>
        ))}
      </PromptMenuList>
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ImageStudio({
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
  historyItems,
  droppedFiles,
  onFilesHandled,
}) {
  const LEGACY_PERSIST_KEY = "hg_image_studio_persistent";
  const PERSIST_KEY = scopedPersistKey(LEGACY_PERSIST_KEY, persistScope || apiKey);
  useEffect(() => {
    if (!persistScope) migrateLegacyPersistKey(LEGACY_PERSIST_KEY, PERSIST_KEY);
  }, [PERSIST_KEY]);

  // ── Model / mode state ──────────────────────────────────────────────────
  const [imageMode, setImageMode] = useState(false); // false=t2i, true=i2i
  const [selectedModelId, setSelectedModelId] = useState(openRouterT2IModels[0].id);
  const [selectedModelName, setSelectedModelName] = useState(openRouterT2IModels[0].name);
  const [selectedAr, setSelectedAr] = useState("9:16");
  const [selectedQuality, setSelectedQuality] = useState(() => {
    const resolutions = getResolutionsForModel(openRouterT2IModels[0].id);
    return resolutions[0] || null;
  });
  const [selectedEffect, setSelectedEffect] = useState("");
  const [maxImages, setMaxImages] = useState(1);
  const [seed, setSeed] = useState(null); // last-used seed, shown for reuse
  const [seedLocked, setSeedLocked] = useState(false); // when true, reuse `seed` instead of randomizing

  // ── Prompt / upload state ───────────────────────────────────────────────
  const [prompt, setPrompt] = useState(initialPrompt);
  useEffect(() => {
    if (initialPrompt) setPrompt(initialPrompt);
  }, [initialPrompt]);
  const [uploadedImageUrls, setUploadedImageUrls] = useState([]);
  const [swapImageUrl, setSwapImageUrl] = useState(null);
  const [uploadHistory, setUploadHistory] = useState([]); // persisted reference images history

  // ── UI state ────────────────────────────────────────────────────────────
  const [dropdownOpen, setDropdownOpen] = useState(null); // 'model' | 'ar' | 'quality' | null
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [fullscreenUrl, setFullscreenUrl] = useState(null);
  const [isDrawModalOpen, setIsDrawModalOpen] = useState(false);

  // ── Canvas / history state ──────────────────────────────────────────────
  const [currentImageUrl, setCurrentImageUrl] = useState(null);
  const [activeHistoryIdx, setActiveHistoryIdx] = useState(0);
  const [batchSize, setBatchSize] = useState(1);
  const [localHistory, setLocalHistory] = useState([]); // [{id,url,prompt,model,aspect_ratio,timestamp}]

  // Use prop history if provided, otherwise local
  // Signed-in accounts read their history from the server; deleting hides an entry here.
  const serverHistory = useServerHistory("image", { enabled: !persistScope });
  const HIDDEN_KEY = `${PERSIST_KEY}:hidden-history`;
  const [hiddenHistoryIds, setHiddenHistoryIds] = useState(() => {
    try { return JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]"); } catch { return []; }
  });
  const history = historyItems ?? mergeHistory(serverHistory.entries, localHistory, hiddenHistoryIds);
  const removeHistoryEntry = (entry) => {
    const key = entry.id || entry.url;
    setLocalHistory((prev) => prev.filter((e) => (e.id || e.url) !== key));
    setHiddenHistoryIds((prev) => {
      const next = [...new Set([...prev, key])].slice(-500);
      try { localStorage.setItem(HIDDEN_KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
      return next;
    });
  };

  // ── Refs ────────────────────────────────────────────────────────────────
  const textareaRef = useRef(null);
  const dropdownRef = useRef(null);
  const uploadPickerResetRef = useRef(null); // not used directly — managed via key

  // ── Close dropdown on outside click ─────────────────────────────────────
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(null);
      }
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [dropdownOpen]);

  // ── Persistence: Load ────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PERSIST_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.imageMode !== undefined) setImageMode(data.imageMode);
        if (data.selectedModelId) setSelectedModelId(data.selectedModelId);
        if (data.selectedModelName) setSelectedModelName(data.selectedModelName);
        if (data.selectedAr && data.selectedAr !== "Auto") setSelectedAr(data.selectedAr);
        if (data.selectedQuality) setSelectedQuality(data.selectedQuality);
        if (data.selectedEffect) setSelectedEffect(data.selectedEffect);
        if (data.maxImages) setMaxImages(data.maxImages);
        if (data.prompt) setPrompt(data.prompt);
        if (data.uploadedImageUrls) setUploadedImageUrls(data.uploadedImageUrls);
        if (data.uploadHistory) setUploadHistory(data.uploadHistory);
        if (data.batchSize) setBatchSize(data.batchSize);
      }
    } catch (err) {
      console.warn("Failed to load ImageStudio persistence:", err);
    }
  }, []);

  useEffect(() => {
    if (!restoredWork) return;
    const { settings, jobs } = restoredWork;
    const model = [...openRouterT2IModels, ...openRouterI2IModels].find(item => item.id === settings.selectedModelId);
    const mode = settings.mode || (model && openRouterI2IModels.some(item => item.id === model.id) ? 'i2i' : 't2i');
    if (model) {
      setImageMode(mode === 'i2i');
      setSelectedModelId(model.id);
      setSelectedModelName(model.name);
    }
    setPrompt(settings.prompt || jobs[0]?.prompt || '');
    setSelectedAr(settings.selectedAr || jobs[0]?.parameters?.aspectRatio || '9:16');
    if (settings.selectedQuality) setSelectedQuality(settings.selectedQuality);
    if (settings.selectedEffect) setSelectedEffect(settings.selectedEffect);
    setUploadedImageUrls(jobs[0]?.parameters?.referenceImages || []);
    const entries = jobs.filter(job => job.asset_id).map(job => ({
      id: job.id,
      url: '/api/assets/' + job.asset_id + '/download?workspace_id=' + projectWorkspace,
      prompt: job.prompt,
      model: job.model,
      aspect_ratio: job.parameters?.aspectRatio,
      timestamp: job.created_at,
    }));
    setLocalHistory(entries);
    setCurrentImageUrl(entries[0]?.url || null);
    setActiveHistoryIdx(0);
  }, [restoredWork, projectWorkspace]);

  // ── Adjust height on load ────────────────────────────────────────────────
  // ── Persistence: Save ────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const state = {
          imageMode,
          selectedModelId,
          selectedModelName,
          selectedAr,
          selectedQuality,
          selectedEffect,
          maxImages,
          prompt,
          uploadedImageUrls,
          uploadHistory,
          batchSize,
        };
        localStorage.setItem(PERSIST_KEY, JSON.stringify(state));
      } catch (err) {
        console.warn("Failed to save ImageStudio persistence:", err);
      }
    }, 500); // 500ms debounce
    return () => clearTimeout(timer);
  }, [
    imageMode,
    selectedModelId,
    selectedModelName,
    selectedAr,
    selectedQuality,
    selectedEffect,
    maxImages,
    prompt,
    uploadedImageUrls,
    uploadHistory,
    batchSize,
  ]);

  const processDroppedImages = async (files) => {
    const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
    const tooLarge = files.filter((f) => f.size > MAX_IMAGE_SIZE);
    if (tooLarge.length > 0) {
      toast.error(
        `The following images are too large (max 10MB): ${tooLarge.map((f) => f.name).join(", ")}`
      );
      return;
    }

    setGenerating(true); // Show as generating/busy
    try {
      const toUpload =
        maxImages === 1 ? files.slice(0, 1) : files.slice(0, maxImages);
      const urls = await Promise.all(
        toUpload.map(async (file) => {
          try {
            return await uploadFile(apiKey, file);
          } catch (err) {
            console.error(
              "[ImageStudio] Drop upload failed for",
              file.name,
              err
            );
            throw err;
          }
        })
      );

      handleUploadSelect({ urls });
    } catch (err) {
      toast.error(`Image upload failed: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  };

  // ── Handle Dropped Files ────────────────────────────────────────────────
  useEffect(() => {
    if (droppedFiles && droppedFiles.length > 0) {
      const imageFiles = droppedFiles.filter(f => f.type.startsWith('image/'));
      if (imageFiles.length > 0) {
        processDroppedImages(imageFiles);
      }
      onFilesHandled?.();
    }
  }, [droppedFiles, onFilesHandled, processDroppedImages]);

  // ── Derived: current model lists & helpers ───────────────────────────────
  const currentModels = imageMode ? openRouterI2IModels : openRouterT2IModels;
  const currentAspectRatios = imageMode
    ? getAspectRatiosForI2IModel(selectedModelId)
    : getAspectRatiosForModel(selectedModelId);
  const currentResolutions = imageMode
    ? getResolutionsForI2IModel(selectedModelId)
    : getResolutionsForModel(selectedModelId);
  const currentQualityField = imageMode
    ? getQualityFieldForI2IModel(selectedModelId)
    : getQualityFieldForModel(selectedModelId);
  const showQualityBtn = currentResolutions.length > 0;
  const currentEffects = imageMode ? getEffectsForI2IModel(selectedModelId) : [];
  const showEffectBtn = currentEffects.length > 0;

  // ── Textarea auto-resize ─────────────────────────────────────────────────
  // ── Upload picker callbacks ──────────────────────────────────────────────
  const handleUploadSelect = useCallback(
    ({ url, urls }) => {
      const newUrls = urls || [url];
      setUploadedImageUrls(newUrls);

      if (!imageMode) {
        // Find the i2i sibling of the currently selected t2i model.
        // Many models follow conventions, but some have completely irregular names —
        // those are handled via a hardcoded exceptions map.
        const curId = selectedModelId;
        const i2iIds = new Set(openRouterI2IModels.map((m) => m.id));

        // Hardcoded exceptions for models with irregular t2i → i2i naming
        const EXCEPTIONS = {
          'reve-text-to-image':          'reve-image-edit',
          'wan2.1-text-to-image':        'wan2.5-image-edit',   // no wan2.1 i2i — closest
          'wan2.5-text-to-image':        'wan2.5-image-edit',
          'wan2.6-text-to-image':        'wan2.6-image-edit',
          'kling-o1-text-to-image':      'kling-o1-edit-image',
          'vidu-q2-text-to-image':       'vidu-q2-reference-to-image',
          'bytedance-seedream-v3':       'bytedance-seededit-v3',
          'bytedance-seedream-v4':       'bytedance-seedream-edit-v4',
          'seedream-4.5-unfiltered':      'seedream-4.5-unfiltered-edit',
          'seedream-5.0-lite-unfiltered': 'seedream-5.0-lite-unfiltered-edit',
          'ideogram-v3-t2i':             'ideogram-v3-reframe',
        };

        const findI2I = (id) => openRouterI2IModels.find((m) => m.id === id) ?? null;

        const target =
          // 0. Hardcoded exceptions for irregular names
          findI2I(EXCEPTIONS[curId]) ||
          // 1. Model exists directly in i2i list (e.g. qwen-text-to-image-2512, flux-pulid, flux-redux)
          findI2I(curId) ||
          // 2. {id}-edit suffix (e.g. nano-banana → nano-banana-edit, gpt-image-1.5 → gpt-image-1.5-edit)
          findI2I(`${curId}-edit`) ||
          // 3. -t2i → -i2i (e.g. flux-kontext-dev-t2i → flux-kontext-dev-i2i)
          (curId.includes('-t2i') && findI2I(curId.replace('-t2i', '-i2i'))) ||
          // 4. text-to-image → image-to-image (e.g. gpt4o-text-to-image, midjourney-v7, grok-imagine)
          (curId.includes('text-to-image') && findI2I(curId.replace('text-to-image', 'image-to-image'))) ||
          // 5. Prefix match fallback (e.g. minimax-image-01 → minimax-image-01-subject-reference)
          openRouterI2IModels.find((m) => m.id.startsWith(curId)) ||
          // 6. No sibling exists — use first i2i model
          openRouterI2IModels[0];

        const ars = getAspectRatiosForI2IModel(target.id);
        const resolutions = getResolutionsForI2IModel(target.id);
        const effects = getEffectsForI2IModel(target.id);
        setImageMode(true);
        setSelectedModelId(target.id);
        setSelectedModelName(target.name);
        setSelectedAr(ars[0] || "9:16");
        setSelectedQuality(resolutions[0] || null);
        setSelectedEffect(effects.length > 0 ? (getDefaultEffectForI2IModel(target.id) || effects[0]) : "");
        setMaxImages(getMaxImagesForI2IModel(target.id));
      }
    },
    [imageMode, selectedModelId],
  );

  const handleUploadClear = useCallback(() => {
    setUploadedImageUrls([]);
    setImageMode(false);

    // Find the t2i parent of the currently selected i2i model (reverse of upload logic)
    const curId = selectedModelId;
    const findT2I = (id) => id ? (openRouterT2IModels.find((m) => m.id === id) ?? null) : null;

    // Reverse exceptions map (i2i → t2i for irregular names)
    const REVERSE_EXCEPTIONS = {
      'reve-image-edit':               'reve-text-to-image',
      'wan2.5-image-edit':             'wan2.5-text-to-image',
      'wan2.6-image-edit':             'wan2.6-text-to-image',
      'kling-o1-edit-image':           'kling-o1-text-to-image',
      'vidu-q2-reference-to-image':    'vidu-q2-text-to-image',
      'bytedance-seededit-v3':         'bytedance-seedream-v3',
      'bytedance-seedream-edit-v4':    'bytedance-seedream-v4',
      'seedream-4.5-unfiltered-edit':   'seedream-4.5-unfiltered',
      'seedream-5.0-lite-unfiltered-edit': 'seedream-5.0-lite-unfiltered',
      'ideogram-v3-reframe':           'ideogram-v3-t2i',
    };

    const target =
      // 0. Hardcoded reverse exceptions
      findT2I(REVERSE_EXCEPTIONS[curId]) ||
      // 1. Model exists directly in t2i list (e.g. qwen-text-to-image-2512, flux-pulid, flux-redux)
      findT2I(curId) ||
      // 2. Strip -edit suffix (e.g. nano-banana-edit → nano-banana, gpt-image-1.5-edit → gpt-image-1.5)
      (curId.endsWith('-edit') && findT2I(curId.slice(0, -5))) ||
      // 3. -i2i → -t2i (e.g. flux-kontext-dev-i2i → flux-kontext-dev-t2i)
      (curId.includes('-i2i') && findT2I(curId.replace('-i2i', '-t2i'))) ||
      // 4. image-to-image → text-to-image (e.g. gpt4o-image-to-image → gpt4o-text-to-image)
      (curId.includes('image-to-image') && findT2I(curId.replace('image-to-image', 'text-to-image'))) ||
      // 5. No parent found — use first t2i model
      openRouterT2IModels[0];

    const ars = getAspectRatiosForModel(target.id);
    const resolutions = getResolutionsForModel(target.id);
    setSelectedModelId(target.id);
    setSelectedModelName(target.name);
    setSelectedAr(ars[0] || "9:16");
    setSelectedQuality(resolutions[0] || null);
    setSelectedEffect("");
    setMaxImages(1);
  }, [selectedModelId]);

  // ── Model selection ──────────────────────────────────────────────────────
  const handleModelSelect = (m, category = imageMode ? "i2i" : "t2i") => {
    const nextImageMode = category === "i2i";
    const ars = nextImageMode
      ? getAspectRatiosForI2IModel(m.id)
      : getAspectRatiosForModel(m.id);
    const resolutions = nextImageMode
      ? getResolutionsForI2IModel(m.id)
      : getResolutionsForModel(m.id);
    if (!nextImageMode && imageMode) {
      setUploadedImageUrls([]);
      setSwapImageUrl(null);
    }
    setImageMode(nextImageMode);
    setSelectedModelId(m.id);
    setSelectedModelName(m.name);
    setSelectedAr(ars[0] || "9:16");
    setSelectedQuality(resolutions[0] || null);
    setSwapImageUrl(null);
    if (nextImageMode) {
      setMaxImages(getMaxImagesForI2IModel(m.id));
      const effects = getEffectsForI2IModel(m.id);
      setSelectedEffect(effects.length > 0 ? (getDefaultEffectForI2IModel(m.id) || effects[0]) : "");
    } else {
      setMaxImages(1);
      setSelectedEffect("");
    }
  };

  // ── History helpers ──────────────────────────────────────────────────────
  const appliedSelection = useRef(null);
  useEffect(() => {
    if (!homeSelection || appliedSelection.current === homeSelection) return;
    appliedSelection.current = homeSelection;
    const model = openRouterT2IModels.find(item => item.id === homeSelection.modelId);
    if (model) handleModelSelect(model, 't2i');
  }, [homeSelection, handleModelSelect]);

  const addToHistory = useCallback(
    (entry) => {
      if (!historyItems) {
        setLocalHistory((prev) => [entry, ...prev.slice(0, 49)]);
        serverHistory.refresh();
      }
      setActiveHistoryIdx(0);
      setCurrentImageUrl(entry.url);
    },
    [historyItems, serverHistory.refresh], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // ── View state ─────────────────────────────────────

  const resetToPrompt = () => {
    setCurrentImageUrl(null);
    setPrompt("");
    setUploadedImageUrls([]);
    setImageMode(false);
    const firstT2I = openRouterT2IModels[0];
    const ars = getAspectRatiosForModel(firstT2I.id);
    const resolutions = getResolutionsForModel(firstT2I.id);
    setSelectedModelId(firstT2I.id);
    setSelectedModelName(firstT2I.name);
    setSelectedAr(ars[0] || "9:16");
    setSelectedQuality(resolutions[0] || null);
    setSelectedEffect("");
    setMaxImages(1);
  };


  // Same pricing as the server reservation: one job per image, so the
  // button shows the per-image price times the batch.
  const pricePerImage = useGenerationPrice({
    kind: "image",
    model: OPENROUTER_IMAGE_MODEL_MAP[selectedModelId] || selectedModelId,
    parameters: {
      resolution: currentQualityField === "resolution" ? selectedQuality : undefined,
      referenceImages: imageMode ? uploadedImageUrls.length : 0,
    },
    promptLength: prompt.trim().length,
  });
  const batchCredits = pricePerImage === null ? null : pricePerImage * batchSize;

  // ── Generation ───────────────────────────────────────────────────────────
  const randomSeed = () => Math.floor(Math.random() * 2147483647);

  const handleGenerate = async () => {
    if (beforeGenerate && !beforeGenerate()) return;
    if (generating) return;

    if (imageMode) {
      if (uploadedImageUrls.length === 0) {
        toast.error("Please upload a reference image first.");
        return;
      }
      const modelInfo = getI2IModelById(selectedModelId);
      if (modelInfo?.swapField && !swapImageUrl) {
        toast.error("Please upload a swap face image.");
        return;
      }
    } else {
      if (!prompt.trim()) {
        toast.error("Please enter a prompt to generate an image.");
        return;
      }
    }

    onGenerationStart?.();
    setGenerating(true);
    setGenerateError(null);

    // Seed each batch item: locked reuses the same seed for reproducibility,
    // otherwise every item gets its own random seed so re-generating a good
    // one later (via lock) is possible instead of pure luck.
    const lockedSeed = seedLocked ? (seed ?? randomSeed()) : null;
    const batchSeeds = Array.from({ length: batchSize }).map(() => lockedSeed ?? randomSeed());

    try {
      const workspaceId = typeof window !== "undefined" ? window.sessionStorage.getItem("nexoclip_workspace_id") : null;
      const results = await Promise.all(
        batchSeeds.map((batchSeed) => {
          const parameters = {
            aspectRatio: selectedAr,
            seed: batchSeed,
            ...(currentQualityField && selectedQuality ? { [currentQualityField]: selectedQuality } : {}),
            ...(imageMode && uploadedImageUrls.length ? { referenceImages: uploadedImageUrls } : {}),
          };
          // These legacy model-specific fields are retained in the job parameters for
          // adapters that support them; the provider router ignores unsupported fields.
          if (swapImageUrl) parameters.swap_url = swapImageUrl;
          if (showEffectBtn && selectedEffect) parameters.name = selectedEffect;
          return generateSaasImage({
            workspace_id: workspaceId,
            studioWork: studioWork?.({ prompt: prompt.trim(), selectedModelId, selectedAr, mode: imageMode ? 'i2i' : 't2i', selectedQuality: selectedQuality || '', selectedEffect }),
            model: selectedModelId,
            prompt: prompt.trim(),
            parameters,
            idempotencyKey: crypto.randomUUID(),
          });
        }),
      );
      setSeed(batchSeeds[batchSeeds.length - 1]);

      results.forEach((res) => {
        const output = res?.outputs?.[0];
        const outputUrl = res?.url || output?.url;
        if (outputUrl) {
          const entry = {
            id: res.id || res.providerRequestId || Math.random().toString(36).substring(7),
            url: outputUrl,
            prompt: prompt.trim(),
            model: selectedModelId,
            aspect_ratio: selectedAr,
            timestamp: new Date().toISOString(),
          };
          addToHistory(entry);
          onGenerationComplete?.({
            url: outputUrl,
            model: selectedModelId,
            prompt: prompt.trim(),
            type: "image",
          });
        }
      });
    } catch (e) {
      console.error("[ImageStudio] Generation failed:", e);
      const errMsg = formatErrorMessage(e, "Image generation failed");
      if (onGenerationError) onGenerationError(errMsg);
      else toast.error(errMsg);
    } finally {
      setGenerating(false);
      onGenerationEnd?.();
    }
  };

  const placeholderText =
    uploadedImageUrls.length > 1
      ? `${uploadedImageUrls.length} images selected — describe the transformation (optional)`
      : imageMode
        ? "Describe how to transform this image (optional)"
        : "Describe the image you want to create";

  const IMAGE_STARTERS = [
    "Editorial studio product photo of an iced matcha bottle on frosted glass, morning sunlight",
    "Minimalist skincare campaign portrait, soft diffused lighting, crisp 85mm lens",
    "Architectural modern coffee bar interior with warm oak and brushed steel",
    "Isometric 3D luxury perfume packaging floating on clean alabaster backdrop",
  ];

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-transparent relative px-4 md:px-6 overflow-hidden">
      
      {/* ── CENTRAL GALLERY AREA ── */}
      <div className="flex-1 w-full max-w-7xl mx-auto overflow-y-auto custom-scrollbar pb-48 lg:pb-44 px-1">
        {history.length === 0 && !serverHistory.loading && (
          <div className="pt-4">
            <DurableJobHistory kind="image" onSelect={(it) => setFullscreenUrl(it.url)} />
          </div>
        )}
        {history.length === 0 && serverHistory.loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 w-full pt-6" role="status" aria-label="Loading generated images">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div key={idx} className="rounded-2xl overflow-hidden border border-[#e6e7f0] bg-white shadow-[0_2px_10px_rgba(20,20,31,0.03)]">
                <div className="w-full aspect-square nx-skel" style={{ borderRadius: 0 }} />
                <div className="p-3.5 space-y-2.5">
                  <div className="nx-skel h-3.5 w-4/5" />
                  <div className="flex items-center gap-2">
                    <div className="nx-skel nx-skel--pill h-5 w-20" />
                    <div className="nx-skel h-3 w-10" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : history.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5 w-full pt-6 animate-fade-in-up">
            {history.map((entry, idx) => (
              <div
                key={entry.id || idx}
                className="relative group rounded-2xl overflow-hidden border border-[#e6e7f0] bg-white shadow-[0_2px_10px_rgba(20,20,31,0.04)] hover:border-[#c8bffb] hover:shadow-[0_14px_30px_rgba(20,20,31,0.08)] transition-all duration-200 flex flex-col cursor-pointer"
                onClick={() => setFullscreenUrl(entry.url)}
              >
                <div className="relative w-full aspect-square bg-[#f3f4f8] overflow-hidden">
                  <img
                    src={assetPreviewUrl(entry.url)}
                    alt={entry.prompt?.substring(0, 30) || "Generated image"}
                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                  />
                </div>
                
                {/* Overlay actions */}
                <div className="absolute top-2.5 right-2.5 hidden md:flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <GenerationCopyButtons
                    prompt={entry.prompt}
                    imageUrl={entry.url}
                    onCopyError={onGenerationError}
                  />
                  <button
                    type="button"
                    title="Download"
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadImage(entry.url, `muapi-${entry.id || idx}.jpg`);
                    }}
                    className="w-8 h-8 flex items-center justify-center bg-[#14141f]/75 backdrop-blur-md rounded-full text-white hover:bg-[#5b45f2] hover:border-[#5b45f2] transition-all border border-white/15"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                    </svg>
                  </button>
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
                  imageUrl={entry.url}
                  onCopyError={onGenerationError}
                  actions={[
                    {
                      kind: "download",
                      label: "Download",
                      onSelect: () =>
                        downloadImage(entry.url, `muapi-${entry.id || idx}.jpg`),
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
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[11px] font-semibold text-[#4c38d6] px-2 py-0.5 bg-[#f2f0ff] rounded-md border border-[#ddd7fe] capitalize truncate">
                        {entry.model?.replace(/-/g, " ") || "Image Studio"}
                      </span>
                      {entry.aspect_ratio && (
                        <span className="text-[11px] font-medium text-[#7a7b90] shrink-0">{entry.aspect_ratio}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full animate-fade-in-up min-h-[56vh] px-4 py-10">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e4e2f0] bg-white/90 px-3.5 py-1 text-[11.5px] font-semibold text-[#5b45f2] shadow-[0_2px_8px_rgba(20,20,31,0.04)] mb-4">
              Image Studio · {imageMode ? "Image to Image" : "Text to Image"}
            </span>
            <h1 className="text-[30px] sm:text-[40px] font-semibold tracking-[-0.03em] text-[#14141f] text-center leading-tight mb-3">
              {selectedModelName}
            </h1>
            <p className="text-[#5e5e72] text-[14.5px] text-center max-w-lg leading-relaxed mb-7">
              Describe a scene, product shot, portrait, or visual concept — and render high-resolution frames in seconds.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 max-w-2xl">
              {IMAGE_STARTERS.map((idea) => (
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
          </div>
        )}
      </div>

      {/* ── BOTTOM PROMPT BAR ── */}
      <PromptComposer>
          {/* Top row: upload picker + textarea */}
          <div className="flex flex-col gap-3">
            {/* Inline list of uploaded files */}
            <div className="flex items-center gap-2.5 flex-wrap">
              {uploadedImageUrls && uploadedImageUrls.length > 0 && uploadedImageUrls.map((url, idx) => (
                <div key={url} className={PROMPT_MEDIA_PREVIEW_CLASS}>
                  <img src={assetPreviewUrl(url)} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => {
                      const next = uploadedImageUrls.filter((_, i) => i !== idx);
                      setUploadedImageUrls(next);
                      if (next.length === 0) handleUploadClear();
                    }}
                    className="absolute top-0.5 right-0.5 w-4 h-4 bg-[#14141f]/75 hover:bg-[#14141f] rounded-full flex items-center justify-center text-white text-[9px]"
                  >
                    ×
                  </button>
                </div>
              ))}
              
              {/* Main Upload Trigger */}
              {uploadedImageUrls.length < maxImages && (
                <UploadButton
                  apiKey={apiKey}
                  maxImages={maxImages}
                  onSelect={handleUploadSelect}
                  onClear={handleUploadClear}
                  initialUrls={uploadedImageUrls}
                  persistedHistory={uploadHistory}
                  onHistoryChange={setUploadHistory}
                />
              )}

              {/* Swap Image Upload Trigger */}
              {imageMode && getI2IModelById(selectedModelId)?.swapField && (
                <UploadButton
                  apiKey={apiKey}
                  maxImages={1}
                  onSelect={({ urls }) => setSwapImageUrl(urls[0] || null)}
                  onClear={() => setSwapImageUrl(null)}
                  initialUrls={swapImageUrl ? [swapImageUrl] : []}
                  label="Swap Face"
                />
              )}
            </div>

            {/* Input prompt text area */}
            <PromptTextarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={placeholderText}
            />
          </div>

          {/* Bottom row: controls + generate */}
          <PromptFooter>
            {/* Left controls */}
            <PromptControls ref={dropdownRef}>
              {/* Model button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDropdownOpen((o) => (o === "model" ? null : "model"));
                  }}
                  className={promptControlClassName({
                    active: dropdownOpen === "model",
                  })}
                >
                  <div className="w-4 h-4 rounded overflow-hidden shrink-0 flex items-center justify-center bg-white border border-[#e6e7f0]">
                    {(() => {
                      const selectedModelObj = currentModels.find(m => m.id === selectedModelId);
                      const selectedModelProvider = selectedModelObj?.provider || 'muapi';
                      return PROVIDER_LOGOS[selectedModelProvider] ? (
                        <img 
                          src={PROVIDER_LOGOS[selectedModelProvider]} 
                          alt="" 
                          className="w-full h-full object-contain p-0.5" 
                        />
                      ) : (
                        <span className="text-[9px] font-bold text-[#4c38d6] uppercase">G</span>
                      );
                    })()}
                  </div>
                  <span className={PROMPT_CONTROL_LABEL_CLASS}>
                    {selectedModelName}
                  </span>
                  <PromptChevronIcon />
                </button>

                {dropdownOpen === "model" && (
                  <PromptPopover
                    onClick={(e) => e.stopPropagation()}
                    className="w-[calc(100vw-2rem)] md:w-[480px] max-w-md md:max-w-none max-h-[70vh]"
                  >
                    <PromptPopoverHeader>Model</PromptPopoverHeader>
                    <ModelDropdown
                      selectedModel={selectedModelId}
                      onSelect={handleModelSelect}
                      onClose={() => setDropdownOpen(null)}
                    />
                  </PromptPopover>
                )}
              </div>

              {/* Aspect ratio button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDropdownOpen((o) => (o === "ar" ? null : "ar"));
                  }}
                  className={promptControlClassName({
                    active: dropdownOpen === "ar",
                  })}
                >
                  <PromptAspectRatioIcon />
                  <span className={PROMPT_CONTROL_LABEL_CLASS}>
                    {selectedAr}
                  </span>
                </button>

                {dropdownOpen === "ar" && (
                  <PromptPopover
                    onClick={(e) => e.stopPropagation()}
                  >
                    <SimpleDropdown
                      title="Aspect Ratio"
                      options={currentAspectRatios}
                      selected={selectedAr}
                      onSelect={(val) => setSelectedAr(val)}
                      onClose={() => setDropdownOpen(null)}
                    />
                  </PromptPopover>
                )}
              </div>

              {/* Quality/resolution button */}
              {showQualityBtn && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDropdownOpen((o) => (o === "quality" ? null : "quality"));
                    }}
                    className={promptControlClassName({
                      active: dropdownOpen === "quality",
                    })}
                  >
                    <PromptQualityIcon />
                    <span className={PROMPT_CONTROL_LABEL_CLASS}>
                      {selectedQuality || currentResolutions[0]}
                    </span>
                  </button>

                  {dropdownOpen === "quality" && (
                    <PromptPopover
                      onClick={(e) => e.stopPropagation()}
                    >
                      <SimpleDropdown
                        title="Resolution"
                        options={currentResolutions}
                        selected={selectedQuality}
                        onSelect={(val) => setSelectedQuality(val)}
                        onClose={() => setDropdownOpen(null)}
                      />
                    </PromptPopover>
                  )}
                </div>
              )}

              {/* Effect type button */}
              {showEffectBtn && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDropdownOpen((o) => (o === "effect" ? null : "effect"));
                    }}
                    className={promptControlClassName({
                      active: dropdownOpen === "effect",
                    })}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="opacity-65">
                      <path d="M5 3l14 9-14 9V3z" />
                    </svg>
                    <span className={`${PROMPT_CONTROL_LABEL_CLASS} max-w-[140px] truncate`}>
                      {selectedEffect || "Effect"}
                    </span>
                  </button>

                  {dropdownOpen === "effect" && (
                    <PromptPopover
                      onClick={(e) => e.stopPropagation()}
                      className="min-w-[200px]"
                    >
                      <SimpleDropdown
                        title="Effect Type"
                        options={currentEffects}
                        selected={selectedEffect}
                        onSelect={(val) => setSelectedEffect(val)}
                        onClose={() => setDropdownOpen(null)}
                      />
                    </PromptPopover>
                  )}
                </div>
              )}

              {/* Seed button */}
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDropdownOpen((o) => (o === "seed" ? null : "seed"));
                  }}
                  className={promptControlClassName({
                    active: dropdownOpen === "seed" || seedLocked,
                    compact: true,
                  })}
                  title={seedLocked ? `Seed locked: ${seed}` : "Seed: random each generation"}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70 shrink-0">
                    {seedLocked ? (
                      <>
                        <rect x="5" y="11" width="14" height="9" rx="2" />
                        <path d="M8 11V7a4 4 0 018 0v4" />
                      </>
                    ) : (
                      <>
                        <rect x="3" y="3" width="18" height="18" rx="3" />
                        <circle cx="8.5" cy="8.5" r="1" fill="currentColor" />
                        <circle cx="15.5" cy="8.5" r="1" fill="currentColor" />
                        <circle cx="8.5" cy="15.5" r="1" fill="currentColor" />
                        <circle cx="15.5" cy="15.5" r="1" fill="currentColor" />
                        <circle cx="12" cy="12" r="1" fill="currentColor" />
                      </>
                    )}
                  </svg>
                  <span className={PROMPT_CONTROL_LABEL_CLASS}>
                    {seedLocked ? seed : "Seed"}
                  </span>
                </button>

                {dropdownOpen === "seed" && (
                  <PromptPopover
                    onClick={(e) => e.stopPropagation()}
                    className="min-w-[240px]"
                  >
                    <PromptPopoverHeader>Seed</PromptPopoverHeader>
                    <div className="flex flex-col gap-2.5 px-1 pb-1">
                      <p className="text-[11.5px] text-[#5e5e72] leading-relaxed">
                        Lock a seed to reproduce the exact same result, or reuse the
                        last one generated. Unlocked uses a new random seed every time.
                      </p>
                      <input
                        type="number"
                        value={seed ?? ""}
                        onChange={(e) => setSeed(e.target.value === "" ? null : Number(e.target.value))}
                        placeholder="Random"
                        className="w-full bg-[#f6f6fa] border border-[#e6e7f0] rounded-xl px-3 py-2 text-[12.5px] text-[#14141f] focus:outline-none focus:border-[#5b45f2] focus:bg-white"
                      />
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSeed(randomSeed())}
                          className="flex-1 text-[12px] font-semibold text-[#2d2e3f] hover:text-[#14141f] bg-[#f6f6fa] hover:bg-[#efeff6] border border-[#e6e7f0] rounded-xl py-1.5 transition-colors"
                        >
                          Randomize
                        </button>
                        <button
                          type="button"
                          onClick={() => setSeedLocked((v) => !v)}
                          className={`flex-1 text-[12px] font-semibold rounded-xl py-1.5 border transition-colors ${
                            seedLocked
                              ? "text-[#4c38d6] bg-[#f2f0ff] border-[#c8bffb]"
                              : "text-[#2d2e3f] hover:text-[#14141f] bg-[#f6f6fa] hover:bg-[#efeff6] border-[#e6e7f0]"
                          }`}
                        >
                          {seedLocked ? "Locked" : "Lock seed"}
                        </button>
                      </div>
                    </div>
                  </PromptPopover>
                )}
              </div>

              {/* Batch size stepper */}
              <div className={promptControlClassName({ compact: true, className: "select-none" })}>
                <button
                  type="button"
                  onClick={() => setBatchSize(prev => Math.max(1, prev - 1))}
                  className="text-[#5e5e72] hover:text-[#14141f] font-bold text-xs transition-colors px-1"
                >
                  −
                </button>
                <span className="text-[12px] font-semibold text-[#14141f] min-w-[24px] text-center">
                  {batchSize}/4
                </span>
                <button
                  type="button"
                  onClick={() => setBatchSize(prev => Math.min(4, prev + 1))}
                  className="text-[#5e5e72] hover:text-[#14141f] font-bold text-xs transition-colors px-1"
                >
                  +
                </button>
              </div>

              {/* Draw button */}
              <button
                type="button"
                className={promptControlClassName()}
                onClick={() => setIsDrawModalOpen(true)}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="opacity-65 transition-colors">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                <span className={PROMPT_CONTROL_LABEL_CLASS}>
                  Draw
                </span>
              </button>
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
                  <span>{batchCredits !== null ? `Generate · ${formatCredits(batchCredits)} credits` : 'Generate'}</span>
                </>
              )}
            </PromptAction>
          </PromptFooter>
      </PromptComposer>

      {/* ── FULLSCREEN IMAGE MODAL ── */}
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
          <img 
            src={assetPreviewUrl(fullscreenUrl)}
            alt="Fullscreen Preview" 
            className="max-w-[94vw] max-h-[92vh] rounded-2xl shadow-2xl object-contain animate-scale-up" 
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* ── DRAW CANVAS MODAL ── */}
      <DrawModal
        isOpen={isDrawModalOpen}
        onClose={() => setIsDrawModalOpen(false)}
        apiKey={apiKey}
        batchSize={1}
        onAddHistoryItem={addToHistory}
      />
      <Toaster position="top-right" containerStyle={{ zIndex: 99999 }} toastOptions={{ duration: 5000, style: { background: '#ffffff', color: '#14141f', border: '1px solid #e6e7f0', fontSize: '13px', borderRadius: '12px', boxShadow: '0 10px 30px rgba(20,20,31,0.12)', maxWidth: '440px', wordBreak: 'break-word', whiteSpace: 'pre-wrap', padding: '12px 16px' } }} />
    </div>
  );
}
