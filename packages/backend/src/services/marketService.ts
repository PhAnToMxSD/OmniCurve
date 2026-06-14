import prisma from '../models/db';
import { config } from '../config';

export const getMarkets = async (filters: { category?: string; active?: boolean }) => {
  const where: any = {};

  if (filters.category) {
    where.category = filters.category;
  }

  if (filters.active !== undefined) {
    if (filters.active) {
      where.totalLiquidity = { gt: 0 };
    }
  }

  // Hide retired/stale markets even if a row still exists in the DB.
  if (config.EXCLUDED_MARKET_IDS.length > 0) {
    where.marketId = { notIn: config.EXCLUDED_MARKET_IDS };
  }

  return prisma.market.findMany({
    where,
    orderBy: { totalLiquidity: 'desc' },
  });
};

export const getMarketDetails = async (marketId: string) => {
  // Excluded markets are treated as if they don't exist.
  if (config.EXCLUDED_MARKET_IDS.includes(marketId)) {
    return null;
  }

  return prisma.market.findUnique({
    where: { marketId },
    include: {
      positions: true,
    }
  });
};
