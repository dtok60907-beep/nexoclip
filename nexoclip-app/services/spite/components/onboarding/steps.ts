import type { TourSurface } from '@/lib/onboarding'

// One step in a tour. `target` is a `[data-tour="..."]` selector to spotlight;
// omit it (or let it resolve to nothing) and the popover renders centered — used
// for welcome/concept steps and for empty-state fallbacks. `image`/`video` point
// at swappable files under /public/onboarding/ (your screenshots/renders); they
// hide themselves gracefully if missing. `onEnter`/`onLeave` run side effects
// (e.g. opening the assets panel) as the step is shown / left.
export interface TourStep {
  target?: string
  title: string
  body: string
  image?: string
  video?: string
  placement?: 'auto' | 'top' | 'bottom' | 'left' | 'right'
  onEnter?: () => void
  onLeave?: () => void
}

// Ask the canvas for a connected Prompt → Image pair to point at (see
// canvas-workspace). Idempotent: it only adds nodes to an empty canvas.
const seedNodes = () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('spite:tour-seed-nodes'))
}

// Drive the canvas assets panel from the tour (left-toolbar listens for this).
const assets = (mode: 'side' | 'expanded' | 'close') => () => {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('spite:tour-assets', { detail: mode }))
  }
}

export const TOURS: Record<TourSurface, TourStep[]> = {
  dashboard: [
    {
      title: 'Welcome to Nexoclip Canvas',
      body: 'Your pre-production studio for AI filmmaking. There are two ways to create — let’s take a quick look. (You can skip anytime.)',
      image: '/onboarding/dashboard-welcome.png',
    },
    {
      target: '[data-tour="new-canvas"]',
      title: 'Canvas — the node graph',
      body: 'Start a Canvas to build shots and scenes on an infinite plane: prompts, references, image and video generators, all wired together.',
      image: '/onboarding/canvas-overview.png',
    },
    {
      target: '[data-tour="new-flow"]',
      title: 'Flow — fast & linear',
      body: 'Prefer something simpler? Flow is a conversational prompt→image thread. Same models, works on your phone too.',
      image: '/onboarding/flow-overview.png',
    },
    {
      target: '[data-tour="search"]',
      title: 'Find anything',
      body: 'Search across all your projects by name as your library grows.',
    },
    {
      title: 'You’re set',
      body: 'Create your first project to dive in. You can replay this tour anytime from the “?” in the top bar.',
    },
  ],
  canvas: [
    {
      title: 'Welcome to the Canvas',
      body: 'An infinite board where every node is a piece of your shot: prompts, references, images and videos, wired together. This tour covers every tool, about two minutes.',
      video: '/onboarding/canvas-working.mp4',
      image: '/onboarding/canvas-welcome.png', // fallback if the video is absent
    },
    {
      target: '[data-tour="canvas-toolbar"]',
      title: 'Your toolbar',
      body: 'Everything you need sits in this bar, grouped left to right: navigate, comment, board objects, drawing, new nodes, assets, then undo and redo. Hover any button to see its name and shortcut.',
    },
    {
      target: '[data-tour="tools-navigate"]',
      title: 'Select, pan and cut',
      body: 'Cursor selects, moves and connects nodes. Hand only pans, so you can move around without nudging anything. Cut removes connections between nodes.',
    },
    {
      target: '[data-tour="add-nodes"]',
      title: 'Add nodes',
      body: 'Drop a Prompt, an Image generator or a Video generator into the middle of your view. Right-click empty canvas for the full menu, placed right where your cursor is.',
    },
    {
      target: '.react-flow__node-prompt',
      title: 'A Prompt node',
      body: 'We added a starter Prompt and Image pair so you can see how they work; delete them or press Undo anytime. Write what you want in the Prompt. Type @ to mention a character, prop or location from your library.',
      onEnter: seedNodes,
    },
    {
      target: '.react-flow__edge',
      title: 'Connections carry the prompt',
      body: 'Drag from the right edge of one node to the left edge of another to connect them. Drag a connection into empty space to create a new, already-connected Image or Video node.',
      onEnter: seedNodes,
    },
    {
      target: '.react-flow__node-imageGen',
      title: 'An Image generator',
      body: 'Pick the model, aspect ratio and how many images to make, right on the node. The Generate button shows the credit cost first. Results collect under the node, and Regenerate runs it again.',
      onEnter: seedNodes,
    },
    {
      target: '[data-tour="add-video"]',
      title: 'Video generators go further',
      body: 'Connect a prompt, a first frame or reference images, then choose a mode.',
    },
    {
      target: '[data-tour="add-video"]',
      title: 'Draft, Extend, Edit, Next shot',
      body: 'Draft renders a cheap 480p preview; Render 1080p finalises the take you like. Extend continues a clip, Edit changes one, and Next shot starts a new connected shot from the last frame, keeping your references.',
    },
    {
      target: '[data-tour="asset-tools"]',
      title: 'History, uploads and your library',
      body: 'Open every past generation, upload your own images, and keep Characters, Props, Locations and General folders. Anything in a folder can be @mentioned in a prompt to keep it consistent.',
    },
    {
      target: '[data-tour="assets-panel"]',
      title: 'The library panel',
      body: 'Browse and search your assets here, then drag any of them straight onto the canvas as a reference.',
      onEnter: assets('side'),
      onLeave: assets('close'),
    },
    {
      target: '[data-tour="assets-expanded"]',
      title: 'Browse it full-screen',
      body: 'Open the library expanded to organise folders, rename, bulk-select and download.',
      onEnter: assets('expanded'),
      onLeave: assets('close'),
    },
    {
      target: '[data-tour="tools-comment"]',
      title: 'Comments',
      body: 'Pick Comment (C) and click anywhere to drop a pin for feedback. The check button next to it shows or hides resolved comments.',
    },
    {
      target: '[data-tour="project-chat"]',
      title: 'Project chat',
      body: 'Talk with everyone on this project without leaving the board. Collaborators’ cursors and names show live on the canvas.',
    },
    {
      target: '[data-tour="tools-board"]',
      title: 'Notes, text and tables',
      body: 'Sticky notes (N), text labels (T) and tables for shot lists or briefs. Select two or more nodes and press Ctrl+G to group them in a frame; Ctrl+Shift+G ungroups.',
    },
    {
      target: '[data-tour="tools-draw"]',
      title: 'Pen and eraser',
      body: 'Sketch arrows, circles or layout ideas with the Pen (P). The Eraser (E) removes strokes you sweep across.',
    },
    {
      target: '[data-tour="undo-redo"]',
      title: 'Undo and redo',
      body: 'Step back or forward through your edits. The canvas saves automatically as you work.',
    },
    {
      target: '[data-tour="scene-timeline"]',
      title: 'Scenes, shots and pages',
      body: 'Switch scenes up here and add as many as you need. Assign a node to a shot from the badge on the node; assigned shots glow yellow. Export downloads a storyboard zip with one folder per scene.',
      image: '/onboarding/canvas-shot.png',
    },
    {
      target: '[data-tour="canvas-page"]',
      title: 'Where you are',
      body: 'Shows the current canvas page. The target button recenters the view on your work if you get lost.',
    },
    {
      target: '[data-tour="zoom-controls"]',
      title: 'Zoom and fit',
      body: 'Zoom in and out, or fit everything in view. The minimap above it gives you an overview of large boards.',
    },
    {
      target: '[data-tour="canvas-credits"]',
      title: 'Your credits',
      body: 'Your balance, shared with every studio in Nexoclip. Each Generate button shows its cost before you run it.',
    },
    {
      target: '[data-tour="canvas-tour-button"]',
      title: 'Replay anytime',
      body: 'Open this tour again from here whenever you need a refresher.',
    },
    {
      title: 'You’re ready',
      body: 'Try it now: edit the starter prompt, press Generate on the Image node, then connect the image into a Video generator and make a Draft.',
    },
  ],
  flow: [
    {
      title: 'This is Flow',
      body: 'A simple, linear way to generate: describe an image, pick a model, generate. Each result keeps its prompt, model and references.',
      image: '/onboarding/flow-welcome.png',
    },
    {
      target: '[data-tour="compose"]',
      title: 'Describe it here',
      body: 'Type what you want and hit generate. This bar stays with you as the thread grows.',
    },
    {
      target: '[data-tour="model"]',
      title: 'Models & settings',
      body: 'Switch models, set the aspect ratio and resolution (defaults to 2K), and choose how many images per prompt.',
    },
    {
      target: '[data-tour="attach"]',
      title: 'Attach references',
      body: 'Add reference images to steer a generation — character, style, composition. They’re remembered with each result.',
    },
    {
      target: '[data-tour="generate"]',
      title: 'Generate',
      body: 'Results stream in below, newest at the bottom. Tap one to revisit it.',
    },
    {
      target: '[data-tour="result"]',
      title: 'Reuse, copy, save',
      body: 'On any result: Reuse brings its prompt + references back into the composer, Copy also restores model + aspect, and Save downloads it.',
      image: '/onboarding/flow-result.png',
    },
  ],
  settings: [
    {
      title: 'Settings',
      body: 'A quick look at what you can tune here.',
      image: '/onboarding/settings-overview.png',
    },
    {
      target: '[data-tour="settings-apikey"]',
      title: 'AI providers',
      body: 'Nexoclip manages the AI provider keys for you, so there is nothing to set up. This shows whether generation is connected.',
    },
    {
      target: '[data-tour="settings-retention"]',
      title: 'Data retention',
      body: 'Nothing is auto-deleted by default. Optionally have old unused results and reference inputs cleaned up after a set number of days.',
    },
    {
      target: '[data-tour="settings-storage"]',
      title: 'Storage',
      body: 'See how much of your Cloudflare R2 free tier you’re using at a glance.',
    },
    {
      target: '[data-tour="settings-recovery"]',
      title: 'Recovery',
      body: 'If a generation gets stuck (a spinner that never ends) or vanishes after a refresh, “Recover stuck generations” pulls any job fal actually finished back into your library — fal keeps results ~24h, and the check is free to run. Recovered assets get a small blue badge in the asset panel so you can tell them apart; “Backfill badges” adds that badge to anything recovered before the badge existed.',
      image: '/onboarding/settings-recovery.png',
    },
  ],
}
