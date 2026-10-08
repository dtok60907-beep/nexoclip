export const ACCOUNT_STATUS_OPTIONS = [
  ['all', 'Semua status'], ['active', 'Aktif'], ['suspended', 'Disuspend'],
];
export const ACCOUNT_PAGE_SIZES = [10, 25, 50, 100];

export function accountDirectoryFilters({ q, status, page, pageSize } = {}) {
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  if (q != null && (typeof q !== 'string' || q.length > 120)) fail('Pencarian akun maksimal 120 karakter');
  const selectedStatus = status ?? 'all';
  if (!ACCOUNT_STATUS_OPTIONS.some(([value]) => value === selectedStatus)) fail('Status akun tidak valid');
  const integer = (value, fallback, label) => {
    if (value == null) return fallback;
    if (!['string', 'number'].includes(typeof value) || !/^[1-9][0-9]*$/.test(String(value)) || !Number.isSafeInteger(Number(value))) fail(`${label} tidak valid`);
    return Number(value);
  };
  const selectedPage = integer(page, 1, 'Halaman');
  const selectedSize = integer(pageSize, 25, 'Ukuran halaman');
  if (selectedPage > 1_000_000 || !ACCOUNT_PAGE_SIZES.includes(selectedSize)) fail('Pagination akun tidak valid');
  return { q: (q ?? '').trim(), status: selectedStatus, page: selectedPage, pageSize: selectedSize };
}
