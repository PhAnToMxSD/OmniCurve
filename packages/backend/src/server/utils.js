const { formatEther } = require('viem');

/**
 * Takes raw blockchain BigInts/strings scaled by 10^18 and converts them to standard JS floats.
 */
function formatCurveData(rawMu, rawSigma) {
  if (!rawMu || !rawSigma) return null;
  
  return {
    mu: parseFloat(formatEther(BigInt(rawMu))),
    sigma: parseFloat(formatEther(BigInt(rawSigma)))
  };
}

/**
 * Formats a trade's target_price from WAD to a standard float.
 */
function formatTradeData(rawTrade) {
  if (!rawTrade) return null;

  return {
    ...rawTrade,
    target_price: parseFloat(formatEther(BigInt(rawTrade.target_price))),
  };
}

module.exports = {
  formatCurveData,
  formatTradeData
};
