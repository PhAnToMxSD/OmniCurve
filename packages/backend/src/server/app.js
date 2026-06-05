require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../.env') });
const express = require('express');
const cors = require('cors');
const { getGlobalCurve, getRecentTrades } = require('../indexer/queries');
const { formatCurveData, formatTradeData } = require('./utils');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Endpoint 1: /api/market-state (GET)
app.get('/api/market-state', async (req, res) => {
  try {
    const rawData = await getGlobalCurve();
    
    if (!rawData) {
      // Fallback state if nothing is returned
      return res.json({
        success: true,
        data: { mu: 0, sigma: 0 }
      });
    }

    const formattedData = formatCurveData(rawData.new_mu, rawData.new_sigma);
    
    res.json({
      success: true,
      data: formattedData
    });
  } catch (error) {
    console.error('Error in /api/market-state:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// Endpoint 2: /api/trades (GET)
app.get('/api/trades', async (req, res) => {
  try {
    const rawTrades = await getRecentTrades();
    const formattedTrades = rawTrades.map(formatTradeData);

    res.json({
      success: true,
      data: formattedTrades
    });
  } catch (error) {
    console.error('Error in /api/trades:', error);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 REST API is alive and listening on port ${PORT}`);
});
