/**
 * WHALE WATCHER - FRONTEND APPLICATION
 * 
 * Features:
 * - Real-time trade display with Socket.io
 * - Live chart updates with Chart.js
 * - Whale alert animations
 * - CoinGecko Bitcoin metadata
 */

// ============================================
// CONFIGURATION
// ============================================

const CHART_MAX_POINTS = 60; // 60 minutes
const FEED_MAX_ITEMS = 20; // Show last 20 trades
const WHALE_THRESHOLD = 500000; // $500K
let previousPrice = 0;

// ============================================
// SOCKET.IO CONNECTION
// ============================================

const socket = io();

// ============================================
// CHART.JS SETUP
// ============================================

let priceChart = null;

function initializeChart() {
  const ctx = document.getElementById('priceChart').getContext('2d');
  
  priceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        {
          label: 'BTC Price (USD)',
          data: [],
          borderColor: '#f7931a', // Bitcoin orange
          backgroundColor: 'rgba(247, 147, 26, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          yAxisID: 'y',
          pointRadius: 1,
          pointHoverRadius: 4
        },
        {
          label: 'Volume (BTC)',
          data: [],
          borderColor: '#00a86b', // Green
          backgroundColor: 'rgba(0, 168, 107, 0.1)',
          borderWidth: 2,
          fill: true,
          tension: 0.4,
          yAxisID: 'y1',
          pointRadius: 1,
          pointHoverRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: {
        mode: 'index',
        intersect: false
      },
      plugins: {
        legend: {
          display: true,
          labels: {
            color: '#333',
            font: { size: 12 }
          }
        },
        title: {
          display: false
        }
      },
      scales: {
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          title: {
            display: true,
            text: 'Price (USD)',
            color: '#f7931a'
          },
          ticks: {
            callback: function(value) {
              return '$' + value.toLocaleString();
            }
          }
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          title: {
            display: true,
            text: 'Volume (BTC)',
            color: '#00a86b'
          },
          grid: {
            drawOnChartArea: false
          }
        }
      }
    }
  });
}

// ============================================
// FETCH BITCOIN METADATA FROM COINGECKO
// ============================================

async function fetchBitcoinMetadata() {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/coins/bitcoin?localization=false'
    );
    const data = await response.json();
    
    // Display logo
    const logoElement = document.getElementById('btcLogo');
    logoElement.src = data.image.large;
    logoElement.alt = 'Bitcoin Logo';
    
    // Display metadata
    const metadataElement = document.getElementById('btcMetadata');
    metadataElement.innerHTML = `
      <strong>${data.name}</strong> (${data.symbol.toUpperCase()}) • 
      Market Cap: $${data.market_data.market_cap.usd?.toLocaleString() || 'N/A'} • 
      24h Change: ${data.market_data.price_change_percentage_24h?.toFixed(2)}%
    `;
    
    console.log('✅ Bitcoin metadata loaded from CoinGecko');
  } catch (error) {
    console.error('❌ Error fetching Bitcoin metadata:', error);
  }
}

// ============================================
// SOCKET.IO EVENT LISTENERS
// ============================================

/**
 * Connection established
 */
socket.on('connection_status', (data) => {
  console.log('✅ Connected to server:', data.message);
  updateConnectionStatus('connected');
});

/**
 * Trade update - add to chart
 */
socket.on('trade_update', (tradeData) => {
  // Update price display
  const currentPrice = parseFloat(tradeData.price);
  updatePriceDisplay(currentPrice);
});

/**
 * Chart data update - refresh visualization
 */
socket.on('chart_data', (chartData) => {
  if (!priceChart) return;
  
  // Update chart with new data
  priceChart.data.labels = chartData.labels;
  priceChart.data.datasets[0].data = chartData.prices;
  priceChart.data.datasets[1].data = chartData.volumes;
  
  priceChart.update('none'); // No animation for performance
});

/**
 * Whale alert - show dramatic animation
 */
socket.on('whale_alert', (whaleData) => {
  console.log('🚨 WHALE ALERT:', whaleData);
  
  // Show modal
  showWhaleAlert(whaleData);
  
  // Add to feed
  addTradeToFeed(whaleData, true);
  
  // Play sound alert (optional)
  playAlert();
});

/**
 * Metrics update - update stats display
 */
socket.on('metrics_update', (metrics) => {
  document.getElementById('whaleCount').textContent = metrics.whaleCount;
  document.getElementById('hourlyVolume').textContent = 
    metrics.hourlyVolume + ' BTC';
});

/**
 * Disconnection
 */
socket.on('disconnect', () => {
  console.log('❌ Disconnected from server');
  updateConnectionStatus('disconnected');
});

// ============================================
// UI UPDATE FUNCTIONS
// ============================================

/**
 * Update BTC price display and calculate percentage change
 */
function updatePriceDisplay(price) {
  const priceElement = document.getElementById('btcPrice');
  const changeElement = document.getElementById('priceChange');
  
  priceElement.textContent = '$' + price.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  
  // Calculate percentage change
  if (previousPrice > 0) {
    const change = ((price - previousPrice) / previousPrice) * 100;
    changeElement.textContent = (change > 0 ? '+' : '') + change.toFixed(2) + '%';
    changeElement.style.color = change > 0 ? '#00a86b' : '#ff4444';
  }
  
  previousPrice = price;
}

/**
 * Update connection status indicator
 */
function updateConnectionStatus(status) {
  const statusElement = document.getElementById('connectionStatus');
  const statusDot = statusElement.querySelector('.status-dot');
  const statusText = statusElement.querySelector('.status-text');
  
  if (status === 'connected') {
    statusDot.style.backgroundColor = '#00a86b';
    statusDot.classList.add('pulse');
    statusText.textContent = 'Connected';
    statusElement.style.color = '#00a86b';
  } else {
    statusDot.style.backgroundColor = '#ff4444';
    statusDot.classList.remove('pulse');
    statusText.textContent = 'Disconnected';
    statusElement.style.color = '#ff4444';
  }
}

/**
 * Show whale alert modal with animation
 */
function showWhaleAlert(whaleData) {
  const modal = document.getElementById('whaleAlertModal');
  
  // Update alert content
  document.getElementById('alertQuantity').textContent = 
    parseFloat(whaleData.quantity).toFixed(4);
  document.getElementById('alertPrice').textContent = 
    parseFloat(whaleData.price).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  document.getElementById('alertValue').textContent = 
    parseFloat(whaleData.tradeValue).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 0
    });
  document.getElementById('alertTime').textContent = 
    new Date(whaleData.timestamp).toLocaleTimeString();
  
  // Show modal
  modal.classList.add('show');
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    modal.classList.remove('show');
  }, 5000);
}

/**
 * Add trade to live feed
 */
function addTradeToFeed(tradeData, isWhale = false) {
  const feed = document.getElementById('tradeFeed');
  
  // Remove placeholder if exists
  const placeholder = feed.querySelector('.placeholder');
  if (placeholder) {
    placeholder.remove();
  }
  
  // Create feed item
  const item = document.createElement('div');
  item.className = `feed-item ${isWhale ? 'whale' : ''}`;
  
  const time = new Date(tradeData.timestamp).toLocaleTimeString();
  const price = parseFloat(tradeData.price).toLocaleString('en-US', {
    minimumFractionDigits: 2
  });
  const quantity = parseFloat(tradeData.quantity).toFixed(6);
  const value = parseFloat(tradeData.tradeValue).toLocaleString('en-US', {
    minimumFractionDigits: 0
  });
  
  item.innerHTML = `
    <div class="feed-item__header">
      <span class="time">${time}</span>
      ${isWhale ? '<span class="whale-badge">🐋 WHALE</span>' : ''}
    </div>
    <div class="feed-item__body">
      <span class="quantity">${quantity} BTC</span>
      <span class="price">@ $${price}</span>
      <span class="value">= $${value}</span>
    </div>
  `;
  
  // Add to top of feed
  feed.insertBefore(item, feed.firstChild);
  
  // Keep only last 20 trades
  while (feed.children.length > FEED_MAX_ITEMS) {
    feed.removeChild(feed.lastChild);
  }
}

/**
 * Play alert sound
 */
function playAlert() {
  // Using Web Audio API for beep
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  
  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  
  oscillator.frequency.value = 800; // 800 Hz beep
  oscillator.type = 'sine';
  
  gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
  
  oscillator.start(audioContext.currentTime);
  oscillator.stop(audioContext.currentTime + 0.5);
}

// ============================================
// INITIALIZATION
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('🐋 Whale Watcher Frontend Initialized');
  
  // Initialize chart
  initializeChart();
  
  // Fetch Bitcoin metadata
  fetchBitcoinMetadata();
  
  // Update connection status
  updateConnectionStatus('connecting');
});
