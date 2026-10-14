'use client';

import { useEffect, useRef } from 'react';

/** Asks the user to top up when their credits run low or out; "Top up" opens the pricing / top-up dialog. */
export default function LowBalanceDialog({ level, balance, onTopUp, onClose }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => previous?.focus?.();
  }, []);
  const empty = level === 'empty';
  const credits = Number(balance || 0).toLocaleString(undefined, { maximumFractionDigits: 1 });
  return <dialog ref={dialog} className="suite-low-balance-dialog" aria-label="Low credit balance" onCancel={onClose}
    onClick={(event) => { if (event.target === dialog.current) onClose(); }}>
    <div className="suite-low-balance-icon" aria-hidden="true">{empty ? '!' : '✧'}</div>
    <h2>{empty ? 'You are out of credits' : 'Your credits are running low'}</h2>
    <p>
      {empty
        ? 'Generating images, videos, voiceovers and AI Director chats is paused until you top up.'
        : `You have ${credits} credits left. Top up now so your next generation does not stop halfway.`}
    </p>
    <div className="suite-low-balance-actions">
      <button type="button" className="suite-primary" onClick={onTopUp}>Top up credits</button>
      <button type="button" className="suite-low-balance-later" onClick={onClose}>{empty ? 'Close' : 'Later'}</button>
    </div>
  </dialog>;
}
