// Rupiah amounts in Indonesian words, as receipts write them ("Terbilang").
const UNITS = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan', 'sepuluh', 'sebelas'];

function words(n) {
  if (n < 12) return UNITS[n];
  if (n < 20) return `${words(n - 10)} belas`;
  if (n < 100) return `${words(Math.floor(n / 10))} puluh ${words(n % 10)}`;
  if (n < 200) return `seratus ${words(n - 100)}`;
  if (n < 1000) return `${words(Math.floor(n / 100))} ratus ${words(n % 100)}`;
  if (n < 2000) return `seribu ${words(n - 1000)}`;
  if (n < 1_000_000) return `${words(Math.floor(n / 1000))} ribu ${words(n % 1000)}`;
  if (n < 1_000_000_000) return `${words(Math.floor(n / 1_000_000))} juta ${words(n % 1_000_000)}`;
  if (n < 1_000_000_000_000) return `${words(Math.floor(n / 1_000_000_000))} miliar ${words(n % 1_000_000_000)}`;
  return `${words(Math.floor(n / 1_000_000_000_000))} triliun ${words(n % 1_000_000_000_000)}`;
}

export function terbilang(amount) {
  const n = Math.floor(Math.abs(Number(amount) || 0));
  if (n === 0) return 'nol rupiah';
  const text = words(n).replace(/\s+/g, ' ').trim();
  return `${text.charAt(0).toUpperCase()}${text.slice(1)} rupiah`;
}
