'use client'

import { withBasePath } from '@/lib/base-path'
import { useState, useMemo } from 'react'
import useSWR from 'swr'
import { ArrowLeft, Question } from '@phosphor-icons/react'
import { ProjectCard } from './project-card'
import { NewProjectCard } from './new-project-card'
import { SearchBar } from './search-bar'
import { DashboardHero } from './dashboard-hero'
import { OnboardingTour } from './onboarding/use-onboarding-tour'
import { startTour } from '@/lib/onboarding'

interface Project {
  id: string
  name: string
  description: string | null
  thumbnail: string | null
  origin?: string
  createdat: string
  updatedat: string
}

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(data => {
  // Handle both array response and error response
  if (Array.isArray(data)) return data
  console.error('[projects-dashboard] API returned non-array:', data)
  return []
})

export function ProjectsDashboard() {
  const [search, setSearch] = useState('')
  const { data: projects = [], mutate } = useSWR<Project[]>(withBasePath('/api/projects'), fetcher)

  const filtered = useMemo(() => {
    if (!search.trim()) return projects
    const q = search.toLowerCase()
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q)
    )
  }, [search, projects])

  // Flow (the linear prompt→result thread) is no longer offered as a
  // creation option — Canvas is the only project type this dashboard lets
  // you start. Projects already created as Flow before that change still
  // need somewhere to live, so they get their own small read-only section
  // below (no "New Flow" card) instead of disappearing. Anything that
  // isn't 'canvas' counts as Flow (so legacy 'mobile' rows still group
  // correctly).
  const canvasProjects = useMemo(() => filtered.filter((p) => (p.origin ?? 'canvas') === 'canvas'), [filtered])
  const flowProjects = useMemo(() => filtered.filter((p) => (p.origin ?? 'canvas') !== 'canvas'), [filtered])

  // Format relative time
  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)
    const diffWeeks = Math.floor(diffDays / 7)
    
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`
    if (diffWeeks < 4) return `${diffWeeks} week${diffWeeks !== 1 ? 's' : ''} ago`
    return date.toLocaleDateString()
  }

  const handleProjectCreated = () => {
    mutate()
  }

  return (
    <>
      {/* Brand background: ozone gradient base + film grain overlay,
          both fixed-position so the atmosphere stays consistent as the
          project grid scrolls. Mirrors the login page. The dot-grid sits
          on top of those two — it's the same pattern the hero uses, but
          spans the whole page (not just the hero) so scrolling into the
          project grid doesn't hit a visible seam where the pattern stops. */}
      <div className="spite-ozone-bg fixed inset-0 z-0 pointer-events-none" aria-hidden="true" />
      <div className="spite-grain" aria-hidden="true" />
      <div
        className="fixed inset-0 z-[1] pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(rgba(107,143,168,0.14) 1.2px, transparent 1.2px)',
          backgroundSize: '24px 24px',
        }}
        aria-hidden="true"
      />

      <div className="relative z-10 min-h-screen">
        {/* Header */}
        <header className="sticky top-0 z-50">
          <div className="glass border-b border-white/5 px-6 md:px-10 py-4">
            <div className="max-w-6xl mx-auto flex items-center justify-between gap-6">
              <a
                href={process.env.NEXT_PUBLIC_STUDIO_URL || '/studio'}
                className="shrink-0 flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft size={15} />
                Kembali ke Studio
              </a>

              {/* Search */}
              <div className="flex-1 max-w-md" data-tour="search">
                <SearchBar value={search} onChange={setSearch} />
              </div>

            </div>
          </div>
        </header>

        {/* Decorative node-graph hero — full-bleed like the canvas it
            represents, not boxed into the article-width column below.
            Hidden while searching so results aren't pushed off-screen. */}
        {!search && (
          <div data-tour="hero">
            <DashboardHero />
          </div>
        )}

        {/* Main content */}
        <main className="max-w-6xl mx-auto px-6 md:px-10 py-10">

          {/* Section label. While searching, show the result count instead. */}
          <div className="flex items-baseline justify-between gap-3 mb-6">
            {search ? (
              <p className="text-[11px] font-mono tracking-[0.18em] uppercase text-muted-foreground/70">
                {filtered.length} result{filtered.length !== 1 ? 's' : ''} for &quot;{search}&quot;
              </p>
            ) : (
              <div className="flex items-baseline gap-3">
                <p className="text-[11px] font-mono tracking-[0.18em] uppercase text-muted-foreground/70">
                  Semua Kanvas
                </p>
                <span className="text-[10px] font-mono text-muted-foreground/40">
                  {canvasProjects.length} · node canvas{canvasProjects.length !== 1 ? 'es' : ''}
                </span>
              </div>
            )}
            {!search && (
              <button
                onClick={() => startTour('dashboard')}
                className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground hover:text-accent transition-colors"
              >
                <Question size={12} weight="regular" />
                Panduan Singkat
              </button>
            )}
          </div>

          {/* Grid — canvas projects */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {/* New project card is always first */}
            {!search && <div data-tour="new-canvas"><NewProjectCard onCreated={handleProjectCreated} /></div>}

            {canvasProjects.map((project) => (
              <ProjectCard
                key={project.id}
                id={project.id}
                name={project.name}
                thumbnail={project.thumbnail || undefined}
                lastModified={formatRelativeTime(project.updatedat)}
                onMutate={() => mutate()}
              />
            ))}

            {/* Empty state when searching (and nothing matched anywhere) */}
            {search && filtered.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-24 gap-3">
                <p
                  className="text-xl text-foreground/40"
                  style={{ fontFamily: 'var(--font-montserrat)' }}
                >
                  No projects found
                </p>
                <p className="text-xs font-mono text-muted-foreground/50 tracking-wide">
                  Try a different search term
                </p>
              </div>
            )}

            {/* Empty state when no projects at all */}
            {!search && projects.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-12 gap-3">
                <p className="text-sm text-muted-foreground/50 font-mono">
                  No projects yet. Create your first one!
                </p>
              </div>
            )}
          </div>

          {/* Flow — the simple, linear prompt→result generation mode. No longer
              offered as something you can start (Canvas is the only creation
              option now), so there's no "New Flow" card here — this section
              is just a landing spot for projects that were already Flow
              before that change, and disappears entirely once none are left. */}
          {flowProjects.length > 0 && (
            <section className="mt-12">
              <div className="flex items-baseline gap-3 mb-6">
                <p className="text-[11px] font-mono tracking-[0.18em] uppercase text-muted-foreground/70">
                  Flow
                </p>
                <span className="text-[10px] font-mono text-muted-foreground/40">
                  {flowProjects.length} · generation thread{flowProjects.length !== 1 ? 's' : ''} (lama)
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {flowProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    id={project.id}
                    name={project.name}
                    thumbnail={project.thumbnail || undefined}
                    lastModified={formatRelativeTime(project.updatedat)}
                    href={`/m/project/${project.id}`}
                    onMutate={() => mutate()}
                  />
                ))}
              </div>
            </section>
          )}
        </main>
      </div>

      <OnboardingTour surface="dashboard" />
    </>
  )
}
