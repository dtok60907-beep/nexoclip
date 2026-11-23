'use client';

import { useEffect, useRef, useState } from 'react';
import { saasFetch } from '../src/lib/saas/api';
import { NxStudioSkeleton } from './ui/nx-loading';

export default function GenerationProject({ component: Studio, studio, authStatus, ...props }) {
  const [link] = useState(() => {
    const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
    return { project: params.get('project'), draft: params.get('draft'), fresh: params.has('new') };
  });
  const requested = link.project || link.draft;
  const [work, setWork] = useState(null);
  const [ready, setReady] = useState(!requested);
  const [error, setError] = useState('');
  const [draftId] = useState(() => requested || (link.fresh ? crypto.randomUUID() : null));
  const id = useRef(draftId);
  const workspace = typeof window !== 'undefined' && window.sessionStorage.getItem('nexoclip_workspace_id');
  useEffect(() => {
    if (!requested || !workspace || authStatus !== 'authenticated') return;
    let active = true;
    saasFetch('/api/project-library?studio=' + studio + '&id=' + encodeURIComponent(requested), {
      headers: { 'x-workspace-id': workspace },
    }).then(data => {
      if (!active) return;
      setWork(data);
      setReady(true);
    }).catch(err => {
      if (!active) return;
      // Refresh can land between reservation and the server's acknowledgement.
      if (!link.project && err.status === 404) setReady(true);
      else setError(err.message);
    });
    return () => { active = false; };
  }, [requested, workspace, studio, authStatus, link.project]);

  if (!ready) {
    if (error || authStatus === 'guest') {
      return (
        <div className="flex h-full w-full items-center justify-center p-6 text-sm text-[#5e5e72]" role="status">
          {error || 'Sign in to open this project.'}
        </div>
      );
    }
    return <NxStudioSkeleton variant={studio === 'ai-influencer' ? 'split' : 'canvas'} label="Loading project" />;
  }

  function studioWork(settings) {
    if (['image', 'video'].includes(studio) && !link.project) return undefined;
    id.current ||= crypto.randomUUID();
    const url = new URL(window.location.href);
    if (url.pathname === '/studio/' + studio && !url.searchParams.has('project')) {
      url.searchParams.delete('new');
      url.searchParams.set('draft', id.current);
      window.history.replaceState(window.history.state, '', url);
    }
    return { id: id.current, studio, settings };
  }
  return <Studio {...props} studioWork={studioWork} restoredWork={work} projectWorkspace={workspace}
    persistScope={draftId ? workspace + ':' + draftId : props.persistScope} />;
}
