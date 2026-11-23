"use client";
import { confirmDialog } from "./confirmDialog.jsx";

import { useState, useEffect, useRef, useCallback } from "react";
import toast, { Toaster } from "react-hot-toast";
import { runMotionGraphics, runMotionGraphicsEdit } from "../generationClient.js";
import { formatErrorMessage } from "../utils/formatError.js";
import { scopedPersistKey, migrateLegacyPersistKey } from "../persistKey.js";
import MobileGenerationActions, {
  GenerationCopyButtons,
} from "./MobileGenerationActions.jsx";
import {
  PROMPT_CONTROL_LABEL_CLASS,
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
  PromptSegmentedControl,
  PromptSegmentOption,
  PromptTextarea,
  promptControlClassName,
} from "./prompt/PromptComposer.jsx";

// ── helpers ───────────────────────────────────────────────────────────────────
async function downloadFile(url, filename) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
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

const formatTime = (s) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// ── icons ─────────────────────────────────────────────────────────────────────
const CheckSvg = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#5b45f2" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// ── Dropdown helper ───────────────────────────────────────────────────────────
function DropdownItem({ label, selected, onClick }) {
  return (
    <PromptMenuItem
      selected={selected}
      onClick={onClick}
    >
      {label}
    </PromptMenuItem>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function VibeMotionStudio({
  apiKey,
  onGenerationStart,
  onGenerationEnd,
  onGenerationComplete,
  onGenerationError,
}) {
  const LEGACY_PERSIST_KEY = "hg_vibe_motion_studio_persistent";
  const PERSIST_KEY = scopedPersistKey(LEGACY_PERSIST_KEY, apiKey);
  useEffect(() => {
    migrateLegacyPersistKey(LEGACY_PERSIST_KEY, PERSIST_KEY);
  }, [PERSIST_KEY]);

  // ── Params ────────────────────────────────────────────────────────────────
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [duration, setDuration] = useState(6);

  // ── Edit mode ─────────────────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [editSourceId, setEditSourceId] = useState(null);  // request_id of source

  // ── Dropdown open state ───────────────────────────────────────────────────
  const [openDropdown, setOpenDropdown] = useState(null); // "ar" | "dur" | "source"
  const controlsRef = useRef(null);
  const textareaRef = useRef(null);

  // ── Generation state ──────────────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef(null);
  const pendingRequestId = useRef(null);

  // ── History ───────────────────────────────────────────────────────────────
  const [history, setHistory] = useState([]);
  const [fullscreenUrl, setFullscreenUrl] = useState(null);

  // ── Load from localStorage ─────────────────────────────────────────────────
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PERSIST_KEY) || "[]");
      if (Array.isArray(saved)) {
        // Strip any wrongly-persisted canEdit:false flags from old bug — restore all entries as remixable
        const restored = saved.map((h) => {
          const { canEdit, ...rest } = h;
          return rest; // canEdit is only an in-memory hint, never persisted
        });
        setHistory(restored);
      }
    } catch (_) {}
  }, []);

  const saveHistory = useCallback((items) => {
    setHistory(items);
    // Strip canEdit from persisted data — it is an in-memory hint only
    const stripped = items.map(({ canEdit, ...rest }) => rest);
    try { localStorage.setItem(PERSIST_KEY, JSON.stringify(stripped)); } catch (_) {}
  }, []);

  // ── Close dropdowns on outside click ─────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (controlsRef.current && !controlsRef.current.contains(e.target)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);
  // ── Timer ─────────────────────────────────────────────────────────────────
  const startTimer = () => {
    setElapsedTime(0);
    timerRef.current = setInterval(() => setElapsedTime((t) => t + 1), 1000);
  };
  const stopTimer = () => { clearInterval(timerRef.current); timerRef.current = null; };
  useEffect(() => () => stopTimer(), []);

  // ── Generate ──────────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || generating) return;
    onGenerationStart?.();
    setGenerating(true);
    setGenerateError(null);
    startTimer();
    try {
      let result;
      if (editMode) {
        result = await runMotionGraphicsEdit(apiKey, {
          request_id: editSourceId,
          edit_prompt: prompt.trim(),
          aspect_ratio: aspectRatio,
          duration_seconds: duration,
          onRequestId: (id) => { pendingRequestId.current = id; },
        });
      } else {
        result = await runMotionGraphics(apiKey, {
          prompt: prompt.trim(),
          aspect_ratio: aspectRatio,
          duration_seconds: duration,
          onRequestId: (id) => { pendingRequestId.current = id; },
        });
      }

      const videoUrl = result?.output?.video || result?.url || result?.outputs?.[0];
      const requestId = result?.id || result?.request_id || pendingRequestId.current;

      const entry = {
        id: requestId || Date.now().toString(),
        requestId,
        url: videoUrl,
        prompt: prompt.trim(),
        aspectRatio,
        duration,
        mode: editMode ? "edit" : "generate",
        sourceId: editMode ? editSourceId : null,
        timestamp: new Date().toISOString(),
        // Mark as editable — only generations created with saved animation code can be remixed
        canEdit: true,
      };

      const next = [entry, ...history].slice(0, 30);
      saveHistory(next);
      onGenerationComplete?.({ url: videoUrl, type: "video" });
    } catch (err) {
      // Detect the backend's "animation code not saved" limitation
      const raw = err.message || "";
      const isStaleEdit =
        raw.includes("animation code") ||
        raw.includes("does not have saved") ||
        raw.includes("Original generation does not");

      if (isStaleEdit) {
        console.warn("[VibeMotionStudio] Remix unavailable:", raw.slice(0, 120));
        const msg = "This generation can't be remixed — the animation code wasn't saved server-side. Generate a new motion graphic first, then remix that result.";
        if (onGenerationError) onGenerationError(msg);
        else toast.error(msg);
        setEditMode(false);
        setEditSourceId(null);
      } else {
        console.error("[VibeMotionStudio]", err);
        const errMsg = formatErrorMessage(raw || err, "Vibe Motion generation failed");
        if (onGenerationError) onGenerationError(errMsg);
        else toast.error(errMsg);
      }
    } finally {
      setGenerating(false);
      stopTimer();
      onGenerationEnd?.();
    }
  }, [
    apiKey,
    prompt,
    editMode,
    editSourceId,
    aspectRatio,
    duration,
    history,
    saveHistory,
    onGenerationComplete,
    onGenerationEnd,
    onGenerationError,
    onGenerationStart,
  ]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleGenerate();
  };

  const toggleDropdown = (type) => (e) => {
    e.stopPropagation();
    setOpenDropdown((prev) => (prev === type ? null : type));
  };

  const ASPECT_RATIOS = ["16:9", "9:16", "1:1"];
  const DURATION_OPTIONS = [5, 6, 8, 10, 12, 15, 20, 25, 30];

  // Show all entries with a requestId as editable UNLESS they are explicitly marked canEdit:false
  // (entries loaded from localStorage without the flag are treated as optimistically editable)
  const editSources = history.filter((h) => h.requestId && h.canEdit !== false);
  const sourceEntry = editSources.find((h) => h.requestId === editSourceId);

  const VIBE_STARTERS = [
    "Animated revenue dashboard with smooth bar charts climbing and KPI callouts",
    "Kinetic typography launch teaser with bold editorial transitions and clean grid",
    "Minimalist SaaS logo reveal with geometric violet light sweep",
    "3-step product feature explainer cards sliding smoothly into view",
  ];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-transparent relative px-4 md:px-6 overflow-hidden">
      {/* ── Fullscreen overlay ── */}
      {fullscreenUrl && (
        <div
          className="fixed inset-0 z-[200] bg-[#0f1117]/92 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setFullscreenUrl(null)}
        >
          <video
            src={fullscreenUrl}
            autoPlay loop controls
            className="max-h-[92vh] max-w-[94vw] rounded-2xl shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            className="absolute top-5 right-5 w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors border border-white/15"
            onClick={() => setFullscreenUrl(null)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* ── GALLERY AREA ── */}
      <div className="flex-1 w-full max-w-7xl mx-auto overflow-y-auto custom-scrollbar pb-48 lg:pb-44 px-1">
        {generating && (
          /* ── Loading card at top of grid ── */
          <div className="w-full pt-10 flex justify-center animate-fade-in-up">
            <div className="flex flex-col items-center gap-4 px-10 py-12 rounded-3xl bg-white/95 border border-[#e6e7f0] shadow-[0_14px_40px_rgba(20,20,31,0.06)]">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-2 border-[#ddd7fe] animate-ping" />
                <div className="absolute inset-1.5 rounded-full border-2 border-[#e6e7f0] border-t-[#5b45f2] animate-spin" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#5b45f2]">
                    <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
                  </svg>
                </div>
              </div>
              <div className="flex flex-col items-center gap-1 text-center">
                <span className="text-[#14141f] font-semibold text-[15px]">
                  {editMode ? "Remixing motion graphics…" : "Generating motion graphics…"}
                </span>
                <span className="text-[#5e5e72] text-[12.5px]">Rendering animation frames</span>
              </div>
              <div className="flex items-center gap-2 text-[#4c38d6] text-[12px] font-semibold bg-[#f2f0ff] px-4 py-1.5 rounded-full border border-[#ddd7fe]">
                <svg className="animate-spin" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25"/>
                  <path d="M12 2a10 10 0 0 1 10 10"/>
                </svg>
                {formatTime(elapsedTime)}
              </div>
            </div>
          </div>
        )}

        {!generating && history.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 w-full pt-6 animate-fade-in-up">
            {history.map((entry, idx) => (
              <div
                key={entry.id || idx}
                className="relative group rounded-2xl overflow-hidden border border-[#e6e7f0] bg-white shadow-[0_2px_10px_rgba(20,20,31,0.04)] hover:border-[#c8bffb] hover:shadow-[0_14px_30px_rgba(20,20,31,0.08)] transition-all duration-200 flex flex-col cursor-pointer"
                onClick={() => setFullscreenUrl(entry.url)}
              >
                {/* Video thumbnail */}
                <div className="relative w-full aspect-video bg-[#0f1117] overflow-hidden">
                  <video
                    src={entry.url}
                    className="w-full h-full object-cover group-hover:opacity-95 transition-opacity"
                    controls={false}
                    loop
                    muted
                    playsInline
                    onMouseEnter={(e) => {
                      const p = e.currentTarget.play();
                      if (p && typeof p.catch === "function") p.catch(() => {});
                    }}
                    onMouseLeave={(e) => {
                      try { e.currentTarget.pause(); e.currentTarget.currentTime = 0; } catch {}
                    }}
                  />
                </div>

                {/* ── Mode tag (top-left) ── */}
                <div className={`absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-lg text-[10.5px] font-semibold backdrop-blur-md border ${
                  entry.mode === "edit"
                    ? "bg-[#5b45f2]/90 text-white border-white/20"
                    : "bg-[#14141f]/75 text-white border-white/15"
                }`}>
                  {entry.mode === "edit" ? "Remix" : "Generated"}
                </div>

                {/* ── Hover overlay actions ── */}
                <div className="absolute top-2.5 right-2.5 hidden md:flex flex-col gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <GenerationCopyButtons
                    prompt={entry.prompt}
                    onCopyError={onGenerationError}
                  />
                  <button
                    type="button"
                    title="Download"
                    onClick={(e) => { e.stopPropagation(); downloadFile(entry.url, `motion-${entry.id || idx}.mp4`); }}
                    className="w-8 h-8 flex items-center justify-center bg-[#14141f]/75 backdrop-blur-md rounded-full text-white hover:bg-[#5b45f2] hover:border-[#5b45f2] transition-all border border-white/15"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                    </svg>
                  </button>
                  {entry.requestId && entry.canEdit !== false ? (
                    <button
                      type="button"
                      title="Remix this generation"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditMode(true);
                        setEditSourceId(entry.requestId);
                        setPrompt("");
                        setTimeout(() => textareaRef.current?.focus(), 50);
                      }}
                      className="w-8 h-8 flex items-center justify-center bg-[#14141f]/75 backdrop-blur-md rounded-full text-white hover:bg-[#5b45f2] hover:border-[#5b45f2] transition-all border border-white/15"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </button>
                  ) : entry.requestId && entry.canEdit === false ? (
                    <div
                      title="Legacy generation — remix not available. Generate a new motion graphic to enable editing."
                      className="w-8 h-8 flex items-center justify-center bg-[#14141f]/55 backdrop-blur-md rounded-full text-white/35 border border-white/10 cursor-not-allowed"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" className="opacity-50">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        <line x1="4" y1="4" x2="20" y2="20" stroke="currentColor" strokeWidth="2"/>
                      </svg>
                    </div>
                  ) : null}
                  <button
                    type="button"
                    title="Delete"
                    onClick={async (e) => {
                      e.stopPropagation();
                      if (await confirmDialog({ title: "Delete this generated item?", confirmLabel: "Delete", destructive: true })) {
                        setHistory(prev => prev.filter((_, i) => i !== idx));
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
                    {
                      kind: "download",
                      label: "Download",
                      onSelect: () =>
                        downloadFile(entry.url, `motion-${entry.id || idx}.mp4`),
                    },
                    entry.requestId &&
                      entry.canEdit !== false && {
                        kind: "remix",
                        label: "Remix",
                        onSelect: () => {
                          setEditMode(true);
                          setEditSourceId(entry.requestId);
                          setPrompt("");
                          setTimeout(() => textareaRef.current?.focus(), 50);
                        },
                      },
                    {
                      kind: "delete",
                      label: "Delete",
                      danger: true,
                      onSelect: async () => {
                        if (await confirmDialog({ title: "Delete this generated item?", confirmLabel: "Delete", destructive: true })) {
                          setHistory((prev) => prev.filter((_, i) => i !== idx));
                        }
                      },
                    },
                  ]}
                />

                {/* ── Card footer: prompt + metadata ── */}
                <div className="p-3.5 bg-white border-t border-[#efeff5] flex-1 flex flex-col justify-between gap-2.5">
                  <p className="text-[#2d2e3f] text-[12.5px] line-clamp-2 leading-relaxed" title={entry.prompt}>
                    {entry.prompt || "No prompt"}
                  </p>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-[#4c38d6] px-2 py-0.5 bg-[#f2f0ff] rounded-md border border-[#ddd7fe] whitespace-nowrap">
                        Vibe Motion
                      </span>
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-[#7a7b90]">
                        {entry.aspectRatio && <span>{entry.aspectRatio}</span>}
                        {entry.aspectRatio && entry.duration && <span>·</span>}
                        {entry.duration && <span>{entry.duration}s</span>}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : !generating ? (
          /* ── Empty State ── */
          <div className="flex flex-col items-center justify-center h-full animate-fade-in-up min-h-[56vh] px-4 py-10">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e4e2f0] bg-white/90 px-3.5 py-1 text-[11.5px] font-semibold text-[#5b45f2] shadow-[0_2px_8px_rgba(20,20,31,0.04)] mb-4">
              Vibe Motion · Animated Graphics
            </span>
            <h1 className="text-[30px] sm:text-[40px] font-semibold tracking-[-0.03em] text-[#14141f] text-center leading-tight mb-3">
              Vibe Motion Studio
            </h1>
            <p className="text-[#5e5e72] text-[14.5px] text-center max-w-lg leading-relaxed mb-7">
              Generate crisp animated motion graphics from a text prompt — kinetic typography, data charts, logo reveals, and more.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 max-w-2xl">
              {VIBE_STARTERS.map((idea) => (
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
        ) : null}
      </div>

      {/* ── BOTTOM PROMPT BAR — matches VideoStudio exactly ── */}
      <PromptComposer>

          {/* ── Top Row: Mode Toggle & Edit Source Banner ── */}
          <div className="flex items-center justify-between gap-3">
            {/* Left: Mode toggle pill */}
            <PromptSegmentedControl className="flex-shrink-0">
              <PromptSegmentOption
                type="button"
                onClick={() => { setEditMode(false); setEditSourceId(null); }}
                selected={!editMode}
              >
                Generate
              </PromptSegmentOption>
              <PromptSegmentOption
                type="button"
                onClick={() => setEditMode(true)}
                disabled={editSources.length === 0}
                selected={editMode}
                className="disabled:opacity-35 disabled:cursor-not-allowed"
              >
                Edit
              </PromptSegmentOption>
            </PromptSegmentedControl>

            {/* Right: Edit mode status banner beside toggle buttons */}
            {editMode && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#f2f0ff] border border-[#ddd7fe] rounded-full text-[11.5px] text-[#4c38d6] font-medium tracking-tight min-w-0 max-w-full overflow-hidden">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" className="flex-shrink-0">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                <span className="truncate">
                  {sourceEntry
                    ? `Editing: "${sourceEntry.prompt?.slice(0, 45)}${sourceEntry.prompt?.length > 45 ? "…" : ""}"`
                    : "Select a source generation from the gallery"}
                </span>
                <button
                  type="button"
                  onClick={() => { setEditMode(false); setEditSourceId(null); setPrompt(""); }}
                  className="ml-auto text-[#5b45f2]/60 hover:text-[#4c38d6] transition-colors text-sm leading-none flex-shrink-0"
                  title="Cancel Edit Mode"
                >
                  ×
                </button>
              </div>
            )}
          </div>

            {/* Bottom: Textarea full width */}
            <div className="w-full">
              <PromptTextarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  editMode
                    ? "Describe what to change — 'change background to crisp white, make bars violet, add subtle glow…'"
                    : "Describe the motion graphic — 'Animated sales dashboard with smooth bar charts and rising numbers'"
                }
              />
            </div>

          {/* ── Error banner ── */}
          {generateError && (
            <div className="flex items-center gap-2 px-3 py-2 bg-[#fff1f3] border border-[#fccdd6] rounded-xl text-[#c01048] text-[12px] font-medium">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {generateError}
            </div>
          )}

          {/* ── Controls row: dropdowns + generate button ── */}
          <PromptFooter>
            <PromptControls ref={controlsRef}>

              {/* ── Aspect Ratio dropdown ── */}
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
                    {aspectRatio}
                  </span>
                </button>
                {openDropdown === "ar" && (
                  <PromptPopover>
                    <PromptPopoverHeader>Aspect Ratio</PromptPopoverHeader>
                    <PromptMenuList>
                      {ASPECT_RATIOS.map((ar) => (
                        <DropdownItem
                          key={ar}
                          label={ar}
                          selected={aspectRatio === ar}
                          onClick={() => { setAspectRatio(ar); setOpenDropdown(null); }}
                        />
                      ))}
                    </PromptMenuList>
                  </PromptPopover>
                )}
              </div>

              {/* ── Duration dropdown ── */}
              <div className="relative">
                <button
                  type="button"
                  onClick={toggleDropdown("dur")}
                  className={promptControlClassName({
                    active: openDropdown === "dur",
                  })}
                >
                  <PromptDurationIcon />
                  <span className={PROMPT_CONTROL_LABEL_CLASS}>
                    {duration}s
                  </span>
                </button>
                {openDropdown === "dur" && (
                  <PromptPopover>
                    <PromptPopoverHeader>Duration</PromptPopoverHeader>
                    <PromptMenuList>
                      {DURATION_OPTIONS.map((d) => (
                        <DropdownItem
                          key={d}
                          label={`${d}s`}
                          selected={duration === d}
                          onClick={() => { setDuration(d); setOpenDropdown(null); }}
                        />
                      ))}
                    </PromptMenuList>
                  </PromptPopover>
                )}
              </div>

              {/* Edit source picker dropdown — only shown in edit mode */}
              {editMode && editSources.length > 0 && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={toggleDropdown("source")}
                    className={promptControlClassName({ active: true })}
                  >
                    <div className="w-4 h-4 bg-[#f2f0ff] rounded flex items-center justify-center border border-[#ddd7fe] text-[#5b45f2]">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                    </div>
                    <span className={`${PROMPT_CONTROL_LABEL_CLASS} max-w-[130px] truncate`}>
                      {sourceEntry ? `Source: ${sourceEntry.prompt?.slice(0, 20)}…` : "Pick source…"}
                    </span>
                    <PromptChevronIcon />
                  </button>
                  {openDropdown === "source" && (
                    <PromptPopover className="w-64">
                      <PromptPopoverHeader>Source Generation</PromptPopoverHeader>
                      <div className="flex flex-col gap-1">
                        {editSources.map((src) => (
                          <div
                            key={src.requestId}
                            className={`flex items-center gap-2.5 p-2 rounded-xl cursor-pointer transition-all ${editSourceId === src.requestId ? "bg-[#f2f0ff]" : "hover:bg-[#f6f6fa]"}`}
                            onClick={() => { setEditSourceId(src.requestId); setOpenDropdown(null); }}
                          >
                            <div className="w-10 h-7 rounded-lg overflow-hidden bg-[#0f1117] flex-shrink-0 border border-[#e6e7f0]">
                              <video src={src.url} className="w-full h-full object-cover" muted playsInline />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[12px] font-medium text-[#14141f] truncate leading-tight">{src.prompt}</p>
                              <p className="text-[10.5px] text-[#7a7b90] mt-0.5">{src.aspectRatio} · {src.duration}s</p>
                            </div>
                            {editSourceId === src.requestId && <CheckSvg />}
                          </div>
                        ))}
                      </div>
                    </PromptPopover>
                  )}
                </div>
              )}

              <span className="text-[11px] text-[#7a7b90] hidden sm:block ml-1.5">Ctrl+Enter to run</span>
            </PromptControls>

            {/* ── Generate Button — matches VideoStudio exactly ── */}
            <PromptAction
              onClick={handleGenerate}
              disabled={generating || !prompt.trim() || (editMode && !editSourceId)}
            >
              {generating ? (
                <>
                  <span className="inline-block w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  {editMode ? "Remixing…" : "Generating…"}
                </>
              ) : editMode ? (
                <span>Remix</span>
              ) : (
                <span>Generate</span>
              )}
            </PromptAction>
          </PromptFooter>
      </PromptComposer>
      <Toaster position="top-right" containerStyle={{ zIndex: 99999 }} toastOptions={{ duration: 5000, style: { background: '#ffffff', color: '#14141f', border: '1px solid #e6e7f0', fontSize: '13px', borderRadius: '12px', boxShadow: '0 10px 30px rgba(20,20,31,0.12)', maxWidth: '440px', wordBreak: 'break-word', whiteSpace: 'pre-wrap', padding: '12px 16px' } }} />
    </div>
  );
}
