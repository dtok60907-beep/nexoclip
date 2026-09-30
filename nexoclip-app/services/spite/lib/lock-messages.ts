// Turn a refused node/prompt lock into a message that says what actually
// happened. Every failure used to read "another user", including the user's
// own other tab, an expired session and server errors.
export function describeLockFailure(status: number, holder?: unknown): string {
  if (status === 409) {
    return holder === 'self'
      ? 'Node ini sedang terbuka di tab lain kamu. Tutup tab itu atau tunggu ±15 detik.'
      : 'Node sedang dikerjakan user lain.'
  }
  if (status === 401) return 'Sesi login habis. Refresh halaman lalu coba lagi.'
  if (status === 404) return 'Project atau node tidak ditemukan. Refresh halaman.'
  if (status === 0) return 'Koneksi terputus. Cek internet lalu coba lagi.'
  return 'Server kunci node sedang bermasalah. Coba lagi sebentar.'
}
