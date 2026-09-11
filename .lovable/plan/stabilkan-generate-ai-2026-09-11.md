# Stabilkan Generate AI

## Hasil
- Generate tidak lagi dibatalkan hanya karena sambungan halaman berubah saat AI masih bekerja.
- Kode yang sudah berhasil diterima tetap dipasang ke proyek dan preview, termasuk bila aliran jawaban terputus setelah menghasilkan file valid.
- Kegagalan sementara 429/5xx dicoba ulang secara terbatas dengan jeda; error permanen tetap ditampilkan apa adanya.
- Tombol generate tetap terkunci selama proses agar permintaan ganda tidak saling membatalkan.

## Verifikasi
- Uji generate nyata sampai preview terisi dan progres mencapai 100%.
- Periksa tampilan ponsel, log browser, dan status build.
