'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Check,
  ChevronDown,
  Clapperboard,
  Image as ImageIcon,
  Minus,
  Plus,
  Search,
  Sparkles,
  X,
} from 'lucide-react'
import { getImageModels, getVideoModels } from '@/lib/fal-models'
import {
  AUTO_DURATION,
  maxVideoDurationSeconds,
  minVideoDurationSeconds,
  resolveGenerationSettings,
  settingsForModelChange,
} from '@/lib/generation-settings'

type SettingsNode = {
  id: string
  type?: string
  data: Record<string, unknown>
}

type Props = {
  node: SettingsNode | null
  onClose: () => void
  onPatch: (nodeId: string, patch: Record<string, unknown>) => void
}

const FIELD_CARD =
  'rounded-[13px] border border-zinc-200/90 bg-[#f5f5f7] transition-colors hover:border-zinc-300'

const POPOVER_CARD =
  'dock-popover-enter overflow-hidden rounded-[16px] border border-zinc-200 bg-white shadow-[0_16px_42px_rgba(15,15,20,0.14)]'

export function GenerationSettingsPanel({ node, onClose, onPatch }: Props) {
  const [modelOpen, setModelOpen] = useState(false)
  const [choice, setChoice] = useState<'resolution' | 'ratio' | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const openSection = (event: Event) => {
      const section = (event as CustomEvent<string>).detail
      setModelOpen(section === 'model')
      setChoice(section === 'resolution' ? 'resolution' : section === 'aspect' ? 'ratio' : null)
    }
    window.addEventListener('open-generation-settings-section', openSection)
    return () => window.removeEventListener('open-generation-settings-section', openSection)
  }, [])

  useEffect(() => {
    if (!node) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (modelOpen || choice) {
        setModelOpen(false)
        setChoice(null)
      } else {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [choice, modelOpen, node, onClose])

  const isVideo = node?.type === 'videoGen'
  const models = useMemo(() => (isVideo ? getVideoModels() : getImageModels()), [isVideo])
  const effective = resolveGenerationSettings(isVideo ? 'video' : 'image', node?.data)
  const currentModel = effective.model || models[0]
  const resolution = effective.resolution
  const ratio = effective.aspectRatio
  const autoDuration = effective.duration === AUTO_DURATION
  const duration = Number.parseInt(effective.duration, 10) || 5
  const batch = effective.count
  const audio = effective.enableAudio
  const draft = effective.draftMode
  const extend = effective.extendMode
  const edit = effective.editMode
  const mov = effective.outputFormat === 'mov'
  const watermark = effective.watermark
  const lastFrame = effective.returnLastFrame

  if (!node || !currentModel || (node.type !== 'imageGen' && node.type !== 'videoGen')) return null

  const patch = (values: Record<string, unknown>) => onPatch(node.id, values)
  const minDuration = minVideoDurationSeconds(currentModel)
  const maxDuration = maxVideoDurationSeconds(currentModel)

  const renderToggle = (label: string, on: boolean, onClick: () => void, title?: string) => (
    <div
      className="flex items-center justify-between rounded-[13px] border border-zinc-200/80 bg-[#f5f5f7] px-3.5 py-2.5"
      title={title}
    >
      <span className="text-[12px] font-medium text-zinc-800">{label}</span>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={on}
        className={`relative h-[22px] w-10 rounded-full p-0.5 transition-colors duration-200 ${
          on ? 'bg-[#18181b]' : 'bg-zinc-300'
        }`}
      >
        <span
          className={`block h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform duration-200 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
            on ? 'translate-x-[18px]' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )

  const visibleModels = models.filter((model) =>
    `${model.name} ${model.description}`.toLowerCase().includes(search.toLowerCase()),
  )
  const selectModel = (nextId: string) => {
    patch(settingsForModelChange(isVideo ? 'video' : 'image', nextId, node.data))
    setModelOpen(false)
  }

  const selectOption = (value: string) => {
    patch(choice === 'resolution' ? { resolution: value } : { aspectRatio: value })
    setChoice(null)
  }

  return (
    <aside className="dock-popover-enter absolute right-4 top-4 z-40 w-[332px] select-none rounded-[20px] border border-zinc-200/95 bg-white/98 p-4 text-zinc-900 shadow-[0_16px_44px_rgba(15,15,20,0.12)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
        <div className="flex items-center gap-2.5">
          <span
            className={`flex h-7 w-7 items-center justify-center rounded-[9px] ${
              isVideo ? 'bg-indigo-50 text-indigo-600' : 'bg-sky-50 text-sky-600'
            }`}
          >
            {isVideo ? <Clapperboard size={14} strokeWidth={1.85} /> : <ImageIcon size={14} strokeWidth={1.85} />}
          </span>
          <div>
            <div className="text-[13px] font-semibold leading-tight text-zinc-900">
              {isVideo ? 'Video Settings' : 'Image Settings'}
            </div>
            <div className="text-[10px] text-zinc-400">Node configuration</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
          aria-label="Close dynamic settings"
        >
          <X size={15} strokeWidth={1.9} />
        </button>
      </div>

      <div className="space-y-2.5 pt-3">
        {/* Model Selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setModelOpen((value) => !value)
              setChoice(null)
            }}
            className={`${FIELD_CARD} flex w-full items-center justify-between px-3 py-2.5 text-left`}
          >
            <span className="min-w-0">
              <span className="block text-[10px] font-medium uppercase tracking-wider text-zinc-400">Model</span>
              <span className="block truncate text-[13px] font-semibold text-zinc-900">{currentModel.name}</span>
            </span>
            <span className="ml-2 flex shrink-0 items-center gap-2">
              {isVideo && (
                <span className="rounded-md bg-zinc-200/80 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700">
                  ≤ {maxDuration}s
                </span>
              )}
              <ChevronDown
                size={15}
                strokeWidth={1.8}
                className={`text-zinc-400 transition-transform duration-200 ${modelOpen ? 'rotate-180' : ''}`}
              />
            </span>
          </button>

          {modelOpen ? (
            <div className={`${POPOVER_CARD} absolute right-[calc(100%+10px)] top-0 z-50 w-[370px]`}>
              <div className="border-b border-zinc-100 p-2.5">
                <div className="flex items-center gap-2 rounded-[10px] border border-zinc-200 bg-[#f5f5f7] px-2.5 py-2 text-zinc-400">
                  <Search size={14} strokeWidth={1.8} />
                  <input
                    autoFocus
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search models..."
                    className="w-full border-0 bg-transparent p-0 text-[12px] text-zinc-900 outline-none placeholder:text-zinc-400 focus:ring-0"
                  />
                </div>
              </div>
              <div className="max-h-[400px] overflow-y-auto p-1.5">
                {visibleModels.map((model) => {
                  const selected = model.id === currentModel.id
                  return (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => selectModel(model.id)}
                      className={`flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors ${
                        selected ? 'bg-zinc-900 text-white' : 'text-zinc-800 hover:bg-zinc-100'
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          selected ? 'bg-white/15 text-white' : 'bg-zinc-100 text-zinc-500'
                        }`}
                      >
                        <Sparkles size={14} strokeWidth={1.8} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12px] font-semibold">{model.name}</span>
                        <span className={`block truncate text-[10px] ${selected ? 'text-zinc-300' : 'text-zinc-500'}`}>
                          {model.description}
                        </span>
                      </span>
                      {isVideo ? (
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            selected ? 'bg-white/15 text-white' : 'bg-zinc-100 text-zinc-600'
                          }`}
                        >
                          ≤ {maxVideoDurationSeconds(model)}s
                        </span>
                      ) : null}
                      {selected ? <Check size={14} strokeWidth={2.2} className="shrink-0 text-white" /> : null}
                    </button>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>

        {isVideo && (
          <p className="px-1 text-[11px] leading-relaxed text-zinc-500">
            {currentModel.videoTaskMode === 'frame'
              ? 'Frames: 1 first image + 1 optional last image.'
              : `References: up to ${currentModel.maxReferenceImages || 0} images · ${currentModel.maxReferenceVideos || 0} videos · ${currentModel.maxReferenceAudios || 0} audio clips (≤ ${maxDuration}s total per type).`}
          </p>
        )}

        {/* Resolution & Aspect Ratio */}
        <div className="grid grid-cols-2 gap-2">
          {(['resolution', 'ratio'] as const).map((type) => {
            const options = type === 'resolution' ? currentModel.resolutions || [] : currentModel.aspectRatios
            const value = type === 'resolution' ? resolution : ratio
            if (options.length === 0) return <div key={type} />
            const isOpen = choice === type
            return (
              <div key={type} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setChoice(isOpen ? null : type)
                    setModelOpen(false)
                  }}
                  className={`${FIELD_CARD} flex w-full items-center justify-between px-3 py-2 text-left`}
                >
                  <span className="min-w-0">
                    <span className="block text-[10px] font-medium uppercase tracking-wider text-zinc-400">
                      {type === 'resolution' ? 'Resolution' : 'Aspect'}
                    </span>
                    <span className="block truncate text-[13px] font-semibold text-zinc-900">{value}</span>
                  </span>
                  <ChevronDown
                    size={14}
                    strokeWidth={1.8}
                    className={`shrink-0 text-zinc-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                  />
                </button>
                {isOpen ? (
                  <div className={`${POPOVER_CARD} absolute left-0 right-0 top-full z-50 mt-1.5 max-h-52 overflow-y-auto p-1`}>
                    {options.map((option) => {
                      const active = value === option
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => selectOption(option)}
                          className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12px] transition-colors ${
                            active ? 'bg-zinc-900 font-medium text-white' : 'text-zinc-700 hover:bg-zinc-100'
                          }`}
                        >
                          <span>{option}</span>
                          {active ? <Check size={13} strokeWidth={2.2} className="text-white" /> : null}
                        </button>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>

        {/* Duration Slider (Video only) */}
        {isVideo ? (
          <div className="rounded-[13px] border border-zinc-200/80 bg-[#f5f5f7] px-3.5 py-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px] font-medium text-zinc-800">Duration</span>
              <span className="flex items-center gap-2">
                {currentModel.supportsAutoDuration ? (
                  <button
                    type="button"
                    disabled={edit}
                    onClick={() => patch({ duration: autoDuration ? `${duration}s` : AUTO_DURATION })}
                    title={edit ? 'Edit keeps the source video length' : 'Let the model pick the length'}
                    className={`rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors disabled:opacity-40 ${
                      autoDuration ? 'bg-[#18181b] text-white' : 'bg-zinc-200 text-zinc-600 hover:text-zinc-900'
                    }`}
                  >
                    Auto
                  </button>
                ) : null}
                <span className="min-w-[30px] text-right text-[12px] font-semibold tabular-nums text-zinc-900">
                  {autoDuration ? 'auto' : `${duration}s`}
                </span>
              </span>
            </div>
            <input
              type="range"
              aria-label="Video duration"
              min={minDuration}
              max={maxDuration}
              step={1}
              value={duration}
              disabled={autoDuration}
              onChange={(event) => patch({ duration: `${event.target.value}s` })}
              className={`h-1.5 w-full cursor-ew-resize accent-[#18181b] ${autoDuration ? 'opacity-35' : ''}`}
            />
            <div className="mt-1 flex justify-between text-[10px] tabular-nums text-zinc-400">
              <span>{minDuration}s</span>
              <span>{maxDuration}s</span>
            </div>
          </div>
        ) : null}

        {/* Batch Size Stepper */}
        <div className="flex items-center justify-between rounded-[13px] border border-zinc-200/80 bg-[#f5f5f7] px-3.5 py-2.5">
          <span className="text-[12px] font-medium text-zinc-800">Batch size</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={batch <= 1}
              onClick={() => patch({ [isVideo ? 'numVideos' : 'numImages']: Math.max(1, batch - 1) })}
              className="flex h-6 w-6 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="Decrease batch size"
            >
              <Minus size={12} strokeWidth={2} />
            </button>
            <span className="min-w-[30px] text-center text-[12px] font-semibold tabular-nums text-zinc-900">
              {batch}/4
            </span>
            <button
              type="button"
              disabled={batch >= 4}
              onClick={() => patch({ [isVideo ? 'numVideos' : 'numImages']: Math.min(4, batch + 1) })}
              className="flex h-6 w-6 items-center justify-center rounded-md border border-zinc-200 bg-white text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-950 disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="Increase batch size"
            >
              <Plus size={12} strokeWidth={2} />
            </button>
          </div>
        </div>

        {/* Mode Segmented Buttons (Draft / Extend / Edit) */}
        {isVideo && (currentModel.supportsDraft || currentModel.supportsExtend || currentModel.supportsEdit) ? (
          <div className="grid grid-cols-3 gap-1.5 rounded-[13px] border border-zinc-200/80 bg-[#f5f5f7] p-1">
            {currentModel.supportsDraft ? (
              <button
                type="button"
                onClick={() =>
                  patch({
                    draftMode: !draft,
                    extendMode: false,
                    editMode: false,
                    ...(!draft ? { resolution: '480p' } : {}),
                  })
                }
                className={`rounded-[9px] py-2 text-[11px] font-semibold transition-colors ${
                  draft
                    ? 'bg-amber-100 text-amber-900 ring-1 ring-amber-300'
                    : 'text-zinc-600 hover:bg-white hover:text-zinc-950'
                }`}
              >
                Draft
              </button>
            ) : (
              <div />
            )}
            {currentModel.supportsExtend ? (
              <button
                type="button"
                onClick={() => patch({ extendMode: !extend, draftMode: false, editMode: false })}
                className={`rounded-[9px] py-2 text-[11px] font-semibold transition-colors ${
                  extend
                    ? 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300'
                    : 'text-zinc-600 hover:bg-white hover:text-zinc-950'
                }`}
              >
                Extend
              </button>
            ) : (
              <div />
            )}
            {currentModel.supportsEdit ? (
              <button
                type="button"
                title="Edit a connected 4–30s source video (add / remove / replace …). Keeps its ratio and length."
                onClick={() =>
                  patch({
                    editMode: !edit,
                    draftMode: false,
                    extendMode: false,
                    ...(!edit ? { aspectRatio: 'adaptive', duration: AUTO_DURATION } : {}),
                  })
                }
                className={`rounded-[9px] py-2 text-[11px] font-semibold transition-colors ${
                  edit
                    ? 'bg-sky-100 text-sky-900 ring-1 ring-sky-300'
                    : 'text-zinc-600 hover:bg-white hover:text-zinc-950'
                }`}
              >
                Edit
              </button>
            ) : (
              <div />
            )}
          </div>
        ) : null}

        {/* Video Toggles */}
        {isVideo && currentModel.supportsAudio
          ? renderToggle('Generate audio', audio, () => patch({ enableAudio: !audio }))
          : null}

        {isVideo && currentModel.supportsMov
          ? renderToggle(
              'Output .mov',
              mov,
              () => patch({ outputFormat: mov ? 'mp4' : 'mov' }),
              'High color precision (H.264 yuv444p + PCM). Recommended for edit/extend; some players cannot play it.',
            )
          : null}

        {isVideo && currentModel.supportsLastFrame
          ? renderToggle(
              'Keep last frame',
              lastFrame,
              () => patch({ returnLastFrame: !lastFrame }),
              'Save the final frame so the next shot can start from it (Next shot button on the node)',
            )
          : null}

        {isVideo && currentModel.supportsWatermark
          ? renderToggle(
              'AI watermark',
              watermark,
              () => patch({ watermark: !watermark }),
              'Adds an "AI generated" mark to the lower-right corner',
            )
          : null}
      </div>
    </aside>
  )
}
