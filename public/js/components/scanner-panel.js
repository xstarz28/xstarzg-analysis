import { t, formatNumber } from '../../i18n/index.js';
export class ScannerPanel {
  constructor({ containerId, onSelectSymbol }) {
    this.container = document.getElementById(containerId);
    this.onSelectSymbol = onSelectSymbol;
    this.activeFilter = 'all';
  }
  renderLoading() {
    if (!this.container) return;
    this.container.innerHTML = `<div class="pillar-summary">Memindai 30 instrumen multi-aset dan mengurutkan konfluensi + expectancy...</div>`;
  }
  renderError(message) {
    if (!this.container) return;
    this.container.innerHTML = `<div class="warn-banner">Gagal memuat pemindai pasar: ${message}</div>`;
  }
  render(data, currentMode = 'trader', onFilterChange = null) {
    if (!this.container || !data) return;
    const items = Array.isArray(data.items) ? data.items : [];
    const rowsHtml = items
      .map((item, idx) => {
        const dir = item.direction || 'NEUTRAL';
        const badgeClass = dir === 'LONG' ? 'text-bull' : dir === 'SHORT' ? 'text-bear' : 'text-warn';
        const dirLabel = dir === 'LONG' ? '▲ LONG' : dir === 'SHORT' ? '▼ SHORT' : '◆ WAIT';
        return `
          <tr>
            <td style="font-family:var(--font-mono);">#${idx + 1}</td>
            <td><strong>${item.symbol}</strong></td>
            <td><span class="mh-exchange-badge">${String(item.assetClass || '').toUpperCase()}</span></td>
            <td class="${badgeClass}" style="font-family:var(--font-mono);font-weight:700;">${dirLabel}</td>
            <td style="font-family:var(--font-mono);font-weight:700;">${formatNumber(item.confluenceScore || 50, 1)} / 100</td>
            <td style="font-family:var(--font-mono);">${formatNumber(item.winRatePct || 0, 1)}% (${item.expectancyR >= 0 ? '+' : ''}${formatNumber(item.expectancyR || 0, 2)}R)</td>
            <td style="font-family:var(--font-mono);">${item.regime || 'BALANCED'}</td>
            <td>
              <button type="button" class="btn-chamfer btn-sm btn-scan-load" data-symbol="${item.symbol}" data-asset="${item.assetClass}">
                Buka Chart →
              </button>
            </td>
          </tr>
        `;
      })
      .join('');
    this.container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
        <div>
          <h3 class="panel-title">${t('scanner.panelTitle', 'PEMINDAI KONFLUENSI MULTI-ASET & PERINGKAT SETUP TERBAIK')}</h3>
          <p class="panel-subtitle">Mode Aktif: <strong>${currentMode === 'investor' ? 'Spot Investor (Long-Only)' : 'Trader (2-Arah)'}</strong></p>
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;">
          ${['all', 'crypto', 'forex', 'metals', 'commodities', 'stocks']
            .map(
              (f) => `
              <button type="button" class="btn-chamfer btn-sm scan-filter-btn ${this.activeFilter === f ? 'btn-primary' : ''}" data-filter="${f}">
                ${f.toUpperCase()}
              </button>
            `
            )
            .join('')}
        </div>
      </div>
      <div class="scanner-table-wrap">
        <table class="scanner-table">
          <thead>
            <tr>
              <th>Rank</th>
              <th>Instrumen</th>
              <th>Kelas Aset</th>
              <th>Sinyal Quant</th>
              <th>Skor Konfluensi</th>
              <th>Win Rate (Expectancy)</th>
              <th>Regime</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="8">Tidak ada setup yang memenuhi filter saat ini.</td></tr>'}
          </tbody>
        </table>
      </div>
    `;
    this.container.querySelectorAll('.btn-scan-load').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (this.onSelectSymbol) {
          this.onSelectSymbol({
            symbol: btn.getAttribute('data-symbol'),
            assetClass: btn.getAttribute('data-asset')
          });
        }
      });
    });
    this.container.querySelectorAll('.scan-filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const nextFilter = btn.getAttribute('data-filter');
        this.activeFilter = nextFilter;
        if (onFilterChange) onFilterChange(nextFilter);
      });
    });
  }
}