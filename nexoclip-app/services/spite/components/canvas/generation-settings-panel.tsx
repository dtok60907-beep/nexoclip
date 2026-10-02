'use client'

import { useEffect, useMemo, useState } from 'react'
import { CaretDown, Check, FilmStrip, Image as ImageIcon, MagnifyingGlass, Sparkle, X } from '@phosphor-icons/react'
import { getImageModels, getVideoModels } from '@/lib/fal-models'
import { AUTO_DURATION, minVideoDurationSeconds, resolveGenerationSettings, settingsForModelChange } from '@/lib/generation-settings'

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

  const isVideo = node?.type === 'videoGen'
  const models = useMemo(() => isVideo ? getVideoModels() : getImageModels(), [isVideo])
  // Same resolution the node uses when it submits, so the panel shows what
  // will actually be generated.
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
  const toggle = (label: string, on: boolean, onClick: () => void, title?: string) => <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-[#242832] px-3.5 py-2.5 text-[13px] font-bold" title={title}><span>{label}</span><button onClick={onClick} className={`h-6 w-11 rounded-full p-0.5 transition-colors ${on ? 'bg-[#25d32c]' : 'bg-zinc-700'}`} aria-pressed={on}><span className={`block h-5 w-5 rounded-full bg-white transition-transform ${on ? 'translate-x-5' : ''}`} /></button></div>
  const visibleModels = models.filter(model => `${model.name} ${model.description}`.toLowerCase().includes(search.toLowerCase()))
  const selectModel = (nextId: string) => {
    patch(settingsForModelChange(isVideo ? 'video' : 'image', nextId, node.data))
    setModelOpen(false)
  }

  const selectOption = (value: string) => {
    patch(choice === 'resolution' ? { resolution: value } : { aspectRatio: value })
    setChoice(null)
  }

  return (
    <aside className="absolute right-4 top-4 z-40 w-[350px] select-none rounded-[24px] border border-[#2b303c] bg-[#1d2027] p-4 text-slate-100 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
        <div className="flex items-center gap-2.5 text-sm font-semibold text-white">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-sky-400/30 bg-sky-500/15 text-sky-300">
            {isVideo ? <FilmStrip size={15} /> : <ImageIcon size={15} />}
          </span>
          {isVideo ? 'Video Generation' : 'Image Generation'}
        </div>
        <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/[0.08] hover:text-white" aria-label="Close dynamic settings"><X size={16} /></button>
      </div>

      <div className="space-y-2.5 pt-3">
        <div className="relative">
          <button onClick={() => { setModelOpen(value => !value); setChoice(null) }} className="flex w-full items-center justify-between rounded-xl border border-white/[0.1] bg-[#202328] px-3 py-2.5 text-left hover:border-white/[0.2]">
            <span><span className="block text-[11px] text-slate-500">Model</span><span className="text-sm font-semibold text-slate-100">{currentModel.name}</span></span>
            <CaretDown size={16} className="text-slate-400" />
          </button>
          {modelOpen ? (
            <div className="absolute right-[calc(100%-14px)] top-0 z-50 w-[405px] overflow-hidden rounded-2xl border border-white/[0.12] bg-[#202328]/[.98] shadow-2xl backdrop-blur-xl">
              <div className="border-b border-white/[0.08] p-3"><div className="flex items-center gap-2 rounded-xl border border-white/[0.08] bg-[#17191f] px-3 py-2 text-slate-400"><MagnifyingGlass size={16} /><input autoFocus value={search} onChange={event => setSearch(event.target.value)} placeholder="Search models..." className="w-full border-0 bg-transparent p-0 text-sm text-white outline-none placeholder:text-slate-500 focus:ring-0" /></div></div>
              <div className="max-h-[420px] overflow-y-auto p-2">{visibleModels.map(model => <button key={model.id} onClick={() => selectModel(model.id)} className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left ${model.id === currentModel.id ? 'bg-white/[0.1]' : 'hover:bg-white/[0.06]'}`}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.07] text-slate-400"><Sparkle size={16} /></span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{model.name}</span><span className="block truncate text-[11px] text-slate-500">{model.description}</span></span>{model.id === currentModel.id ? <Check size={15} className="text-lime-300" /> : null}</button>)}</div>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-2">
          {(['resolution', 'ratio'] as const).map(type => {
            const options = type === 'resolution' ? (currentModel.resolutions || []) : currentModel.aspectRatios
            const value = type === 'resolution' ? resolution : ratio
            if (options.length === 0) return <div key={type} />
            return <div key={type} className="relative"><button onClick={() => { setChoice(choice === type ? null : type); setModelOpen(false) }} className="flex w-full items-center justify-between rounded-xl border border-white/[0.1] bg-[#202328] px-3 py-2.5 text-left"><span><span className="block text-[11px] text-slate-500">{type === 'resolution' ? 'Resolution' : 'Aspect ratio'}</span><span className="text-sm font-semibold">{value}</span></span><CaretDown size={15} className="text-slate-400" /></button>{choice === type ? <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-52 overflow-y-auto rounded-xl border border-white/[0.1] bg-[#202328] p-1 shadow-xl">{options.map(option => <button key={option} onClick={() => selectOption(option)} className="flex w-full justify-between rounded-lg px-2 py-2 text-left text-xs hover:bg-white/[0.08]">{option}{value === option ? <Check size={13} className="text-lime-300" /> : null}</button>)}</div> : null}</div>
          })}
        </div>

        {isVideo ? <div className="rounded-2xl border border-white/5 bg-[#242832] px-3.5 py-3"><div className="mb-2 flex items-center justify-between text-[13px] font-bold"><span>Duration</span><span className="flex items-center gap-2">{currentModel.supportsAutoDuration ? <button disabled={edit} onClick={() => patch({ duration: autoDuration ? `${duration}s` : AUTO_DURATION })} title={edit ? 'Edit keeps the source video length' : 'Let the model pick the length'} className={`rounded-md px-1.5 py-0.5 text-[10px] ${autoDuration ? 'bg-[#d8ff05]/20 text-[#d8ff05]' : 'bg-white/[0.06] text-slate-400'}`}>Auto</button> : null}<span>{autoDuration ? 'auto' : `${duration}s`}</span></span></div><input type="range" min={minDuration} max={30} step={1} value={duration} disabled={autoDuration} onChange={event => patch({ duration: `${event.target.value}s` })} className={`h-1.5 w-full cursor-ew-resize accent-[#d8ff05] ${autoDuration ? 'opacity-40' : ''}`} /><div className="mt-1 flex justify-between text-[9px] text-slate-500"><span>{minDuration}s</span><span>30s</span></div></div> : null}

        <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-[#242832] px-3.5 py-3 text-[13px] font-bold"><span>Batch size</span><div className="flex items-center gap-3"><button onClick={() => patch({ [isVideo ? 'numVideos' : 'numImages']: Math.max(1, batch - 1) })} className="text-slate-400 hover:text-white">−</button><span>{batch}/4</span><button onClick={() => patch({ [isVideo ? 'numVideos' : 'numImages']: Math.min(4, batch + 1) })} className="text-slate-400 hover:text-white">＋</button></div></div>

        {isVideo && currentModel.supportsAudio ? <div className="flex items-center justify-between rounded-2xl border border-white/5 bg-[#242832] px-3.5 py-2.5 text-[13px] font-bold"><span>Generate Audio</span><button onClick={() => patch({ enableAudio: !audio })} className={`h-6 w-11 rounded-full p-0.5 transition-colors ${audio ? 'bg-[#25d32c]' : 'bg-zinc-700'}`} aria-pressed={audio}><span className={`block h-5 w-5 rounded-full bg-white transition-transform ${audio ? 'translate-x-5' : ''}`} /></button></div> : null}

        {isVideo && (currentModel.supportsDraft || currentModel.supportsExtend || currentModel.supportsEdit) ? <div className="grid grid-cols-3 gap-2">{currentModel.supportsDraft ? <button onClick={() => patch({ draftMode: !draft, extendMode: false, editMode: false, ...(!draft ? { aspectRatio: 'adaptive', resolution: '480p' } : {}) })} className={`rounded-xl border px-2 py-2.5 text-xs font-semibold ${draft ? 'border-amber-400/40 bg-amber-500/20 text-amber-200' : 'border-white/[0.1] bg-[#202328] text-slate-300'}`}>Draft</button> : <div />}{currentModel.supportsExtend ? <button onClick={() => patch({ extendMode: !extend, draftMode: false, editMode: false, ...(!extend ? { aspectRatio: 'adaptive' } : {}) })} className={`rounded-xl border px-2 py-2.5 text-xs font-semibold ${extend ? 'border-emerald-400/40 bg-emerald-500/20 text-emerald-200' : 'border-white/[0.1] bg-[#202328] text-slate-300'}`}>Extend</button> : <div />}{currentModel.supportsEdit ? <button title="Edit a connected 4–30s source video (add / remove / replace …). Keeps its ratio and length." onClick={() => patch({ editMode: !edit, draftMode: false, extendMode: false, ...(!edit ? { aspectRatio: 'adaptive', duration: AUTO_DURATION } : {}) })} className={`rounded-xl border px-2 py-2.5 text-xs font-semibold ${edit ? 'border-sky-400/40 bg-sky-500/20 text-sky-200' : 'border-white/[0.1] bg-[#202328] text-slate-300'}`}>Edit</button> : null}</div> : null}

        {isVideo && currentModel.supportsMov ? toggle('Output .mov', mov, () => patch({ outputFormat: mov ? 'mp4' : 'mov' }), 'High color precision (H.264 yuv444p + PCM). Recommended for edit/extend; some players cannot play it.') : null}

        {isVideo && currentModel.supportsLastFrame ? toggle('Keep last frame', lastFrame, () => patch({ returnLastFrame: !lastFrame }), 'Save the final frame so the next shot can start from it (Next shot button on the node)') : null}

        {isVideo && currentModel.supportsWatermark ? toggle('AI watermark', watermark, () => patch({ watermark: !watermark }), 'Adds an "AI generated" mark to the lower-right corner') : null}
      </div>
    </aside>
  )
}
