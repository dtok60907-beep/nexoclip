# Runbook: Top-up Kredit Manual (sementara)

Dipakai selama belum ada payment provider. Customer membayar di luar aplikasi (transfer bank / QRIS),
admin memverifikasi pembayaran, lalu menambah kredit lewat `scripts/grant-credits.mjs`.

Status: script sudah dites lokal (mock). Menjalankannya di production butuh persetujuan Founder.

## 1. Siapa yang boleh menjalankan

- Hanya Founder atau satu admin yang ditunjuk Founder: `<ditetapkan Founder>`.
- Customer Success TIDAK menjalankan script ini langsung; mereka meneruskan permintaan + bukti ke admin.
- Prasyarat: pembayaran sudah diterima dan diverifikasi di mutasi bank / QRIS.
- `--ref` = nomor referensi transfer bank atau nomor invoice. Satu pembayaran = satu ref, tidak dipakai ulang.

## 2. Cara menjalankan

Jalankan di host live (`<deploy target belum dikonfirmasi Founder>`), di folder `nexoclip-app`,
dengan `DATABASE_URL` dari environment server. Jangan menempel kredensial di chat/ticket.

Cari `workspace_id` customer (UUID) lebih dulu, lalu dry-run:

    node scripts/grant-credits.mjs --workspace <uuid> --credits 1000 --ref TRF-20261002-001 \
      --operator "<nama admin>" --note "Invoice INV-001" --dry-run

Periksa nama/slug workspace, balance sebelum, dan proyeksi balance sesudah. Jika benar, jalankan sungguhan
(tanpa `--dry-run`; script meminta konfirmasi `y`, atau pakai `--yes` untuk scripted):

    node scripts/grant-credits.mjs --workspace <uuid> --credits 1000 --ref TRF-20261002-001 \
      --operator "<nama admin>" --note "Invoice INV-001"

Aturan:
- `--credits`: angka positif, maksimal 1 desimal, maksimal 1.000.000.
- `--ref`: karakter `A-Za-z0-9._:-`, maksimal 64.
- Menjalankan ulang dengan ref + workspace yang sama = "already applied", tidak ada perubahan (aman).
- Ref yang sama di workspace lain, atau jumlah berbeda untuk ref yang sama, ditolak (exit code non-zero).
- Output mencetak balance sebelum/sesudah, ledger entry id, dan idempotency key (`manual_topup:<ref>`). Simpan di catatan pembayaran.
- Jika muncul WARNING budget: lihat bagian 5.

## 3. Cek mutasi

Semua top-up ada di `credit_ledger` dengan `reason = 'manual_topup'`.

Per workspace:

    SELECT created_at, amount, balance_after, idempotency_key,
           metadata->>'ref' AS ref, metadata->>'operator' AS operator, metadata->>'note' AS note
    FROM credit_ledger
    WHERE reason = 'manual_topup' AND workspace_id = '<uuid>'
    ORDER BY created_at DESC;

Per rentang tanggal (semua workspace):

    SELECT l.created_at, w.slug, l.amount, l.metadata->>'ref' AS ref, l.metadata->>'operator' AS operator
    FROM credit_ledger l JOIN workspaces w ON w.id = l.workspace_id
    WHERE l.reason = 'manual_topup'
      AND l.created_at >= '2026-10-01' AND l.created_at < '2026-11-01'
    ORDER BY l.created_at;

Customer melihat saldo di badge kredit pada header studio dan di tab Usage.

## 4. Rekonsiliasi (harian/mingguan)

1. Jumlahkan kredit per periode:

       SELECT sum(amount) AS credits, count(*) AS entries
       FROM credit_ledger
       WHERE reason = 'manual_topup' AND created_at >= '<mulai>' AND created_at < '<akhir>';

2. Bandingkan dengan pembayaran masuk di mutasi bank/QRIS pada periode yang sama.
   100 kredit = USD 1; kurs IDR sesuai price list Founder.
3. Setiap ref di ledger harus cocok dengan tepat satu pembayaran, dan setiap pembayaran harus punya tepat satu ref.
4. Selisih diselidiki hari itu juga.

Koreksi kesalahan: ledger bersifat append-only, jangan UPDATE/DELETE. Koreksi dilakukan dengan entri negatif
(reason `manual_topup_reversal`, key `manual_topup_reversal:<ref>`).
PENDING: script belum punya flag `--reverse`. Sampai ditambahkan, minta engineer menjalankan reversal
melalui `appendCreditEntry` (src/services/creditService.js); jangan edit saldo dengan SQL langsung.
PERHATIAN: reversal GAGAL ("Insufficient credits") bila sebagian kredit sudah terpakai customer, karena
saldo tidak boleh negatif. Cek saldo dulu; jika saldo < jumlah top-up, reversal hanya bisa sebagian
(sebesar saldo tersisa) dan selisihnya diselesaikan secara bisnis (refund/penagihan) dengan keputusan Founder.

## 5. Menaikkan budget bulanan workspace

`workspace_generation_limits.budget_credits` membatasi pemakaian per bulan kalender (0 = tanpa batas).
Jika saldo setelah top-up melebihi budget bulanannya, script mencetak WARNING (generasi mungkin diblokir
setelah pemakaian bulan ini mencapai budget) dan tidak mengubah limit.
Menaikkan budget (butuh persetujuan Founder atas default limits):

    UPDATE workspace_generation_limits
    SET budget_credits = <angka baru>, updated_at = now()
    WHERE workspace_id = '<uuid>';
