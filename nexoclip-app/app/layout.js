import './globals.css';
import './suite.css';
import './shell.css';
import localFont from "next/font/local";
import { Geist_Mono, Plus_Jakarta_Sans } from "next/font/google";
import ImpersonationBanner from '../components/ImpersonationBanner';
import SupportChat from '../components/SupportChat';

// Same type as nexoclip.com, self-hosted by next/font (the CSP blocks fonts.googleapis.com):
// Plus Jakarta Sans for all UI text, Geist Mono for numbers/timecodes (`font-mono`), and
// Clash Display (Fontshare, ITF Free Font License, free for commercial use) as
// `font-display` for headings.
const sans = Plus_Jakarta_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  style: ["normal", "italic"],
  display: "swap",
});

const mono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

const display = localFont({
  src: [
    { path: "./fonts/ClashDisplay-500.woff2", weight: "500" },
    { path: "./fonts/ClashDisplay-600.woff2", weight: "600" },
    { path: "./fonts/ClashDisplay-700.woff2", weight: "700" },
  ],
  variable: "--font-display",
  display: "swap",
});

// The app is not for search engines: nexoclip.com is the public site. Every page here says noindex
// (robots.txt still lets crawlers in, so they can read it).
export const metadata = {
  title: 'Nexo Clip Studio',
  description: 'Studio AI Nexo Clip untuk membuat gambar dan video: Seedance, Veo, Kling, Nano Banana, GPT Image, dan AI Director.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable} ${display.variable}`}>{children}<ImpersonationBanner /><SupportChat /></body>
    </html>
  );
}
