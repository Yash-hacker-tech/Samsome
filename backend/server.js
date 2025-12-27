/**
 * WHALE WATCHER - Backend Server
 * 
 * Express server with Socket.IO for real-time BTC whale tracking
 * Connects to Binance WebSocket for live trade data
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const WebSocket = require('ws');
const WhaleDetector = require('./whaleDetector');
const setupSocketIO = require('./socket');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from frontend directory
app.use(express.static(path.join(__dirname, '../frontend')));

// Initialize Whale Detector
const whaleDetector = new WhaleDetector();

// Setup Socket.IO handlers
const socketHandlers = setupSocketIO(io, whaleDetector);

// Binance WebSocket connection
let binanceWS = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 5000; // 5 seconds

function connectToBinance() {
  console.log('🔌 Connecting to Binance WebSocket...');
  
  // Binance trade stream for BTCUSDT
  const stream = 'btcusdt@trade';
  const wsUrl = `wss://stream.binance.com:9443/ws/${stream}`;
  
  binanceWS = new WebSocket(wsUrl);

  binanceWS.on('open', () => {
    console.log('✅ Connected to Binance WebSocket');
    reconnectAttempts = 0;
  });

  binanceWS.on('message', (data) => {
    try {
      const trade = JSON.parse(data.toString());
      
      // Process trade through whale detector
      const processedTrade = whaleDetector.processTrade(trade);
      
      // Broadcast trade update to all clients
      socketHandlers.broadcastTradeUpdate(processedTrade);
      
      // If it's a whale trade, send alert
      if (processedTrade.isWhale) {
        socketHandlers.broadcastWhaleAlert({
          ...processedTrade,
          message: `🐋 WHALE DETECTED: ${processedTrade.quantity.toFixed(4)} BTC at $${processedTrade.price.toFixed(2)}`
        });
      }
      
      // Broadcast metrics update every 10 trades (to reduce load)
      if (whaleDetector.tradeHistory.length % 10 === 0) {
        socketHandlers.broadcastMetricsUpdate(whaleDetector.getMetrics());
      }
      
    } catch (error) {
      console.error('❌ Error processing trade:', error);
    }
  });

  binanceWS.on('error', (error) => {
    console.error('❌ Binance WebSocket error:', error);
  });

  binanceWS.on('close', () => {
    console.log('⚠️ Binance WebSocket closed');
    
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts++;
      console.log(`🔄 Reconnecting in ${RECONNECT_DELAY / 1000} seconds... (Attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
      setTimeout(connectToBinance, RECONNECT_DELAY);
    } else {
      console.error('❌ Max reconnection attempts reached. Please check your internet connection.');
    }
  });
}

// Start server
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🚀 Whale Watcher server running on http://localhost:${PORT}`);
  console.log(`📊 Open your browser and navigate to http://localhost:${PORT}`);
  
  // Connect to Binance WebSocket
  connectToBinance();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down server...');
  if (binanceWS) {
    binanceWS.close();
  }
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
