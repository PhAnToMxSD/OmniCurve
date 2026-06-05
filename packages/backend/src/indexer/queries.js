require('dotenv').config({ path: require('path').resolve(__dirname, '../../../../.env') });
const { GraphQLClient, gql } = require('graphql-request');

const GOLDSKY_GRAPHQL_ENDPOINT = process.env.GOLDSKY_GRAPHQL_ENDPOINT || 'https://api.goldsky.com/api/public/project_id/subgraphs/omnicurve-amm/1.0.0/graphql';

const client = new GraphQLClient(GOLDSKY_GRAPHQL_ENDPOINT);

const GET_GLOBAL_CURVE = gql`
  query GetGlobalCurve {
    curveUpdateds(first: 1, orderBy: timestamp_, orderDirection: desc) {
      new_mu
      new_sigma
      timestamp_
      transactionHash_
    }
  }
`;

const GET_RECENT_TRADES = gql`
  query GetRecentTrades($first: Int = 10) {
    tradeExecuteds(first: $first, orderBy: timestamp_, orderDirection: desc) {
      user
      target_price
      is_yes
      timestamp_
      transactionHash_
    }
  }
`;

async function getGlobalCurve() {
  try {
    const data = await client.request(GET_GLOBAL_CURVE);
    // Return the single most recent curve state
    return data.curveUpdateds[0] || null;
  } catch (error) {
    console.error('Error fetching global curve:', error);
    throw error;
  }
}

async function getRecentTrades(count = 10) {
  try {
    const data = await client.request(GET_RECENT_TRADES, { first: count });
    return data.tradeExecuteds || [];
  } catch (error) {
    console.error('Error fetching recent trades:', error);
    throw error;
  }
}

module.exports = {
  getGlobalCurve,
  getRecentTrades
};
