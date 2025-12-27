/**
 * WHALE WATCHER - Advanced Trading UI
 * With candlestick charts and technical indicators
 */

const socket = io();
const WHALE_THRESHOLD = 500000;

// Chart instances
let candleChart = null;
let volumeChart = null;
let candleSeries = null;
let volumeSeries = null;

// Data storage
let candleData = [];
let volumeData = [];
let allTrades = [];
let priceHistory = [];
let previousPrice = 0;
let currentInterval = 1; // in minutes

// ============================================
// INITIALIZE CHARTS
// ============================================

function initializeCharts() {
  const candleContainer = document.getElementById('candleChart');
  const volumeContainer = document.getElementById('volumeChart');
  
  // Candlestick Chart
  candleChart = LightweightCharts.createChart(candleContainer, {
    layout: {
      textColor: '#a0a8c0',
      background: { color: '#1a1f3a' }
    },
    width: candleContainer.clientWidth,
    height: 500,
    timeScale: {
      timeVisible: true,
      secondsVisible: false,
      fixLeftEdge: false,
      barSpacing: 3,     // thinner candles (2–4 is a good range)
      minBarSpacing: 1,
      shiftVisibleRangeOnNewBar: true,
    },
    rightPriceScale: {
      autoScale: true
    }
  });

  candleSeries = candleChart.addCandlestickSeries({
    upColor: '#00a86b',
    downColor: '#ff4444',
    borderDownColor: '#ff4444',
    borderUpColor: '#00a86b',
    wickDownColor: '#ff4444',
    wickUpColor: '#00a86b'
  });

  // Add SMAs
  const sma20Series = candleChart.addLineSeries({
    color: '#3b82f6',
    title: 'SMA (20)',
    visible: true
  });
  sma20Series.setData([]);

  const ema12Series = candleChart.addLineSeries({
    color: '#f59e0b',
    title: 'EMA (12)',
    visible: true
  });
  ema12Series.setData([]);

  // Volume Chart
  volumeChart = LightweightCharts.createChart(volumeContainer, {
    layout: {
      textColor: '#a0a8c0',
      background: { color: '#1a1f3a' }
    },
    width: volumeContainer.clientWidth,
    height: 150,
    timeScale: {
      timeVisible: true,
      barSpacing: 3,
      minBarSpacing: 1
    },
    rightPriceScale: {
      autoScale: true
    }
  });

  volumeSeries = volumeChart.addHistogramSeries({
    color: '#f7931a',
    title: 'Volume'
  });

  // Initial zoom – do NOT call fitContent() (it makes single candles huge)
  candleChart.timeScale().applyOptions({
    barSpacing: 3,
    minBarSpacing: 1,
  });
  volumeChart.timeScale().applyOptions({
    barSpacing: 3,
    minBarSpacing: 1,
  });

  // Store for later access
  window.chartInstance = {
    candleChart,
    candleSeries,
    volumeChart,
    volumeSeries,
    sma20Series,
    ema12Series
  };
}

// ============================================
// CALCULATE TECHNICAL INDICATORS
// ============================================

function calculateSMA(prices, period) {
  if (prices.length < period) return null;
  const sum = prices.slice(-period).reduce((a, b) => a + b, 0);
  return sum / period;
}

function calculateEMA(prices, period) {
  if (prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices.slice(-period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) return 50;
  
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff > 0) gains += diff;
    else losses -= diff;
  }
  
  const avgGain = gains / period;
  const avgLoss = losses / period;
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

// ============================================
// BUILD CANDLESTICK DATA
// ============================================

function buildCandleData() {
  if (allTrades.length === 0) return;

  const intervalMs = currentInterval * 60 * 1000;
  const buckets = new Map();

  // Group trades by interval
  allTrades.forEach(trade => {
    const bucketTime = Math.floor(trade.timestamp / intervalMs) * intervalMs;
    const key = bucketTime;

    if (!buckets.has(key)) {
      buckets.set(key, {
        time: Math.floor(bucketTime / 1000),
        open: trade.price,
        high: trade.price,
        low: trade.price,
        close: trade.price,
        volume: trade.quantity
      });
    } else {
      const candle = buckets.get(key);
      candle.high = Math.max(candle.high, trade.price);
      candle.low = Math.min(candle.low, trade.price);
      candle.close = trade.price;
      candle.volume += trade.quantity;
    }
  });

  candleData = Array.from(buckets.values()).sort((a, b) => a.time - b.time);
  priceHistory = candleData.map(c => c.close);

  // Update charts
  candleSeries.setData(candleData);
  volumeSeries.setData(candleData.map(c => ({
    time: c.time,
    value: c.volume,
    color: c.close > c.open ? '#00a86b' : '#ff4444'
  })));

  // Update SMAs
  const sma20Data = [];
  const ema12Data = [];
  
  candleData.forEach((candle, idx) => {
    const prices = priceHistory.slice(0, idx + 1);
    const sma = calculateSMA(prices, 20);
    const ema = calculateEMA(prices, 12);
    
    if (sma) sma20Data.push({ time: candle.time, value: sma });
    if (ema) ema12Data.push({ time: candle.time, value: ema });
  });

  window.chartInstance.sma20Series.setData(sma20Data);
  window.chartInstance.ema12Series.setData(ema12Data);

  // Calculate RSI
  const rsi = calculateRSI(priceHistory);
  document.getElementById('rsiValue').textContent = rsi.toFixed(2);

  // Keep candles thin: show last N bars instead of fitting whole content
  const ts = candleChart.timeScale();
  const last = candleData[candleData.length - 1]?.time;
  const visibleBars = 80; // adjust: more = tighter/thinner visual

  if (last) {
    ts.setVisibleRange({
      from: last - visibleBars * currentInterval * 60,
      to: last,
    });
  }

  // Match volume chart range
  const vts = volumeChart.timeScale();
  if (last) {
    vts.setVisibleRange({
      from: last - visibleBars * currentInterval * 60,
      to: last,
    });
  }
}

// ============================================
// UPDATE TRADE HISTORY TABLE
// ============================================

function updateHistoryTable() {
  const tbody = document.getElementById('historyBody');
  const filter = document.getElementById('historyFilter').value;

  let trades = [...allTrades].reverse().slice(0, 50);

  if (filter === 'whale') {
    trades = trades.filter(t => t.isWhale);
  } else if (filter === 'large') {
    trades = trades.filter(t => t.tradeValue > 100000);
  }

  if (trades.length === 0) {
    tbody.innerHTML = '<tr class="empty"><td colspan="4">No trades</td></tr>';
    return;
  }

  tbody.innerHTML = trades.map(trade => `
    <tr class="${trade.isWhale ? 'whale-row' : ''}">
      <td class="time">${new Date(trade.timestamp).toLocaleTimeString()}</td>
      <td class="amount">${parseFloat(trade.quantity).toFixed(4)}</td>
      <td class="price">$${parseFloat(trade.price).toLocaleString('en-US', { maximumFractionDigits: 2 })}</td>
      <td class="value">$${parseFloat(trade.tradeValue).toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
    </tr>
  `).join('');
}

// ============================================
// SOCKET.IO EVENT LISTENERS
// ============================================

socket.on('connection_status', () => {
  updateConnectionStatus('connected');
});

socket.on('trade_update', (tradeData) => {
  const trade = {
    timestamp: new Date(tradeData.timestamp).getTime(),
    price: parseFloat(tradeData.price),
    quantity: parseFloat(tradeData.quantity),
    tradeValue: parseFloat(tradeData.tradeValue),
    isWhale: tradeData.isWhale
  };

  allTrades.push(trade);
  updatePriceTicker(trade.price);
  buildCandleData();
  updateHistoryTable();
});

socket.on('whale_alert', (whaleData) => {
  showWhaleAlert(whaleData);
  playAlert();
});

socket.on('metrics_update', (metrics) => {
  document.getElementById('whaleCount').textContent = metrics.whaleCount;
  document.getElementById('maxWhale').textContent = 
    '$' + parseFloat(metrics.maxWhaleAmount).toLocaleString('en-US', { maximumFractionDigits: 0 });
  
  // Calculate whale pressure
  const pressure = metrics.whaleCount > 3 ? 'High' : metrics.whaleCount > 0 ? 'Medium' : 'Low';
  const element = document.getElementById('whalePressure');
  element.textContent = pressure;
  element.className = 'indicator-value whale-pressure ' + pressure.toLowerCase();
});

socket.on('disconnect', () => {
  updateConnectionStatus('disconnected');
});

// ============================================
// UI UPDATES
// ============================================

function updateConnectionStatus(status) {
  const element = document.getElementById('connectionStatus');
  const dot = element.querySelector('.status-dot');
  
  if (status === 'connected') {
    dot.style.backgroundColor = '#00a86b';
    dot.classList.add('pulse');
    element.querySelector('span:last-child').textContent = 'Connected';
  } else {
    dot.style.backgroundColor = '#ff4444';
    dot.classList.remove('pulse');
    element.querySelector('span:last-child').textContent = 'Disconnected';
  }
}

function updatePriceTicker(price) {
  const element = document.getElementById('tickerPrice');
  element.textContent = '$' + price.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });

  if (previousPrice > 0) {
    const change = ((price - previousPrice) / previousPrice) * 100;
    const changeElement = document.getElementById('tickerChange');
    changeElement.textContent = (change > 0 ? '+' : '') + change.toFixed(2) + '%';
    changeElement.style.color = change > 0 ? '#00a86b' : '#ff4444';
  }
  previousPrice = price;
}

function showWhaleAlert(whaleData) {
  const modal = document.getElementById('whaleAlertModal');
  
  document.getElementById('modalAmount').textContent = 
    parseFloat(whaleData.quantity).toFixed(4);
  document.getElementById('modalPrice').textContent = 
    parseFloat(whaleData.price).toLocaleString('en-US', { maximumFractionDigits: 2 });
  document.getElementById('modalValue').textContent = 
    parseFloat(whaleData.tradeValue).toLocaleString('en-US', { maximumFractionDigits: 0 });
  document.getElementById('modalTime').textContent = 
    new Date(whaleData.timestamp).toLocaleTimeString();

  modal.classList.add('show');
  
  // Add to alerts panel
  const alertsContainer = document.getElementById('alertsContainer');
  if (alertsContainer.querySelector('.empty-state')) {
    alertsContainer.innerHTML = '';
  }

  const alertItem = document.createElement('div');
  alertItem.className = 'alert-item';
  alertItem.innerHTML = `
    <div class="alert-time">${new Date(whaleData.timestamp).toLocaleTimeString()}</div>
    <div class="alert-info">
      <strong>${parseFloat(whaleData.quantity).toFixed(4)} BTC</strong>
      <span>$${parseFloat(whaleData.tradeValue).toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
    </div>
  `;
  alertsContainer.insertBefore(alertItem, alertsContainer.firstChild);

  while (alertsContainer.children.length > 10) {
    alertsContainer.removeChild(alertsContainer.lastChild);
  }

  setTimeout(() => {
    modal.classList.remove('show');
  }, 5000);
}

function playAlert() {
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.frequency.value = 1000;
  oscillator.type = 'sine';
  
  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
  
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.5);
}

// ============================================
// EVENT LISTENERS
// ============================================

document.querySelectorAll('.time-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.time-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
    currentInterval = parseInt(this.dataset.interval);
    buildCandleData();
  });
});

document.getElementById('historyFilter').addEventListener('change', updateHistoryTable);

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  initializeCharts();
  updateConnectionStatus('connecting');
  
  // Resize charts on window resize
  window.addEventListener('resize', () => {
    if (candleChart && volumeChart) {
      const candleContainer = document.getElementById('candleChart');
      const volumeContainer = document.getElementById('volumeChart');
      candleChart.applyOptions({
        width: candleContainer.clientWidth
      });
      volumeChart.applyOptions({
        width: volumeContainer.clientWidth
      });
    }
  });
});
