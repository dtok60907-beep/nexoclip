import { accountDirectoryFilters } from './accountDirectoryFilters.js';

export const ACCOUNT_HISTORY_TYPES = ['sessions', 'payments', 'ledger'];
export const ACCOUNT_HISTORY_OPTIONS={
 sessions:[['all','Semua aktivitas'],['session_created','Sesi dibuat'],['session_revoked','Sesi dicabut']],
 payments:[['all','Semua status'],['pending','Menunggu'],['completed','Selesai'],['canceled','Dibatalkan'],['failed','Gagal']],
};
export function accountHistoryFilters({ history, page, pageSize, from, to, category } = {}) {
  if (!ACCOUNT_HISTORY_TYPES.includes(history)) {
    throw Object.assign(new Error('Jenis riwayat akun tidak valid'), { status: 400 });
  }
  const pagination = accountDirectoryFilters({ page, pageSize });
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  const selection=category==null||category===''?(history==='ledger'?'':'all'):category;
  if(typeof selection!=='string')fail('Filter riwayat tidak valid');
  if(history==='ledger'){if(selection.length>120)fail('Pencarian alasan maksimal 120 karakter');}
  else if(!ACCOUNT_HISTORY_OPTIONS[history].some(([value])=>value===selection))fail('Filter riwayat tidak valid');
  const day = (value, label) => {
    if (value == null || value === '') return null;
    if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value.startsWith('0000')) fail(`${label} tidak valid`);
    const date = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) fail(`${label} tidak valid`);
    return date;
  };
  const start = day(from, 'Tanggal awal'), end = day(to, 'Tanggal akhir');
  if (start && end && start > end) fail('Tanggal awal harus sebelum atau sama dengan tanggal akhir');
  const until = end ? new Date(end.getTime() + 86400000).toISOString() : null;
  if (until && !/^[0-9]{4}-/.test(until)) fail('Tanggal akhir di luar rentang yang didukung');
  return { history, page: pagination.page, pageSize: pagination.pageSize,
    category: history==='ledger'?selection.trim():selection, from: start ? from : null, to: end ? to : null, since: start?.toISOString() ?? null, until };

}
