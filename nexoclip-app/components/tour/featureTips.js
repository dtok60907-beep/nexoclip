// Dedicated per-page spotlight walkthroughs for Nexoclip Studio.
// Clicking "Tips" on any page launches only that page's tailored spotlight steps
// pointing to real UI elements (`data-tour`), paired with a light web-kit
// visual micro-preview instead of a generic text modal.

export const PAGE_TOURS = {
  home: {
    id: 'home',
    title: 'Studio Home',
    shortTitle: 'Home',
    icon: 'home',
    steps: [
      {
        target: 'studio-nav',
        preview: 'sidebar',
        title: 'Every workspace tool in one rail',
        body: 'Jump between Home, Apps (including AI Director, Canvas & Media Library), Projects, My Brand, and Account controls from this rail.',
        tip: 'Open Apps anytime to launch any creative studio.',
      },
      {
        target: 'home-mode-tabs',
        preview: 'showcase',
        title: 'Switch between UGC Ads & Filmmaking',
        body: 'Pick your production track to tailor prompt suggestions and curated showcase reels to your goal.',
      },
      {
        target: 'home-composer',
        preview: 'composer',
        title: 'Start a brief from one command bar',
        body: 'Describe your shot, press + to attach a product photo or clip, pick a model, and launch directly into the matching studio.',
        tip: 'Press Ctrl/⌘ + Enter to send immediately.',
      },
      {
        target: 'home-showcase',
        preview: 'showcase',
        title: 'Hover to preview, click to Recreate',
        body: 'Explore finished ads and drama scenes below. Click any card to inspect its prompt structure and load it into your composer.',
      },
    ],
  },

  apps: {
    id: 'apps',
    title: 'Apps & Studios',
    shortTitle: 'Apps',
    icon: 'apps',
    steps: [
      {
        target: 'apps-hero',
        preview: 'apps',
        title: 'Featured creative studios',
        body: 'Browse highlighted studios at the top and click the center card to jump straight into production.',
      },
      {
        target: 'apps-toolbar',
        preview: 'controls',
        title: 'Filter by category or search',
        body: 'Narrow down studios across Video & Film, Visuals & Avatar, and Workspace—or type a keyword to find a tool fast.',
      },
      {
        target: 'apps-grid',
        preview: 'apps',
        title: 'One balance across every studio',
        body: 'Every tool shares the exact same workspace credits. Start with stills in Image Studio, then animate winners in Video Studio.',
      },
      {
        target: 'apps-inspo',
        preview: 'showcase',
        title: 'Save & recreate inspiration reels',
        body: 'Bookmark formats you want to revisit later, or open any reel to send its prompt straight to Studio Home.',
      },
    ],
  },

  projects: {
    id: 'projects',
    title: 'Projects',
    shortTitle: 'Projects',
    icon: 'projects',
    steps: [
      {
        target: 'library-header',
        preview: 'library',
        title: 'Your campaign hub',
        body: 'All multi-scene productions and saved briefs live here so you can pick up any campaign right where you left off.',
      },
      {
        target: 'library-content',
        preview: 'library',
        title: 'Inspect briefs & last updates',
        body: 'Expand any project card to review its summary and timestamps before generating new variations.',
        tip: 'Name projects by campaign and aspect ratio (e.g. "Serum Launch — 9:16").',
      },
      {
        target: 'studio-nav',
        preview: 'sidebar',
        title: 'Find Media Library inside Apps',
        body: 'Need raw generated files instead of project folders? Open Apps in the sidebar and launch Media Library.',
      },
    ],
  },

  media: {
    id: 'media',
    title: 'Media Library',
    shortTitle: 'Media',
    icon: 'media',
    steps: [
      {
        target: 'library-filters',
        preview: 'library',
        title: 'Filter by Images, Videos, or Audio',
        body: 'Toggle media categories to isolate stills, rendered clips, or audio tracks without scrolling through mixed outputs.',
      },
      {
        target: 'library-content',
        preview: 'library',
        title: 'Auto-saved & ready to reuse',
        body: 'Every generation saves here automatically. Click any asset to open full resolution, or reuse your best still as a video reference.',
        tip: 'Videos render in the background—collect them here once ready.',
      },
    ],
  },

  director: {
    id: 'director',
    title: 'AI Director',
    shortTitle: 'AI Director',
    icon: 'director',
    steps: [
      {
        target: 'director-brief',
        preview: 'director',
        optional: true,
        title: 'Brief AI Director like a filmmaker',
        body: 'Describe your product, audience, duration, and mood. Attach reference photos or videos so visuals stay anchored to your brand.',
        tip: 'Choose "Pandu aku" to approve each stage, or "Langsung jadi" for end-to-end auto production.',
      },
      {
        target: 'director-examples',
        preview: 'showcase',
        optional: true,
        title: 'Hover to preview, click to Recreate',
        body: 'Explore finished showcase reels below. Click any video to inspect its prompt structure and load it into your AI Director composer.',
      },
      {
        target: 'director-project-switcher',
        preview: 'director',
        optional: true,
        title: 'Switch, rename, or duplicate projects',
        body: 'Manage multiple film campaigns here—duplicate a winning project to test alternate hooks without starting from scratch.',
      },
      {
        target: 'director-chat',
        preview: 'composer',
        optional: true,
        title: 'Direct scenes & @mention shots',
        body: 'Chat to refine scripts before generating media, or @mention specific shots and assets to request targeted revisions.',
        tip: 'Iterating script text costs far fewer credits than regenerating clips.',
      },
      {
        target: 'director-board',
        preview: 'director',
        optional: true,
        title: 'Review concepts, storyboard & final cut',
        body: 'Inspect generated briefs, characters, keyframes, audio, and timeline renders right here on the production board.',
      },
    ],
  },

  canvas: {
    id: 'canvas',
    title: 'Canvas Editor',
    shortTitle: 'Canvas',
    icon: 'canvas',
    steps: [
      {
        target: 'canvas-frame',
        preview: 'canvas',
        title: 'Wire prompts, photos & video nodes',
        body: 'Connect reference photos into Image keyframes, then chain outputs into Video, Extend, or Next Shot nodes on one visual board.',
        tip: 'Draft video branches at 480p first, then upgrade only your winning cut to 1080p.',
      },
      {
        target: 'studio-nav',
        preview: 'sidebar',
        title: 'Built-in board controls & shortcuts',
        body: 'Canvas includes its own node toolbar and zoom controls inside the board. Return to Apps or any other workspace from the sidebar.',
      },
    ],
  },

  image: {
    id: 'image',
    title: 'Image Studio',
    shortTitle: 'Image',
    icon: 'image',
    steps: [
      {
        target: 'prompt-composer',
        preview: 'composer',
        title: 'Describe your shot & attach references',
        body: 'Write Subject + Setting + Lighting, and use + to attach your real product photo so labels and colors stay accurate.',
      },
      {
        target: 'prompt-controls',
        preview: 'controls',
        title: 'Tune model, aspect ratio & seed',
        body: 'Pick your model, ratio (9:16, 1:1, 16:9), batch size, or lock a Seed to repeat a winning layout. Use Draw to guide placement.',
      },
      {
        target: 'prompt-generate',
        preview: 'credits',
        title: 'Live credit price before you run',
        body: 'The exact cost updates as you adjust settings. Lock visual styling cheaply as stills here before animating in Video Studio.',
      },
    ],
  },

  video: {
    id: 'video',
    title: 'Video Studio',
    shortTitle: 'Video',
    icon: 'video',
    steps: [
      {
        target: 'prompt-composer',
        preview: 'composer',
        title: 'Animate a photo or describe motion',
        body: 'Attach an approved still with + and describe one clear camera move (like a slow push-in or orbit) for clean, stable motion.',
      },
      {
        target: 'prompt-controls',
        preview: 'controls',
        title: 'Choose model, format & clip length',
        body: 'Pick 9:16 for TikTok and Reels or 16:9 for YouTube. Test shorter clips and draft resolution first before rendering 1080p.',
      },
      {
        target: 'prompt-generate',
        preview: 'credits',
        title: 'Background rendering & auto-refunds',
        body: 'Credits preview live on Generate. Videos render in the background so you can keep working—failed jobs return credits automatically.',
      },
    ],
  },

  cinema: {
    id: 'cinema',
    title: 'Cinema Studio',
    shortTitle: 'Cinema',
    icon: 'cinema',
    steps: [
      {
        target: 'prompt-composer',
        preview: 'cinema',
        title: 'Direct atmosphere, depth & blocking',
        body: 'Describe foreground, hero subject, and motivated lighting (like twilight windows or tungsten lamps) for natural film contrast.',
      },
      {
        target: 'prompt-controls',
        preview: 'cinema',
        title: 'Choose camera body, lens & focal length',
        body: 'Use 24mm–35mm for expansive establishing shots, or 50mm–85mm for intimate portraits and shallow depth-of-field hero reveals.',
      },
      {
        target: 'prompt-generate',
        preview: 'credits',
        title: 'Lock the hero frame before animating',
        body: 'Preview credit cost right on the button, generate your widescreen keyframe, then bring it to life in Video Studio or Canvas.',
      },
    ],
  },

  'ai-influencer': {
    id: 'ai-influencer',
    title: 'AI Influencer Studio',
    shortTitle: 'AI Influencer',
    icon: 'ai-influencer',
    steps: [
      {
        target: 'influencer-builder',
        preview: 'influencer',
        title: 'Design Face, Body & Style step by step',
        body: 'Craft a cohesive virtual brand spokesperson across facial traits, wardrobe, and accessories.',
      },
      {
        target: 'influencer-generate',
        preview: 'credits',
        title: 'Generate Character or Shuffle ideas',
        body: 'Render your custom character, or hit Shuffle to explore fresh archetypes before fine-tuning specific traits.',
      },
      {
        target: 'influencer-gallery',
        preview: 'influencer',
        title: 'Your reusable cast gallery',
        body: 'Every generated spokesperson is saved here so you can keep the exact same brand face across stills, UGC ads, and reels.',
      },
    ],
  },

  marketing: {
    id: 'marketing',
    title: 'Marketing Studio',
    shortTitle: 'Marketing',
    icon: 'marketing',
    steps: [
      {
        target: 'prompt-composer',
        preview: 'composer',
        title: 'Pair your product, avatar & ad angle',
        body: 'Upload your product shot, pick an avatar or ad format, and describe one clear hook or benefit per creative.',
      },
      {
        target: 'prompt-controls',
        preview: 'controls',
        title: 'Match ratio, quality & duration to channel',
        body: 'Set 9:16 for Reels/TikTok or 1:1 and 4:3 for feeds, and choose clip length based on your ad placement.',
      },
      {
        target: 'prompt-generate',
        preview: 'credits',
        title: 'Preview cost & test multiple hooks',
        body: 'Check the live credit estimate before rendering, then test 2–3 visual openings for the same offer.',
      },
    ],
  },

  usage: {
    id: 'usage',
    title: 'Usage & Billing',
    shortTitle: 'Usage',
    icon: 'usage',
    steps: [
      {
        target: 'ub-header',
        preview: 'billing',
        title: 'Switch between Usage & Billing',
        body: 'Toggle between credit analytics and payment receipts here, jump to log search, or top up your balance anytime.',
      },
      {
        target: 'usage-kpis',
        preview: 'usage',
        title: 'One balance across every studio',
        body: 'Track remaining workspace credits alongside monthly spend across Video, Image & Canvas, and AI Director.',
      },
      {
        target: 'usage-trend',
        preview: 'usage',
        title: 'Monitor daily credit burn (7D / 30D)',
        body: 'Hover any point on the trend chart to see daily runs and spot which studio workflows drive your volume.',
      },
      {
        target: 'usage-log',
        preview: 'library',
        title: 'Search & filter every generation',
        body: 'Filter by status (Complete, Running, Failed) or search by prompt and model. Failed runs refund credits automatically.',
      },
    ],
  },

  billing: {
    id: 'billing',
    title: 'Billing & Top Up',
    shortTitle: 'Billing',
    icon: 'usage',
    steps: [
      {
        target: 'ub-header',
        preview: 'billing',
        title: 'Jump back to Usage analytics anytime',
        body: 'Switch between Usage insights and Billing receipts from the top segmented bar.',
      },
      {
        target: 'billing-summary',
        preview: 'billing',
        title: 'Active plan & non-expiring top-ups',
        body: 'See your current plan cycle and available credits in one glance. One-time top-up credits never expire.',
      },
      {
        target: 'billing-actions',
        preview: 'credits',
        title: 'Manage plan or instant top-up',
        body: 'Upgrade plans or add credits via QRIS and Virtual Account—your balance updates immediately once payment clears.',
      },
      {
        target: 'billing-history',
        preview: 'library',
        title: 'All subscription & top-up receipts',
        body: 'Review completed orders or resume pending checkouts directly from your payment history table.',
      },
    ],
  },

  'brand-kit': {
    id: 'brand-kit',
    title: 'Brand Kit',
    shortTitle: 'Brand Kit',
    icon: 'brand-kit',
    steps: [
      {
        target: 'brandkit-header',
        preview: 'brandkit',
        title: 'Single source of truth for your brand',
        body: 'Keep your positioning, tone of voice, products, and claims to avoid stored in one workspace kit.',
      },
      {
        target: 'brandkit-actions',
        preview: 'director',
        title: 'Send Brand Kit straight to AI Director',
        body: 'Save changes anytime, or launch AI Director pre-filled with your brand voice, audience, and key selling points.',
      },
      {
        target: 'brandkit-sections',
        preview: 'brandkit',
        title: 'Define voice, audience & guardrails',
        body: 'Clear selling points and claims-to-avoid keep scripts and ad copy accurate across every campaign.',
      },
      {
        target: 'brandkit-colors',
        preview: 'brandkit',
        title: 'Lock your visual brand palette',
        body: 'Store exact HEX codes and color names so stills, motion graphics, and ad overlays stay visually consistent.',
      },
    ],
  },

  settings: {
    id: 'settings',
    title: 'Settings',
    shortTitle: 'Settings',
    icon: 'settings',
    steps: [
      {
        target: 'settings-header',
        preview: 'settings',
        title: 'Active workspace & quick actions',
        body: 'Confirm your active workspace, email identity, and remaining credits before starting team renders.',
      },
      {
        target: 'settings-tabs',
        preview: 'settings',
        title: 'General, Workspaces, Security & Billing',
        body: 'Switch sections to edit your display name, create or switch team workspaces, update your password, or review plans.',
      },
      {
        target: 'settings-panel',
        preview: 'settings',
        title: 'Changes sync immediately',
        body: 'Updates to your profile or active workspace take effect right away across every Studio tab.',
      },
    ],
  },

  accounts: {
    id: 'accounts',
    title: 'Integration Apps',
    shortTitle: 'Integrations',
    icon: 'accounts',
    steps: [
      {
        target: 'integrations-header',
        preview: 'integrations',
        title: 'Connect social, ads & cloud drives',
        body: 'Link Instagram, TikTok, YouTube, Meta Ads, Google Drive, or Sheets to move briefs and renders smoothly.',
      },
      {
        target: 'integrations-toolbar',
        preview: 'controls',
        title: 'Filter by stack or connection status',
        body: 'Switch between Ads accounts, Social accounts, and Additional cloud tools, or filter by Enabled status.',
      },
      {
        target: 'integrations-grid',
        preview: 'integrations',
        title: 'Workspace-scoped connections',
        body: 'Enable or disconnect any app per workspace without affecting your saved Media Library assets.',
      },
    ],
  },
};

// Post-onboarding workspace overview walkthrough (only triggered via ?tour=1).
export const OVERVIEW_TOUR_STEPS = [
  {
    tab: 'home',
    preview: 'sidebar',
    title: 'Welcome to Nexoclip Studio',
    body: 'A quick visual walkthrough of your creative workspace. Use arrow keys or buttons, and press Esc anytime.',
  },
  {
    target: 'studio-nav',
    tab: 'home',
    preview: 'sidebar',
    title: 'Every tool starts from this rail',
    body: 'Move between Home, Apps (AI Director, Canvas, Media Library & all studios), Projects, My Brand, and Account controls from one rail.',
  },
  {
    target: 'home-composer',
    tab: 'home',
    preview: 'composer',
    title: 'Start with a prompt or product photo',
    body: 'Write what you want to create, attach a reference with +, and jump right into the matching studio.',
  },
  {
    target: 'studio-nav',
    tab: 'home',
    preview: 'canvas',
    title: 'Explore all studios inside Apps',
    body: 'Open Apps in the sidebar whenever you want AI Director, Canvas Editor, Media Library, or specialized video & image studios.',
  },
  {
    target: 'tour-button',
    tab: 'home',
    preview: 'controls',
    title: 'Dedicated Tips on every page',
    body: 'Click Tips inside any studio or workspace page to get a tailored spotlight walkthrough for that exact screen.',
    finish: true,
  },
];

export function resolveFeatureTipId(tabId) {
  if (!tabId) return 'home';
  if (PAGE_TOURS[tabId]) return tabId;
  return 'home';
}

export function getPageTour(tabId) {
  return PAGE_TOURS[resolveFeatureTipId(tabId)] || PAGE_TOURS.home;
}

// Kept as alias for existing imports (StandaloneShell badge & aria labels).
export function getFeatureTips(tabId) {
  return getPageTour(tabId);
}
