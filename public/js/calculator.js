import { formatNumber } from '../i18n/index.js';
export class PositionCalculator {
  constructor() {
    this.marketPrice = 0;
    this.atr = 0;
    this.symbol = 'BTC/USDT';
    this.mode = 'trader';
  }
  init() {
    this.elBalance = document.getElementById('calcBalance');
    this.elRiskPct = document.getElementById('calcRiskPct');
    this.elEntry = document.getElementById('calcEntryPrice');
    this.elStop = document.getElementById('calcStopLoss');
    this.elLeverage = document.getElementById('calcLeverage');
    this.elAtrBadge = document.getElementById('calcAtrBadge');
    this.btnUseAtr = document.getElementById('btnCalcUseAtr');
    this.elResUnits = document.getElementById('resPosSizeUnits');
    this.elResNotional = document.getElementById('resPosNotional');
    this.elResMaxLoss = document.getElementById('resMaxLossUsd');
    this.elResMargin = document.getElementById('resReqMargin');
    this.elResEffLev = document.getElementById('resEffectiveLev');
    this.elResLiq = document.getElementById('resLiqPrice');
    const inputs = [this.elBalance, this.elRiskPct, this.elEntry, this.elStop, this.elLeverage];
    inputs.forEach((inp) => {
      if (inp) inp.addEventListener('input', () => this.recalculate());
    });
    if (this.btnUseAtr) {
      this.btnUseAtr.addEventListener('click', () => {
        const entry = Number(this.elEntry?.value) || this.marketPrice;
        if (entry > 0 && this.atr > 0) {
          this.elEntry.value = this.formatPriceInput(entry);
          this.elStop.value = this.formatPriceInput(Math.max(entry * 0.1, entry - 2 * this.atr));
          this.recalculate();
        }
      });
    }
  }
  formatPriceInput(val) {
    if (!Number.isFinite(val)) return '';
    if (val >= 100) return val.toFixed(2);
    if (val >= 1) return val.toFixed(4);
    return val.toFixed(6);
  }
  updateMarketContext({ price, atr, symbol, mode }) {
    if (Number.isFinite(price) && price > 0) this.marketPrice = price;
    if (Number.isFinite(atr) && atr > 0) this.atr = atr;
    if (symbol) this.symbol = symbol;
    if (mode) this.mode = mode;
    if (this.elAtrBadge) {
      this.elAtrBadge.textContent = `ATR(14): ${this.atr > 0 ? this.formatPriceInput(this.atr) : '--'}`;
    }
    if (this.mode === 'investor' && this.elLeverage && Number(this.elLeverage.value) > 1) {
      this.elLeverage.value = '1';
    }
    if (this.elEntry && (!this.elEntry.value || this.elEntry.dataset.symbol !== this.symbol)) {
      if (this.marketPrice > 0) {
        this.elEntry.value = this.formatPriceInput(this.marketPrice);
        this.elEntry.dataset.symbol = this.symbol;
        const stopDist = this.atr > 0 ? 2 * this.atr : this.marketPrice * 0.02;
        if (this.elStop) {
          this.elStop.value = this.formatPriceInput(Math.max(this.marketPrice * 0.1, this.marketPrice - stopDist));
        }
      }
    }
    this.recalculate();
  }
  setLevelsFromSignal(levels) {
    if (!levels) return;
    if (this.elEntry && Number.isFinite(levels.entry)) {
      this.elEntry.value = this.formatPriceInput(levels.entry);
      this.elEntry.dataset.symbol = this.symbol;
    }
    if (this.elStop && Number.isFinite(levels.stopLoss)) {
      this.elStop.value = this.formatPriceInput(levels.stopLoss);
    }
    this.recalculate();
  }
  recalculate() {
    const balance = Math.max(0, Number(this.elBalance?.value || 0));
    const riskPct = Math.max(0.05, Math.min(100, Number(this.elRiskPct?.value || 1)));
    const entry = Number(this.elEntry?.value || 0);
    const stop = Number(this.elStop?.value || 0);
    const leverage = Math.max(1, Math.min(100, Number(this.elLeverage?.value || 1)));
    const stopDistance = Math.abs(entry - stop);
    if (balance <= 0 || entry <= 0 || stop <= 0 || stopDistance <= 0) {
      if (this.elResUnits) this.elResUnits.textContent = '--';
      if (this.elResNotional) this.elResNotional.textContent = '--';
      if (this.elResMaxLoss) this.elResMaxLoss.textContent = '--';
      if (this.elResMargin) this.elResMargin.textContent = '--';
      if (this.elResEffLev) this.elResEffLev.textContent = '--';
      if (this.elResLiq) this.elResLiq.textContent = '--';
      return;
    }
    const maxLossUsd = balance * (riskPct / 100);
    const units = maxLossUsd / stopDistance;
    const notionalUsd = units * entry;
    const reqMargin = notionalUsd / leverage;
    const effectiveLev = notionalUsd / balance;
    const isLong = entry >= stop;
    let liqPrice = null;
    if (leverage > 1) {
      const mmr = 0.005;
      liqPrice = isLong
        ? entry * (1 - 1 / leverage + mmr)
        : entry * (1 + 1 / leverage - mmr);
    }
    if (this.elResUnits) this.elResUnits.textContent = formatNumber(units, 4);
    if (this.elResNotional) this.elResNotional.textContent = `$${formatNumber(notionalUsd, 2)}`;
    if (this.elResMaxLoss) this.elResMaxLoss.textContent = `-$${formatNumber(maxLossUsd, 2)} (${riskPct}%)`;
    if (this.elResMargin) this.elResMargin.textContent = `$${formatNumber(reqMargin, 2)}`;
    if (this.elResEffLev) this.elResEffLev.textContent = `${formatNumber(effectiveLev, 2)}x`;
    if (this.elResLiq) {
      this.elResLiq.textContent = liqPrice && liqPrice > 0 ? this.formatPriceInput(liqPrice) : (window.__xsT ? window.__xsT('ui.calcLiqSpot', 'SPOT (Tanpa Likuidasi)') : 'SPOT (Tanpa Likuidasi)');
    }
  }
}