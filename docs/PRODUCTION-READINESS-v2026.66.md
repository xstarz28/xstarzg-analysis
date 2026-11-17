# Audit Produksi & Kesiapan Launch — v2026.66
Tanggal audit: 12 Nov 2026 • Cabang: `arena/97d4a2b0-xstarzg-analysis` • Dasar: `affeba0` (v2026.65 LIVE)

---

## 1. PUTUSAN (jujur, tanpa dilebih-lebihkan)

**Verdict: BELUM siap menagih uang sekarang — menjadi SIAP setelah checklist operasional 15 menit di dashboard Cloudflare (bagian 4) selesai.**

Sebelum v2026.66 jawabannya adalah **TIDAK tegas**: siapa pun bisa mengaktifkan VIP tanpa membayar
(30 detik lewat DevTools), dan subscriber TIDAK tercatat di mana pun. Setelah v2026.66 rantai
entitlement-nya benar end-to-end — tetapi masih ada **dua blok keamanan operasional yang hanya bisa
ditutup oleh pemilik akun Cloudflare** (secret produksi + database D1). Detail di bawah.

| Area | Sebelum v2026.66 | Sesudah v2026.66 |
|---|---|---|
| Verifikasi pembayaran on-chain | Klien memeriksa sendiri via RPC publik lalu **menulis sendiri `tier:'VIP'` di localStorage** | Server (`/api/billing/verify-bsc`) memeriksa receipt on-chain, lalu **menandatangani entitlement (JWT)** |
| Autentikasi endpoint billing | **Dekoratif — hasil `authenticateRequest` tidak pernah dicek** | Wajib: tanpa JWT valid → **401**, tanpa grant |
| Identitas akun | Login email publik murni client-side (regex saja, tanpa sesi server) | `/api/auth/register` menerbitkan sesi JWT bertanda tangan; pembayaran diikat ke email |
| Aktivasi setelah bayar (auto-approve) | Ada tapi tidak aman & tak tercatat | **Auto-approve nyata**: tx terverifikasi → VIP 30 hari langsung aktif, token diserahkan server. Perpanjangan **menumpuk** (max(sisa, kini) + 30 hari) |
| Manajemen subscriber | **Nol** — tidak ada persistensi apa pun | Entitlement tersimpan di D1 (`vip_entitlements`) + log tx (`vip_tx`) bila binding aktif; anti-replay txHash lintas-isolate |
| Revalidasi sesi | Hanya OWNER yang divalidasi ulang | VIP ikut divalidasi saat boot (`/api/auth/me`); token kedaluwarsa → re-register senyap, VIP dipulihkan dari D1 bila masih sah |
| Faktur/tagihan | `invoice.js` stub kosong `{ok:true}` | Endpoint faktur nyata: nominal, wallet resmi, jaringan, ID faktur; modal pembayaran terhidrasi dari server |
| Jurnal Sinyal (fitur baru v2026.65) | Riwayat tampil, tetapi kartu **tidak bisa diklik** | Setiap kartu (termasuk putusan TP/SL/⚠/⏳ **hari-hari sebelumnya**) clickable → membuka kembali grafik instrumen + timeframe asal (`gotoInstrument`) |

---

## 2. DAFTAR BUG YANG DITEMUKAN & DIPERBAIKI (tanpa menghapus fitur apa pun)

1. **[KRITIS] Self-grant VIP** — `btnVerifyTxHash` memanggil `clientVerifyBscPayment()` (RPC publik dari
   browser) lalu menulis tier langsung ke `localStorage`. Siapa pun bisa menekan satu tombol di DevTools
   dan menjadi VIP. Bahkan **Mode Tamu dibuatkan akun palsu `vip@xstarzg.local`**. → Dihapus total;
   diganti `serverVerifyBscPayment()` yang berbicara dengan server dan hanya menerima entitlement
   bertanda tangan.
2. **[KRITIS] Auth tidak ditegakkan di `/api/billing/verify-bsc`** — variabel `user` diisi lalu tidak
   pernah dipakai; `undefined` tidak menolak apa pun. → kini `if (!user || !user.email) → 401`.
3. **[KRITIS] Tidak ada persistensi subscriber** — verify sukses hanya membalas `{ok,tier,daysAdded}`
   tanpa mencatat siapa pun. → upsert D1 `vip_entitlements(email, vip_until)` + `vip_tx(tx_hash)`;
   skema di `migrations/0001_vip.sql`.
4. **[TINGGI] Login publik palsu** — form "Google" hanya memvalidasi regex email di browser; endpoint
   `/api/auth/google` (verifier GIS sungguhan) tidak pernah dipakai UI. → `/api/auth/register` baru
   menerbitkan JWT untuk email+name, dipanggil senyap setelah login dan sebelum verifikasi bayar.
5. **[SEDANG] Jurnal tidak clickable** — permintaan eksplisit user: entri lampau (termasuk kemarin &
   lebih tua — store menyimpan hingga ±80 putusan) harus membuka grafiknya. → kartu jurnal kini
   `data-sym/data-tf` + klik → `gotoInstrument(sym, tf)`, pointer + hint ↗ (i18n `jnlOpen` ×20 bahasa).
6. **[SEDANG] `invoice.js` stub** → dieksekusi menjadi endpoint faktur nyata (satu sumber kebenaran
   untuk `$29 USDT`, wallet `0xB2Da…12C`, jaringan BEP-20, ID faktur `XS-YYYYMMDD-XXXXXX`).
7. **[RENDAH] File warisan `public/js/app.js`** memanggil endpoint `/api/billing/verify-bsc-usdt` yang
   tidak ada. File ini **tidak dimuat `index.html`** (hanya `/app.js` yang dimuat) sehingga tidak aktif
   di produksi. Dibiarkan utuh (aturan "jangan hapus fitur"), tapi direkomendasikan dihapus pada
   upgrade berikut bila Anda setuju.
8. **[RENDAH] Anti-replay txHash per-isolate** — `Set` in-memory hilang saat isolate dingin. → KV
   `XS_TXLOG` (sudah didukung) **dan** D1 `vip_tx` kini keduanya dicek; dengan D1 aktif replay mustahil
   lintas-isolate.

Verifikasi silang SEMUA instrumen/kategori tetap berlaku (audit fitur hilang tiap upgrade):
**110/110** cek statis, **99/99** uji engine, 20 locale seragam **502 key**. Tidak ada fitur yang
dihapus; satu-satunya fungsi yang hilang adalah jalur berbahaya `clientVerifyBscPayment` yang memang
harus mati.

---

## 3. CARA KERJA PEMBAYARAN SEKARANG (auto-approve)

```
User bayar $29 USDT (BEP-20) ke wallet resmi
  → tempel TxHash di modal → [frontend wajib login email]
  → POST /api/billing/verify-bsc (Bearer JWT dari /api/auth/register)
  → Server: auth 401-gate → eth_getTransactionReceipt (status 0x1)
           → log Transfer USDT ke wallet resmi → amount ≥ $29
           → anti-replay (KV/D1/Set) → entitlement = max(now, sisa) + 30 hari
  → Server menandatangani JWT VIP {email, tier:'VIP', vipUntil}
  → Frontend menyimpan token; quotaLimit() membuka 600+ instrumen
  → Boot berikutnya: /api/auth/me memvalidasi ulang tanda tangan & saldo hari
```

---

## 4. CHECKLIST WAJIB OWNER — 15 MENIT SEBELUM MENERIMA UANG SUNGGUHAN

1. **Set `JWT_SECRET` produksi (acak, panjang)** di Cloudflare Pages → Settings → Environment
   variables. Tanpa ini secret default ada di repo publik → **siapa pun bisa memalsukan token VIP**.
   Ini satu-satunya blok yang benar-benar mengunci.
2. **Buat D1 & pasang binding `DB`**:
   `wrangler d1 create xstarzg-db` → `wrangler d1 execute xstarzg-db --remote --file=migrations/0001_vip.sql`
   → salin blok `[[d1_databases]]` (komentar di `wrangler.toml`) dengan `database_id` asli.
   Tanpa D1 sistem tetap jalan (stateless JWT), tetapi: daftar subscriber lintas perangkat, tumpukan
   perpanjangan >30 hari, dan anti-replay permanen baru terjamin setelah D1 aktif.
3. Opsional: set `BSC_RPC_URL` ke RPC berbayar/andal (Ankr/NodeReal) — default publik kadang lambat.
4. Uji ujung-ke-ujung SEKALI dengan pembayaran nyata kecil-kecilan tidak mungkin (minimum $29
   ditegakkan server) → uji dengan akun kedua Anda sendiri, lalu cek baris masuk ke `vip_entitlements`.

**Batas jujur yang tersisa (desain, bukan bug):** penegakan kuota instrumen masih di sisi klien —
penyerang tingkat mahir bisa memodifikasi JS lokal. Ini hanya bisa ditutup total dengan memindahkan
katalog penuh/sinyal ke API yang digate server (pekerjaan besar, Fase 2). Pada harga $29 dan jejak
audit kita, risiko praktisnya rendah-sedang; risiko reputasi (klaim "scam") sudah ditangani jurnal
transparan. Lacak ulang bila pendapatan mulai berarti.

---

## 5. STRATEGI PEMASARAN ORGANIK — TANPA MEMBAYAR PROMOTOR MANUSIA

Prinsip: **jurnal sinyal = mesin pemasaran**. Setiap hari ia memproduksi bukti (kartu TP ✅/SL ❌ +
win-rate per horison) yang bisa diposting apa adanya — transparansi penuh adalah pembeda melawan
penjual sinyal gelap, dan satu-satunya cara mematahkan tuduhan "scam" yang Anda takutkan.

### Minggu 1–2 — Fondasi bukti
- **Ritual harian 5 menit**: screenshot jurnal + kartu radar terbaik → posting ke X (Twitter) &
  TradingView Ideas dengan link situs. Format tetap: "Kemarin AI kami: XAU/USD LONG TP ✅+1.8R,
  BTC ❌SL −1R, WR 30 hari: NN%". Kekalahan DIPOSTING juga — itulah iklannya.
- **Halaman publik permanen** (Fase 2 kode): `/track-record` yang membaca jurnal — link tunggal
  untuk semua bio sosial.

### Minggu 2–6 — Kanal organik utama
- **TradingView Ideas** (gratis, audiens tepat 100% trader): bahasa Inggris, 3–5 analisis/minggu
  mengutip output radar; profil → link situs.
- **Reddit** (r/Daytrading, r/Forex, r/CryptoMarkets): jangan promosi — jawab pertanyaan dengan
  tangkapan layar jurnal; link hanya di bio profil. 1–2 kontribusi berkualitas/hari.
- **YouTube Shorts + TikTok** (dibuat sendiri): 45–60 detik "1 sinyal, 1 alasan, 1 hasil" memakai
  rekaman layar aplikasi. 20 bahasa UI = konten bisa dilokalkan (id/en/es/pt/ar dulu).
- **Grup Telegram/Discord sendiri** (gratis): "Jurnal Terbuka XStarZG" — push putusan jurnal harian;
  komunitas kecil yang jujur menyebar lebih cepat daripada grup besar yang dibeli.

### Bulan 2–3 — Efek majemuk
- **SEO programatis**: situs sudah 20 bahasa, 600+ instrumen → halaman statis per instrumen populer
  ("Analisis XAU/USD hari ini", "Analisis BTC/USD minggu ini", dst.) yang dirender dari data engine;
  halaman inilah yang diindeks Google dan menuai trafik abadi tanpa biaya.
- **Launch bertahap**: Product Hunt → Hacker News (Show HN: "open track-record signal engine")
  → IndieHackers milestone pendapatan publik (build in public).
- **Newsletter mingguan makro** (endpoint `/api/macro/regime` sudah ada): tulis ulang regime map
  sebagai email 5 menit — alat retensi sekaligus bukti keahlian.
- **Referral tanpa uang muka** (butuh D1, jadi setelah checklist): pembeli VIP dapat kode; tiap
  pembelian referral menambah +7 hari ke keduanya. Ini bukan membayar promotor — biaya nol rupiah,
  hanya hari layanan.

### Anggaran: $0 — hanya waktu ~45 menit/hari.
KPI 90 hari yang realistis: 1.000 kunjungan organik/minggu → 3–5% daftar login → 2–5% konversi VIP
→ 5–20 pelanggan pertama. Angka itu, dengan jurnal WR yang konsisten, adalah bahan bakar bulan 4–6.

*Catatan integritas: jangan pernah menyembunyikan SL. Satu bulan WR jelek yang dipublikasikan utuh
membangun lebih banyak kepercayaan daripada satu bulan WR sempurna yang dicurigai.*
