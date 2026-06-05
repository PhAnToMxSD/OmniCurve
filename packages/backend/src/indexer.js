require('dotenv').config({ path: '../../.env' });
const { createPublicClient, http, webSocket, parseAbiItem } = require('viem');
const { arbitrumSepolia } = require('viem/chains');

// Load ABIs
const distributionAmmAbi = require('../../types/abis/distribution_amm.json');
const binaryRouterAbi = require('../../types/abis/binary_router.json');

// Addresses from .env or defaults from recent deployment
const DISTRIBUTION_AMM_ADDRESS = process.env.DISTRIBUTION_AMM_ADDRESS || '0xb4f1cf16d4da2c35956706c25fc194c0df14260e';
const BINARY_ROUTER_ADDRESS = process.env.BINARY_ROUTER_ADDRESS || '0x334cec716c70f2aaace00e321ecc67bbe4a01c14';

// Setup Viem Client
const rpcUrl = process.env.RPC_URL || 'https://sepolia-rollup.arbitrum.io/rpc';
const wsRpcUrl = process.env.WS_RPC_URL; // e.g. wss://sepolia-rollup.arbitrum.io/rpc

const transport = wsRpcUrl ? webSocket(wsRpcUrl) : http(rpcUrl);

const client = createPublicClient({
  chain: arbitrumSepolia,
  transport: transport
});

// Helper function to extract ABI by name
function getAbiItem(abi, itemName) {
    for (const item of abi) {
        if (item.type === 'event' && item.name === itemName) {
            return item;
        }
    }
    for (const item of abi) {
        if (Array.isArray(item)) {
             for (const nested of item) {
                  if (nested.type === 'event' && nested.name === itemName) {
                       return nested;
                  }
             }
        }
    }
    return null;
}

const curveUpdatedAbi = getAbiItem(distributionAmmAbi, 'CurveUpdated');
const tradeExecutedAbi = getAbiItem(binaryRouterAbi, 'TradeExecuted');

async function main() {
  console.log('🚀 Starting OmniCurve Indexer...');
  console.log(`🔗 Connected to Arbitrum Sepolia via ${wsRpcUrl ? 'WebSocket' : 'HTTP Polling'}`);
  console.log(`📡 Listening to DistributionAMM at ${DISTRIBUTION_AMM_ADDRESS}`);
  console.log(`📡 Listening to BinaryRouter at ${BINARY_ROUTER_ADDRESS}\n`);

  // 1. Listening to the AMM (Pro View Updates)
  client.watchContractEvent({
    address: DISTRIBUTION_AMM_ADDRESS,
    abi: distributionAmmAbi.flat ? distributionAmmAbi.flat() : distributionAmmAbi,
    eventName: 'CurveUpdated',
    onLogs: logs => {
      logs.forEach(log => {
        const { new_mu, new_sigma } = log.args;
        console.log('\n=============================================');
        console.log('📈 [AMM] CURVE UPDATED EVENT DETECTED');
        console.log('=============================================');
        console.log(`   μ (new_mu)    : ${new_mu.toString()}`);
        console.log(`   σ (new_sigma) : ${new_sigma.toString()}`);
        console.log('=============================================\n');
      });
    }
  });

  // 2. Listening to the Router (Retail Trades)
  client.watchContractEvent({
    address: BINARY_ROUTER_ADDRESS,
    abi: binaryRouterAbi.flat ? binaryRouterAbi.flat() : binaryRouterAbi,
    eventName: 'TradeExecuted',
    onLogs: logs => {
      logs.forEach(log => {
        const { user, target_price, is_yes } = log.args;
        console.log('\n---------------------------------------------');
        console.log('🛒 [ROUTER] RETAIL TRADE EXECUTED');
        console.log('---------------------------------------------');
        console.log(`   User         : ${user}`);
        console.log(`   Target Price : ${target_price.toString()}`);
        console.log(`   Direction    : ${is_yes ? '🟢 YES' : '🔴 NO'}`);
        console.log('---------------------------------------------\n');
      });
    }
  });
}

main().catch(console.error);
