'use client'

import { useState } from 'react'
import { Download, Loader2, Play, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { exportScenesAsZip } from '@/lib/export-scenes'

export interface Shot {
  id: string
  nodeId: string
  thumbnail?: string
  mediaUrl?: string
  label?: string
  hasVideo?: boolean
  order: number
}

export interface Scene {
  id: string
  name: string
  shots: Shot[]
}

interface SceneTimelineProps {
  scenes: Scene[]
  activeSceneId: string
  onSceneChange: (sceneId: string) => void
  onAddScene: () => void
  onDeleteScene?: (sceneId: string) => void
  onShotClick?: (sceneId: string, shotId: string) => void
  onReorderShot?: (sceneId: string, shotId: string, newIndex: number) => void
  projectName?: string
}

export function SceneTimeline({
  scenes,
  activeSceneId,
  onSceneChange,
  onAddScene,
  onDeleteScene,
  onShotClick,
  onReorderShot,
  projectName,
}: SceneTimelineProps) {
  const [exporting, setExporting] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string; shotCount: number } | null>(null)
  const [draggedShot, setDraggedShot] = useState<{ sceneId: string; shotId: string; index: number } | null>(null)
  const [dropTarget, setDropTarget] = useState<{ sceneId: string; index: number } | null>(null)

  const totalShots = scenes.reduce((acc, s) => acc + s.shots.filter((sh) => sh.nodeId).length, 0)

  const handleExport = async () => {
    if (exporting) return
    setExporting(true)
    const toastId = toast.loading('Building zip...')
    try {
      const result = await exportScenesAsZip(scenes, projectName || 'nexoclip-storyboard')
      const skippedCount = result.skipped.length
      toast.success(
        skippedCount > 0
          ? `Exported ${result.fileCount} shot${result.fileCount === 1 ? '' : 's'} (${skippedCount} skipped)`
          : `Exported ${result.fileCount} shot${result.fileCount === 1 ? '' : 's'}`,
        { id: toastId },
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed', { id: toastId })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div data-tour="scene-timeline" className="min-w-0 max-w-full flex items-center gap-1.5">
      {/* Compact Segmented Scene Strip */}
      <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-[11px] border border-zinc-200/90 bg-[#f4f4f6] p-0.5 scrollbar-hide">
        {scenes.map((scene) => {
          const isActive = scene.id === activeSceneId
          const sortedShots = [...scene.shots].sort((a, b) => a.order - b.order)
          const realShots = sortedShots.filter((s) => s.nodeId)

          return (
            <div
              key={scene.id}
              onClick={() => onSceneChange(scene.id)}
              className={`group/scene flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-[8px] px-2.5 transition-all ${
                isActive
                  ? 'border border-zinc-200/90 bg-white text-zinc-950 shadow-[0_1px_3px_rgba(15,15,20,0.06)]'
                  : 'border border-transparent text-zinc-500 hover:bg-white/60 hover:text-zinc-900'
              }`}
            >
              {isActive && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-violet-500" />}
              <span className="whitespace-nowrap text-[12px] font-medium">{scene.name}</span>

              {/* Compact shot thumbnails only when real shots exist */}
              {realShots.length > 0 && (
                <div className="ml-0.5 flex items-center gap-1">
                  {realShots.slice(0, 4).map((shot, index) => (
                    <div
                      key={shot.id}
                      draggable
                      onDragStart={() => setDraggedShot({ sceneId: scene.id, shotId: shot.id, index })}
                      onDragOver={(e) => {
                        e.preventDefault()
                        if (draggedShot && draggedShot.sceneId === scene.id) {
                          setDropTarget({ sceneId: scene.id, index })
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        if (draggedShot && draggedShot.sceneId === scene.id && onReorderShot) {
                          onReorderShot(scene.id, draggedShot.shotId, index)
                        }
                        setDraggedShot(null)
                        setDropTarget(null)
                      }}
                      onDragEnd={() => {
                        setDraggedShot(null)
                        setDropTarget(null)
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        onShotClick?.(scene.id, shot.id)
                      }}
                      title={shot.label || `Shot ${shot.order}`}
                      className={`relative h-5 w-7 shrink-0 overflow-hidden rounded border border-zinc-200 bg-zinc-100 transition-transform ${
                        dropTarget?.sceneId === scene.id && dropTarget.index === index ? 'ring-2 ring-zinc-900 scale-105' : ''
                      }`}
                    >
                      {shot.thumbnail ? (
                        <img
                          src={shot.thumbnail}
                          alt={shot.label || `Shot ${shot.order}`}
                          className="h-full w-full object-cover"
                          draggable={false}
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-[9px] font-medium text-zinc-500">
                          {shot.order}
                        </span>
                      )}
                      {shot.hasVideo && (
                        <span className="absolute bottom-0.5 right-0.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-black/75">
                          <Play size={6} fill="white" className="text-white" />
                        </span>
                      )}
                    </div>
                  ))}
                  {realShots.length > 4 && (
                    <span className="text-[10px] font-medium text-zinc-400">+{realShots.length - 4}</span>
                  )}
                </div>
              )}

              {onDeleteScene && scenes.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setPendingDelete({ id: scene.id, name: scene.name, shotCount: realShots.length })
                  }}
                  className="ml-0.5 flex h-4 w-4 items-center justify-center rounded text-zinc-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover/scene:opacity-100"
                  aria-label={`Delete ${scene.name}`}
                  title={`Delete ${scene.name}`}
                >
                  <Trash2 size={11} strokeWidth={2} />
                </button>
              )}
            </div>
          )
        })}

        {/* Compact Add Scene button */}
        <button
          type="button"
          onClick={onAddScene}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] text-zinc-500 transition-colors hover:bg-white hover:text-zinc-950"
          aria-label="Add scene"
          title="Add scene"
        >
          <Plus size={14} strokeWidth={2} />
        </button>
      </div>

      {/* Export Storyboard button (only shown once at least 1 shot is tagged) */}
      {totalShots > 0 && (
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting}
          title="Export storyboard shots as ZIP"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] border border-zinc-200 bg-white px-2.5 text-[11px] font-medium text-zinc-700 shadow-xs transition-colors hover:bg-zinc-50 hover:text-zinc-950 disabled:opacity-50"
        >
          {exporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} strokeWidth={2} />}
          <span className="hidden sm:inline">Export</span>
        </button>
      )}

      {/* Delete-scene confirmation modal */}
      {pendingDelete && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/35 backdrop-blur-[2px]"
          onClick={() => setPendingDelete(null)}
        >
          <div
            className="w-[400px] max-w-[90vw] rounded-[18px] border border-zinc-200 bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1.5 text-[15px] font-semibold text-zinc-900">
              Delete {pendingDelete.name}?
            </h3>
            <p className="mb-5 text-[13px] leading-relaxed text-zinc-500">
              {pendingDelete.shotCount > 0
                ? `This scene has ${pendingDelete.shotCount} tagged shot${pendingDelete.shotCount === 1 ? '' : 's'}. Every node on its canvas will be deleted along with it.`
                : 'All nodes on this scene’s canvas will be deleted.'}{' '}
              This can’t be undone.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteScene?.(pendingDelete.id)
                  setPendingDelete(null)
                }}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-red-500"
              >
                Delete scene
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
