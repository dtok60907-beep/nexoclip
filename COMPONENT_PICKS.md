# Component picks

Components found while building Nexoclip's own look (started 2026-10-21). Judge each by
its motion and structure; colors, fonts and radius get re-themed once the brand DNA is
decided. Nothing here is in the code yet.

| # | Component | Source | License | Liked because | Fit for |
|---|---|---|---|---|---|
| 1 | Pill button with sliding arrow | Uiverse.io, by alexmaracinaru | MIT (Uiverse) | Arrow slides right on hover, press shrinks it; bold, round, lime | Main CTAs: "Start creating", "Ambil promo", "Choose plan" |
| 2 | Pill CTA with arrow in a circle, colors swap on hover | Uiverse.io, by uiverse-astronaut | MIT (Uiverse) | Lime and ink swap places on hover, button lifts, the arrow circle slides; thin ink outline; already tokenized, has a focus ring | Hero CTA on the landing, "See plans" on the promo banner |
| 3 | MaskedHeading: video playing inside giant headline letters | React Bits (reactbits.dev/text-animations/masked-heading), needs gsap | MIT + Commons Clause | Big type filled with a video reel, words reveal with scale + stagger, slight parallax on scroll | Landing hero: headline filled with our showcase reel |
| 4 | RotatingText: words swap letter by letter on a resizing block | React Bits, needs motion (works with framer-motion) | MIT + Commons Clause | Five swap effects, highlight block resizes to each word | Hero sub-line: Bikin [iklan produk / video UGC / …] pakai AI |
| 5 | FlexCarousel: infinite image row through liquid glass | React Bits (reactbits.dev/components/flex-carousel), needs ogl (WebGL) | MIT + Commons Clause | Edges bend and refract like liquid glass, click focuses a card, captions | Showcase row of our cinematic ads |
| 6 | RefineFrame: generation progress that resolves the image | React Bits (reactbits.dev/micro/refine-frame), needs @hugeicons | MIT + Commons Clause | Status chip (queued → generating → refining → ready), pixel mosaic sharpening with a glint, retry on error, no layout shift | Generation tiles in Studio, Canvas and AI Director (app, not landing) |
| 7 | ThoughtLine: thinking header with live clock and steps | React Bits (reactbits.dev/micro/thought-line), needs motion + @hugeicons | MIT + Commons Clause | Shimmer + timer while working, steps tick off, folds to one line | AI Director chat, in place of StepGroup in components/director/ChatView.js (real steps only) |
| 8 | WakeSlider: thumbless bar slider with a wake | React Bits (reactbits.dev/micro/wake-slider), needs motion | MIT + Commons Clause | Bars, drag speed raises a wave, keyboard support | Video duration only where a model takes a 1-second range (~12 of ~250 models; most have [5], [5,10,15], [8]) |
| 9 | InfiniteSlider: endless row that slows on hover | Motion Primitives (motion-primitives.com/docs/infinite-slider), needs motion + react-use-measure | MIT | Endless strip, slows under the pointer, reversible | Landing showcase/logo strip; Canvas template or asset strip at most |
| 10 | Cursor: custom pointer with a label | Motion Primitives (motion-primitives.com/docs/cursor), needs motion | MIT | Springs in with a name tag inside an area | Canvas collaborator cursors (services/spite/components/canvas/realtime-presence.tsx PresenceCursor) |
| 11 | TextShimmerWave: letters wave with a shimmer | Motion Primitives | MIT | Calm 3D light wave through text | Waiting text in Studio, Director, Canvas |
| 12 | AnimatedNumber: numbers spring to their value | Motion Primitives | MIT | Counts up in view, eases balance changes | Landing stats (real numbers only: query prod), Studio credit balance |
| 13 | Dock: macOS-style magnifying bar | Motion Primitives | MIT | Icons magnify with labels | Canvas bottom add-node bar (types from add-node-menu.tsx); not the left tool rail |
| 14 | ProgressiveBlur: gradual edge blur | Motion Primitives | MIT | Layered soft edges | Edges of every horizontal strip/slider |
| 15 | AI Input: prompt box that grows with the text | 21st.dev (ai-input + kokonutd use-auto-resize-textarea) | Check listing | Auto-grow pill, send appears with text, Enter sends | Landing hero prompt, Studio home, Director chat. Mic is decoration only; needs a real voice input or removal |
| 16 | Banner: announcement strip with a flowing glow | 21st.dev (banner, Fumadocs-based) | Check listing (Fumadocs MIT) | Moving color band, dismiss remembered | Promo strip in Studio and landing, in place of the current amber/pink banner |
| 17 | ScrollVelocity: text band reacting to scroll speed | 21st.dev (scroll-velocity), needs motion | Check listing | Drifts, races and flips direction with scroll | Between landing sections (use cases, model names) |
| 18 | TiltedGridHero: images stream round a curved band | 21st.dev (tilted-grid-hero), pure CSS 3D | Check listing | Cylinder-curved row, ends curl toward viewer, no WebGL | Landing hero background with our 9:16 showcase |
| 19 | CardHandGallery: a hand of cards, one lifted | 21st.dev (card-hand-gallery), needs motion | Check listing | Fan of cards, hover lifts, click/flick selects, title + text beside | Home Contoh penggunaan or Studio AI |
| 20 | GlowCard: border lit by the pointer | 21st.dev (glow-card) | Check listing | Spotlight follows the pointer across all cards; lime variant added | Home Kenapa Nexo Clip, plan cards (dark sections) |
| 19 | CardHandGallery: a hand of cards, one lifted | 21st.dev (card-hand-gallery), needs motion | Check listing | Fan of cards, hover lifts, click/flick selects, title + text beside | Home "Contoh penggunaan" or Studio AI |

---

## 1. Pill button with sliding arrow

Lime `#cfef00` is close to the landing's `#d4ff64`; swap in the brand token.

```css
/* From Uiverse.io by alexmaracinaru */
button {
  cursor: pointer;
  font-weight: 700;
  transition: all 0.2s;
  padding: 10px 20px;
  border-radius: 100px;
  background: #cfef00;
  border: 1px solid transparent;
  display: flex;
  align-items: center;
  font-size: 15px;
}

button:hover {
  background: #c4e201;
}

button > svg {
  width: 34px;
  margin-left: 10px;
  transition: transform 0.3s ease-in-out;
}

button:hover svg {
  transform: translateX(5px);
}

button:active {
  transform: scale(0.95);
}
```

Notes for when it goes in:
- Scope the selectors to a class (`.nx-cta`), not every `button`.
- Add a visible `:focus-visible` ring; the original has none.
- Skip the arrow slide under `prefers-reduced-motion`.

---

## 2. Pill CTA with arrow in a circle

Brings its own small palette, worth keeping in mind for the DNA: chartreuse `#d8ff3d`
(again close to `#d4ff64`), ink `#0e0e0c`, paper `#f2eee5` (warm off-white) and tangerine
`#ff5a1f` (focus ring). Better built than #1: scoped class, CSS variables, focus ring.
Markup: `<a class="bc-cta"><span class="bc-cta__label">…</span><span class="bc-cta__arrow"><svg>…</svg></span></a>`.

```css
/* From Uiverse.io by uiverse-astronaut */
.bc-cta {
  --bc-cta-bg: var(--color-chartreuse, #d8ff3d);
  --bc-cta-ink: var(--color-ink, #0e0e0c);
  --bc-cta-paper: var(--color-paper, #f2eee5);
  --bc-cta-tangerine: var(--color-tangerine, #ff5a1f);

  display: inline-flex;
  align-items: center;
  gap: 14px;
  height: 56px;
  padding: 0 10px 0 28px;
  background: var(--bc-cta-bg);
  color: var(--bc-cta-ink);
  font-family: var(--font-body, "Inter", system-ui, sans-serif);
  font-weight: 600;
  font-size: 0.9375rem;
  line-height: 1;
  letter-spacing: -0.005em;
  border: 1.5px solid var(--bc-cta-ink);
  border-radius: 999px;
  cursor: pointer;
  user-select: none;
  text-decoration: none;
  transition:
    background 180ms cubic-bezier(0.2, 0.7, 0.2, 1),
    color 180ms cubic-bezier(0.2, 0.7, 0.2, 1),
    transform 180ms cubic-bezier(0.2, 0.7, 0.2, 1),
    box-shadow 220ms cubic-bezier(0.2, 0.7, 0.2, 1);
}

.bc-cta__label {
  display: inline-block;
  padding-bottom: 1px;
}

.bc-cta__arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 999px;
  background: var(--bc-cta-ink);
  color: var(--bc-cta-bg);
  transition:
    background 180ms cubic-bezier(0.2, 0.7, 0.2, 1),
    color 180ms cubic-bezier(0.2, 0.7, 0.2, 1),
    transform 200ms cubic-bezier(0.2, 0.7, 0.2, 1);
}

.bc-cta__arrow svg {
  width: 18px;
  height: 18px;
  display: block;
}

.bc-cta:hover {
  background: var(--bc-cta-ink);
  color: var(--bc-cta-bg);
  transform: translateY(-2px);
  box-shadow: 0 10px 22px -14px rgba(14, 14, 12, 0.45);
}

.bc-cta:hover .bc-cta__arrow {
  background: var(--bc-cta-bg);
  color: var(--bc-cta-ink);
  transform: translateX(4px);
}

.bc-cta:active {
  transform: translateY(0);
  box-shadow: none;
}

.bc-cta:focus-visible {
  outline: 2px solid var(--bc-cta-tangerine);
  outline-offset: 3px;
}
```

Notes for when it goes in:
- On a dark background the ink outline and the hover (button turns ink) nearly vanish;
  use a light outline there, or keep the light/paper sections for it.
- Skip the lift and arrow slide under `prefers-reduced-motion`.

---

## 3. MaskedHeading (video inside the headline)

Source: React Bits registry (https://reactbits.dev/r/MaskedHeading-JS-CSS), saved in the lab.

```jsx
import MaskedHeading from './MaskedHeading';

<MaskedHeading
  text="Designed in the details"
  mediaType="video"
  src="/reel.mp4"
  poster="/reel-poster.jpg"
  fillScale={1.25}
  parallax={26}
  reveal="scale"
  trigger="view"
  spotlight={false}
  spotlightRadius={180}
  outline={false}
  duration={1.1}
  stagger={0.09}
  drift={18}
  hoverZoom={0}
  align="center"
  brightness={1}
  saturation={1}
  grayscale={false}
  outlineWidth={1}
  weight={700}
  tracking={-0.03}
  lineHeight={1.06}
  textScale={0.115}
  tint="#656363"
/>
```

Hero idea: a short line in Indonesian ("Dari ide jadi video", "Ide kamu, filmnya kami")
filled with a 6–10 s reel cut from the showcase (Nescafe, PUMA, Wardah…), with the
sub-headline and the #2 CTA below it.

Notes for when it goes in:
- Text filled with video can be hard to read on dark or busy frames: keep the line short,
  very bold, and pick bright, steady footage (or turn `outline` on).
- The reel must be small (compressed MP4/WebM, around 2–4 MB, muted, `playsInline`) and
  the poster shown first, or the hero loads slowly on mobile data.
- Screen readers need the real text (an `aria-label` or visually hidden heading), since
  masked text may be drawn in SVG/canvas.
- Under `prefers-reduced-motion`, show the poster still and skip parallax/reveal.
- Only showcase footage from team accounts may be used; client work needs permission.

---

## Live board

All picks run at http://localhost:3100/lab (`cd ~/Documents/Frontend && npx next dev -p 3100`).
Sources are in ~/Documents/Frontend/components/lab/picks/; the lab, its assets
(public/lab) and its extra packages (ogl, gsap, installed with --no-save) stay out of git.
React Bits sources come from https://reactbits.dev/r/<Component>-JS-CSS.json.
WebGL picks need images served with CORS; assets.nexoclip.com sends none, so the lab uses
local copies. Fix that on the bucket before such a component goes live.

---

## DNA, draft 1 (2026-10-21, user's picks)

- Fonts: Clash Display bold (display, Fontshare, free for commercial use), Plus Jakarta
  Sans (body), Geist Mono (mono, already in the app). Replaces Bricolage Grotesque (the
  app's display font today, also OpenArt's) and Poppins (app UI) / Inter (landing).
- Colors: ink `#0b0c0a` background, paper `#f2eee5` light sections, lime `#cfef00`
  (vs landing `#d4ff64`, still to pick), tangerine `#ff5a1f` as second accent.
- Shown in the lab's DNA panel (components/lab/DnaPanel.tsx).

## References

- R1 (2026-10-21): dark hero, pill badge, two-line headline, one CTA, a row of tilted photo
  cards at the bottom. Screenshot in the lab (public/lab/refs/hero-tilted-cards.png) with a
  Nexoclip take (components/lab/References.tsx). Their CTA overlaps the cards; avoid that.
- R2 (2026-10-21): pricing as a usage calculator (drag usage, best plan lights up, compact
  table). Nexoclip take in the lab uses real plans and credit estimates from lib/plans.ts:
  pick what you make, drag how many per month, see the fitting plan and Rp per video.
- R3 (2026-10-22), app sidebar: "Blurred Side Navigation Bar" (dribbble.com/shots/25159878).
  A floating frosted-glass panel with rounded corners, detached from the screen edge. Header:
  avatar and name with a round collapse toggle on the edge. Grouped links (Menus, Service)
  with small labels; the active or hovered link is a solid white pill. Footer card with a
  black "+" and "Create new task". Collapses into an icon rail: group labels stay as tiny
  captions, and the card becomes a single "+" button. For the app: ink glass, a lime
  active pill, and "+ Proyek baru" as the footer card.
