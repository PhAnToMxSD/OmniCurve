require('dotenv').config({ path: '../../../.env' });
const { getGlobalCurve, getRecentTrades } = require('./queries');

async function run() {
  console.log("Starting backend client... Fetching indexed data from Goldsky...");

  try {
    const globalCurve = await getGlobalCurve();
    console.log("Global Curve:", globalCurve);

    const recentTrades = await getRecentTrades(5);
    console.log("Recent Trades:", recentTrades);
    
    // Poll every 5 seconds
    setInterval(async () => {
      console.log("\n--- Fetching updates ---");
      try {
        const updatedCurve = await getGlobalCurve();
        console.log("Global Curve:", updatedCurve);
      } catch (err) {
        console.error("Error polling global curve");
      }
    }, 5000);

  } catch (err) {
    console.error("Error during initial fetch:", err);
  }
}

run();
