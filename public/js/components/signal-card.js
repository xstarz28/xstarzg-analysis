import { t, formatNumber } from '../../i18n/index.js';
export class SignalCard {
  constructor({ containerId, statusPillId, onApplyLevels }) {
    this.container = document.getElementById(containerId);
    this.statusPill = document.getElementById(statusPillId);
    this.onApplyLevels = onApplyLevels;
    this.lastPayload = null;
  }
  renderIdle() {
    if (!this.container) return;
    if (this.statusPill) this.statusPill.textContent = 'IDLE';
    this.container.innerHTML = `
      <div class="sig-metric-box">
        <span class="sig-metric-title">${t('signal.idleTitle', 'Mesin Keputusan Kuantitatif Siap')}</span>
        <p class="pillar-summary" style="margin-top:4px;">
          ${t('signal.idleDesc', 'Klik tombol "Analisis Penuh" atau pilih instrumen untuk menjalankan evaluasi 5-Pilar Konfluensi beserta simulasi Walk-Forward Backtest tanpa Look-Ahead Bias.')}
        </p>
      </div>
    `;
  }
  renderLoading(symbol, timeframe) {
    if (!this.container) return;
    if (this.statusPill) this.statusPill.textContent = 'COMPUTING...';
    this.container.innerHTML = `
      <div class="sig-metric-box">
        <span class="sig-metric-title">Memproses Walk-Forward Backtest...</span>
        <p class="pillar-summary">${symbol} • Timeframe ${timeframe}</p>
      </div>
    `;
  }
  renderError(message) {
    if (!this.container) return;
    if (this.statusPill) this.statusPill.textContent = 'ERROR';
    this.container.innerHTML = `
      <div class="warn-banner">
        <strong>Gagal Memuat Analisis:</strong> ${message}
      </div>
    `;
  }
  fmtPrice(p) {
    if (!Number.isFinite(p)) return '--';
    if (p >= 100) return formatNumber(p, 2);
    if (p >= 1) return formatNumber(p, 4);
    return formatNumber(p, 6);
  }
  renderAnalysis(payload) {
    if (!this.container || !payload) return;
    this.lastPayload = payload;
    const signal = payload.signal || payload;
    const bt = payload.backtest || signal.backtest || {};
    const levels = signal.levels || {};
    const pillars = signal.pillars || [];
    const computeMs = payload.computeMs ?? signal.computeMs ?? 0;
    if (this.statusPill) {
      this.statusPill.textContent = `${computeMs ? Number(computeMs).toFixed(1) + 'ms' : 'READY'}`;
    }
    const dir = signal.direction || 'NEUTRAL';
    const isBull = dir === 'LONG';
    const isBear = dir === 'SHORT';
    const heroClass = isBull ? 'bull' : isBear ? 'bear' : 'neutral';
    const dirSymbol = isBull ? '▲ LONG / BUY' : isBear ? '▼ SHORT / SELL' : '◆ WAIT / NO TRADE';
    const spotNoticeHtml = signal.spotLongOnlyNotice
      ? `<div class="warn-banner">🛡️ <strong>Mode Spot Investor (Long-Only):</strong> Setup teknikal saat ini cenderung Bearish. Sinyal otomatis dikonversi menjadi <strong>WAIT / PERTAHANKAN KAS</strong> (Tidak ada rekomendasi Short).</div>`
      : '';
    const weakEvidenceHtml = bt.disabled
      ? `<div class="warn-banner">ℹ️ <strong>Backtest Dinonaktifkan pada Timeframe Makro (${payload.timeframe || 'MN/1Y'}):</strong> Jumlah bar siklus historis tidak mencukupi untuk sampel statistik minimal N ≥ 30.</div>`
      : bt.weakEvidence
      ? `<div class="warn-banner">⚠️ <strong>Bukti Statistik Lemah (Weak Evidence):</strong> Ukuran sampel historis N = ${bt.sampleSize || 0} (di bawah ambang institusional N ≥ 30) atau Expectancy ≤ 0R setelah dipotong fee & slippage. Gunakan ekstra hati-hati.</div>`
      : '';
    const pillarsHtml = pillars
      .map(
        (p) => `
        <div class="pillar-item">
          <div class="pillar-top">
            <span>${p.name} (${p.weight}%)</span>
            <span class="${p.score >= 60 ? 'text-bull' : p.score <= 40 ? 'text-bear' : 'text-warn'}">${formatNumber(p.score, 1)} / 100</span>
          </div>
          <div class="pillar-bar-track">
            <div class="pillar-bar-fill" style="width:${Math.max(4, Math.min(100, p.score))}%"></div>
          </div>
          <div class="pillar-summary">${p.summary || ''}</div>
        </div>
      `
      )
      .join('');
    this.container.innerHTML = `
      ${spotNoticeHtml}
      <div class="sig-hero ${heroClass}">
        <div>
          <span class="sig-metric-title">${t('signal.actionRecommendation', 'KEPUTUSAN KUANTITATIF')}</span>
          <div class="sig-action ${heroClass}">${dirSymbol}</div>
        </div>
        <div style="text-align:right;">
          <span class="sig-metric-title">${t('signal.regimeLabel', 'MARKET REGIME')}</span>
          <span style="font-family:var(--font-mono);font-weight:700;font-size:12px;">${signal.regime || 'BALANCED'}</span>
        </div>
      </div>
      <!-- EXPLICIT SEPARATION: CONFLUENCE SCORE vs HISTORICAL BACKTEST WIN RATE -->
      <div class="sig-dual-metrics">
        <div class="sig-metric-box">
          <span class="sig-metric-title">${t('signal.confluenceScoreLabel', 'SKOR KONFLUENSI SAAT INI')}</span>
          <div class="sig-metric-val">${formatNumber(signal.confluenceScore || 50, 1)}<span style="font-size:11px;color:var(--text-muted);"> / 100</span></div>
          <span class="sig-metric-note">${t('signal.confluenceNote', 'Keselarasan 5-Pilar saat ini (Bukan probabilitas menang)')}</span>
        </div>
        <div class="sig-metric-box">
          <span class="sig-metric-title">${t('signal.backtestWinRateLabel', 'WIN RATE BACKTEST HISTORIS')}</span>
          <div class="sig-metric-val ${bt.expectancyR > 0 ? 'text-bull' : 'text-warn'}">
            ${bt.disabled ? 'N/A' : formatNumber(bt.winRatePct || 0, 1) + '%'}
          </div>
          <span class="sig-metric-note">
            ${bt.disabled ? 'Timeframe Makro' : `Expectancy: ${bt.expectancyR >= 0 ? '+' : ''}${formatNumber(bt.expectancyR || 0, 2)}R (N=${bt.sampleSize || 0})`}
          </span>
        </div>
      </div>
      <!-- EXECUTION LEVELS -->
      <div class="bt-box">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
          <span class="sig-metric-title" style="font-weight:700;color:var(--text-ice);">${t('signal.executionLevels', 'LEVEL EKSEKUSI & MANAJEMEN RISIKO (ATR)')}</span>
          <button id="btnApplySignalToCalc" type="button" class="btn-link-xs">${t('signal.sendToCalc', 'Salin ke Kalkulator →')}</button>
        </div>
        <div class="levels-grid">
          <div class="level-cell">
            <span class="level-label">Entry</span>
            <span class="level-val">${this.fmtPrice(levels.entry)}</span>
          </div>
          <div class="level-cell">
            <span class="level-label">Stop Loss (1R)</span>
            <span class="level-val text-bear">${this.fmtPrice(levels.stopLoss)}</span>
          </div>
          <div class="level-cell">
            <span class="level-label">Take Profit 1 (1.5R)</span>
            <span class="level-val text-bull">${this.fmtPrice(levels.tp1)}</span>
          </div>
          <div class="level-cell">
            <span class="level-label">Take Profit 2 (2.5R)</span>
            <span class="level-val text-bull">${this.fmtPrice(levels.tp2)}</span>
          </div>
          <div class="level-cell">
            <span class="level-label">Take Profit 3 (4.0R)</span>
            <span class="level-val text-bull">${this.fmtPrice(levels.tp3)}</span>
          </div>
          <div class="level-cell">
            <span class="level-label">R:R Target Utama</span>
            <span class="level-val">1 : ${formatNumber(levels.riskRewardTp2 || 2.5, 1)}</span>
          </div>
        </div>
      </div>
      <!-- 5-PILLAR BREAKDOWN -->
      <div>
        <span class="sig-metric-title" style="margin-bottom:6px;font-weight:700;color:var(--text-ice);">${t('signal.pillarsHeading', 'RINCIAN SKOR 5-PILAR KONFLUENSI')}</span>
        <div class="pillar-list">
          ${pillarsHtml}
        </div>
      </div>
      <!-- WALK-FORWARD BACKTEST AUDIT -->
      <div class="bt-box">
        <span class="sig-metric-title" style="font-weight:700;color:var(--text-ice);">${t('signal.backtestHeading', 'AUDIT WALK-FORWARD BACKTEST (NET OF FEES & SLIPPAGE)')}</span>
        ${weakEvidenceHtml}
        <div class="bt-grid">
          <div class="bt-stat">
            <span class="bt-stat-label">Sampel Trade (N)</span>
            <span class="bt-stat-val">${bt.disabled ? 'N/A' : bt.sampleSize || 0}</span>
          </div>
          <div class="bt-stat">
            <span class="bt-stat-label">Net Expectancy</span>
            <span class="bt-stat-val ${bt.expectancyR > 0 ? 'text-bull' : 'text-bear'}">${bt.disabled ? 'N/A' : (bt.expectancyR >= 0 ? '+' : '') + formatNumber(bt.expectancyR || 0, 2) + 'R'}</span>
          </div>
          <div class="bt-stat">
            <span class="bt-stat-label">Profit Factor</span>
            <span class="bt-stat-val">${bt.disabled ? 'N/A' : formatNumber(bt.profitFactor || 0, 2)}</span>
          </div>
          <div class="bt-stat">
            <span class="bt-stat-label">Max Drawdown</span>
            <span class="bt-stat-val text-bear">${bt.disabled ? 'N/A' : '-' + formatNumber(bt.maxDrawdownR || 0, 2) + 'R'}</span>
          </div>
          <div class="bt-stat">
            <span class="bt-stat-label">Penalti Fee+Slip</span>
            <span class="bt-stat-val">${bt.disabled ? 'N/A' : '-' + formatNumber(bt.avgFeePenaltyR || 0.08, 3) + 'R/tx'}</span>
          </div>
          <div class="bt-stat">
            <span class="bt-stat-label">Aturan Candle Sama</span>
            <span class="bt-stat-val">SL Konservatif</span>
          </div>
        </div>
      </div>
      <!-- LAYER-2 SIGNAL CARD RISK DISCLAIMER -->
      <div class="sig-disclaimer-mini" data-i18n="disclaimer.signalCardNote">
        ⚠️ Bukan Saran Keuangan: Level Entry/SL/TP dihitung secara algoritmik dari volatilitas ATR(14) dan struktur historis. Selalu gunakan manajemen risiko mandiri.
      </div>
    `;
    const btnApply = document.getElementById('btnApplySignalToCalc');
    if (btnApply && this.onApplyLevels) {
      btnApply.addEventListener('click', () => this.onApplyLevels(levels));
    }
  }
}