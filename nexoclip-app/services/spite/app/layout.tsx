import type { Metadata, Viewport } from 'next'
import { Montserrat, Inter, Geist_Mono } from 'next/font/google'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

const montserrat = Montserrat({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-montserrat',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
})

export const metadata: Metadata = {
  title: 'SPITE — AI filmmaking workflows',
  description: 'Open-source node-based canvas for AI filmmaking workflows. Your keys. Your models. Your workflow.',
  // Browser page translation rewrites text nodes under React's feet, which
  // crashes the canvas with "insertBefore/removeChild ... not a child of this
  // node". It's a tool UI, so opt out of translation entirely.
  other: { google: 'notranslate' },
}

// Lock zoom so the canvas (and the mobile app) don't pinch/double-tap zoom the
// page out from under you — it's a tool, not a content page. Desktop browsers
// ignore user-scalable; this mainly tames mobile.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

// Suppress ResizeObserver errors (common with React Flow)
if (typeof window !== 'undefined') {
  const resizeObserverErr = window.onerror
  window.onerror = (msg, ...args) => {
    if (typeof msg === 'string' && msg.includes('ResizeObserver')) return true
    return resizeObserverErr ? resizeObserverErr(msg, ...args) : false
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" translate="no" className={`notranslate ${montserrat.variable} ${inter.variable} ${geistMono.variable} bg-background`} suppressHydrationWarning>
      <body className="font-sans antialiased bg-background text-foreground min-h-screen" suppressHydrationWarning>
        {children}
        <Toaster theme="dark" position="bottom-right" />
      </body>
    </html>
  )
}
