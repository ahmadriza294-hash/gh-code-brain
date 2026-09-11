# AI Workspace Berkelanjutan dan Editor Visual

## Hasil yang akan dibangun
- Menempatkan prompt AI sebagai bagian tetap workspace, sehingga tetap tersedia saat pengguna berpindah antara pembuatan, patch, ekspor, dan GitHub.
- Mengubah prompt menjadi alur percakapan berkelanjutan: setiap instruksi dan hasil tampil sebagai baris riwayat baru, sementara proyek aktif dan preview tetap dipertahankan.
- Menyimpan proyek aktif, riwayat prompt, nama proyek, dan pengaturan preview di browser agar tidak hilang saat halaman dimuat ulang.
- Menggunakan model AI utama paling canggih yang tersedia untuk memahami instruksi lanjutan dan memperbarui proyek yang sama.
- Menambahkan editor visual pada preview: pilih elemen, geser posisinya, dan ubah lebar/tinggi melalui kontrol langsung maupun kolom ukuran.
- Menuliskan perubahan visual kembali ke kode HTML secara otomatis, sehingga hasil unduhan dan push GitHub sama dengan tampilan preview.

## Tampilan dan interaksi
- Prompt selalu terlihat di bagian atas panel kerja, dengan tombol kirim dan status proses.
- Riwayat instruksi tersusun kronologis dan dapat digulir tanpa menggantikan proyek aktif.
- Preview memiliki mode Lihat dan Edit, pilihan ukuran perangkat, serta panel properti untuk elemen terpilih.
- Mode Edit memberi garis seleksi dan pegangan ubah ukuran; perubahan langsung terlihat dan tersimpan.
- Pengguna tetap dapat menggunakan Build New, Smart Patch, ekspor ZIP, dan push GitHub seperti sebelumnya.

## Detail teknis
- Panggilan AI dipindahkan ke Responses API streaming dengan `openai/gpt-6-astra`, reasoning aktif, dan penanganan error gateway yang jelas.
- Konteks setiap prompt mencakup file proyek terkini dan ringkasan riwayat instruksi agar AI melanjutkan pekerjaan, bukan memulai ulang.
- Editor visual berkomunikasi aman dengan iframe preview, mengidentifikasi elemen berdasarkan jalur DOM, lalu menyimpan posisi dan ukuran sebagai inline style pada sumber HTML.
- Data browser diberi versi dan dipulihkan saat aplikasi dibuka; token GitHub tetap mengikuti perilaku penyimpanan yang sudah ada.
- Verifikasi mencakup build, alur prompt, pemulihan workspace, pemilihan elemen, drag, resize, dan sinkronisasi kode-preview pada desktop serta ponsel.
