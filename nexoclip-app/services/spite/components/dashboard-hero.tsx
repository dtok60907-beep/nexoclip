import { withBasePath } from '@/lib/base-path'

export function DashboardHero() {
  return (
    <section className="nx-canvas-hero" aria-labelledby="canvas-heading">
      <img src={withBasePath('/canvas-editorial.webp')} alt="" width={1600} height={533} fetchPriority="high" />
      <div>
        <p className="nx-canvas-eyebrow">NEXOCLIP CANVAS</p>
        <h1 id="canvas-heading">A little space.<br />Endless possibilities.</h1>
        <p>Connect ideas, images, and video in one creative workspace.</p>
        <a href="#canvas-projects">Explore your projects <span aria-hidden="true">↗</span></a>
      </div>
    </section>
  )
}
