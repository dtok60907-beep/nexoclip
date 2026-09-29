'use client'

import { useState } from 'react'
import { CaretDown, Check } from '@phosphor-icons/react'

type Option = { id: string; label: string }

interface Props {
  visible: boolean
  model: string
  models: Option[]
  resolution: string
  resolutions: Option[]
  aspectRatio: string
  aspectRatios: Option[]
  duration?: string
  durations?: Option[]
  onModel: (value: string) => void
  onResolution: (value: string) => void
  onAspectRatio: (value: string) => void
  onDuration?: (value: string) => void
}

export function NodeQuickSettings({ visible, model, models, resolution, resolutions, aspectRatio, aspectRatios, duration, durations = [], onModel, onResolution, onAspectRatio, onDuration }: Props) {
  const [open, setOpen] = useState<'model' | 'resolution' | 'aspect' | 'duration' | null>(null)
  if (!visible) return null
  const groups = {
    model: { label: 'Model', value: models.find(x => x.id === model)?.label || model, options: models, onChange: onModel },
    resolution: { label: 'Resolusi', value: resolution || 'Pilih resolusi', options: resolutions, onChange: onResolution },
    aspect: { label: 'Rasio aspek', value: aspectRatio || 'Pilih rasio', options: aspectRatios, onChange: onAspectRatio },
    duration: { label: 'Durasi', value: duration || 'Pilih durasi', options: durations, onChange: onDuration || (() => {}) },
  }
  return <div className="nodrag nopan absolute bottom-full left-0 right-0 z-50 mb-2 rounded-xl border border-white/[0.08] bg-[#202328]/[.98] p-2 shadow-2xl backdrop-blur-xl" onPointerDown={e => e.stopPropagation()}>
    <div className="flex gap-1.5">
      {(Object.keys(groups) as Array<keyof typeof groups>).filter(key => key !== 'duration' || durations.length > 0).map(key => {
        const group = groups[key]
        return <button key={key} onClick={() => setOpen(open === key ? null : key)} className={`min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left ${open === key ? 'bg-white/[0.1]' : 'bg-white/[0.04] hover:bg-white/[0.08]'}`}><span className="block text-[9px] uppercase text-slate-500">{group.label}</span><span className="flex items-center justify-between gap-1 truncate text-[10px] font-semibold text-slate-100">{group.value}<CaretDown size={10} /></span></button>
      })}
    </div>
    {open && <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-white/[0.08] bg-[#17191f] p-1">{groups[open].options.map(option => <button key={option.id} onClick={() => { groups[open].onChange(option.id); setOpen(null) }} className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[10px] text-slate-300 hover:bg-white/[0.08]">{option.label}{groups[open].value === option.label || (open !== 'model' && groups[open].value === option.id) ? <Check size={11} className="text-lime-300" /> : null}</button>)}</div>}
  </div>
}
