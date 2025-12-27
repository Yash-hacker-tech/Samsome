/**
 * WHALE DETECTOR MODULE
 * 
 * Detects whale trades (>$500,000 USD value)
 * Maintains 60-minute rolling window of price/volume data
 * Broadcasts alerts to connected clients
 */

class WhaleDetector {
  constructor() {
    // Trade history for chart updates (60-minute rolling window)
    this.tradeHistory = [];
    
    // Alert threshold in USD
    this.WHALE_THRESHOLD = 500000;
    
    // Maximum data points to keep (60 minutes of data)
    this.MAX_HISTORY = 3600; // 3600 seconds = 60 minutes
    
    // Store last price for aggregated volume calculation
    this.lastPrice = 0;
    this.aggregatedVolume = 0;
    this.lastVolumeResetTime = Date.now();
    
    // Real-time metrics
    this.metrics = {
      totalVolume24h: 0,
      whaleCount: 0,
      maxWhaleAmount: 0,
      lastWhaleTime: null,
      averageWhaleSize: 0
    };
  }

  /**
   * Process incoming trade from Binance WebSocket
   * @param {Object} trade - Trade data from Binance
   * @returns {Object} Processed trade with whale detection result
   */
  processTrade(trade) {
    // Parse string values to numbers
    const price = parseFloat(trade.p);
    const quantity = parseFloat(trade.q);
    const timestamp = trade.T || Date.now();
    
    // Calculate trade value in USD
    const tradeValue = price * quantity;
    
    // Store last price for volume aggregation
    this.lastPrice = price;
    
    // Add to aggregated volume
    this.aggregatedVolume += quantity;
    
    // Create trade record for chart
    const tradeRecord = {
      price: price,
      quantity: quantity,
      tradeValue: tradeValue,
      timestamp: timestamp,
      isWhale: tradeValue > this.WHALE_THRESHOLD
    };
    
    // Add to history (maintain rolling window)
    this.tradeHistory.push(tradeRecord);
    if (this.tradeHistory.length > this.MAX_HISTORY) {
      this.tradeHistory.shift();
    }
    
    // Detect whale trade
    if (tradeValue > this.WHALE_THRESHOLD) {
      this.onWhaleDetected(tradeRecord);
    }
    
    // Reset volume every 60 seconds
    const now = Date.now();
    if (now - this.lastVolumeResetTime > 60000) {
      this.aggregatedVolume = 0;
      this.lastVolumeResetTime = now;
    }
    
    return tradeRecord;
  }

  /**
   * Handle whale trade detection
   * Updates metrics and prepares alert payload
   * @param {Object} trade - Whale trade record
   */
  onWhaleDetected(trade) {
    this.metrics.whaleCount++;
    this.metrics.maxWhaleAmount = Math.max(
      this.metrics.maxWhaleAmount, 
      trade.tradeValue
    );
    this.metrics.lastWhaleTime = new Date().toISOString();
    
    // Calculate average whale size
    this.metrics.averageWhaleSize = 
      this.metrics.maxWhaleAmount / this.metrics.whaleCount;
  }

  /**
   * Get aggregated chart data (last 60 minutes)
   * Aggregates trades by time buckets for efficient visualization
   * @returns {Object} Chart data with labels, prices, and volumes
   */
  getChartData() {
    if (this.tradeHistory.length === 0) {
      return {
        labels: [],
        prices: [],
        volumes: [],
        timestamps: []
      };
    }

    // Create 60 buckets for 60-minute window
    const buckets = new Map();
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);

    // Filter trades within last 60 minutes
    this.tradeHistory.forEach(trade => {
      if (trade.timestamp >= oneHourAgo) {
        // Create 1-minute buckets
        const bucketTime = Math.floor(trade.timestamp / 60000) * 60000;
        
        if (!buckets.has(bucketTime)) {
          buckets.set(bucketTime, {
            price: trade.price,
            totalVolume: 0,
            count: 0,
            timestamp: bucketTime
          });
        }
        
        const bucket = buckets.get(bucketTime);
        bucket.totalVolume += trade.quantity;
        bucket.price = trade.price; // Use latest price in bucket
        bucket.count++;
      }
    });

    // Convert to sorted arrays
    const sortedBuckets = Array.from(buckets.values())
      .sort((a, b) => a.timestamp - b.timestamp);

    return {
      labels: sortedBuckets.map(b => {
        const date = new Date(b.timestamp);
        return date.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
      }),
      prices: sortedBuckets.map(b => b.price.toFixed(2)),
      volumes: sortedBuckets.map(b => b.totalVolume.toFixed(4)),
      timestamps: sortedBuckets.map(b => b.timestamp)
    };
  }

  /**
   * Get current metrics
   * @returns {Object} Real-time metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      currentPrice: this.lastPrice,
      hourlyVolume: this.aggregatedVolume.toFixed(4)
    };
  }

  /**
   * Reset all metrics (useful for daily resets)
   */
  reset() {
    this.metrics = {
      totalVolume24h: 0,
      whaleCount: 0,
      maxWhaleAmount: 0,
      lastWhaleTime: null,
      averageWhaleSize: 0
    };
    this.tradeHistory = [];
    this.aggregatedVolume = 0;
  }
}

module.exports = WhaleDetector;

