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
    const rawLiquidity = await readAmmField<bigint>('availableLiquidity', 0n);
    const rawIsResolved = await readAmmField<boolean>('isResolved', false);
    const rawWinningId = await readAmmField<bigint>('winningTokenId', 0n);

    // Convert WAD (1e18) I256 values to JS floats
    currentMu = parseFloat(formatEther(rawMu));
    currentSigma = parseFloat(formatEther(rawSigma));
    totalLiquidity = parseFloat(formatEther(rawLiquidity));
    isResolved = rawIsResolved;

    if (isResolved) {
      winningTokenId = rawWinningId.toString();
    }

    console.log(`  μ (mu):         ${currentMu}`);
    console.log(`  σ (sigma):      ${currentSigma}`);
    console.log(`  Liquidity:      ${totalLiquidity}`);
    console.log(`  Resolved:       ${isResolved}`);

    // ─── Upsert into Prisma ───
    const marketId = i.toString();

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
      },
      create: {
        marketId,
        title: `Market #${i}`,
        category: 'general',
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
