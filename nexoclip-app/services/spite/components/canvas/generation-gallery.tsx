'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowSquareOut, CheckCircle, CircleNotch, Images, WarningCircle } from '@phosphor-icons/react'

import { useCanvasCollaboration } from './canvas-collaboration'
import { AssetThumb } from './asset-thumb'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { getCanvasRuntimeCapabilities } from '@/lib/canvas-runtime-ui'
import { readGenerationHistory, type GenerationHistoryEntry } from '@/lib/generation-history'

const STRIP_SIZE = 3
const OPEN_EVENT = 'open-generation-gallery'
type OpenDetail = { nodeId: string; focusId: string | null }

function formatWhen(entry: GenerationHistoryEntry): string {
  const at = entry.finishedAt ?? entry.startedAt
  if (!at) return ''
  const date = new Date(at)
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function Bubble({ entry, onClick }: { entry: GenerationHistoryEntry; onClick: () => void }) {
  const label = entry.status === 'succeeded' ? 'Generated result' : entry.status === 'failed' ? `Failed: ${entry.error ?? 'generation failed'}` : 'Still generating'
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`nodrag relative h-9 w-9 shrink-0 overflow-hidden rounded-full border-2 bg-[#15171d] shadow-md transition-transform hover:scale-110 ${
        entry.status === 'failed' ? 'border-red-500/70' : entry.status === 'queued' ? 'border-sky-400/60' : 'border-white/25'
      }`}
    >
      {entry.status === 'succeeded' && entry.outputUrl ? (
        <AssetThumb url={entry.outputUrl} type={entry.kind} />
      ) : entry.status === 'failed' ? (
        <span className="flex h-full w-full items-center justify-center bg-red-500/15 text-red-400"><WarningCircle size={18} weight="fill" /></span>
      ) : (
        <span className="flex h-full w-full items-center justify-center text-sky-300"><CircleNotch size={16} className="animate-spin" /></span>
      )}
    </button>
  )
}

// A generator node's run history: the latest results as bubbles under the
// node. The Gallery dialog itself lives in GenerationGalleryHost, outside the
// node, because the node's pointer handlers would swallow clicks inside a
// dialog rendered from within it (React events bubble through portals).
export function GenerationGallery({ nodeId, data, selected }: { nodeId: string; data: Record<string, unknown>; selected?: boolean }) {
  const history = useMemo(() => readGenerationHistory(data), [data])
  if (history.length === 0) return null

  const openGallery = (entryId?: string) => {
    window.dispatchEvent(new CustomEvent<OpenDetail>(OPEN_EVENT, { detail: { nodeId, focusId: entryId ?? null } }))
  }

  return (
    <>
      <div className="absolute left-0 top-full mt-2.5 flex items-center gap-1.5" onDoubleClick={(event) => event.stopPropagation()}>
        {history.slice(0, STRIP_SIZE).map((entry) => (
          <Bubble key={entry.id} entry={entry} onClick={() => openGallery(entry.id)} />
        ))}
        {selected || history.length > STRIP_SIZE ? (
          <button
            type="button"
            onClick={() => openGallery()}
            className="nodrag ml-1 flex h-7 items-center gap-1.5 rounded-full border border-white/10 bg-[#15171d]/95 px-3 text-[11px] font-medium text-slate-200 shadow-md hover:bg-white/[0.08]"
            title="See every result of this node"
          >
            <Images size={13} /> Gallery · {history.length}
          </button>
        ) : null}
      </div>
    </>
  )
}

// Mounted once by the canvas; shows the Gallery for whichever node asked.
export function GenerationGalleryHost({ nodes }: { nodes: Array<{ id: string; data?: unknown }> }) {
  const [request, setRequest] = useState<OpenDetail | null>(null)
  useEffect(() => {
    const onOpen = (event: Event) => setRequest((event as CustomEvent<OpenDetail>).detail)
    window.addEventListener(OPEN_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_EVENT, onOpen)
  }, [])
  const node = request ? nodes.find((candidate) => candidate.id === request.nodeId) : undefined
  const history = useMemo(() => readGenerationHistory((node?.data ?? {}) as Record<string, unknown>), [node?.data])
  if (!request || !node) return null
  return (
    <GalleryDialog
      nodeId={node.id}
      history={history}
      open
      focusId={request.focusId}
      onOpenChange={(open) => { if (!open) setRequest(null) }}
    />
  )
}

function GalleryDialog({ nodeId, history, open, focusId, onOpenChange }: {
  nodeId: string
  history: GenerationHistoryEntry[]
  open: boolean
  focusId: string | null
  onOpenChange: (open: boolean) => void
}) {
  const { patchNodeData, persistenceStatus } = useCanvasCollaboration()
  const { allowDocumentMutation } = getCanvasRuntimeCapabilities(persistenceStatus)
  const succeeded = history.filter((entry) => entry.status === 'succeeded').length
  const failed = history.filter((entry) => entry.status === 'failed').length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] max-w-4xl overflow-hidden border-white/10 bg-[#111318] p-0 text-slate-100"
        onKeyDown={(event) => event.stopPropagation()}
      >
        <DialogHeader className="border-b border-white/[0.06] px-5 py-4">
          <DialogTitle className="flex items-center gap-2 text-base"><Images size={16} /> Gallery</DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            {history.length} run{history.length === 1 ? '' : 's'} · {succeeded} succeeded · {failed} failed
          </DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[calc(85vh-80px)] grid-cols-2 gap-3 overflow-y-auto p-5 sm:grid-cols-3">
          {history.map((entry) => (
            <article
              key={entry.id}
              ref={(element) => { if (element && entry.id === focusId) element.scrollIntoView({ block: 'nearest' }) }}
              className={`overflow-hidden rounded-xl border bg-[#181b22] ${entry.id === focusId ? 'border-sky-400/70 ring-1 ring-sky-400/40' : 'border-white/[0.08]'}`}
            >
              <div className="aspect-video bg-black">
                {entry.status === 'succeeded' && entry.outputUrl ? (
                  <AssetThumb url={entry.outputUrl} type={entry.kind} variant="preview" fit="contain" />
                ) : entry.status === 'failed' ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 bg-red-500/[0.06] p-3 text-center text-red-300">
                    <WarningCircle size={26} weight="fill" />
                    <p className="line-clamp-4 text-[11px] leading-snug text-red-200/90">{entry.error ?? 'Generation failed'}</p>
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center text-sky-300"><CircleNotch size={24} className="animate-spin" /></div>
                )}
              </div>
              <div className="flex items-center gap-2 px-3 py-2 text-[11px]">
                <span className={`flex items-center gap-1 font-medium ${entry.status === 'succeeded' ? 'text-emerald-300' : entry.status === 'failed' ? 'text-red-300' : 'text-sky-300'}`}>
                  {entry.status === 'succeeded' ? <CheckCircle size={12} weight="fill" /> : entry.status === 'failed' ? <WarningCircle size={12} weight="fill" /> : <CircleNotch size={12} className="animate-spin" />}
                  {entry.status === 'succeeded' ? 'Succeeded' : entry.status === 'failed' ? 'Failed' : 'Generating'}
                </span>
                <span className="text-slate-500">{formatWhen(entry)}</span>
                {entry.status === 'succeeded' && entry.outputUrl ? (
                  <span className="ml-auto flex items-center gap-1">
                    {allowDocumentMutation ? (
                      <button
                        type="button"
                        onClick={() => { patchNodeData(nodeId, { outputUrl: entry.outputUrl }); onOpenChange(false) }}
                        className="rounded-md px-1.5 py-0.5 text-slate-300 hover:bg-white/10 hover:text-white"
                        title="Show this result on the node"
                      >
                        Use this
                      </button>
                    ) : null}
                    <a href={entry.outputUrl} target="_blank" rel="noreferrer" className="rounded-md p-1 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Open in a new tab">
                      <ArrowSquareOut size={12} />
                    </a>
                  </span>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
