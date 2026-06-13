/**
 * Trade-position backfill script — reconstructs Position rows from on-chain
 * TradeExecuted logs, without restarting the API server.
 *
 * Usage:  pnpm db:backfill
 *
 * Why this exists: trade positions are only persisted by the live chain watcher
 * (watchContractEvent sees future events only). Any trade that landed while the
 * backend was down — or before the DB was wiped/re-seeded — is missing from the
 * portfolio until reconstructed. LP positions are unaffected because they are
 * read live on-chain. This script runs the same idempotent, absolute-write
 * backfill the watcher runs at startup, for every market in the DB.
 *
 * Run `pnpm db:seed` first if the Market table is empty — markets must exist
 * before their trade logs can be attributed.
 */

import prisma from '../models/db';
import { backfillTradePositions } from '../services/chainService';

async function backfill() {
  console.log('📦 Starting trade-position backfill...\n');

  const markets = await prisma.market.findMany({
    select: { marketId: true, ammAddress: true, routerAddress: true },
  });

  if (markets.length === 0) {
    console.warn('⚠️  No markets in DB. Run `pnpm db:seed` first, then re-run this.');
    return;
  }

  let processed = 0;
  for (const market of markets) {
    if (!market.ammAddress || !market.routerAddress) {
      console.warn(`⚠️  Market ${market.marketId} missing AMM/Router address — skipping`);
      continue;
    }
    await backfillTradePositions(market);
    processed++;
  }

  console.log(`\n✅ Backfill complete — processed ${processed} market(s).`);
}

backfill()
  .catch((err) => {
    console.error('❌ Backfill failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
