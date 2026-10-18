import './globals.css';
import './suite.css';
import { Bricolage_Grotesque, Geist_Mono, Poppins } from "next/font/google";
import ImpersonationBanner from '../components/ImpersonationBanner';

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

export const metadata = {
  title: 'Nexoclip — AI Image & Video Studio',
  description: 'Generate AI images and videos using 200+ models — Flux, Midjourney, Kling, Veo, Seedance and more.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable} ${display.variable}`}>{children}<ImpersonationBanner /></body>
    </html>
  );
}
