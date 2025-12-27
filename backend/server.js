/**
 * WHALE WATCHER - BACKEND SERVER
 * 
 * Main server file that:
 * 1. Connects to Binance WebSocket for BTC/USDT trades
 * 2. Detects whale trades (>$500K)
 * 3. Broadcasts updates via Socket.io to frontend
 * 4. Serves static frontend files
 */

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const WebSocket = require('ws');
const path = require('path');
const WhaleDetector = require('./whaleDetector');
const setupSocketIO = require('./socket');

// ============================================
// CONFIGURATION
// ============================================

const PORT = 3000;
const BINANCE_WS_URL = 'wss://stream.binance.com:9443/ws/btcusdt@trade';

// ============================================
// INITIALIZE EXPRESS & SOCKET.IO
// ============================================

const app = express();
const server = http.createServer(app);
const io = socketIO(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// ============================================
// INITIALIZE WHALE DETECTOR
// ============================================

const whaleDetector = new WhaleDetector();
const { 
  broadcastTradeUpdate, 
  broadcastWhaleAlert, 
  broadcastMetricsUpdate,
  broadcastChartData,
  getConnectedClientsCount
} = setupSocketIO(io, whaleDetector);

// ============================================
// BINANCE WEBSOCKET CONNECTION
// ============================================

let binanceWS = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 5000; // 5 seconds

/**
 * Connect to Binance WebSocket trade stream
 * Automatically reconnects on disconnect
 */
function connectToBinance() {
  console.log('🔌 Connecting to Binance WebSocket...');
  
  // Fix 403 error by adding User-Agent header
  const options = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  };
  
  binanceWS = new WebSocket(BINANCE_WS_URL, options);

  // ---- WebSocket opened ----
  binanceWS.on('open', () => {
    console.log('✅ Binance WebSocket connected');
    reconnectAttempts = 0; // Reset on successful connection
  });

  // ---- Trade data received ----
  binanceWS.on('message', (data) => {
    try {
      const trade = JSON.parse(data);

      // Process trade through whale detector
      const processedTrade = whaleDetector.processTrade(trade);

      // Broadcast to all connected clients
      broadcastTradeUpdate(processedTrade);

      // If whale trade, send alert
      if (processedTrade.isWhale) {
        broadcastWhaleAlert(processedTrade);
      }

      // Update chart data every 5 trades for performance
      if (whaleDetector.tradeHistory.length % 5 === 0) {
        broadcastChartData(whaleDetector.getChartData());
        broadcastMetricsUpdate(whaleDetector.getMetrics());
      }

    } catch (error) {
      console.error('❌ Error processing trade:', error.message);
    }
  });

  // ---- WebSocket error ----
  binanceWS.on('error', (error) => {
    console.error('❌ Binance WebSocket error:', error.message);
  });

  // ---- WebSocket closed ----
  binanceWS.on('close', () => {
    console.log('⚠️  Binance WebSocket disconnected');
    
    // Attempt reconnection
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      console.log(`🔄 Reconnecting... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
      setTimeout(connectToBinance, RECONNECT_DELAY);
    } else {
      console.error('❌ Max reconnection attempts reached. Please restart the server.');
    }
  });
}

// ============================================
// PERIODIC UPDATES
// ============================================

/**
 * Update chart every 10 seconds
 * Ensures smooth chart updates even with sparse trades
 */
setInterval(() => {
  broadcastChartData(whaleDetector.getChartData());
  broadcastMetricsUpdate(whaleDetector.getMetrics());
}, 10000);

/**
 * Log server status every 30 seconds
 */
setInterval(() => {
  const metrics = whaleDetector.getMetrics();
  const clientCount = getConnectedClientsCount();
  
  console.log(
    `\n📊 [${new Date().toLocaleTimeString()}] ` +
    `Clients: ${clientCount} | ` +
    `Whales: ${metrics.whaleCount} | ` +
    `Price: $${metrics.currentPrice.toFixed(2)} | ` +
    `Trades: ${whaleDetector.tradeHistory.length}`
  );
}, 30000);

// ============================================
// HTTP ROUTES
// ============================================

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    connectedClients: getConnectedClientsCount(),
    metrics: whaleDetector.getMetrics()
  });
});

/**
 * API endpoint for metrics
 */
app.get('/api/metrics', (req, res) => {
  res.json(whaleDetector.getMetrics());
});

/**
 * API endpoint for chart data
 */
app.get('/api/chart-data', (req, res) => {
  res.json(whaleDetector.getChartData());
});

// ============================================
// START SERVER
// ============================================

server.listen(PORT, () => {
  console.log(`\n🚀 WHALE WATCHER SERVER STARTED`);
  console.log(`📍 Listening on http://localhost:${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔗 WebSocket: wss://localhost:${PORT}`);
  console.log(`\n⚙️  Connecting to Binance WebSocket...\n`);
  
  // Connect to Binance
  connectToBinance();
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  
  // Close Binance connection
  if (binanceWS) {
    binanceWS.close();
  }
  
  // Close server
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

module.exports = app;

