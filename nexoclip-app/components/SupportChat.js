'use client';
import { useEffect, useState } from 'react';
import { SUPPORT_WHATSAPP_URL } from './publicPricing';

export const WHATSAPP_PATH = 'M17.5 14.4c-.3-.2-1.8-.9-2-1s-.5-.2-.7.1-.8 1-.9 1.2-.3.2-.6.1a8.2 8.2 0 0 1-2.4-1.5 9 9 0 0 1-1.7-2.1c-.2-.3 0-.5.1-.6l.4-.5.3-.5a.5.5 0 0 0 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6a1.1 1.1 0 0 0-.8.4 3.4 3.4 0 0 0-1.1 2.5 5.9 5.9 0 0 0 1.2 3.1 13.4 13.4 0 0 0 5.2 4.6c.7.3 1.3.5 1.7.6a4.2 4.2 0 0 0 1.9.1 3.1 3.1 0 0 0 2-1.4 2.5 2.5 0 0 0 .2-1.4c-.1-.1-.3-.2-.6-.4ZM12 21.8a9.8 9.8 0 0 1-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4A9.8 9.8 0 1 1 12 21.8Zm8.4-18.2A11.8 11.8 0 0 0 1.8 17.8L.1 24l6.4-1.7a11.8 11.8 0 0 0 5.6 1.4A11.8 11.8 0 0 0 20.4 3.6Z';

// The floating support button: opens a WhatsApp chat with the team. Never on admin pages
// or while an operator impersonates a customer.
export default function SupportChat() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (/^\/admin(\/|$)/.test(window.location.pathname)) return;
    if (document.cookie.split('; ').some((c) => c.startsWith('nexoclip_impersonation='))) return;
    setVisible(true);
  }, []);
  if (!visible) return null;
  return (
    <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer" aria-label="Chat dengan NexoClip lewat WhatsApp" title="Chat dengan NexoClip lewat WhatsApp"
      className="group fixed bottom-5 right-5 z-[150] flex h-[52px] items-center gap-2 rounded-full bg-[#25d366] pl-[14px] pr-[14px] text-white shadow-[0_12px_32px_-8px_rgba(37,211,102,0.55)] transition-[padding,transform] duration-200 hover:-translate-y-0.5 hover:pr-5">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={WHATSAPP_PATH} /></svg>
      <span className="max-w-0 overflow-hidden whitespace-nowrap text-[13.5px] font-semibold transition-[max-width] duration-200 group-hover:max-w-[180px] group-focus-visible:max-w-[180px]">Chat dengan NexoClip</span>
    </a>
  );
}
