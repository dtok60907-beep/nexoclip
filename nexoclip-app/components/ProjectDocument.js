import PrintButton from './PrintButton';
import { date, documentStyles, idr, missing, num } from './BusinessDocument';

export const PROJECT_DOCUMENTS = {
  pks: 'Draft Cooperation Agreement (Revenue Share)',
  bast: 'Handover Certificate (BAST)',
  statement: 'Revenue Share Statement',
};

function number(project, prefix) {
  const created = new Date(project.created_at);
  return `${prefix}/${created.getUTCFullYear()}/${String(created.getUTCMonth() + 1).padStart(2, '0')}/${String(project.document_seq).padStart(4, '0')}`;
}

function Signatures({ left, right, when }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 36, textAlign: 'center' }}>
    {[left, right].map((side) => <div key={side.title} style={{ minWidth: 220 }}>
      <div>{side.title}</div><div className="muted">{date(when)}</div><div className="space" />
      <div><b>{side.name}</b></div><div className="muted">{side.role}</div>
    </div>)}
  </div>;
}

export default function ProjectDocument({ type, data }) {
  const { project: p, company: c } = data;
  const s = p.summary;
  const us = { title: 'First Party', name: missing(c.signer_name, 'Signatory name'), role: <>{missing(c.signer_title, 'Title')}, {missing(c.legal_name, 'Legal entity name')}</> };
  const partner = { title: 'Second Party', name: p.partner_name, role: p.partner_contact || 'Agency partner' };
  const prefix = { pks: 'PKS', bast: 'BAST', statement: 'RBH' }[type];
  const issued = type === 'bast' ? (p.delivered_at || new Date()) : type === 'statement' ? new Date() : p.created_at;
  return <div className="doc-page">
    <style>{documentStyles}</style>
    <div className="doc-bar"><span>{PROJECT_DOCUMENTS[type]} · {p.title}</span><PrintButton /></div>
    <article className="doc">
      <header className="head">
        <div><h1>{missing(c.legal_name, 'Legal entity name')}</h1><div className="muted">{missing(c.address, 'Address')}</div></div>
        <div className="right"><h1 style={{ fontSize: 16 }}>{PROJECT_DOCUMENTS[type].toUpperCase()}</h1><div>No. {number(p, prefix)}</div><div className="muted">Date {date(issued)}</div></div>
      </header>

      {type === 'pks' && <>
        <p style={{ marginTop: 12, color: '#b91c1c' }}><b>DRAFT</b>: review with a notary or legal counsel before signing.</p>
        <p>This agreement is made between <b>{missing(c.legal_name, 'Legal entity name')}</b> (First Party, NexoClip AI production provider) and <b>{p.partner_name}</b> (Second Party, agency) for project <b>“{p.title}”</b> for client <b>{p.client_name}</b> with a project value of {idr(p.project_value_idr)}.</p>
        <h2>Article 1 · Scope of Work</h2><p>{p.scope || 'Deliverables, video count, duration, revision rounds, and deadlines are detailed in the project brief attached to this agreement.'}</p>
        <h2>Article 2 · Revenue Share</h2>
        <ul>
          <li>From the received project value, AI costs (model provider costs for all generations in this project, per the First Party’s system records) are reimbursed first, followed by other costs agreed in writing.</li>
          <li>The remaining net profit is shared {num(p.partner_share_percent, 2)}% to the Second Party and {num(100 - Number(p.partner_share_percent), 2)}% to the First Party.</li>
          <li>The Second Party’s share is paid within 14 days after full payment from the end client is received, to the Second Party’s bank account{p.partner_bank_account_number ? ` (${p.partner_bank_name} ${p.partner_bank_account_number} account name ${p.partner_bank_account_name})` : ''}, accompanied by a revenue share statement.</li>
        </ul>
        <h2>Article 3 · Invoicing</h2><p>The party responsible for invoicing the end client and collecting payment is agreed in writing for each project. The receiving party distributes the other party’s share in accordance with Article 2.</p>
        <h2>Article 4 · Revisions</h2><p>Revisions beyond the rounds agreed in the brief incur additional AI costs; such additions must be approved by both parties before work begins.</p>
        <h2>Article 5 · Intellectual Property</h2><p>Rights to the final deliverables transfer to the end client upon full payment, unless agreed otherwise. Both parties may display the work in their portfolios with the end client’s permission.</p>
        <h2>Article 6 · Confidentiality & Non-Circumvention</h2><p>Both parties shall maintain the confidentiality of client materials and data, and shall not directly solicit or work with the end client of this project without involving the other party during the term of this agreement and for 12 months thereafter.</p>
        <h2>Article 7 · Termination</h2><p>This agreement terminates upon project completion and full settlement of all revenue shares, or earlier by mutual written agreement. Work already in progress shall be completed or settled proportionally.</p>
        <Signatures left={us} right={partner} when={issued} />
      </>}

      {type === 'bast' && <>
        <p style={{ marginTop: 12 }}>On {date(issued)}, the First Party handed over to the Second Party the deliverables for project <b>“{p.title}”</b> for client <b>{p.client_name}</b>, and the Second Party confirms receipt.</p>
        <h2>Delivered Items</h2><p>{p.scope || '[Deliverable details: video count and duration, format, download links]'}</p>
        <p className="muted">Upon signing this handover certificate, the work is deemed accepted and serves as the basis for invoicing. Subsequent revisions follow the cooperation agreement.</p>
        <Signatures left={{ ...us, title: 'Handed over by' }} right={{ ...partner, title: 'Received by' }} when={issued} />
      </>}

      {type === 'statement' && <>
        <p style={{ marginTop: 12 }}>Revenue share statement for project <b>“{p.title}”</b> (client {p.client_name}) between {missing(c.legal_name, 'Legal entity name')} and {p.partner_name}.</p>
        <table><tbody>
          <tr><td>Project value</td><td className="right">{idr(s.value)}</td></tr>
          <tr><td>AI cost (model providers, from {date(p.started_at)}{p.closed_at ? ` to ${date(p.closed_at)}` : ''})</td><td className="right">− {idr(s.aiCost)}</td></tr>
          <tr><td>Other costs</td><td className="right">− {idr(s.otherCosts)}</td></tr>
          <tr className="total"><td>Net profit</td><td className="right">{idr(s.profit)}</td></tr>
          <tr><td>{p.partner_name} share ({num(p.partner_share_percent, 2)}%)</td><td className="right"><b>{idr(s.partnerShare)}</b></td></tr>
          <tr><td>{missing(c.legal_name, 'Legal entity name')} share</td><td className="right">{idr(s.ourShare)}</td></tr>
        </tbody></table>
        <h2>Payment Status</h2>
        <ul>
          <li>Client payment: {p.client_paid_at ? `received ${date(p.client_paid_at)}` : 'pending'}</li>
          <li>Partner share: {p.partner_paid_at ? `paid ${date(p.partner_paid_at)}` : 'unpaid'}{p.partner_bank_account_number ? ` · to ${p.partner_bank_name} ${p.partner_bank_account_number} (${p.partner_bank_account_name})` : ''}</li>
        </ul>
        {p.unknownCostRequests > 0 && <p className="muted">{p.unknownCostRequests} generations do not yet have recorded provider costs and are not yet included in AI cost.</p>}
        <Signatures left={us} right={partner} when={issued} />
      </>}
    </article>
  </div>;
}
