import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../models/db';
import { calculateExpectedPrices } from '../services/mathService';
import {
  getLpTokenBalance,
  getAccFeePerShare,
  getRewardDebt,
  computePendingRewards,
} from '../services/chainService';

const router = Router();

/**
 * GET /api/users/:address/portfolio
 *
 * Returns all positions for a given wallet address, enriched with
 * current token value estimates and market state.
 */
router.get('/:address/portfolio', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const address = String(req.params.address);

    // Validate Ethereum address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid Ethereum address format',
      });
    }

    const positions = await prisma.position.findMany({
      where: { userAddress: address.toLowerCase() },
      include: { market: true },
    });

    // Enrich each position with current value estimate
    const enrichedPositions = positions.map((pos) => {
      const market = pos.market;
      let currentValue = 0;
      let status: 'active' | 'won' | 'lost' = 'active';

      if (market.isResolved) {
        // Resolved: value is tokensMinted if on winning side, else 0
        const isYes = pos.direction === 'ABOVE';
        const winningId = market.winningTokenId;

        // winningTokenId "0" = NO won, "1" = YES won (convention)
        const userWon = (isYes && winningId === '1') || (!isYes && winningId === '0');
        currentValue = userWon ? pos.tokensMinted : 0;
        status = userWon ? 'won' : 'lost';
      } else {
        // Not resolved: estimate value from current prices
        const prices = calculateExpectedPrices(
          pos.targetValueX,
          market.currentMu,
          market.currentSigma,
        );
        const currentPrice = pos.direction === 'ABOVE' ? prices.pYes : prices.pNo;
        currentValue = pos.tokensMinted * currentPrice;
      }

      return {
        positionId: pos.positionId,
        marketId: pos.marketId,
        marketTitle: market.title,
        direction: pos.direction,
        targetValueX: pos.targetValueX,
        tokensMinted: pos.tokensMinted,
        stakeAmount: pos.stakeAmount,
        currentValue,
        status,
        market: {
          title: market.title,
          ammAddress: market.ammAddress,
          routerAddress: market.routerAddress,
          lpTokenAddress: market.lpTokenAddress,
          currentMu: market.currentMu,
          currentSigma: market.currentSigma,
          totalLiquidity: market.totalLiquidity,
          isResolved: market.isResolved,
          winningTokenId: market.winningTokenId,
        },
      };
    });

    // ─── LP positions ────────────────────────────────────────────────────
    // Trade positions only cover users who bought YES/NO tokens. Liquidity
    // providers never create Position rows, so their on-chain LP balance must
    // be read directly. Scan every market and include any with a non-zero LP
    // balance for this wallet, enriched with pending fee rewards.
    const markets = await prisma.market.findMany();

    const lpPositionResults = await Promise.all(
      markets.map(async (market) => {
        try {
          const lpBalance = await getLpTokenBalance(market.ammAddress, address);
          if (lpBalance <= 0) return null;

          const accFeePerShare = await getAccFeePerShare(market.ammAddress);
          const rewardDebt = await getRewardDebt(market.ammAddress, address);
          const pendingRewards = computePendingRewards(lpBalance, accFeePerShare, rewardDebt);

          return {
            marketId: market.marketId,
            marketTitle: market.title,
            lpBalance,
            pendingRewards,
            market: {
              title: market.title,
              ammAddress: market.ammAddress,
              routerAddress: market.routerAddress,
              lpTokenAddress: market.lpTokenAddress,
              totalLiquidity: market.totalLiquidity,
              isResolved: market.isResolved,
              winningTokenId: market.winningTokenId,
            },
          };
        } catch (err) {
          // A single market's read failing shouldn't blank the whole portfolio
          console.error(`LP read failed for market ${market.marketId}:`, err);
          return null;
        }
      }),
    );

    const lpPositions = lpPositionResults.filter(
      (p): p is NonNullable<typeof p> => p !== null,
    );

    const totalValue = enrichedPositions.reduce((sum, p) => sum + p.currentValue, 0);

    res.status(200).json({
      success: true,
      data: {
        address,
        positionCount: enrichedPositions.length,
        positions: enrichedPositions,
        lpPositions,
        totalValue,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
