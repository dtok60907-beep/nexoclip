import PrintButton from './PrintButton';
import { date, documentStyles, idr, missing, num } from './BusinessDocument';

export const PROJECT_DOCUMENTS = {
  pks: 'Draf Perjanjian Kerja Sama (Bagi Hasil)',
  bast: 'Berita Acara Serah Terima',
  statement: 'Rekap Bagi Hasil',
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
  const us = { title: 'Pihak Pertama', name: missing(c.signer_name, 'Nama penanda tangan'), role: <>{missing(c.signer_title, 'Jabatan')}, {missing(c.legal_name, 'Nama badan usaha')}</> };
  const partner = { title: 'Pihak Kedua', name: p.partner_name, role: p.partner_contact || 'Mitra agency' };
  const prefix = { pks: 'PKS', bast: 'BAST', statement: 'RBH' }[type];
  const issued = type === 'bast' ? (p.delivered_at || new Date()) : type === 'statement' ? new Date() : p.created_at;
  return <div className="doc-page">
    <style>{documentStyles}</style>
    <div className="doc-bar"><span>{PROJECT_DOCUMENTS[type]} · {p.title}</span><PrintButton /></div>
    <article className="doc">
      <header className="head">
        <div><h1>{missing(c.legal_name, 'Nama badan usaha')}</h1><div className="muted">{missing(c.address, 'Alamat')}</div></div>
        <div className="right"><h1 style={{ fontSize: 16 }}>{PROJECT_DOCUMENTS[type].toUpperCase()}</h1><div>No. {number(p, prefix)}</div><div className="muted">Tanggal {date(issued)}</div></div>
      </header>

      {type === 'pks' && <>
        <p style={{ marginTop: 12, color: '#b91c1c' }}><b>DRAF</b>: periksa bersama notaris atau konsultan hukum sebelum ditandatangani.</p>
        <p>Perjanjian ini dibuat antara <b>{missing(c.legal_name, 'Nama badan usaha')}</b> (Pihak Pertama, penyedia produksi AI NexoClip) dan <b>{p.partner_name}</b> (Pihak Kedua, agency) untuk project <b>“{p.title}”</b> bagi client <b>{p.client_name}</b> dengan nilai project {idr(p.project_value_idr)}.</p>
        <h2>Pasal 1 · Lingkup kerja</h2><p>{p.scope || 'Deliverable, jumlah video, durasi, jumlah revisi dan tenggat dirinci dalam brief project yang menjadi lampiran perjanjian ini.'}</p>
        <h2>Pasal 2 · Pembagian hasil</h2>
        <ul>
          <li>Dari nilai project yang diterima, terlebih dahulu dikembalikan biaya AI (biaya penyedia model untuk seluruh generate project ini, sesuai catatan sistem Pihak Pertama), lalu biaya lain yang disepakati tertulis.</li>
          <li>Sisanya adalah laba, dibagi {num(p.partner_share_percent, 2)}% untuk Pihak Kedua dan {num(100 - Number(p.partner_share_percent), 2)}% untuk Pihak Pertama.</li>
          <li>Bagian Pihak Kedua dibayar paling lambat 14 hari setelah pembayaran client akhir diterima penuh, ke rekening Pihak Kedua{p.partner_bank_account_number ? ` (${p.partner_bank_name} ${p.partner_bank_account_number} a.n. ${p.partner_bank_account_name})` : ''}, disertai rekap bagi hasil.</li>
        </ul>
        <h2>Pasal 3 · Penagihan</h2><p>Pihak yang menagih client akhir dan menerima pembayaran disepakati tertulis untuk tiap project. Pihak penerima menyalurkan bagian pihak lain sesuai Pasal 2.</p>
        <h2>Pasal 4 · Revisi</h2><p>Revisi di luar jumlah yang disepakati dalam brief menambah biaya AI; tambahan tersebut disepakati para pihak sebelum dikerjakan.</p>
        <h2>Pasal 5 · Hak atas karya</h2><p>Hak atas hasil karya beralih kepada client akhir setelah pembayaran lunas, kecuali disepakati lain. Para pihak boleh menampilkan karya sebagai portofolio dengan izin client akhir.</p>
        <h2>Pasal 6 · Kerahasiaan dan non-circumvention</h2><p>Para pihak menjaga kerahasiaan materi dan data client, dan tidak menghubungi atau mengerjakan client akhir project ini secara langsung tanpa melibatkan pihak lain selama perjanjian berlaku dan 12 bulan sesudahnya.</p>
        <h2>Pasal 7 · Pengakhiran</h2><p>Perjanjian berakhir setelah project selesai dan seluruh pembagian hasil dibayar, atau lebih awal atas kesepakatan tertulis para pihak. Pekerjaan yang sudah berjalan diselesaikan atau dihitung secara proporsional.</p>
        <Signatures left={us} right={partner} when={issued} />
      </>}

      {type === 'bast' && <>
        <p style={{ marginTop: 12 }}>Pada {date(issued)}, Pihak Pertama menyerahkan kepada Pihak Kedua hasil pekerjaan project <b>“{p.title}”</b> untuk client <b>{p.client_name}</b>, dan Pihak Kedua menyatakan telah menerimanya.</p>
        <h2>Hasil yang diserahkan</h2><p>{p.scope || '[Rincian deliverable: jumlah dan durasi video, format, tautan unduhan]'}</p>
        <p className="muted">Dengan ditandatanganinya berita acara ini, pekerjaan dianggap diterima dan menjadi dasar penagihan. Revisi berikutnya mengikuti ketentuan perjanjian kerja sama.</p>
        <Signatures left={{ ...us, title: 'Yang menyerahkan' }} right={{ ...partner, title: 'Yang menerima' }} when={issued} />
      </>}

      {type === 'statement' && <>
        <p style={{ marginTop: 12 }}>Rekap bagi hasil project <b>“{p.title}”</b> (client {p.client_name}) antara {missing(c.legal_name, 'Nama badan usaha')} dan {p.partner_name}.</p>
        <table><tbody>
          <tr><td>Nilai project</td><td className="right">{idr(s.value)}</td></tr>
          <tr><td>Biaya AI (penyedia model, sejak {date(p.started_at)}{p.closed_at ? ` s.d. ${date(p.closed_at)}` : ''})</td><td className="right">− {idr(s.aiCost)}</td></tr>
          <tr><td>Biaya lain</td><td className="right">− {idr(s.otherCosts)}</td></tr>
          <tr className="total"><td>Laba</td><td className="right">{idr(s.profit)}</td></tr>
          <tr><td>Bagian {p.partner_name} ({num(p.partner_share_percent, 2)}%)</td><td className="right"><b>{idr(s.partnerShare)}</b></td></tr>
          <tr><td>Bagian {missing(c.legal_name, 'Nama badan usaha')}</td><td className="right">{idr(s.ourShare)}</td></tr>
        </tbody></table>
        <h2>Status pembayaran</h2>
        <ul>
          <li>Pembayaran client: {p.client_paid_at ? `diterima ${date(p.client_paid_at)}` : 'belum diterima'}</li>
          <li>Bagian mitra: {p.partner_paid_at ? `dibayar ${date(p.partner_paid_at)}` : 'belum dibayar'}{p.partner_bank_account_number ? ` · ke ${p.partner_bank_name} ${p.partner_bank_account_number} a.n. ${p.partner_bank_account_name}` : ''}</li>
        </ul>
        {p.unknownCostRequests > 0 && <p className="muted">{p.unknownCostRequests} generate belum memiliki biaya penyedia tercatat dan belum masuk biaya AI.</p>}
        <Signatures left={us} right={partner} when={issued} />
      </>}
    </article>
  </div>;
}
