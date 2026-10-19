import './globals.css';
import './suite.css';
import { Bricolage_Grotesque, Geist_Mono, Poppins } from "next/font/google";
import ImpersonationBanner from '../components/ImpersonationBanner';
import SupportChat from '../components/SupportChat';

// Self-hosted by next/font (the CSP blocks fonts.googleapis.com).
// Poppins for all UI text, Geist Mono for numbers/timecodes (`font-mono`),
// Bricolage Grotesque available as `font-display` for big headings.
const sans = Poppins({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  display: "swap",
});

const mono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

const display = Bricolage_Grotesque({
  variable: "--font-display",
  subsets: ["latin"],
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
