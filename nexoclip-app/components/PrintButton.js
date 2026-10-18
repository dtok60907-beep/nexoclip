'use client';

// The browser's print dialog, where "Save as PDF" downloads the document.
export default function PrintButton() {
  return <button type="button" onClick={() => window.print()} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #111827', background: '#111827', color: '#fff', cursor: 'pointer' }}>Unduh PDF / Cetak</button>;
}
