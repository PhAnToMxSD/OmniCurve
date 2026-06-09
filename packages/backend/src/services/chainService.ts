/**
 * On-chain sync service — watches AMM and Router contract events via viem
 * and pushes state updates into Prisma + Socket.io.
 *
 * Watches the single market configured in .env (DISTRIBUTION_AMM_ADDRESS / ROUTER_ADDRESS).
 */

import { createPublicClient, http, formatEther, formatUnits, type WatchContractEventReturnType } from 'viem';
import { arbitrumSepolia } from 'viem/chains';
import { config } from '../config';
import prisma from '../models/db';
import { ammAbi, routerAbi, lpTokenAbi } from '../db/abis';
import { broadcastMarketUpdate, broadcastMarketResolved } from '../sockets/socketManager';
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

/**
 * Starts watching on-chain events for the configured AMM and Router.
 * Returns an array of unwatch functions for graceful shutdown.
 */
export async function startChainWatcher(): Promise<WatchContractEventReturnType[]> {
  const ammAddress = config.DISTRIBUTION_AMM_ADDRESS as `0x${string}`;
  const routerAddress = config.ROUTER_ADDRESS as `0x${string}`;

  // Resolve the marketId for this AMM from Prisma
  const market = await prisma.market.findFirst({
    where: { ammAddress: config.DISTRIBUTION_AMM_ADDRESS },
  });

  const marketId = market?.marketId ?? '0';

  // Floor any rows left with negative liquidity by the pre-fix decrement bug,
  // then resync the configured market's liquidity from the AMM's actual USDC
  // balance so the persisted value is correct on boot (not just on the next event).
  await prisma.market.updateMany({
    where: { totalLiquidity: { lt: 0 } },
    data: { totalLiquidity: 0 },
  });
  if (market) {
    try {
      const state = await getMarketState(config.DISTRIBUTION_AMM_ADDRESS);
      await prisma.market.update({
        where: { marketId: market.marketId },
        data: { totalLiquidity: state.totalLiquidity },
      });
      console.log(`🧹 Synced market ${market.marketId} liquidity from chain: $${state.totalLiquidity}`);
    } catch (err) {
      console.error('❌ Startup liquidity resync failed:', err);
    }
  }

  console.log(`⛓️  Watching events on AMM ${ammAddress} (market ${marketId})`);
  console.log(`⛓️  Watching events on Router ${routerAddress}`);

  const unwatchers: WatchContractEventReturnType[] = [];

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

  console.log(`✅ Chain watcher active — listening for 5 event types`);

  return unwatchers;
}
