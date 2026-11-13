# 🌐 Panduan Domain XSTARZG Analysis (Cloudflare)

Status sekarang: project Cloudflare Pages bernama **`xstarzg-analysis`** → URL default
`https://xstarzg-analysis.pages.dev` (URL `*.pages.dev` mengikuti **nama project** dan
nama project Pages **tidak bisa di-rename** — jadi "anti" solusinya adalah membuat
project baru dengan nama yang diinginkan).

---

## ✅ Opsi A — 100% GRATIS: `xstarzganalysis.pages.dev`

Nama lebih pendek & bersih, tanpa biaya apa pun, ±5 menit.

### Lewat Dashboard (termudah)
1. Buka https://dash.cloudflare.com → **Workers & Pages** → **Create** → tab **Pages** → **Connect to Git**.
2. Pilih repo `xstarz28/xstarzg-analysis`.
3. Isi:
   - **Project name**: `xstarzganalysis`  ← inilah yang menentukan URL
   - **Production branch**: `main`
   - **Build command**: *(kosong)*
   - **Build output directory**: `public`
4. **Save and Deploy** → situs live di `https://xstarzganalysis.pages.dev`.
   Pages Functions di folder `functions/` ikut ter-deploy otomatis.

### Lewat Wrangler CLI (alternatif)
```bash
npx wrangler pages project create xstarzganalysis --production-branch=main
npx wrangler pages deploy public --project-name xstarzganalysis
# (folder functions/ otomatis ikut ter-deploy)
```

### Wajib disalin dari project lama (env tidak ikut pindah!)
Di project baru → **Settings → Variables and Secrets** (untuk production & preview):
| Key | Fungsi |
|---|---|
| `OWNER_ACCESS_CODE` | kode rahasia owner |
| `JWT_SECRET` | secret penandatangan token sesi |
| `GOOGLE_CLIENT_ID` | login Google |
| `VIP_PRICE_USDT` | harga lisensi VIP (opsional, ada default) |

Bila KV anti-replay dipakai: **Settings → Bindings → KV** → tambah binding `XS_TXLOG`
ke namespace yang sama.

### Update Google Sign-In
Google Cloud Console → **APIs & Services → Credentials** → OAuth 2.0 Client ID →
**Authorized JavaScript origins**: tambahkan `https://xstarzganalysis.pages.dev`
(biarkan origin lama tetap ada selama project lama masih dipakai).

### Setelah semua beres
- `wrangler.toml` di repo **sudah menunjuk** nama project baru (`xstarzganalysis`) —
  deploy via CLI (`npx wrangler pages deploy public`) otomatis menargetnya, bahkan
  otomatis **membuat** project-nya bila belum ada.
- Project lama `xstarzg-analysis` bisa di-**Delete** (atau dibiarkan; URL lama tetap hidup
  tapi tidak ada redirect otomatis — cukup berhenti membagikannya).

---

## 👑 Opsi B — Profesional: `xstarzganalysis.com` (hosting tetap GRATIS)

Fitur **Custom Domain** di Cloudflare Pages itu gratis (termasuk SSL otomatis) — paket
gratisan pun bisa. Yang berbayar hanya **registrasi domainnya** (aset milikmu, sekali
setahun): `.com` di **Cloudflare Registrar** dijual **at-cost** ±US$11–13/tahun
(±Rp180–220 ribu/tahun). Tidak ada cara legal mendapatkan `.com` gratis — layanan
domain gratisan (mis. Freenom) sudah mati/berisiko dan tidak cocok untuk produk
berbayar (VIP).

### Langkah
1. **Beli domain**: dash.cloudflare.com → **Domain Registration → Register** → cari
   `xstarzganalysis.com` → checkout. Domain otomatis masuk akun Cloudflare-mu.
2. **Tempel ke Pages**: project Pages → tab **Custom domains** → **Set up a custom domain**
   → ketik `xstarzganalysis.com` → **Continue**. Karena domain sudah di Cloudflare,
   DNS + SSL terpasang otomatis dalam hitungan menit.
3. Tambahkan juga `www.xstarzganalysis.com` bila mau (redirect otomatis tersedia).
4. **Google Cloud Console**: tambahkan `https://xstarzganalysis.com` (dan `www`) ke
   Authorized JavaScript origins.
5. Opsional: **Bulk Redirects** dari `xstarzg-analysis.pages.dev` ke domain baru
   (Rules → Redirect Rules) agar link lama tidak mati.

---

## Rekomendasi
- **Sekarang, tanpa keluar uang** → Opsi A (`xstarzganalysis.pages.dev`).
- **Kalau siap investasi ±Rp200rb/tahun** → Opsi B (kredibilitas produk berbayar
  jauh lebih kuat; hosting Cloudflare-nya tetap gratis).
- Keduanya bisa disusul: A dulu, B menyusul kapan pun tanpa perlu ubah kode
  (repo ini sudah bersih — tidak ada domain yang tertanam di file publik).
