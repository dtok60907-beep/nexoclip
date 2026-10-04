// Choices offered during onboarding. Shared by the onboarding screens and the
// API, which only stores ids that appear here.

export const ROLES = [
  { id: 'seller', label: 'Online seller', hint: 'TikTok Shop, Shopee, Tokopedia' },
  { id: 'creator', label: 'Content creator', hint: 'Personal brand and affiliate' },
  { id: 'smb', label: 'Small business', hint: 'UMKM, cafe, local shop' },
  { id: 'agency', label: 'Agency or marketer', hint: 'Content for clients' },
  { id: 'brand', label: 'Brand team', hint: 'In-house marketing' },
  { id: 'exploring', label: 'Just exploring', hint: 'Curious about AI video' },
];

export const CATEGORIES = [
  { id: 'fashion', label: 'Fashion' },
  { id: 'beauty', label: 'Beauty & skincare' },
  { id: 'food', label: 'Food & beverage' },
  { id: 'electronics', label: 'Electronics & gadgets' },
  { id: 'home', label: 'Home & living' },
  { id: 'health', label: 'Health & wellness' },
  { id: 'education', label: 'Education & courses' },
  { id: 'services', label: 'Services' },
  { id: 'other', label: 'Something else' },
];

// `tool` is the Studio destination that best serves the goal.
export const GOALS = [
  { id: 'product-video', label: 'Product ad videos', hint: 'Turn product photos into short ads', tool: 'video' },
  { id: 'product-photo', label: 'Product photos', hint: 'Studio-quality shots without a shoot', tool: 'image' },
  { id: 'influencer', label: 'AI influencer content', hint: 'A consistent face for your brand', tool: 'ai-influencer' },
  { id: 'cinematic', label: 'Cinematic brand films', hint: 'Camera, lens and lighting control', tool: 'cinema' },
  { id: 'campaign', label: 'Multi-shot campaigns', hint: 'Plan and chain scenes on a board', tool: 'canvas' },
  { id: 'ugc', label: 'UGC-style content', hint: 'Natural, social-first clips', tool: 'video' },
];

export const PLATFORMS = [
  { id: 'tiktok', label: 'TikTok' },
  { id: 'reels', label: 'Instagram Reels' },
  { id: 'shorts', label: 'YouTube Shorts' },
  { id: 'shopee', label: 'Shopee Video' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'marketplace', label: 'Marketplace listings' },
  { id: 'website', label: 'Website & ads' },
];

export const EXPERIENCE = [
  { id: 'new', label: 'New to AI tools', hint: 'First time making images or video with AI' },
  { id: 'some', label: 'Tried a few', hint: 'I know the basics of prompting' },
  { id: 'regular', label: 'Use them regularly', hint: 'I use AI tools every week' },
];

export const TEAM_SIZES = [
  { id: 'solo', label: 'Just me' },
  { id: 'small', label: '2–5 people' },
  { id: 'medium', label: '6–20 people' },
  { id: 'large', label: '20+ people' },
];

export const SOURCES = [
  { id: 'tiktok', label: 'TikTok' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'search', label: 'Google search' },
  { id: 'friend', label: 'Friend or colleague' },
  { id: 'community', label: 'Community or group' },
  { id: 'other', label: 'Other' },
];

export const TOOLS = {
  canvas: { label: 'Canvas', path: '/canvas', summary: 'Plan prompts, references, images and videos on one board. Draft cheap at 480p, then render the best take in 1080p.' },
  video: { label: 'Video Studio', path: '/studio/video', summary: 'Text or a photo becomes a video up to 1080p with Seedance 2.0 and 2.5.' },
  image: { label: 'Image Studio', path: '/studio/image', summary: 'Product photos and ad visuals in seconds, from about 2.5 credits each.' },
  cinema: { label: 'Cinema Studio', path: '/studio/cinema', summary: 'Cinematic scenes with camera, lens and lighting control.' },
  'ai-influencer': { label: 'AI Influencer Studio', path: '/studio/ai-influencer', summary: 'Design a virtual influencer and reuse the same face across content.' },
};

const pickIds = (list) => new Set(list.map((item) => item.id));
const ALLOWED = {
  role: pickIds(ROLES),
  category: pickIds(CATEGORIES),
  experience: pickIds(EXPERIENCE),
  teamSize: pickIds(TEAM_SIZES),
  source: pickIds(SOURCES),
  goals: pickIds(GOALS),
  platforms: pickIds(PLATFORMS),
};

// The tool suggested at the end: the one most of the chosen goals point to,
// with Video Studio as the default.
export function recommendTool(goals = []) {
  const counts = {};
  for (const id of goals) {
    const goal = GOALS.find((item) => item.id === id);
    if (goal) counts[goal.tool] = (counts[goal.tool] || 0) + 1;
  }
  const [best] = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return best ? best[0] : 'video';
}

// Keeps only known choices and trimmed free text, so the stored row never
// carries arbitrary client data.
export function normalizeOnboardingAnswers(raw = {}) {
  const answers = {};
  for (const key of ['role', 'category', 'experience', 'teamSize', 'source']) {
    if (ALLOWED[key].has(raw[key])) answers[key] = raw[key];
  }
  for (const key of ['goals', 'platforms']) {
    if (Array.isArray(raw[key])) answers[key] = [...new Set(raw[key].filter((id) => ALLOWED[key].has(id)))];
  }
  const brandName = String(raw.brandName ?? '').trim().slice(0, 80);
  if (brandName) answers.brandName = brandName;
  return answers;
}
