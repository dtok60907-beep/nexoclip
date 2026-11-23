import './globals.css';
import './suite.css';
import './shell.css';
import './studio-light.css';
import './home-reference.css';
import './loading-system.css';
import './usage-billing.css';
import './settings.css';
import './brand-setup.css';
import './director.css';
import './studios-redesign.css';
import localFont from "next/font/local";
import ImpersonationBanner from '../components/ImpersonationBanner';
import SupportChat from '../components/SupportChat';

const inter = localFont({
  src: "./fonts/InterVariable.woff2",
  weight: "100 900",
  variable: "--font-inter",
  display: "swap",
});

// The app is not for search engines: nexoclip.com is the public site. Every page here says noindex
// (robots.txt still lets crawlers in, so they can read it).
export const metadata = {
  title: 'Nexo Clip Studio',
  description: 'NexoClip AI Studio for generating images and videos with Seedance, Veo, Kling, Nano Banana, GPT Image, and AI Director.',
  robots: { index: false, follow: false },
  icons: {
    icon: '/brand/nexoclip-icon.png',
    apple: '/brand/nexoclip-icon.png',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}<ImpersonationBanner /><SupportChat /></body>
    </html>
  );
}
