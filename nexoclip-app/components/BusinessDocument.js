import PrintButton from './PrintButton';
import { STAMP_DUTY_THRESHOLD_IDR } from '../src/services/businessDocumentsService.js';
import { terbilang } from '../src/lib/terbilang.js';

export const idr = (v) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(v) || 0);
export const num = (v, digits = 0) => Number(v || 0).toLocaleString('en-US', { maximumFractionDigits: digits });
export const date = (v) => (v ? new Date(v).toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta' }) : '—');
const addDays = (v, days) => new Date(new Date(v).getTime() + days * 86_400_000);
export const missing = (value, label) => value || <span className="missing">[{label} not set in company profile]</span>;

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
            <h1>{missing(c.legal_name, 'Legal entity name')}</h1>
            <div className="muted">{missing(c.address, 'Address')}</div>
            {/* NPWP, email and phone are optional: shown when filled in. */}
            <div className="muted">{[c.npwp && `NPWP ${c.npwp}`, c.email, c.phone].filter(Boolean).join(' · ')}</div>
          </div>
          <div className="right">
            <h1>{title.toUpperCase()}</h1>
            <div>No. {number}</div>
            <div className="muted">Date {date(issued)}</div>
          </div>
        </header>

        <h2>{type === 'receipt' ? 'Received From' : 'To'}</h2>
        <div><b>{order.company_name}</b></div>
        <div className="muted">{order.customer_name ? `${order.customer_name} · ` : ''}{order.customer_email} · NexoClip Workspace “{order.workspace_name}”</div>

        {type === 'receipt' ? (
          <>
            <table><tbody>
              <tr><td style={{ width: 180 }}>Amount received</td><td><b>{idr(order.amount_idr)}</b></td></tr>
              <tr><td>Amount in words</td><td><i>{terbilang(order.amount_idr)}</i></td></tr>
              <tr><td>In payment for</td><td>NexoClip credit package of {num(total)} credits (invoice {number})</td></tr>
              <tr><td>Payment reference</td><td>{order.payment_reference}</td></tr>
              <tr><td>Payment date</td><td>{date(order.paid_at)}</td></tr>
            </tbody></table>
          </>
        ) : type === 'activation' ? (
          <>
            <p>We hereby confirm that the following credits have been added to NexoClip workspace <b>“{order.workspace_name}”</b> on {date(order.paid_at)}, following receipt of payment for invoice {number}.</p>
            <table><tbody>
              <tr><td style={{ width: 220 }}>Purchased credits</td><td>{num(credits)} credits</td></tr>
              {bonus > 0 && <tr><td>Bonus credits</td><td>{num(bonus)} credits</td></tr>}
              <tr className="total"><td>Total active credits</td><td>{num(total)} credits</td></tr>
            </tbody></table>
            <BalanceBreakdown before={before} added={total} />
            <Estimates pricing={pricing} total={overall} />
            <p className="muted">Credits are shared among workspace members and currently do not expire. Remaining credits can be viewed in the Billing menu of the app.</p>
          </>
        ) : (
          <>
            <table>
              <thead><tr><th>Description</th><th className="right">Credits</th><th className="right">Amount</th></tr></thead>
              <tbody>
                <tr><td>NexoClip credit package (image, video, audio generation){bonus > 0 ? ` including ${num(bonus)} bonus credits` : ''}</td><td className="right">{num(total)}</td><td className="right">{idr(order.amount_idr)}</td></tr>
                <tr className="total"><td colSpan={2}>Total</td><td className="right">{idr(order.amount_idr)}</td></tr>
              </tbody>
            </table>
            {type === 'quotation' && <><BalanceBreakdown before={before} added={total} /><Estimates pricing={pricing} total={overall} /></>}
            {type === 'invoice' ? (
              <>
                <h2>Payment</h2>
                <div>Please transfer {idr(order.amount_idr)} no later than <b>{date(addDays(order.created_at, 7))}</b> to:</div>
                <div><b>{missing(c.bank_name, 'Bank')}</b> · {missing(c.bank_account_number, 'Account number')} · Account name: {missing(c.bank_account_name, 'Account holder name')}</div>
                <div className="muted">Include reference {number} in your transfer memo. Credits will be added once payment is verified.</div>
              </>
            ) : (
              <>
                <h2>Terms</h2>
                <ul>
                  <li>Credits are added to the workspace once payment is received and are non-refundable and non-exchangeable for cash.</li>
                  <li>Estimated durations above depend on USD/IDR exchange rates and actual usage, and exclude retried generations.</li>
                  <li>Usage is subject to the NexoClip Terms & Conditions.</li>
                  <li>Taxes apply per applicable regulations.</li>
                </ul>
              </>
            )}
            {order.notes && <><h2>Notes</h2><div>{order.notes}</div></>}
          </>
        )}

        <div className="sign"><div>
          <div>{date(issued)}</div>
          {type === 'receipt' && Number(order.amount_idr) > STAMP_DUTY_THRESHOLD_IDR ? <div className="stamp">e-Meterai Rp10.000</div> : <div className="space" />}
          <div><b>{missing(c.signer_name, 'Signatory name')}</b></div>
          <div className="muted">{missing(c.signer_title, 'Title')}</div>
        </div></div>
      </article>
    </div>
  );
}

// The credits already in the workspace plus this invoice's, when there were some before.
function BalanceBreakdown({ before, added }) {
  if (!(before > 0)) return null;
  return <>
    <h2>Credit Balance</h2>
    <table><tbody>
      <tr><td>Previous remaining balance</td><td className="right">{num(before, 1)} credits</td></tr>
      <tr><td>Added from this document</td><td className="right">{num(added, 1)} credits</td></tr>
      <tr className="total"><td>Total credits</td><td className="right">{num(before + added, 1)} credits</td></tr>
    </tbody></table>
  </>;
}

// What the credits buy, model by model: video duration and image count.
function Estimates({ pricing, total }) {
  const duration = (seconds) => `± ${num(seconds / 60, 1)} min (${num(seconds)} sec)`;
  return <>
    <h2>Estimated Output from {num(total, 1)} Credits</h2>
    <table>
      <thead><tr><th>Model</th><th className="right">If used exclusively</th></tr></thead>
      <tbody>
        {pricing.videos.map((v) => <tr key={v.label}><td>Video {v.label}</td><td className="right">{duration(total / v.creditsPerSecond)}</td></tr>)}
        {pricing.images.map((i) => <tr key={i.label}><td>Image {i.label}</td><td className="right">± {num(Math.floor(total / i.creditsPerImage))} images</td></tr>)}
      </tbody>
    </table>
    <p className="muted">Each estimate assumes all credits are spent on a single model; mixed usage scales proportionally.</p>
  </>;
}
