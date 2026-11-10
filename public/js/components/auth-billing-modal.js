import { api } from '../api.js';
import { formatNumber, formatDateTime } from '../../i18n/index.js';
const OWNER_BSC_WALLET = '0xB2Da154e6619A57A2B839D7845920e55Bc58A12C';
const BSC_USDT_CONTRACT = '0x55d398326f99059fF775485246999027B3197955';
const LOCAL_CLIENT_ID_KEY = 'xstarzg_google_client_id';
export class AuthBillingModal {
  constructor({ triggerBtnId, onSessionUpdated }) {
    this.triggerBtn = document.getElementById(triggerBtnId);
    this.onSessionUpdated = onSessionUpdated;
    this.session = null;
    this.activeInvoice = null;
    this.modalEl = null;
  }
  init() {
    this.createModalDOM();
    if (this.triggerBtn) {
      this.triggerBtn.addEventListener('click', () => this.open());
    }
  }
  getEffectiveClientId() {
    return (
      this.session?.googleClientId ||
      localStorage.getItem(LOCAL_CLIENT_ID_KEY) ||
      ''
    ).trim();
  }
  createModalDOM() {
    const wrap = document.createElement('div');
    wrap.id = 'authBillingModalBackdrop';
    wrap.className = 'modal-backdrop hidden';
    wrap.innerHTML = `
      <div class="modal-card chamfer-box" style="max-width:620px;">
        <div class="modal-header">
          <h3 id="authModalTitle" class="panel-title">AKUN KUANTITATIF, KUOTA HARIAN & UPGRADE VIP (BSC USDT)</h3>
          <button id="btnCloseAuthModal" type="button" class="btn-chamfer btn-sm">✕ Tutup</button>
        </div>
        <div id="authModalBody" class="modal-body"></div>
      </div>
    `;
    document.body.appendChild(wrap);
    this.modalEl = wrap;
    const closeBtn = wrap.querySelector('#btnCloseAuthModal');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) this.close();
    });
  }
  async refreshSession() {
    try {
      const res = await api.fetchSession();
      this.session = res;
      if (res.googleClientId) {
        localStorage.setItem(LOCAL_CLIENT_ID_KEY, res.googleClientId);
      }
      this.updateTopbarButton();
      if (this.onSessionUpdated) this.onSessionUpdated(res);
      return res;
    } catch (_) {
      return null;
    }
  }
  updateTopbarButton() {
    if (!this.triggerBtn || !this.session) return;
    const u = this.session.user;
    const q = this.session.quota || {};
    if (u && u.email) {
      const roleTag = u.isOwner ? '👑 OWNER ADMIN' : u.isVip ? '⚡ VIP PRO' : '✓ MEMBER';
      this.triggerBtn.innerHTML = `
        <span class="status-dot status-online"></span>
        <span>${roleTag} (${u.email.split('@')[0]})</span>
      `;
    } else {
      this.triggerBtn.innerHTML = `
        <span class="auth-dot"></span>
        <span>Tamu (${q.remaining ?? 2}/${q.limit ?? 2}) • Login Google / VIP</span>
      `;
    }
  }
  open() {
    if (!this.modalEl) return;
    this.modalEl.classList.remove('hidden');
    this.renderContent();
  }
  close() {
    if (!this.modalEl) return;
    this.modalEl.classList.add('hidden');
  }
  renderGoogleButtonInto(mountId) {
    const clientId = this.getEffectiveClientId();
    const mount = document.getElementById(mountId);
    if (!mount || !clientId) return false;
    const tryRender = () => {
      if (!window.google?.accounts?.id) return false;
      mount.innerHTML = '';
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          if (response && response.credential) {
            const res = await api.loginWithGoogle(response.credential);
            if (res.ok) {
              await this.refreshSession();
              this.close();
              const gate = document.getElementById('loginGateScreen');
              const ws = document.getElementById('appWorkspaceWrapper');
              if (gate) gate.classList.add('hidden');
              if (ws) ws.classList.remove('hidden');
              window.dispatchEvent(new Event('resize'));
            } else {
              alert(res.error || 'Verifikasi Google gagal.');
            }
          }
        }
      });
      window.google.accounts.id.renderButton(mount, {
        theme: 'filled_black',
        size: 'large',
        width: 300,
        text: 'signin_with'
      });
      return true;
    };
    if (!tryRender()) {
      setTimeout(tryRender, 800);
    }
    return true;
  }
  async renderContent() {
    const body = document.getElementById('authModalBody');
    if (!body) return;
    await this.refreshSession();
    const u = this.session?.user;
    const q = this.session?.quota || { used: 0, limit: 2, remaining: 2, tier: 'GUEST' };
    const clientId = this.getEffectiveClientId();
    const authSectionHtml = u
      ? `
        <div class="bt-box">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
            <div>
              <span class="sig-metric-title">TERAUTENTIKASI SEBAGAI</span>
              <div style="font-weight:800;font-size:14px;color:var(--text-ice);">${u.email}</div>
              <span class="mh-exchange-badge">${u.isOwner ? 'OWNER ADMIN (UNLIMITED)' : u.isVip ? 'VIP QUANT MEMBER' : 'FREE GOOGLE MEMBER (5 ANALISIS/HARI)'}</span>
            </div>
            <button id="btnLogoutAccount" type="button" class="btn-chamfer btn-sm">Logout / Ganti Akun</button>
          </div>
        </div>
      `
      : `
        <div class="bt-box">
          <span class="sig-metric-title">LOGIN DENGAN AKUN GOOGLE RESMI</span>
          <p class="pillar-summary" style="margin:4px 0 10px;">
            Login dengan Google untuk meningkatkan kuota menjadi <strong>5 analisis/hari</strong> atau mengaktifkan akses <strong>Owner Admin (` +
        `sevenfoldarmy2822@gmail.com / gilfanputra@gmail.com` +
        `)</strong>.
          </p>
          <div id="modalGoogleSignInMount" style="min-height:44px;display:flex;justify-content:center;"></div>
          ${
            !clientId
              ? `<div style="margin-top:8px;">
                   <div style="display:flex;gap:6px;">
                     <input id="inpModalClientId" type="text" placeholder="Tempel Google Client ID (.apps.googleusercontent.com)" class="chamfer-input" style="flex:1;" />
                     <button id="btnSaveModalClientId" type="button" class="btn-chamfer btn-primary btn-sm">Simpan</button>
                   </div>
                 </div>`
              : ''
          }
        </div>
      `;
    const billingSectionHtml = `
      <div class="bt-box">
        <span class="sig-metric-title" style="color:var(--bull-teal);font-weight:700;">UPGRADE KE VIP QUANT PRO — PEMBAYARAN ON-CHAIN USDT BEP-20 (BSC)</span>
        <div class="fund-row" style="margin-top:8px;">
          <span class="fund-row-label">Dompet Penerima Resmi (BEP-20)</span>
          <span class="fund-row-val" style="font-size:11px;word-break:break-all;">${OWNER_BSC_WALLET}</span>
        </div>
        <div class="fund-row">
          <span class="fund-row-label">Kontrak Resmi USDT BSC</span>
          <span class="fund-row-val" style="font-size:11px;word-break:break-all;">${BSC_USDT_CONTRACT}</span>
        </div>
        <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
          <button id="btnCreateInvoiceMonth" type="button" class="btn-chamfer btn-primary btn-sm">Buat Invoice VIP 30 Hari (19 USDT)</button>
          <button id="btnCreateInvoiceYear" type="button" class="btn-chamfer btn-sm">Buat Invoice VIP 365 Hari (149 USDT)</button>
        </div>
        <div id="invoiceActiveMount" style="margin-top:10px;"></div>
      </div>
    `;
    body.innerHTML = `
      <div class="sig-dual-metrics">
        <div class="sig-metric-box">
          <span class="sig-metric-title">TIER AKUN AKTIF</span>
          <div class="sig-metric-val">${q.tier || 'GUEST'}</div>
          <span class="sig-metric-note">Reset harian pukul 00:00 UTC</span>
        </div>
        <div class="sig-metric-box">
          <span class="sig-metric-title">SISA KUOTA ANALISIS PENUH</span>
          <div class="sig-metric-val text-bull">${q.remaining ?? 2} <span style="font-size:12px;color:var(--text-muted);">/ ${q.limit ?? 2}</span></div>
          <span class="sig-metric-note">Terpakai hari ini: ${q.used ?? 0}</span>
        </div>
      </div>
      ${authSectionHtml}
      ${billingSectionHtml}
    `;
    if (!u && clientId) {
      this.renderGoogleButtonInto('modalGoogleSignInMount');
    }
    const btnSaveCid = document.getElementById('btnSaveModalClientId');
    if (btnSaveCid) {
      btnSaveCid.addEventListener('click', () => {
        const val = document.getElementById('inpModalClientId')?.value?.trim();
        if (val) {
          localStorage.setItem(LOCAL_CLIENT_ID_KEY, val);
          this.renderContent();
        }
      });
    }
    const btnLogout = document.getElementById('btnLogoutAccount');
    if (btnLogout) {
      btnLogout.addEventListener('click', async () => {
        await api.logout();
        await this.refreshSession();
        this.close();
        document.getElementById('loginGateScreen')?.classList.remove('hidden');
        document.getElementById('appWorkspaceWrapper')?.classList.add('hidden');
      });
    }
    document.getElementById('btnCreateInvoiceMonth')?.addEventListener('click', () => this.handleCreateInvoice('VIP_MONTHLY'));
    document.getElementById('btnCreateInvoiceYear')?.addEventListener('click', () => this.handleCreateInvoice('VIP_YEARLY'));
  }
  async handleCreateInvoice(planCode) {
    const mount = document.getElementById('invoiceActiveMount');
    if (!mount) return;
    mount.innerHTML = `<div class="pillar-summary">Membuat invoice unik di D1...</div>`;
    const res = await api.createBillingInvoice(planCode);
    if (!res.ok) {
      mount.innerHTML = `<div class="warn-banner">${res.error || 'Silakan login dengan Google terlebih dahulu untuk membuat invoice VIP.'}</div>`;
      return;
    }
    const inv = res.invoice;
    mount.innerHTML = `
      <div class="fund-card" style="margin-top:6px;">
        <div class="fund-card-title">INVOICE AKTIF #${inv.invoiceId}</div>
        <div class="fund-row"><span class="fund-row-label">Nominal Tepat Wajib Dikirim</span><span class="fund-row-val text-bull">${inv.expectedAmountUsdt} USDT (BEP-20)</span></div>
        <div class="fund-row"><span class="fund-row-label">Dompet Tujuan (BSC)</span><span class="fund-row-val" style="font-size:11px;">${inv.recipientWallet || OWNER_BSC_WALLET}</span></div>
        <div style="margin-top:8px;display:flex;gap:6px;">
          <input id="inpBscTxHash" type="text" placeholder="Tempel TxHash BSC (0x...)" class="chamfer-input" style="flex:1;" />
          <button id="btnVerifyTxHash" type="button" class="btn-chamfer btn-primary btn-sm">Verifikasi On-Chain</button>
        </div>
        <div id="txVerifyStatus" style="margin-top:6px;"></div>
      </div>
    `;
  }
}