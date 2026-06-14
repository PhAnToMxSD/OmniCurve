/**
 * On-chain sync service — watches AMM and Router contract events via viem
 * and pushes state updates into Prisma + Socket.io.
 *
 * Watches every market in the DB, plus the Factory's MarketCreated event so
 * newly created markets are registered and watched without a restart.
 */

import { createPublicClient, http, formatEther, formatUnits, type WatchContractEventReturnType } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { config } from '../config';
import prisma from '../models/db';
import { ammAbi, routerAbi, lpTokenAbi, factoryAbi } from '../db/abis';
import { broadcastMarketUpdate, broadcastMarketResolved, broadcastMarketCreated } from '../sockets/socketManager';
import { calculateExpectedPrices } from './mathService';

// ─── Shared viem client ──────────────────────────────────────────────────────

export const publicClient = createPublicClient({
  chain: arbitrumSepolia,
  transport: http(config.RPC_URL),
});

// ─── On-chain read helper ────────────────────────────────────────────────────

/**
 * Reads current mu, sigma, and totalLiquidity directly from an AMM contract.
 * Returns JS floats (WAD values converted via formatEther).
 */
export async function getMarketState(ammAddress: string): Promise<{
  mu: number;
  sigma: number;
  totalLiquidity: number;
}> {
  const address = ammAddress as `0x${string}`;

  const [rawMu, rawSigma] = await Promise.all([
    publicClient.readContract({ address, abi: ammAbi, functionName: 'globalMu' }),
    publicClient.readContract({ address, abi: ammAbi, functionName: 'globalSigma' }),
  ]);

  // Canonical liquidity = USDC collateral actually held by the AMM proxy.
  // The on-chain availableLiquidity getter reverts on deployed proxies, and the
  // event-accumulated DB counter drifts (it could go negative), so the token
  // balance is the only reliable source of truth. USDC has 6 decimals.
  let totalLiquidity: number;
  try {
    const rawUsdc = await publicClient.readContract({
      address: config.USDC_ADDRESS as `0x${string}`,
      abi: lpTokenAbi, // balanceOf(address) fragment
      functionName: 'balanceOf',
      args: [address],
    });
    totalLiquidity = parseFloat(formatUnits(rawUsdc as bigint, 6));
  } catch {
    // Fall back to the persisted DB counter if the balance read fails.
    const market = await prisma.market.findFirst({ where: { ammAddress } });
    totalLiquidity = Math.max(0, market?.totalLiquidity ?? 0);
  }

  return {
    mu: parseFloat(formatEther(rawMu)),
    sigma: parseFloat(formatEther(rawSigma)),
    totalLiquidity,
  };
}

/**
 * Reads sigma_min from an AMM proxy. The deployed implementation has no
 * `sigmaMin()` getter (the call reverts), so fall back to reading the raw
 * storage slot. Slot layout of DistributionAmm: 0 owner, 1 pending_owner,
 * 2 global_mu, 3 global_sigma, 4 sigma_min.
 */
export async function getSigmaMin(ammAddress: string): Promise<number> {
  const address = ammAddress as `0x${string}`;
  try {
    const raw = await publicClient.readContract({ address, abi: ammAbi, functionName: 'sigmaMin' });
    return parseFloat(formatEther(raw as bigint));
  } catch {
    try {
      const slot = await publicClient.getStorageAt({ address, slot: '0x4' });
      return slot ? parseFloat(formatEther(BigInt(slot))) : 0;
    } catch {
      return 0;
    }
  }
}

/**
 * Reads a market's immutable title from the Factory (`getMarketTitle`). Titles
 * are stored on-chain at create time and are the authoritative source. Returns
 * an empty string if the getter reverts (e.g. a factory deployed before on-chain
 * titles existed) so callers can fall back to a placeholder.
 */
export async function getMarketTitle(marketId: string): Promise<string> {
  try {
    const title = await publicClient.readContract({
      address: config.FACTORY_ADDRESS as `0x${string}`,
      abi: factoryAbi,
      functionName: 'getMarketTitle',
      args: [BigInt(marketId)],
    });
    return typeof title === 'string' ? title.trim() : '';
  } catch {
    return '';
  }
}

// ─── Event watcher ───────────────────────────────────────────────────────────

// ─── LP Stats helpers (Section 3) ────────────────────────────────────────────

/**
 * Reads LP token balance for a user by first discovering the LP token address
 * from the AMM, then calling balanceOf on that token.
 */
export async function getLpTokenBalance(ammAddress: string, userAddress: string): Promise<number> {
  const address = ammAddress as `0x${string}`;
  const user = userAddress as `0x${string}`;

  const lpTokenAddress = await publicClient.readContract({
    address,
    abi: ammAbi,
    functionName: 'lpToken',
  }) as `0x${string}`;

  const rawBalance = await publicClient.readContract({
    address: lpTokenAddress,
    abi: lpTokenAbi,
    functionName: 'balanceOf',
    args: [user],
  });

  return parseFloat(formatEther(rawBalance));
}

/**
 * Reads the global fee accumulator (accFeePerShare) from the AMM.
 * Falls back to the DB market value if the contract getter is not deployed.
 */
export async function getAccFeePerShare(ammAddress: string): Promise<number> {
  const address = ammAddress as `0x${string}`;
  try {
    const raw = await publicClient.readContract({
      address,
      abi: ammAbi,
      functionName: 'accFeePerShare',
    });
    return parseFloat(formatEther(raw));
  } catch {
    // accFeePerShare getter not deployed — use DB accumulator as proxy
    const market = await prisma.market.findFirst({ where: { ammAddress } });
    return market?.globalAccumulator ?? 0;
  }
}

/**
 * Reads the reward debt for a specific user from the AMM.
 * Falls back to the user's DB snapshot if the contract getter is not deployed.
 */
export async function getRewardDebt(ammAddress: string, userAddress: string): Promise<number> {
  const address = ammAddress as `0x${string}`;
  const user = userAddress as `0x${string}`;
  try {
    const raw = await publicClient.readContract({
      address,
      abi: ammAbi,
      functionName: 'rewardDebt',
      args: [user],
    });
    return parseFloat(formatEther(raw));
  } catch {
    // rewardDebt getter not deployed — use user's DB accumulator snapshot as proxy
    const dbUser = await prisma.user.findUnique({ where: { walletAddress: userAddress.toLowerCase() } });
    return dbUser?.globalAccumulatorSnapshot ?? 0;
  }
}

/**
 * Reads the owner address from the AMM contract.
 * Falls back to OWNER_ADDRESS env var if the contract getter is not deployed.
 */
export async function getAmmOwner(ammAddress: string): Promise<string> {
  const address = ammAddress as `0x${string}`;
  try {
    return await publicClient.readContract({
      address,
      abi: ammAbi,
      functionName: 'owner',
    }) as string;
  } catch {
    // owner() getter not deployed — fall back to env-configured owner address
    return config.OWNER_ADDRESS ?? '';
  }
}

/**
 * Computes pending rewards off-chain using the MasterChef formula:
 * pending = (lpBalance * accFeePerShare) - rewardDebt
 *
 * All values are WAD floats (already converted from 1e18).
 */
export function computePendingRewards(
  lpBalance: number,
  accFeePerShare: number,
  rewardDebt: number,
): number {
  const pending = (lpBalance * accFeePerShare) - rewardDebt;
  return Math.max(0, pending);
}

// ─── Event watcher ───────────────────────────────────────────────────────────

interface WatchableMarket {
  marketId: string;
  ammAddress: string;
  routerAddress: string;
}

// AMM addresses (lowercased) already being watched — prevents duplicate watchers
// when the Factory event fires for a market the seed already inserted.
const watchedAmms = new Set<string>();

// Shared across startChainWatcher and the Factory handler so watchers added for
// markets created after boot are also cleaned up on shutdown. server.ts holds a
// reference to this same array.
const allUnwatchers: WatchContractEventReturnType[] = [];

/**
 * Reconstructs all Position rows for a market from its full TradeExecuted log
 * history. `watchContractEvent` only sees future events, so any trade that
 * landed while the backend was down — or before the DB was last wiped/seeded —
 * would otherwise never appear in the portfolio (LP balances always show
 * because they are read live on-chain; trade positions are not). This reads
 * every past TradeExecuted log, aggregates them by deterministic positionId,
 * and writes ABSOLUTE totals. Unlike the live handler (which increments per
 * event), writing absolutes makes this safe to re-run on every restart without
 * double-counting.
 */
export async function backfillTradePositions(market: WatchableMarket): Promise<void> {
  const routerAddress = market.routerAddress as `0x${string}`;
  const marketId = market.marketId;

  let logs;
  try {
    logs = await publicClient.getContractEvents({
      address: routerAddress,
      abi: routerAbi,
      eventName: 'TradeExecuted',
      // Arbitrum Sepolia's public RPC rejects the 'earliest' block tag for
      // eth_getLogs ("expected fromBlock to be a hex string starting with 0x"),
      // so pass an explicit block number that viem hex-encodes (0n -> 0x0).
      fromBlock: 0n,
      toBlock: 'latest',
    });
  } catch (err) {
    console.error(`❌ Trade backfill: getContractEvents failed for market ${marketId}:`, err);
    return;
  }
  if (logs.length === 0) return;

  // Current μ/σ is used only to estimate each position's USD stake — the same
  // approximation the live TradeExecuted handler makes.
  const state = await getMarketState(market.ammAddress);

  type Agg = {
    positionId: string;
    userAddress: string;
    targetValueX: number;
    direction: 'ABOVE' | 'BELOW';
    tokensMinted: number;
    stakeAmount: number;
  };
  const byId = new Map<string, Agg>();

  for (const log of logs) {
    const { user, target_price, is_yes, tokens_minted } = log.args as {
      user?: string;
      target_price?: bigint;
      is_yes?: boolean;
      tokens_minted?: bigint;
    };
    if (user === undefined || target_price === undefined || is_yes === undefined || tokens_minted === undefined) {
      continue;
    }

    const targetPriceAbs = target_price < 0n ? -target_price : target_price;
    const tokensFloat = parseFloat(formatEther(tokens_minted));
    const targetValueX = parseFloat(formatEther(targetPriceAbs));
    const prices = calculateExpectedPrices(targetValueX, state.mu, state.sigma);
    const priceFloat = is_yes ? prices.pYes : prices.pNo;
    const stakeAmount = Math.ceil(priceFloat * tokensFloat * 1.01 * 1e6);
    const direction: 'ABOVE' | 'BELOW' = is_yes ? 'ABOVE' : 'BELOW';
    const positionId = `${user.toLowerCase()}-${marketId}-${direction}-${Math.round(targetValueX * 1000)}`;

    const existing = byId.get(positionId);
    if (existing) {
      existing.tokensMinted += tokensFloat;
      existing.stakeAmount += stakeAmount;
    } else {
      byId.set(positionId, {
        positionId,
        userAddress: user.toLowerCase(),
        targetValueX,
        direction,
        tokensMinted: tokensFloat,
        stakeAmount,
      });
    }
  }

  for (const agg of byId.values()) {
    await prisma.user.upsert({
      where: { walletAddress: agg.userAddress },
      create: { walletAddress: agg.userAddress },
      update: {},
    });
    await prisma.position.upsert({
      where: { positionId: agg.positionId },
      create: {
        positionId: agg.positionId,
        userAddress: agg.userAddress,
        marketId,
        targetValueX: agg.targetValueX,
        direction: agg.direction,
        tokensMinted: agg.tokensMinted,
        stakeAmount: agg.stakeAmount,
      },
      // Absolute totals (not increment) → idempotent across restarts.
      update: {
        tokensMinted: agg.tokensMinted,
        stakeAmount: agg.stakeAmount,
      },
    });
  }

  console.log(
    `📦 Trade backfill — market ${marketId}: reconstructed ${byId.size} position(s) ` +
    `from ${logs.length} TradeExecuted log(s)`
  );
}

/**
 * Registers the 5 per-market event watchers (CurveUpdated, LiquidityAdded,
 * LiquidityRemoved, MarketResolved on the AMM; TradeExecuted on the Router).
 * No-op if this AMM is already being watched.
 *
 * Backfills historical trade positions BEFORE subscribing to live events: the
 * absolute-write backfill plus the increment-on-event live handler share the
 * same deterministic positionId, so doing the backfill first avoids the live
 * watcher double-counting a trade that the backfill already captured. A trade
 * landing in the tiny gap between the backfill snapshot and the subscription is
 * recovered by the next restart's backfill.
 */
async function watchMarket(market: WatchableMarket): Promise<void> {
  const ammKey = market.ammAddress.toLowerCase();
  if (watchedAmms.has(ammKey)) return;
  watchedAmms.add(ammKey);

  const ammAddress = market.ammAddress as `0x${string}`;
  const routerAddress = market.routerAddress as `0x${string}`;
  const marketId = market.marketId;

  await backfillTradePositions(market);

  console.log(`⛓️  Watching market ${marketId} — AMM ${ammAddress}, Router ${routerAddress}`);

  const unwatchers = allUnwatchers;

  // ── CurveUpdated ───────────────────────────────────────────────────────
  // Fired when mu/sigma change after a trade or setDistribution
  unwatchers.push(
    publicClient.watchContractEvent({
      address: ammAddress,
      abi: ammAbi,
      eventName: 'CurveUpdated',
      onLogs: async (logs) => {
        for (const log of logs) {
          try {
            const { new_mu, new_sigma } = log.args as { new_mu: bigint; new_sigma: bigint };
            const currentMu = parseFloat(formatEther(new_mu));
            const currentSigma = parseFloat(formatEther(new_sigma));

            console.log(`📈 CurveUpdated — mu: ${currentMu}, sigma: ${currentSigma}`);

            await prisma.market.update({
              where: { marketId },
              data: { currentMu, currentSigma },
            });

            // Re-read liquidity to get a consistent snapshot
            const state = await getMarketState(ammAddress);

            broadcastMarketUpdate(marketId, {
              currentMu,
              currentSigma,
              totalLiquidity: state.totalLiquidity,
            });
          } catch (err) {
            console.error('❌ CurveUpdated handler error:', err);
          }
        }
      },
    })
  );

  // ── LiquidityAdded ─────────────────────────────────────────────────────
  unwatchers.push(
    publicClient.watchContractEvent({
      address: ammAddress,
      abi: ammAbi,
      eventName: 'LiquidityAdded',
      onLogs: async (logs) => {
        for (const log of logs) {
          try {
            const { provider, amount_wad } = log.args as { provider: string; amount_wad: bigint };
            const amount = parseFloat(formatEther(amount_wad));

            console.log(`💧 LiquidityAdded — provider: ${provider}, amount: ${amount}`);

            // getMarketState returns the AMM's actual USDC balance — the canonical
            // liquidity. Write it directly rather than incrementing a drift-prone counter.
            const state = await getMarketState(ammAddress);

            const updated = await prisma.market.update({
              where: { marketId },
              data: {
                currentMu: state.mu,
                currentSigma: state.sigma,
                totalLiquidity: state.totalLiquidity,
              },
            });

            broadcastMarketUpdate(marketId, {
              currentMu: updated.currentMu,
              currentSigma: updated.currentSigma,
              totalLiquidity: updated.totalLiquidity,
            });
          } catch (err) {
            console.error('❌ LiquidityAdded handler error:', err);
          }
        }
      },
    })
  );

  // ── LiquidityRemoved ───────────────────────────────────────────────────
  unwatchers.push(
    publicClient.watchContractEvent({
      address: ammAddress,
      abi: ammAbi,
      eventName: 'LiquidityRemoved',
      onLogs: async (logs) => {
        for (const log of logs) {
          try {
            const { provider, amount_wad } = log.args as { provider: string; amount_wad: bigint };
            const amount = parseFloat(formatEther(amount_wad));

            console.log(`🔻 LiquidityRemoved — provider: ${provider}, amount: ${amount}`);

            // getMarketState returns the AMM's actual USDC balance — the canonical
            // liquidity. Write it directly rather than decrementing a drift-prone counter.
            const state = await getMarketState(ammAddress);

            const updated = await prisma.market.update({
              where: { marketId },
              data: {
                currentMu: state.mu,
                currentSigma: state.sigma,
                totalLiquidity: state.totalLiquidity,
              },
            });

            broadcastMarketUpdate(marketId, {
              currentMu: updated.currentMu,
              currentSigma: updated.currentSigma,
              totalLiquidity: updated.totalLiquidity,
            });
          } catch (err) {
            console.error('❌ LiquidityRemoved handler error:', err);
          }
        }
      },
    })
  );

  // ── MarketResolved (AMM) ───────────────────────────────────────────────
  unwatchers.push(
    publicClient.watchContractEvent({
      address: ammAddress,
      abi: ammAbi,
      eventName: 'MarketResolved',
      onLogs: async (logs) => {
        for (const log of logs) {
          try {
            const { winning_id } = log.args as { winning_id: bigint };
            const winningTokenId = winning_id.toString();

            console.log(`🏁 MarketResolved (AMM) — winningTokenId: ${winningTokenId}`);

            await prisma.market.update({
              where: { marketId },
              data: { isResolved: true, winningTokenId },
            });

            broadcastMarketResolved(marketId, { winningTokenId });
          } catch (err) {
            console.error('❌ MarketResolved handler error:', err);
          }
        }
      },
    })
  );

  // ── TradeExecuted (Router) ─────────────────────────────────────────────
  unwatchers.push(
    publicClient.watchContractEvent({
      address: routerAddress,
      abi: routerAbi,
      eventName: 'TradeExecuted',
      onLogs: async (logs) => {
        for (const log of logs) {
          try {
            const { user, token_id, target_price, is_yes, tokens_minted } = log.args as {
              user: string;
              token_id: bigint;
              target_price: bigint;
              is_yes: boolean;
              tokens_minted: bigint;
            };

            const targetPriceAbs = target_price < 0n ? -target_price : target_price;
            console.log(
              `🔄 TradeExecuted — user: ${user}, tokenId: ${token_id}, ` +
              `price: ${formatEther(targetPriceAbs)}, isYes: ${is_yes}, ` +
              `minted: ${formatEther(tokens_minted)}`
            );

            // Re-read AMM state after trade to capture updated mu/sigma
            const state = await getMarketState(ammAddress);

            await prisma.market.update({
              where: { marketId },
              data: {
                currentMu: state.mu,
                currentSigma: state.sigma,
                totalLiquidity: state.totalLiquidity,
              },
            });

            broadcastMarketUpdate(marketId, {
              currentMu: state.mu,
              currentSigma: state.sigma,
              totalLiquidity: state.totalLiquidity,
            });

            // Write position so the portfolio dashboard is populated
            const tokensFloat = parseFloat(formatEther(tokens_minted));
            const targetValueX = parseFloat(formatEther(targetPriceAbs));
            const prices = calculateExpectedPrices(targetValueX, state.mu, state.sigma);
            const priceFloat = is_yes ? prices.pYes : prices.pNo;
            // Approximate stake: price × tokens × 1.01 fee, in USDC raw (6 decimals)
            const stakeAmount = Math.ceil(priceFloat * tokensFloat * 1.01 * 1e6);
            const direction = is_yes ? 'ABOVE' : 'BELOW';
            // Deterministic ID so repeated trades at the same strike accumulate
            const positionId = `${user.toLowerCase()}-${marketId}-${direction}-${Math.round(targetValueX * 1000)}`;

            await prisma.user.upsert({
              where: { walletAddress: user.toLowerCase() },
              create: { walletAddress: user.toLowerCase() },
              update: {},
            });

            await prisma.position.upsert({
              where: { positionId },
              create: {
                positionId,
                userAddress: user.toLowerCase(),
                marketId,
                targetValueX,
                direction: direction as 'ABOVE' | 'BELOW',
                tokensMinted: tokensFloat,
                stakeAmount,
              },
              update: {
                tokensMinted: { increment: tokensFloat },
                stakeAmount: { increment: stakeAmount },
              },
            });

            console.log(`📝 Position upserted — ${user} ${direction} @${targetValueX.toFixed(2)}`);
          } catch (err) {
            console.error('❌ TradeExecuted handler error:', err);
          }
        }
      },
    })
  );

}

/**
 * Handles a MarketCreated event from the Factory: upserts the new market into
 * Prisma (reading its initial μ/σ/σ_min from the freshly deployed AMM proxy),
 * starts watching its events, and notifies all connected clients.
 */
async function handleMarketCreatedOnChain(
  marketId: string,
  ammAddress: string,
  routerAddress: string,
  lpTokenAddress: string,
): Promise<void> {
  if (config.EXCLUDED_MARKET_IDS.includes(marketId)) {
    console.log(`🚫 Market ${marketId} is excluded (EXCLUDED_MARKET_IDS) — ignoring MarketCreated`);
    return;
  }
  console.log(`🆕 MarketCreated — market ${marketId} (AMM: ${ammAddress})`);

  let currentMu = 0;
  let currentSigma = 0;
  let totalLiquidity = 0;
  let minVarianceBound = 0;

  try {
    const state = await getMarketState(ammAddress);
    currentMu = state.mu;
    currentSigma = state.sigma;
    totalLiquidity = state.totalLiquidity;
  } catch (err) {
    console.warn(`⚠️  Could not read initial state for market ${marketId}:`, err);
  }
  minVarianceBound = await getSigmaMin(ammAddress);

  // Title is immutable on-chain — read it from the Factory. Only overwrite an
  // existing row's title when the chain returns a non-empty value, so a factory
  // without the getter never clobbers a good title with a placeholder.
  const onChainTitle = await getMarketTitle(marketId);

  await prisma.market.upsert({
    where: { marketId },
    update: {
      ammAddress,
      routerAddress,
      lpTokenAddress,
      currentMu,
      currentSigma,
      totalLiquidity,
      minVarianceBound,
      ...(onChainTitle ? { title: onChainTitle } : {}),
    },
    create: {
      marketId,
      title: onChainTitle || `Market #${marketId}`,
      category: 'general',
      currentMu,
      currentSigma,
      totalLiquidity,
      minVarianceBound,
      ammAddress,
      routerAddress,
      lpTokenAddress,
    },
  });

  await watchMarket({ marketId, ammAddress, routerAddress });
  broadcastMarketCreated(marketId);
}

/**
 * Starts watching on-chain events for ALL markets in the DB, plus the Factory's
 * MarketCreated event — newly created markets are upserted into the DB and
 * watched immediately, without a restart or re-seed.
 *
 * Returns the (live) array of unwatch functions for graceful shutdown; watchers
 * registered later for new markets are appended to the same array.
 */
export async function startChainWatcher(): Promise<WatchContractEventReturnType[]> {
  // Floor any rows left with negative liquidity by the pre-fix decrement bug.
  await prisma.market.updateMany({
    where: { totalLiquidity: { lt: 0 } },
    data: { totalLiquidity: 0 },
  });

  const factoryAddress = config.FACTORY_ADDRESS as `0x${string}`;

  // Reconcile DB against the Factory: watchContractEvent only sees future
  // events, so any market created while the backend was down must be picked
  // up here by comparing on-chain market count with DB rows.
  try {
    const marketCount = Number(await publicClient.readContract({
      address: factoryAddress,
      abi: factoryAbi,
      functionName: 'getMarketCount',
    }));
    for (let i = 0; i < marketCount; i++) {
      const marketId = i.toString();
      if (config.EXCLUDED_MARKET_IDS.includes(marketId)) {
        console.log(`🚫 Market ${marketId} is excluded (EXCLUDED_MARKET_IDS) — skipping backfill`);
        continue;
      }
      const exists = await prisma.market.findUnique({ where: { marketId } });
      if (exists) continue;

      const id = BigInt(i);
      const [amm, router, lpToken] = await Promise.all([
        publicClient.readContract({ address: factoryAddress, abi: factoryAbi, functionName: 'getMarketAmm', args: [id] }),
        publicClient.readContract({ address: factoryAddress, abi: factoryAbi, functionName: 'getMarketRouter', args: [id] }),
        publicClient.readContract({ address: factoryAddress, abi: factoryAbi, functionName: 'getMarketLpToken', args: [id] }),
      ]);
      console.log(`🔎 Market ${marketId} exists on-chain but not in DB — backfilling`);
      await handleMarketCreatedOnChain(marketId, amm as string, router as string, lpToken as string);
    }
  } catch (err) {
    console.error('❌ Factory reconciliation failed:', err);
  }

  const markets = await prisma.market.findMany({
    where: config.EXCLUDED_MARKET_IDS.length > 0
      ? { marketId: { notIn: config.EXCLUDED_MARKET_IDS } }
      : undefined,
    select: { marketId: true, ammAddress: true, routerAddress: true },
  });

  if (markets.length === 0) {
    console.warn('⚠️  No markets in DB — Factory watcher will still pick up new markets.');
  }

  for (const market of markets) {
    if (!market.ammAddress || !market.routerAddress) {
      console.warn(`⚠️  Market ${market.marketId} missing AMM/Router address — skipping watcher`);
      continue;
    }

    // Resync liquidity from the AMM's actual USDC balance, and the immutable
    // title from the Factory, so the persisted values are correct on boot (not
    // just on the next event). Title is only overwritten when the chain returns
    // a non-empty value.
    try {
      const [state, onChainTitle] = await Promise.all([
        getMarketState(market.ammAddress),
        getMarketTitle(market.marketId),
      ]);
      await prisma.market.update({
        where: { marketId: market.marketId },
        data: {
          totalLiquidity: state.totalLiquidity,
          ...(onChainTitle ? { title: onChainTitle } : {}),
        },
      });
      console.log(`🧹 Synced market ${market.marketId} liquidity from chain: $${state.totalLiquidity}`);
    } catch (err) {
      console.error(`❌ Startup liquidity resync failed for market ${market.marketId}:`, err);
    }

    await watchMarket(market);
  }

  // ── MarketCreated (Factory) ────────────────────────────────────────────
  allUnwatchers.push(
    publicClient.watchContractEvent({
      address: factoryAddress,
      abi: factoryAbi,
      eventName: 'MarketCreated',
      onLogs: async (logs) => {
        for (const log of logs) {
          try {
            const { market_id, amm, router, lp_token } = log.args as {
              market_id: bigint;
              amm: string;
              router: string;
              lp_token: string;
            };
            await handleMarketCreatedOnChain(market_id.toString(), amm, router, lp_token);
          } catch (err) {
            console.error('❌ MarketCreated handler error:', err);
          }
        }
      },
    })
  );
  console.log(`⛓️  Watching MarketCreated on Factory ${factoryAddress}`);

  console.log(`✅ Chain watcher active — ${watchedAmms.size} market(s) + factory`);

  return allUnwatchers;
}
