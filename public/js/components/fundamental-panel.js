import { formatNumber } from '../../i18n/index.js';
export class FundamentalPanel {
  constructor({ containerId, refreshBtnId, onRefresh }) {
    this.container = document.getElementById(containerId);
    this.refreshBtn = document.getElementById(refreshBtnId);
    if (this.refreshBtn && onRefresh) {
      this.refreshBtn.addEventListener('click', () => onRefresh());
    }
  }
  renderLoading(symbol) {
    if (!this.container) return;
    this.container.innerHTML = `<div class="pillar-summary">Memuat intelijen fundamental & makro untuk <strong>${symbol}</strong>...</div>`;
  }
  renderError(message) {
    if (!this.container) return;
    this.container.innerHTML = `<div class="warn-banner">Gagal memuat data fundamental: ${message}</div>`;
  }
  render(data, secData = null) {
    if (!this.container || !data) return;
    const metrics = data.metrics || {};
    const macro = data.macroContext || {};
    const cardsHtml = [];
    const metricEntries = Object.entries(metrics);
    if (metricEntries.length > 0) {
      const rows = metricEntries
        .map(
          ([k, v]) => `
          <div class="fund-row">
            <span class="fund-row-label">${k}</span>
            <span class="fund-row-val">${typeof v === 'number' ? formatNumber(v, 2) : v}</span>
          </div>
        `
        )
        .join('');
      cardsHtml.push(`
        <div class="fund-card">
          <div class="fund-card-title">Metrik Valuasi & Fundamental Utama (${data.symbol})</div>
          ${rows}
        </div>
      `);
    }
    const macroEntries = Object.entries(macro);
    if (macroEntries.length > 0) {
      const rows = macroEntries
        .map(
          ([k, v]) => `
          <div class="fund-row">
            <span class="fund-row-label">${k}</span>
            <span class="fund-row-val">${v}</span>
          </div>
        `
        )
        .join('');
      cardsHtml.push(`
        <div class="fund-card">
          <div class="fund-card-title">Konteks Makro, Suku Bunga & Posisioning</div>
          ${rows}
        </div>
      `);
    }
    if (secData && secData.ok && secData.facts) {
      const f = secData.facts;
      cardsHtml.push(`
        <div class="fund-card">
          <div class="fund-card-title">Laporan Resmi SEC EDGAR GAAP (CIK: ${secData.cik || 'N/A'})</div>
          <div class="fund-row"><span class="fund-row-label">Pendapatan (Revenue)</span><span class="fund-row-val">${f.revenueFormatted || 'N/A'}</span></div>
          <div class="fund-row"><span class="fund-row-label">Laba Bersih (Net Income)</span><span class="fund-row-val">${f.netIncomeFormatted || 'N/A'}</span></div>
          <div class="fund-row"><span class="fund-row-label">Total Aset</span><span class="fund-row-val">${f.assetsFormatted || 'N/A'}</span></div>
          <div class="fund-row"><span class="fund-row-label">Total Liabilitas</span><span class="fund-row-val">${f.liabilitiesFormatted || 'N/A'}</span></div>
          <div class="fund-row"><span class="fund-row-label">Kas & Setara Kas</span><span class="fund-row-val">${f.cashFormatted || 'N/A'}</span></div>
        </div>
      `);
    }
    if (data.summary) {
      cardsHtml.push(`
        <div class="fund-card">
          <div class="fund-card-title">Ringkasan Eksekutif & Sumber Data</div>
          <p class="pillar-summary" style="line-height:1.5;">${data.summary}</p>
          <div style="margin-top:8px;font-size:10px;color:var(--text-muted);font-family:var(--font-mono);">
            SUMBER: ${data.sourceLabel || 'PUBLIC INSTITUTIONAL FEED'}
          </div>
        </div>
      `);
    }
    this.container.innerHTML = `<div class="fund-grid">${cardsHtml.join('')}</div>`;
  }
}