'use client';

import { useState } from 'react';

const panels = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'artifacts', label: 'Artifacts' },
];

const projects = [
  { id: 'current', name: 'Current workspace', description: 'Ready for a new story' },
];

export default function ViMaxStudioShell() {
  const [activePanel, setActivePanel] = useState('workspace');
  const [prompt, setPrompt] = useState('');

  return (
    <section className="flex h-full min-h-0 w-full bg-[#080809] text-white" data-testid="vimax-studio">
      <aside className="hidden w-64 shrink-0 border-r border-white/[0.08] bg-[#0d0d0f] p-4 md:flex md:flex-col">
        <div className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">AI Storyboard</p>
          <h1 className="mt-2 text-lg font-semibold">AI Storyboard</h1>
          <p className="mt-1 text-xs leading-5 text-white/45">Agentic video generation workspace</p>
        </div>

        <button type="button" className="mb-3 rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-3 py-2 text-left text-sm text-cyan-200 hover:bg-cyan-400/15">
          + New project
        </button>

        <nav className="space-y-1" aria-label="AI Storyboard navigation">
          {panels.map((panel) => (
            <button
              key={panel.id}
              type="button"
              onClick={() => setActivePanel(panel.id)}
              className={`block w-full rounded-md px-3 py-2 text-left text-sm ${activePanel === panel.id ? 'bg-white/[0.08] text-cyan-200' : 'text-white/50 hover:bg-white/[0.04] hover:text-white'}`}
            >
              {panel.label}
            </button>
          ))}
        </nav>

        <div className="mt-5 flex min-h-0 flex-1 flex-col border-t border-white/[0.08] pt-4">
          <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Projects</p>
          <div className="mt-2 space-y-2 overflow-y-auto">
            {projects.map((project) => (
              <button key={project.id} type="button" className="w-full rounded-lg bg-white/[0.08] px-3 py-2 text-left text-sm text-white/85">
                {project.name}
                <span className="mt-1 block text-[11px] text-white/35">{project.description}</span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between bg-transparent px-4 py-3 md:px-6">
          <div>
            <p className="text-sm font-medium text-white/90">{activePanel === 'workspace' ? 'Workspace' : panels.find((panel) => panel.id === activePanel)?.label}</p>
            <p className="text-xs text-white/40">AI Storyboard engine integration</p>
          </div>
          <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2.5 py-1 text-[11px] text-amber-200">Integration preview</span>
        </header>

        {activePanel === 'workspace' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 overflow-y-auto p-4 md:p-8">
              <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-center text-center">
                <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-2xl">✦</div>
                <h2 className="text-2xl font-semibold tracking-tight md:text-4xl">What do you want to create?</h2>
                <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-white/45">Use the AI Storyboard agent for idea-to-video, script-to-video, novel-to-video, and long-form video workflows.</p>
                <div className="mt-8 grid gap-3 text-left sm:grid-cols-3">
                  {['Idea to video', 'Script to video', 'Long-form story'].map((suggestion) => (
                    <button key={suggestion} type="button" onClick={() => setPrompt(`Create a ${suggestion.toLowerCase()} project`)} className="rounded-xl border border-white/[0.08] bg-white/[0.03] p-3 text-xs text-white/65 transition hover:border-cyan-400/30 hover:bg-cyan-400/[0.06]">
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <form className="border-t border-white/[0.08] bg-[#0d0d0f] p-4 md:p-6" onSubmit={(event) => event.preventDefault()}>
              <div className="mx-auto flex max-w-3xl items-end gap-3 rounded-2xl border border-white/[0.1] bg-white/[0.04] p-3 focus-within:border-cyan-400/35">
                <button type="button" aria-label="Attach file" className="mb-1 rounded-lg px-2 py-2 text-white/45 hover:bg-white/[0.08] hover:text-white">+</button>
                <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={2} placeholder="Describe your video idea..." className="min-h-12 flex-1 resize-none bg-transparent px-1 py-2 text-sm text-white outline-none placeholder:text-white/30" />
                <button type="submit" aria-label="Send prompt" className="rounded-lg bg-cyan-300 px-3 py-2 text-sm font-semibold text-black hover:bg-cyan-200">↑</button>
              </div>
            </form>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-sm text-white/45">
            Generated artifacts will appear here.
          </div>
        )}
      </main>
    </section>
  );
}
