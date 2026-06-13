/**
 * Database seed script — reads on-chain Factory state and upserts markets into Prisma.
 *
 * Usage:  pnpm db:seed
 *
 * Flow:
 *   1. Connect to Arbitrum Sepolia via viem
 *   2. Read Factory.getMarketCount()
 *   3. For each market 0..count-1:
 *      - Read AMM/Router/LP Token proxy addresses from Factory
 *      - Read globalMu, globalSigma, sigmaMin from AMM proxy
 *      - Upsert into Prisma Market table
 */

import { createPublicClient, http, formatEther } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { config } from '../config';
import prisma from '../models/db';
import { factoryAbi, ammAbi } from './abis';

// Curated, human-readable titles per market id. Titles are off-chain metadata
// (the factory stores none), so they live here and in the DB. Markets not listed
// fall back to "Market #i". Listed markets have their title kept in sync on re-seed.
const MARKET_TITLES: Record<string, { title: string; category: string }> = {
  '1': { title: 'What will the price of BTC be by the end of 2026?', category: 'crypto' },
  '2': { title: 'What will the price of ETH be by the end of 2026?', category: 'crypto' },
  '6': { title: 'Which year will Anthropic release a new Claude model?', category: 'other' },
};

async function seed() {
  console.log('🌱 Starting database seed...\n');

  const publicClient = createPublicClient({
    chain: arbitrumSepolia,
    transport: http(config.RPC_URL),
  });

  // ─── Step 1: Read market count from Factory ───
  const factoryAddress = config.FACTORY_ADDRESS as `0x${string}`;

  const marketCount = await publicClient.readContract({
    address: factoryAddress,
    abi: factoryAbi,
    functionName: 'getMarketCount',
  });

  const count = Number(marketCount);
  console.log(`📊 Factory reports ${count} market(s) on-chain\n`);

  if (count === 0) {
    console.log('⚠️  No markets found. Nothing to seed.');
    return;
  }

  // ─── Step 2: Iterate each market and upsert ───
  for (let i = 0; i < count; i++) {
    if (config.EXCLUDED_MARKET_IDS.includes(i.toString())) {
      console.log(`─── Market #${i} ─── 🚫 excluded (EXCLUDED_MARKET_IDS) — skipping\n`);
      continue;
    }
    const marketIdBigInt = BigInt(i);

    console.log(`─── Market #${i} ───`);

    // Read proxy addresses from Factory
    const [ammAddress, routerAddress, lpTokenAddress] = await Promise.all([
      publicClient.readContract({
        address: factoryAddress,
        abi: factoryAbi,
        functionName: 'getMarketAmm',
        args: [marketIdBigInt],
      }),
      publicClient.readContract({
        address: factoryAddress,
        abi: factoryAbi,
        functionName: 'getMarketRouter',
        args: [marketIdBigInt],
      }),
      publicClient.readContract({
        address: factoryAddress,
        abi: factoryAbi,
        functionName: 'getMarketLpToken',
        args: [marketIdBigInt],
      }),
    ]);

    console.log(`  AMM Proxy:      ${ammAddress}`);
    console.log(`  Router Proxy:   ${routerAddress}`);
    console.log(`  LP Token Proxy: ${lpTokenAddress}`);

    // Read AMM state field-by-field (some fields may not exist on all contract versions)
    let currentMu = 0;
    let currentSigma = 0;
    let minVarianceBound = 0;
    let totalLiquidity = 0;
    let isResolved = false;
    let winningTokenId: string | null = null;

    // Helper to read a single contract field with a fallback
    async function readAmmField<T>(functionName: string, fallback: T): Promise<T> {
      try {
        return await publicClient.readContract({
          address: ammAddress,
          abi: ammAbi,
          functionName: functionName as any,
        }) as T;
      } catch {
        console.warn(`  ⚠️  Could not read ${functionName} (using default: ${fallback})`);
        return fallback;
      }
    }

    const rawMu = await readAmmField<bigint>('globalMu', 0n);
    const rawSigma = await readAmmField<bigint>('globalSigma', 0n);
    // The deployed AMM has no sigmaMin() getter — fall back to raw storage
    // slot 4 (0 owner, 1 pending_owner, 2 mu, 3 sigma, 4 sigma_min).
    let rawSigmaMin = await readAmmField<bigint>('sigmaMin', 0n);
    if (rawSigmaMin === 0n) {
      try {
        const slot = await publicClient.getStorageAt({ address: ammAddress, slot: '0x4' });
        if (slot) rawSigmaMin = BigInt(slot);
      } catch {
        // keep 0
      }
    }
    const rawLiquidity = await readAmmField<bigint>('availableLiquidity', 0n);
    const rawIsResolved = await readAmmField<boolean>('isResolved', false);
    const rawWinningId = await readAmmField<bigint>('winningTokenId', 0n);

    // Convert WAD (1e18) I256 values to JS floats
    currentMu = parseFloat(formatEther(rawMu));
    currentSigma = parseFloat(formatEther(rawSigma));
    minVarianceBound = parseFloat(formatEther(rawSigmaMin));
    totalLiquidity = parseFloat(formatEther(rawLiquidity));
    isResolved = rawIsResolved;
    console.log(`  σ_min:          ${minVarianceBound}`);

    if (isResolved) {
      winningTokenId = rawWinningId.toString();
    }

    console.log(`  μ (mu):         ${currentMu}`);
    console.log(`  σ (sigma):      ${currentSigma}`);
    console.log(`  Liquidity:      ${totalLiquidity}`);
    console.log(`  Resolved:       ${isResolved}`);

    // ─── Upsert into Prisma ───
    const marketId = i.toString();
    const curated = MARKET_TITLES[marketId];

    const market = await prisma.market.upsert({
      where: { marketId },
      update: {
        currentMu,
        currentSigma,
        totalLiquidity,
        minVarianceBound,
        ammAddress,
        routerAddress,
        lpTokenAddress,
        isResolved,
        winningTokenId,
        // Keep curated titles in sync on re-seed; leave others untouched.
        ...(curated ? { title: curated.title, category: curated.category } : {}),
      },
      create: {
        marketId,
        title: curated?.title ?? `Market #${i}`,
        category: curated?.category ?? 'general',
        currentMu,
        currentSigma,
        totalLiquidity,
        minVarianceBound,
        ammAddress,
        routerAddress,
        lpTokenAddress,
        isResolved,
        winningTokenId,
      },
    });

    console.log(`  ✅ Upserted market "${market.title}" (id: ${market.marketId})\n`);
  }

  console.log('🎉 Seed complete!');
}

seed()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
