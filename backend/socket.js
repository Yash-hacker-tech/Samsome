/**
 * SOCKET.IO CONFIGURATION
 * 
 * Manages WebSocket connections to frontend
 * Broadcasts trade updates and whale alerts
 * Handles client connections/disconnections
 */

function setupSocketIO(io, whaleDetector) {
  // In-memory store of connected clients
  const connectedClients = new Set();

  io.on('connection', (socket) => {
    console.log(`✅ Client connected: ${socket.id}`);
    connectedClients.add(socket.id);

    // Send initial metadata on connection
    socket.emit('connection_status', {
      status: 'connected',
      timestamp: new Date().toISOString(),
      message: '🟢 Connected to whale tracker server'
    });

    // Send current metrics
    socket.emit('metrics_update', whaleDetector.getMetrics());

    // Send initial chart data
    socket.emit('chart_data', whaleDetector.getChartData());

    // Handle client disconnect
    socket.on('disconnect', () => {
      connectedClients.delete(socket.id);
      console.log(`❌ Client disconnected: ${socket.id}`);
      console.log(`📊 Active clients: ${connectedClients.size}`);
    });

    // Handle client requesting full chart update (for sync purposes)
    socket.on('request_chart_update', () => {
      socket.emit('chart_data', whaleDetector.getChartData());
    });
  });

  return {
    // Broadcast trade update to all connected clients
    broadcastTradeUpdate: (tradeData) => {
      io.emit('trade_update', {
        price: tradeData.price.toFixed(2),
        quantity: tradeData.quantity.toFixed(6),
        tradeValue: tradeData.tradeValue.toFixed(2),
        timestamp: new Date(tradeData.timestamp).toISOString(),
        isWhale: tradeData.isWhale
      });
    },

    // Broadcast whale alert with visual emphasis
    broadcastWhaleAlert: (whaleData) => {
      io.emit('whale_alert', {
        price: whaleData.price.toFixed(2),
        quantity: whaleData.quantity.toFixed(6),
        tradeValue: whaleData.tradeValue.toFixed(2),
        timestamp: new Date(whaleData.timestamp).toISOString(),
        severity: whaleData.tradeValue > 1000000 ? 'critical' : 'high',
        message: `🐋 WHALE ALERT: ${whaleData.quantity.toFixed(4)} BTC at $${whaleData.price.toFixed(2)}`
      });

      // Log to console for debugging
      console.log(`\n🚨 ${whaleData.message}`);
      console.log(`   Value: $${whaleData.tradeValue.toLocaleString('en-US')}`);
      console.log(`   Time: ${new Date(whaleData.timestamp).toLocaleTimeString()}\n`);
    },

    // Broadcast updated metrics
    broadcastMetricsUpdate: (metrics) => {
      io.emit('metrics_update', metrics);
    },

    // Broadcast chart data update
    broadcastChartData: (chartData) => {
      io.emit('chart_data', chartData);
    },

    // Get number of connected clients
    getConnectedClientsCount: () => connectedClients.size
  };
}

module.exports = setupSocketIO;
