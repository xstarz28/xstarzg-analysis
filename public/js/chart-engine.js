import { computeAllIndicators } from './shared/quant-core.js';
const BINANCE_TF_MAP = {
  M1: '1m',
  M5: '5m',
  M15: '15m',
  M30: '30m',
  H1: '1h',
  H4: '4h',
  D1: '1d',
  W1: '1w',
  MN: '1M',
  '1Y': '1M'
};
const BYBIT_TF_MAP = {
  M1: '1',
  M5: '5',
  M15: '15',
  M30: '30',
  H1: '60',
  H4: '240',
  D1: 'D',
  W1: 'W',
  MN: 'M',
  '1Y': 'M'
};
export class ChartEngine {
  constructor({ mainContainerId, oscContainerId, vpvrContainerId, onRealtimeTick, onStatusChange }) {
    this.mainContainer = document.getElementById(mainContainerId);
    this.oscContainer = document.getElementById(oscContainerId);
    this.vpvrContainer = document.getElementById(vpvrContainerId);
    this.onRealtimeTick = onRealtimeTick;
    this.onStatusChange = onStatusChange;
    this.mainChart = null;
    this.oscChart = null;
    this.candleSeries = null;
    this.ema20Series = null;
    this.ema50Series = null;
    this.ema200Series = null;
    this.bbUpperSeries = null;
    this.bbLowerSeries = null;
    this.vwapSeries = null;
    this.oscSeries = null;
    this.oscSecondarySeries = null;
    this.smcPriceLines = [];
    this.overlays = { ema: true, bb: true, vwap: true, smc: true, vpvr: true };
    this.activeOscillator = 'delta';
    this.bars = [];
    this.latestIndicators = null;
    this.ws = null;
    this.wsFallbackTimer = null;
    this.worker = null;
    this.reqCounter = 0;
  }
  init() {
    if (!window.LightweightCharts || !this.mainContainer || !this.oscContainer) {
      console.error('LightweightCharts atau container tidak ditemukan.');
      return;
    }
    const LWC = window.LightweightCharts;
    const commonOptions = {
      layout: {
        background: { type: 'solid', color: '#11161d' },
        textColor: '#8395a7',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11
      },
      grid: {
        vertLines: { color: 'rgba(49, 61, 75, 0.35)' },
        horzLines: { color: 'rgba(49, 61, 75, 0.35)' }
      },
      crosshair: { mode: LWC.CrosshairMode.Normal },
      rightPriceScale: { borderColor: '#313d4b' },
      timeScale: { borderColor: '#313d4b', timeVisible: true, secondsVisible: false }
    };
    this.mainChart = LWC.createChart(this.mainContainer, {
      ...commonOptions,
      width: this.mainContainer.clientWidth,
      height: this.mainContainer.clientHeight || 410
    });
    this.oscChart = LWC.createChart(this.oscContainer, {
      ...commonOptions,
      width: this.oscContainer.clientWidth,
      height: this.oscContainer.clientHeight || 135
    });
    this.candleSeries = this.mainChart.addCandlestickSeries({
      upColor: '#4db6a3',
      downColor: '#e0675f',
      borderUpColor: '#4db6a3',
      borderDownColor: '#e0675f',
      wickUpColor: '#4db6a3',
      wickDownColor: '#e0675f'
    });
    this.ema20Series = this.mainChart.addLineSeries({ color: '#dce8f7', lineWidth: 1, priceLineVisible: false });
    this.ema50Series = this.mainChart.addLineSeries({ color: '#6889ad', lineWidth: 1, priceLineVisible: false });
    this.ema200Series = this.mainChart.addLineSeries({ color: '#e5b567', lineWidth: 2, priceLineVisible: false });
    this.bbUpperSeries = this.mainChart.addLineSeries({
      color: 'rgba(104, 137, 173, 0.45)',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false
    });
    this.bbLowerSeries = this.mainChart.addLineSeries({
      color: 'rgba(104, 137, 173, 0.45)',
      lineWidth: 1,
      lineStyle: 2,
      priceLineVisible: false
    });
    this.vwapSeries = this.mainChart.addLineSeries({
      color: '#c084fc',
      lineWidth: 1,
      lineStyle: 1,
      priceLineVisible: false
    });
    this.oscSeries = this.oscChart.addHistogramSeries({
      color: '#4db6a3',
      priceLineVisible: false
    });
    this.oscSecondarySeries = this.oscChart.addLineSeries({
      color: '#e5b567',
      lineWidth: 1,
      priceLineVisible: false
    });
    this.mainChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (range) this.oscChart.timeScale().setVisibleLogicalRange(range);
    });
    window.addEventListener('resize', () => {
      if (this.mainChart && this.mainContainer) {
        this.mainChart.applyOptions({ width: this.mainContainer.clientWidth });
      }
      if (this.oscChart && this.oscContainer) {
        this.oscChart.applyOptions({ width: this.oscContainer.clientWidth });
      }
    });
    try {
      this.worker = new Worker('/js/chart-worker.js', { type: 'module' });
      this.worker.onmessage = (e) => {
        const msg = e.data;
        if (msg && msg.ok && msg.indicators) {
          this.latestIndicators = msg.indicators;
          this.applyIndicatorsToChart(msg.indicators);
        }
      };
    } catch (_) {
      this.worker = null;
    }
  }
  setCandles(bars) {
    if (!Array.isArray(bars) || bars.length === 0) return null;
    this.bars = bars;
    if (this.candleSeries) {
      this.candleSeries.setData(bars);
      this.mainChart.timeScale().fitContent();
    }
    const indicators = computeAllIndicators(bars);
    this.latestIndicators = indicators;
    this.applyIndicatorsToChart(indicators);
    if (this.worker) {
      this.reqCounter += 1;
      this.worker.postMessage({
        type: 'COMPUTE_INDICATORS',
        reqId: this.reqCounter,
        payload: { bars }
      });
    }
    return indicators;
  }
  applyIndicatorsToChart(ind) {
    if (!ind || !this.bars.length) return;
    const mapLine = (arr) => {
      const out = [];
      for (let i = 0; i < this.bars.length; i++) {
        if (arr[i] !== null && arr[i] !== undefined && Number.isFinite(arr[i])) {
          out.push({ time: this.bars[i].time, value: Number(arr[i]) });
        }
      }
      return out;
    };
    if (this.overlays.ema) {
      this.ema20Series.setData(mapLine(ind.series.ema20));
      this.ema50Series.setData(mapLine(ind.series.ema50));
      this.ema200Series.setData(mapLine(ind.series.ema200));
    } else {
      this.ema20Series.setData([]);
      this.ema50Series.setData([]);
      this.ema200Series.setData([]);
    }
    if (this.overlays.bb) {
      this.bbUpperSeries.setData(mapLine(ind.series.bbUpper));
      this.bbLowerSeries.setData(mapLine(ind.series.bbLower));
    } else {
      this.bbUpperSeries.setData([]);
      this.bbLowerSeries.setData([]);
    }
    if (this.overlays.vwap) {
      this.vwapSeries.setData(mapLine(ind.series.vwap));
    } else {
      this.vwapSeries.setData([]);
    }
    this.renderSmcLines(ind.smc);
    this.renderVpvr(ind.vpvr);
    this.renderOscillator(ind);
  }
  renderSmcLines(smc) {
    if (!this.candleSeries) return;
    for (const line of this.smcPriceLines) {
      try {
        this.candleSeries.removePriceLine(line);
      } catch (_) {}
    }
    this.smcPriceLines = [];
    if (!this.overlays.smc || !smc) return;
    if (smc.bullishOB && Number.isFinite(smc.bullishOB.top)) {
      this.smcPriceLines.push(
        this.candleSeries.createPriceLine({
          price: smc.bullishOB.top,
          color: '#4db6a3',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: 'BULL OB'
        })
      );
    }
    if (smc.bearishOB && Number.isFinite(smc.bearishOB.bottom)) {
      this.smcPriceLines.push(
        this.candleSeries.createPriceLine({
          price: smc.bearishOB.bottom,
          color: '#e0675f',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: 'BEAR OB'
        })
      );
    }
  }
  renderVpvr(vpvr) {
    if (!this.vpvrContainer) return;
    if (!this.overlays.vpvr || !vpvr || !Array.isArray(vpvr.bins)) {
      this.vpvrContainer.innerHTML = '';
      return;
    }
    const binsDesc = [...vpvr.bins].reverse();
    this.vpvrContainer.innerHTML = binsDesc
      .map((b) => {
        const isPoc = Math.abs(b.mid - vpvr.poc) <= (vpvr.vah - vpvr.val) * 0.06;
        const widthPct = Math.max(4, Math.min(100, Math.round(b.pctOfMax)));
        return `<div class="vpvr-row"><div class="vpvr-bar ${isPoc ? 'poc' : ''}" style="width:${widthPct}%"></div></div>`;
      })
      .join('');
  }
  renderOscillator(ind) {
    if (!ind || !this.oscSeries) return;
    const key = this.activeOscillator;
    this.oscSeries.setData([]);
    this.oscSecondarySeries.setData([]);
    if (key === 'delta') {
      const hist = [];
      for (let i = 0; i < this.bars.length; i++) {
        const v = ind.series.delta[i];
        if (Number.isFinite(v)) {
          hist.push({
            time: this.bars[i].time,
            value: v,
            color: v >= 0 ? 'rgba(77, 182, 163, 0.75)' : 'rgba(224, 103, 95, 0.75)'
          });
        }
      }
      this.oscSeries.setData(hist);
    } else if (key === 'rsi') {
      const line = [];
      for (let i = 0; i < this.bars.length; i++) {
        const v = ind.series.rsi14[i];
        if (Number.isFinite(v)) line.push({ time: this.bars[i].time, value: v });
      }
      this.oscSecondarySeries.setData(line);
    } else if (key === 'macd') {
      const hist = [];
      const sig = [];
      for (let i = 0; i < this.bars.length; i++) {
        const h = ind.series.macdHist[i];
        const s = ind.series.macdSignal[i];
        if (Number.isFinite(h)) {
          hist.push({
            time: this.bars[i].time,
            value: h,
            color: h >= 0 ? '#4db6a3' : '#e0675f'
          });
        }
        if (Number.isFinite(s)) sig.push({ time: this.bars[i].time, value: s });
      }
      this.oscSeries.setData(hist);
      this.oscSecondarySeries.setData(sig);
    } else if (key === 'stoch') {
      const kLine = [];
      for (let i = 0; i < this.bars.length; i++) {
        const v = ind.series.stochK[i];
        if (Number.isFinite(v)) kLine.push({ time: this.bars[i].time, value: v });
      }
      this.oscSecondarySeries.setData(kLine);
    } else if (key === 'adx') {
      const aLine = [];
      for (let i = 0; i < this.bars.length; i++) {
        const v = ind.series.adx14[i];
        if (Number.isFinite(v)) aLine.push({ time: this.bars[i].time, value: v });
      }
      this.oscSecondarySeries.setData(aLine);
    }
  }
  setOverlayVisibility(overlayKey, isVisible) {
    this.overlays[overlayKey] = Boolean(isVisible);
    if (this.latestIndicators) {
      this.applyIndicatorsToChart(this.latestIndicators);
    }
  }
  setActiveOscillator(oscKey) {
    this.activeOscillator = oscKey;
    if (this.latestIndicators) {
      this.renderOscillator(this.latestIndicators);
    }
  }
  disconnectRealtime() {
    if (this.wsFallbackTimer) {
      clearTimeout(this.wsFallbackTimer);
      this.wsFallbackTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        this.ws.close();
      } catch (_) {}
      this.ws = null;
    }
  }
  connectCryptoRealtime(symbol, timeframe) {
    this.disconnectRealtime();
    const rawSym = String(symbol).replace('/', '').toLowerCase();
    const interval = BINANCE_TF_MAP[timeframe] || '1h';
    const wsUrl = `wss://stream.binance.com:9443/ws/${rawSym}@kline_${interval}`;
    let connected = false;
    try {
      this.ws = new WebSocket(wsUrl);
    } catch (_) {
      this.connectBybitFallback(symbol, timeframe);
      return;
    }
    this.wsFallbackTimer = setTimeout(() => {
      if (!connected) {
        this.connectBybitFallback(symbol, timeframe);
      }
    }, 3500);
    this.ws.onopen = () => {
      connected = true;
      if (this.wsFallbackTimer) clearTimeout(this.wsFallbackTimer);
      if (this.onStatusChange) {
        this.onStatusChange({ status: 'REALTIME WS', exchange: 'BINANCE REALTIME' });
      }
    };
    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (!data || !data.k) return;
        const k = data.k;
        const bar = {
          time: Math.floor(Number(k.t) / 1000),
          open: Number(k.o),
          high: Number(k.h),
          low: Number(k.l),
          close: Number(k.c),
          volume: Number(k.v)
        };
        this.updateRealtimeBar(bar);
      } catch (_) {}
    };
    this.ws.onerror = () => {
      if (!connected) this.connectBybitFallback(symbol, timeframe);
    };
  }
  connectBybitFallback(symbol, timeframe) {
    this.disconnectRealtime();
    const rawSym = String(symbol).replace('/', '').toUpperCase();
    const interval = BYBIT_TF_MAP[timeframe] || '60';
    try {
      this.ws = new WebSocket('wss://stream.bybit.com/v5/public/linear');
      this.ws.onopen = () => {
        this.ws.send(JSON.stringify({ op: 'subscribe', args: [`kline.${interval}.${rawSym}`] }));
        if (this.onStatusChange) {
          this.onStatusChange({ status: 'REALTIME WS', exchange: 'BYBIT V5 REALTIME' });
        }
      };
      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (!msg.data || !msg.data[0]) return;
          const k = msg.data[0];
          const bar = {
            time: Math.floor(Number(k.start) / 1000),
            open: Number(k.open),
            high: Number(k.high),
            low: Number(k.low),
            close: Number(k.close),
            volume: Number(k.volume)
          };
          this.updateRealtimeBar(bar);
        } catch (_) {}
      };
    } catch (_) {}
  }
  updateRealtimeBar(bar) {
    if (!bar || !Number.isFinite(bar.close)) return;
    if (this.candleSeries) {
      this.candleSeries.update(bar);
    }
    if (this.bars.length > 0) {
      const last = this.bars[this.bars.length - 1];
      if (last.time === bar.time) {
        this.bars[this.bars.length - 1] = bar;
      } else if (bar.time > last.time) {
        this.bars.push(bar);
      }
    }
    if (this.onRealtimeTick) {
      this.onRealtimeTick(bar);
    }
  }
}