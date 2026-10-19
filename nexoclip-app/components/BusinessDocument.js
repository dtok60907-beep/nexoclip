import PrintButton from './PrintButton';
import { STAMP_DUTY_THRESHOLD_IDR } from '../src/services/businessDocumentsService.js';
import { terbilang } from '../src/lib/terbilang.js';

export const idr = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(v) || 0);
export const num = (v, digits = 0) => Number(v || 0).toLocaleString('id-ID', { maximumFractionDigits: digits });
export const date = (v) => (v ? new Date(v).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }) : '—');
const addDays = (v, days) => new Date(new Date(v).getTime() + days * 86_400_000);
export const missing = (value, label) => value || <span className="missing">[{label} belum diisi di profil perusahaan]</span>;

export const documentStyles = `
  .doc-page { background: #e5e7eb; min-height: 100vh; padding: 24px 12px; color: #111827; font-family: 'Helvetica Neue', Arial, sans-serif; }
  .doc { background: #fff; max-width: 210mm; margin: 0 auto; padding: 18mm 16mm; box-shadow: 0 2px 12px rgba(0,0,0,.12); font-size: 12.5px; line-height: 1.55; }
  .doc h1 { font-size: 20px; margin: 0; letter-spacing: .5px; }
  .doc h2 { font-size: 13px; margin: 18px 0 6px; text-transform: uppercase; letter-spacing: .6px; color: #374151; }
  .doc table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  .doc th, .doc td { border-bottom: 1px solid #e5e7eb; padding: 6px 4px; text-align: left; vertical-align: top; }
  .doc th { font-size: 11px; color: #6b7280; text-transform: uppercase; }
  .doc .right { text-align: right; }
  .doc .head { display: flex; justify-content: space-between; gap: 24px; border-bottom: 2px solid #111827; padding-bottom: 12px; }
  .doc .muted { color: #6b7280; }
  .doc .total td { font-weight: 700; border-bottom: 2px solid #111827; }
  .doc .sign { display: flex; justify-content: flex-end; margin-top: 36px; }
  .doc .sign > div { text-align: center; min-width: 220px; }
  .doc .space { height: 70px; }
  .doc .stamp { border: 1px dashed #9ca3af; width: 110px; height: 70px; margin: 8px auto; display: flex; align-items: center; justify-content: center; font-size: 10px; color: #9ca3af; }
  .doc .missing { color: #b91c1c; }
  .doc ul { margin: 4px 0; padding-left: 18px; list-style: disc; }
  .doc-bar { max-width: 210mm; margin: 0 auto 12px; display: flex; justify-content: space-between; align-items: center; font-size: 13px; }
  @page { size: A4; margin: 0; }
  @media print { .doc-page { background: #fff; padding: 0; } .doc { box-shadow: none; max-width: none; } .doc-bar { display: none; } }
`;

export default function BusinessDocument({ data }) {
  const { type, title, number, order, company: c, pricing } = data;
  const credits = Number(order.credits), bonus = Number(order.bonus_credits), total = credits + bonus;
  const before = Number(data.balanceBefore) || 0, overall = before + total;
  const issued = ['receipt', 'activation'].includes(type) ? order.paid_at : order.created_at;
  return (
    <div className="doc-page">
      <style>{documentStyles}</style>
      <div className="doc-bar"><span>{title} · {order.company_name}</span><PrintButton /></div>
      <article className="doc">
        <header className="head">
          <div>
            <h1>{missing(c.legal_name, 'Nama badan usaha')}</h1>
            <div className="muted">{missing(c.address, 'Alamat')}</div>
            {/* NPWP, email and phone are optional: shown when filled in. */}
            <div className="muted">{[c.npwp && `NPWP ${c.npwp}`, c.email, c.phone].filter(Boolean).join(' · ')}</div>
          </div>
          <div className="right">
            <h1>{title.toUpperCase()}</h1>
            <div>No. {number}</div>
            <div className="muted">Tanggal {date(issued)}</div>
          </div>
        </header>

        <h2>{type === 'receipt' ? 'Telah terima dari' : 'Kepada'}</h2>
        <div><b>{order.company_name}</b></div>
        <div className="muted">{order.customer_name ? `${order.customer_name} · ` : ''}{order.customer_email} · Workspace NexoClip “{order.workspace_name}”</div>

        {type === 'receipt' ? (
          <>
            <table><tbody>
              <tr><td style={{ width: 180 }}>Uang sejumlah</td><td><b>{idr(order.amount_idr)}</b></td></tr>
              <tr><td>Terbilang</td><td><i>{terbilang(order.amount_idr)}</i></td></tr>
              <tr><td>Untuk pembayaran</td><td>Paket kredit NexoClip {num(total)} kredit (invoice {number})</td></tr>
              <tr><td>Referensi pembayaran</td><td>{order.payment_reference}</td></tr>
              <tr><td>Tanggal pembayaran</td><td>{date(order.paid_at)}</td></tr>
            </tbody></table>
          </>
        ) : type === 'activation' ? (
          <>
            <p>Dengan ini kami konfirmasi bahwa kredit berikut telah ditambahkan ke workspace NexoClip <b>“{order.workspace_name}”</b> pada {date(order.paid_at)}, setelah pembayaran invoice {number} kami terima.</p>
            <table><tbody>
              <tr><td style={{ width: 220 }}>Kredit dibeli</td><td>{num(credits)} kredit</td></tr>
              {bonus > 0 && <tr><td>Bonus kredit</td><td>{num(bonus)} kredit</td></tr>}
              <tr className="total"><td>Total kredit aktif</td><td>{num(total)} kredit</td></tr>
            </tbody></table>
            <BalanceBreakdown before={before} added={total} />
            <Estimates pricing={pricing} total={overall} />
            <p className="muted">Kredit dipakai bersama oleh anggota workspace dan saat ini tidak memiliki masa kedaluwarsa. Sisa kredit dapat dilihat di menu Billing aplikasi.</p>
          </>
        ) : (
          <>
            <table>
              <thead><tr><th>Deskripsi</th><th className="right">Kredit</th><th className="right">Jumlah</th></tr></thead>
              <tbody>
                <tr><td>Paket kredit NexoClip (generate gambar, video, audio){bonus > 0 ? ` termasuk bonus ${num(bonus)} kredit` : ''}</td><td className="right">{num(total)}</td><td className="right">{idr(order.amount_idr)}</td></tr>
                <tr className="total"><td colSpan={2}>Total</td><td className="right">{idr(order.amount_idr)}</td></tr>
              </tbody>
            </table>
            {type === 'quotation' && <><BalanceBreakdown before={before} added={total} /><Estimates pricing={pricing} total={overall} /></>}
            {type === 'invoice' ? (
              <>
                <h2>Pembayaran</h2>
                <div>Mohon transfer {idr(order.amount_idr)} paling lambat <b>{date(addDays(order.created_at, 7))}</b> ke:</div>
                <div><b>{missing(c.bank_name, 'Bank')}</b> · {missing(c.bank_account_number, 'Nomor rekening')} · a.n. {missing(c.bank_account_name, 'Atas nama rekening')}</div>
                <div className="muted">Cantumkan nomor {number} di berita transfer. Kredit masuk setelah pembayaran kami verifikasi.</div>
              </>
            ) : (
              <>
                <h2>Ketentuan</h2>
                <ul>
                  <li>Kredit ditambahkan ke workspace setelah pembayaran diterima, dan tidak dapat diuangkan atau dikembalikan.</li>
                  <li>Estimasi durasi di atas mengikuti kurs USD/IDR dan pemakaian sebenarnya, belum termasuk generate yang diulang.</li>
                  <li>Penggunaan tunduk pada Syarat & Ketentuan NexoClip.</li>
                  <li>Pajak mengikuti ketentuan yang berlaku.</li>
                </ul>
              </>
            )}
            {order.notes && <><h2>Catatan</h2><div>{order.notes}</div></>}
          </>
        )}

        <div className="sign"><div>
          <div>{date(issued)}</div>
          {type === 'receipt' && Number(order.amount_idr) > STAMP_DUTY_THRESHOLD_IDR ? <div className="stamp">e-meterai Rp10.000</div> : <div className="space" />}
          <div><b>{missing(c.signer_name, 'Nama penanda tangan')}</b></div>
          <div className="muted">{missing(c.signer_title, 'Jabatan')}</div>
        </div></div>
      </article>
    </div>
  );
}

// The credits already in the workspace plus this invoice's, when there were some before.
function BalanceBreakdown({ before, added }) {
  if (!(before > 0)) return null;
  return <>
    <h2>Saldo kredit</h2>
    <table><tbody>
      <tr><td>Sisa saldo sebelumnya</td><td className="right">{num(before, 1)} kredit</td></tr>
      <tr><td>Tambahan dari dokumen ini</td><td className="right">{num(added, 1)} kredit</td></tr>
      <tr className="total"><td>Total kredit</td><td className="right">{num(before + added, 1)} kredit</td></tr>
    </tbody></table>
  </>;
}

// What the credits buy, model by model: video duration and image count.
function Estimates({ pricing, total }) {
  const duration = (seconds) => `± ${num(seconds / 60, 1)} menit (${num(seconds)} detik)`;
  return <>
    <h2>Perkiraan hasil dari {num(total, 1)} kredit</h2>
    <table>
      <thead><tr><th>Model</th><th className="right">Jika dipakai seluruhnya</th></tr></thead>
      <tbody>
        {pricing.videos.map((v) => <tr key={v.label}><td>Video {v.label}</td><td className="right">{duration(total / v.creditsPerSecond)}</td></tr>)}
        {pricing.images.map((i) => <tr key={i.label}><td>Gambar {i.label}</td><td className="right">± {num(Math.floor(total / i.creditsPerImage))} gambar</td></tr>)}
      </tbody>
    </table>
    <p className="muted">Masing-masing jika seluruh kredit dipakai untuk satu model saja; pemakaian campuran dibagi sesuai porsinya.</p>
  </>;
}
