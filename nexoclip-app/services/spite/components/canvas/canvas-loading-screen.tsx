'use client'

import { useEffect, useState } from 'react'
import { Sparkle } from '@phosphor-icons/react'

const SLOW_AFTER_MS = 12_000
const FADE_MS = 350

// Full-screen loader shown until the canvas has synced with the server, then
// faded out. Also used as the route-level loading UI.
export function CanvasLoadingScreen({ ready = false }: { ready?: boolean }) {
  const [slow, setSlow] = useState(false)
  const [mounted, setMounted] = useState(true)

  useEffect(() => {
    if (ready) return
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [ready])

  // Keep it on screen for the fade, then unmount.
  useEffect(() => {
    if (!ready) {
      setMounted(true)
      return
    }
    const timer = window.setTimeout(() => setMounted(false), FADE_MS)
    return () => window.clearTimeout(timer)
  }, [ready])

  if (!mounted) return null

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy={!ready}
      className="fixed inset-0 z-[80] flex flex-col items-center justify-center bg-[#0c0d12] transition-opacity ease-out"
      style={{ opacity: ready ? 0 : 1, transitionDuration: `${FADE_MS}ms`, pointerEvents: ready ? 'none' : 'auto' }}
    >
      <style>{`
        @keyframes canvas-loader-spin { to { transform: rotate(360deg) } }
        @keyframes canvas-loader-pulse { 0%, 100% { transform: scale(1); opacity: 1 } 50% { transform: scale(0.92); opacity: 0.85 } }
        @keyframes canvas-loader-shimmer { 0% { transform: translateX(-100%) } 100% { transform: translateX(250%) } }
        @media (prefers-reduced-motion: reduce) {
          .canvas-loader-anim { animation: none !important }
        }
      `}</style>

      <div className="relative h-24 w-24">
        {/* Spinning gradient ring */}
        <div
          className="canvas-loader-anim absolute inset-0 rounded-full"
          style={{
            background: 'conic-gradient(from 0deg, transparent 0deg, rgba(163,230,53,0.0) 40deg, #a3e635 200deg, #34d399 300deg, transparent 360deg)',
            WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))',
            mask: 'radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px))',
            animation: 'canvas-loader-spin 1.1s linear infinite',
          }}
        />
        {/* Orbiting dot */}
        <div className="canvas-loader-anim absolute inset-0" style={{ animation: 'canvas-loader-spin 2.4s linear infinite reverse' }}>
          <span className="absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.9)]" />
        </div>
        {/* Logo */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="canvas-loader-anim flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-400 via-lime-400 to-emerald-400 text-slate-950 shadow-lg shadow-lime-500/20"
            style={{ animation: 'canvas-loader-pulse 1.6s ease-in-out infinite' }}
          >
            <Sparkle size={22} weight="fill" />
          </div>
        </div>
      </div>

      <p className="mt-6 text-sm font-medium text-slate-200">Membuka canvas…</p>
      <div className="mt-3 h-1 w-40 overflow-hidden rounded-full bg-white/[0.07]">
        <div
          className="canvas-loader-anim h-full w-1/3 rounded-full bg-gradient-to-r from-lime-400 to-emerald-400"
          style={{ animation: 'canvas-loader-shimmer 1.3s ease-in-out infinite' }}
        />
      </div>
      <p className={`mt-4 text-xs text-slate-500 transition-opacity duration-500 ${slow ? 'opacity-100' : 'opacity-0'}`}>
        Masih menghubungkan ke server… periksa koneksi kamu kalau ini lama.
      </p>
    </div>
  )
}
