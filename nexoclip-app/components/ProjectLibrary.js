'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Folder, FolderOpen, FolderInput, Pencil, Trash2, Plus, Search, SlidersHorizontal } from 'lucide-react';
import { filterLibrary } from '../src/lib/projectLibraryFilters';
import { saasFetch } from '../src/lib/saas/api';
import { NxCardGridSkeleton } from './ui/nx-loading';

const labels = {
  canvas: 'Canvas',
  cinema: 'Cinema',
  director: 'AI Director',
  motion: 'AI Motion',
  'ai-influencer': 'AI Influencer',
};
const field = 'h-[38px] rounded-[10px] border border-[#e5e5ee] bg-white px-3 text-[13px] text-[#14141f] outline-none transition focus:border-[#14141f]';
const date = (value) =>
  new Date(value).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });

export default function ProjectLibrary({ authStatus, onSignIn, selection }) {
  const workspace = typeof window !== 'undefined' && sessionStorage.getItem('nexoclip_workspace_id');
  const folder = typeof window !== 'undefined' && new URLSearchParams(location.search).get('folder');
  const [data, setData] = useState(null),
    [error, setError] = useState(''),
    [revision, reload] = useState(0);
  const [search, setSearch] = useState(''),
    [studio, setStudio] = useState(''),
    [status, setStatus] = useState(''),
    [order, setOrder] = useState('newest');
  const [modal, setModal] = useState(null),
    [name, setName] = useState(''),
    [busy, setBusy] = useState(false);
  const [dragged, setDragged] = useState(null);
  const [target, setTarget] = useState('');
  const [notice, setNotice] = useState('');
  const dialog = useRef(null);
  const refresh = useCallback(() => reload((v) => v + 1), []);
  useEffect(() => {
    if (authStatus !== 'authenticated' || !workspace) return;
    const controller = new AbortController();
    const load = () =>
      saasFetch('/api/project-library', {
        headers: { 'x-workspace-id': workspace },
        signal: controller.signal,
        cache: 'no-store',
      })
        .then((value) => {
          if (!controller.signal.aborted) {
            setData(value);
            setError('');
          }
        })
        .catch((err) => {
          if (!controller.signal.aborted) setError(err.message);
        });
    load();
    const onShow = (e) => {
      if (e.persisted) refresh();
    };
    window.addEventListener('pageshow', onShow);
    window.addEventListener('focus', refresh);
    window.addEventListener('nexoclip:project-changed', refresh);
    return () => {
      controller.abort();
      window.removeEventListener('pageshow', onShow);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('nexoclip:project-changed', refresh);
    };
  }, [workspace, authStatus, revision, refresh]);
  useEffect(() => {
    if (!data?.projects.some(p => ['queued', 'running'].includes(p.status))) return;
    const timer = window.setTimeout(() => {
      if (document.visibilityState === 'visible') refresh();
    }, 30000);
    return () => window.clearTimeout(timer);
  }, [data, refresh]);
  useEffect(() => {
    if (modal) dialog.current?.showModal();
  }, [modal]);
  function open(action, item) {
    setName(action === 'rename' ? item.name : '');
    setModal({ action, item });
  }
  function endDrag() {
    setDragged(null);
    setTarget('');
  }
  function move(project, destination) {
    if (busy || (project.folderId || null) === destination) return;
    mutate({ action: 'move', studio: project.studio, id: project.id, folderId: destination },
      destination ? 'Project moved to ' + data.folders.find(f => f.id === destination).name : 'Project moved to main list.');
  }
  function dropHandlers(destination) {
    return {
      onDragOver(event) {
        if (!dragged || (dragged.folderId || null) === destination || busy) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setTarget(destination || 'root');
      },
      onDragLeave(event) {
        if (!event.currentTarget.contains(event.relatedTarget)) setTarget('');
      },
      onDrop(event) {
        if (!dragged) return;
        event.preventDefault();
        move(dragged, destination);
        endDrag();
      },
    };
  }
  async function mutate(body, message = '') {
    setBusy(true);
    setNotice('');
    setError('');
    try {
      await saasFetch('/api/project-library', {
        method: 'POST',
        headers: { 'x-workspace-id': workspace, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      setModal(null);
      setNotice(message);
      refresh();
    } catch (err) {
      setError(err.message);
      setModal(null);
    } finally {
      setBusy(false);
    }
  }
  if (authStatus === 'guest')
    return (
      <main className="nx-library nx-content-page">
        <h1>Projects</h1>
        <button onClick={onSignIn}>Sign in to view projects</button>
      </main>
    );
  const current = data?.folders.find((f) => f.id === folder);
  const visible = data && filterLibrary(data, { folder, search, studio, status, order });
  return (
    <main className="nx-library nx-content-page !bg-white">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 data-tour="library-header">{current?.name || 'Projects'}</h1>
          {folder && (
            <a className="text-sm underline" href="/studio/projects">
              ← All projects
            </a>
          )}
        </div>
        <button
          className="inline-flex h-[36px] items-center gap-1.5 rounded-full border border-[#dfe0ea] bg-[#f4f4f7] px-4 text-[13px] font-semibold text-[#14141f] transition hover:border-[#cfd0de] hover:bg-[#e9e9f0]"
          onClick={() => open('add')}
        >
          <Plus size={15} strokeWidth={2.2} /> Add New
        </button>
      </header>
      <div data-tour="library-filters" className="my-6 flex flex-wrap gap-2">
        <label className={field + ' flex items-center gap-2'}>
          <Search size={16} />
          <input
            aria-label="Search projects and folders"
            placeholder="Search projects and folders"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border-0 !bg-transparent outline-none"
          />
        </label>
        <select
          className={field}
          aria-label="Filter by studio"
          value={studio}
          onChange={(e) => setStudio(e.target.value)}
        >
          <option value="">All studios</option>
          {Object.entries(labels).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          className={field}
          aria-label="Filter by status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">All statuses</option>
          {[...new Set(data?.projects.map((p) => p.status).filter(Boolean))].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <select
          className={field}
          aria-label="Sort by date"
          value={order}
          onChange={(e) => setOrder(e.target.value)}
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
        </select>
      </div>
      {notice && <p role="status" className="mb-3 text-sm text-emerald-700">{notice}</p>}
      {error && (
        <p role="alert">
          {error} <button onClick={refresh}>Try again</button>
        </p>
      )}
      {data?.unavailable.length > 0 && (
        <p role="status">
          {data.unavailable.map((s) => labels[s]).join(', ')} could not be loaded.{' '}
          <button onClick={refresh}>Try again</button>
        </p>
      )}
      {!data && !error && <NxCardGridSkeleton kind="projects" count={6} />}
      {visible && (
        <>
          {(!folder || dragged) && (
            <section className={dragged ? 'sticky top-0 z-10 max-h-[38vh] overflow-auto rounded-xl border bg-white p-3 shadow-md' : ''}>
              <h2 className="mb-3 font-semibold">{dragged ? 'Drop project onto a folder' : 'Folders'}</h2>
              <div className="flex flex-wrap gap-3">
                {dragged?.folderId && <div {...dropHandlers(null)} className={field + ' flex items-center gap-2 border-dashed ' + (target === 'root' ? 'ring-2 ring-indigo-500' : '')}><FolderOpen size={18}/> No folder</div>}
                {(dragged ? data.folders : visible.folders).map((f) => (
                  <div key={f.id} {...dropHandlers(f.id)} className={field + ' flex items-center gap-3 transition ' + (target === f.id ? 'ring-2 ring-indigo-500 bg-indigo-50' : '')}>
                    <a className="flex items-center gap-2 font-semibold" href={'?folder=' + f.id}>
                      <Folder size={19} />
                      {f.name}
                    </a>
                    <button aria-label={'Rename ' + f.name} onClick={() => open('rename', f)}>
                      <Pencil size={14} />
                    </button>
                    <button aria-label={'Delete ' + f.name} onClick={() => open('delete', f)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {!visible.folders.length && (
                  <button className={field} onClick={() => open('create')}>
                    + New Folder
                  </button>
                )}
              </div>
            </section>
          )}
          <section data-tour="library-content">
            <h2 className="mb-3 mt-8 font-semibold">Projects</h2>
            {!visible.projects.length ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#e4e5ef] bg-[#fafafc] px-6 py-16 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-xl border border-[#e5e5ee] bg-white text-[#5c5d70]">
                  <FolderOpen size={22} strokeWidth={1.8} />
                </span>
                <h3 className="mt-4 text-[15.5px] font-semibold text-[#14141f]">
                  {search || studio || status ? 'No matching projects' : 'No projects yet'}
                </h3>
                <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-[#6d6e80]">
                  {search || studio || status
                    ? 'Try another keyword or reset your filters to view other projects.'
                    : 'Create a new project in AI Director, Video Studio, Image Studio, or Canvas to get started.'}
                </p>
                {search || studio || status ? (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch('');
                      setStudio('');
                      setStatus('');
                    }}
                    className="mt-5 inline-flex h-[36px] items-center rounded-full border border-[#dfe0ea] bg-[#f4f4f7] px-4 text-[13px] font-semibold text-[#14141f] transition hover:border-[#cfd0de] hover:bg-[#e9e9f0]"
                  >
                    Reset filters
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => open('add')}
                    className="mt-5 inline-flex h-[36px] items-center gap-1.5 rounded-full border border-[#dfe0ea] bg-[#f4f4f7] px-4 text-[13px] font-semibold text-[#14141f] transition hover:border-[#cfd0de] hover:bg-[#e9e9f0]"
                  >
                    <Plus size={15} strokeWidth={2.2} />
                    <span>Add New Project</span>
                  </button>
                )}
              </div>
            ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.projects.map((p) => (
                <article
                  key={p.studio + '/' + p.id}
                  draggable={!busy}
                  onDragStart={e => {
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', p.name);
                    setDragged(p);
                    setNotice('');
                  }}
                  onDragEnd={endDrag}
                  className="cursor-grab overflow-hidden rounded-xl border border-gray-200 bg-white transition-shadow hover:shadow-md active:cursor-grabbing"
                >
                  <a
                    draggable={false}
                    href={p.href || '#' + p.id}
                    className="block"
                    onClick={
                      p.href
                        ? undefined
                        : (e) => {
                            e.preventDefault();
                            open('details', p);
                          }
                    }
                  >
                    <div className="grid aspect-video place-items-center overflow-hidden bg-gray-100">
                      {p.thumbnail ? (
                        p.studio === 'video' || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(p.thumbnail) ? (
                          <video
                            className="h-full w-full object-cover"
                            src={p.thumbnail}
                            muted
                            preload="metadata"
                          />
                        ) : (
                          <img
                            className="h-full w-full object-cover"
                            src={p.thumbnail}
                            alt=""
                            draggable={false}
                            loading="lazy"
                          />
                        )
                      ) : (
                        <SlidersHorizontal aria-hidden="true" className="text-gray-400" />
                      )}
                    </div>
                    <div className="p-3">
                      <small>{labels[p.studio] || 'Workspace'}</small>
                      <h3 className="truncate font-semibold" title={p.name}>
                        {p.name}
                      </h3>
                      <small>
                        {date(p.updated_at)} {p.status && ' · ' + p.status}
                      </small>
                    </div>
                  </a>
                  {selection === p.id && p.description && <p className="px-3">{p.description}</p>}
                  <button type="button" disabled={busy} aria-label={'Move ' + p.name}
                    className="mx-3 mb-3 inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 focus-visible:ring-2"
                    onClick={() => open('move', p)}>
                    <FolderInput size={15} /> Move
                  </button>
                </article>
              ))}
            </div>
            )}
          </section>
        </>
      )}
      {modal && (
        <dialog
          ref={dialog}
          onCancel={() => setModal(null)}
          aria-labelledby="project-dialog-title"
          className="m-auto w-[min(28rem,94vw)] rounded-2xl bg-white p-6 shadow-xl backdrop:bg-black/30"
        >
          <div className="mb-5 flex justify-between gap-2">
            <h2 id="project-dialog-title" className="font-semibold">
              {
                {
                  move: 'Move project',
                  add: 'Add New',
                  studios: 'Choose a studio',
                  create: 'New Folder',
                  rename: 'Rename folder',
                  delete: 'Delete folder?',
                  details: modal.item?.name,
                }[modal.action]
              }
            </h2>
            <button aria-label="Close" onClick={() => setModal(null)}>
              ✕
            </button>
          </div>
          {modal.action === 'add' ? (
            <div className="grid gap-2">
              <button className={field} onClick={() => open('studios')}>
                New Project
              </button>
              <button className={field} onClick={() => open('create')}>
                New Folder
              </button>
            </div>
          ) : modal.action === 'studios' ? (
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(labels).map(([k, v]) => (
                <a key={k} className={field} href={k === 'canvas' ? '/canvas' : '/studio/' + k + '?new=1'}>
                  {v}
                </a>
              ))}
            </div>
          ) : modal.action === 'move' ? (
            <>
              <p className="mb-3 truncate text-sm text-gray-600">{modal.item.name}</p>
              <div className="grid max-h-[55vh] gap-1 overflow-auto">
                {[{ id: null, name: 'No folder' }, ...data.folders].map(f => (
                  <button key={f.id || 'root'} disabled={busy || (modal.item.folderId || null) === f.id}
                    className="flex items-center gap-3 rounded-lg px-3 py-3 text-left text-sm hover:bg-indigo-50 disabled:text-gray-400"
                    onClick={() => move(modal.item, f.id)}>
                    <Folder size={18} /> {f.name}
                    {(modal.item.folderId || null) === f.id && <small className="ml-auto">Current location</small>}
                  </button>
                ))}
              </div>
            </>
          ) : modal.action === 'details' ? (
            <p>{modal.item.description || 'Project workspace'}</p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                mutate({ action: modal.action, folderId: modal.item?.id, name });
              }}
            >
              {modal.action === 'delete' ? (
                <p>All projects in “{modal.item.name}” will appear in the main Projects list without a folder.</p>
              ) : (
                <input
                  className={field + ' w-full'}
                  aria-label="Folder name"
                  placeholder="Folder name"
                  required
                  maxLength={120}
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              )}
              <button disabled={busy} className={field + ' mt-4'}>
                {modal.action === 'delete' ? 'Delete folder' : 'Save'}
              </button>
            </form>
          )}
        </dialog>
      )}
    </main>
  );
}
