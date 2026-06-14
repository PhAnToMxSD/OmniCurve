
<div align="center">

# 🌊 OmniCurve

### A Unified Continuous Distribution Prediction Market Protocol

**Built on Arbitrum Stylus · Powered by Rust + WASM · Priced by Gaussian Mathematics**

[![Built with Rust](https://img.shields.io/badge/Built%20with-Rust-orange?style=for-the-badge&logo=rust)](https://www.rust-lang.org/)
[![Arbitrum Stylus](https://img.shields.io/badge/Arbitrum-Stylus-12AAFF?style=for-the-badge&logo=arbitrum)](https://docs.arbitrum.io/stylus/gentle-introduction)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](#11-project-license)
[![Network: Sepolia](https://img.shields.io/badge/Network-Arbitrum%20Sepolia-blue?style=for-the-badge)](https://sepolia.arbiscan.io/)

[![Stack](https://img.shields.io/badge/Frontend-React%20%2B%20Vite%20%2B%20d3-61DAFB?style=flat-square&logo=react)](#)
[![Backend](https://img.shields.io/badge/Backend-Express%205%20%2B%20Socket.io-339933?style=flat-square&logo=node.js)](#)
[![DB](https://img.shields.io/badge/DB-PostgreSQL%20%2B%20Prisma-2D3748?style=flat-square&logo=prisma)](#)
[![Indexer](https://img.shields.io/badge/Indexer-Goldsky%20Subgraph-7C3AED?style=flat-square)](#)

</div>

**OmniCurve** is a novel prediction market protocol built on **Arbitrum Stylus** (Rust compiled to WASM). Instead of fragmenting liquidity across many separate binary "yes/no" pools, OmniCurve collapses all possible outcomes into a **single continuous liquidity curve** — an "omni-curve" — governed by a normal Gaussian probability density function. Our mission is to deliver a capital-efficient, mathematically precise, and demand-responsive platform for the future of prediction markets. This enables users stake value for the many different possible outcomes under a single pool, preventing the liquidity from being fragmented. 

The core of **OmniCurve** translates the continuous Gaussian distribution into a fully on-chain pricing engine using fixed-point WAD arithmetic, an Abramowitz & Stegun error function approximation, and an 18-term Taylor series exponential. It provides a superior alternative to fragmented binary pool designs, which require creating a separate liquidity pool for every strike price. Instead, the users of our markets can bet under the same pool for the strike price of their choide. All of this would have been very tough to implement in native solidity, but the complex mathematical model governing our protocol could be made live on chain for extremely low gas costs, thanks to the **Arbitrum Stylus** which allowed us to use **Rust** as the primary development language which made implementing all of that math so easy. 

## Addresses and the Transaction Hashes

`Factory deployed at:` [0xde6b999e488d9b723a3409e80ea390c079f88016](https://sepolia.arbiscan.io/address/0xde6b999e488d9b723a3409e80ea390c079f88016)

`AMM Implementation:` [0x56a2a3d3d5b50ff40f84188d1f975fedb819d882](https://sepolia.arbiscan.io/address/0x56a2a3d3d5b50ff40f84188d1f975fedb819d882)

`Router Implementation:` [0xa4ed547186b992eecd7244743577baf4c541ff9d](https://sepolia.arbiscan.io/address/0xa4ed547186b992eecd7244743577baf4c541ff9d)

`LP Token Implementation:` [0x0e382e38342f28493568b98e5cab30348d6b2cab](https://sepolia.arbiscan.io/address/0x0e382e38342f28493568b98e5cab30348d6b2cab) 

`Market #0 {ETH price @ 2026} AMM Proxy:` [0x982A774dd198a0F2E582aD0F3Ecc7348D2292d3b](https://sepolia.arbiscan.io/address/0x982A774dd198a0F2E582aD0F3Ecc7348D2292d3b)

`Market #0 {ETH price @ 2026} Router Proxy:` [0x7B863fA3e629258774f2C2DcF6419abf8F07D2D7](https://sepolia.arbiscan.io/address/0x7B863fA3e629258774f2C2DcF6419abf8F07D2D7)

`Market #0 {ETH price @ 2026} LP Token Proxy:` [0x86C7Ff5421c3aa48e0f7cFa4Ea0C6bbc668488E1](https://sepolia.arbiscan.io/address/0x86C7Ff5421c3aa48e0f7cFa4Ea0C6bbc668488E1)

## Table of Contents

* [1. Overview](#1-overview)
  * [1.1 Introduction](#11-introduction)
  * [1.2 The OmniCurve Solution: Continuous Gaussian Pricing](#12-the-omnicurve-solution-continuous-gaussian-pricing)
  * [1.3 Demand-Responsive Curve Dynamics](#13-demand-responsive-curve-dynamics)
  * [1.4 Settlement Against Reality](#14-settlement-against-reality)
  * [1.5 AMM Model Comparison](#15-amm-model-comparison)
  * [1.6 Conclusion](#16-conclusion)
* [2. Architecture](#2-architecture)
  * [2.1 High-Level Workflow](#21-high-level-workflow)
  * [2.2 Contract System: EIP-1167 Proxy Factory](#22-contract-system-eip-1167-proxy-factory)
  * [2.3 Trade Execution Infrastructure](#23-trade-execution-infrastructure)
  * [2.4 Liquidity Provision Infrastructure](#24-liquidity-provision-infrastructure)
  * [2.5 Fee Distribution Infrastructure](#25-fee-distribution-infrastructure)
  * [2.6 Market Resolution Infrastructure](#26-market-resolution-infrastructure)
  * [2.7 Settlement Infrastructure](#27-settlement-infrastructure)
* [3. Features](#3-features)
* [4. Technical Overview](#4-technical-overview)
* **[Design & deep dive → DESIGN.md](./DESIGN.md)**
  * [5. Product roadmap: from hackathon PoC to consumer trading platform](./DESIGN.md#5-product-roadmap-from-hackathon-poc-to-consumer-trading-platform)
  * [6. Contract-by-contract: math meets Rust](./DESIGN.md#6-contract-by-contract-math-meets-rust)
  * [7. Arbitrum Stylus & ecosystem best practices](./DESIGN.md#7-arbitrum-stylus--ecosystem-best-practices)
  * [8. Future plans: an AI oracle for resolution](./DESIGN.md#8-future-plans-an-ai-oracle-for-resolution)
* [9. Getting Started](#9-getting-started)
  * [9.1 Prerequisites](#91-prerequisites)
  * [9.2 Installation](#92-installation)
  * [9.3 Building Contracts](#93-building-contracts)
  * [9.4 Running the Backend](#94-running-the-backend)
  * [9.5 Running the Frontend](#95-running-the-frontend)
* [10. Deployment](#10-deployment)
* [11. Project License](#11-project-license)
* [12. References](#12-references)

---

## 1. Overview

**OmniCurve** is a prediction market protocol that replaces the traditional approach of creating many separate binary outcome pools for tracking the same numerical asset with a single, unified continuous liquidity curve derived from the Gaussian (normal) distribution, serving as the base of the distribution markets where people can stake on infinite outcomes. Built on **Arbitrum Stylus** using **Rust** compiled to **WASM**, it performs all pricing mathematics entirely on-chain using **fixed-point arithmetic**.

The platform provides a complete prediction market experience: market creation, continuous-strike trading, liquidity provision and real-time analytics (AMM, Router and LP Tokens)— all powered by a full-stack monorepo spanning smart contracts, a backend API with real-time WebSocket feeds, and a React frontend.

### What led to this project?

Prediction markets have entered popular consciousness in the wake of the 2024 US Presidential elections, but the technology is likely still in its infancy. Further development could be of benefit both to developers and to the public at large. More specifically, today's prediction markets generally allow participants to express probability distributions over discrete outcomes, but many questions of relevance to the real world involve continuous outcomes. It's true that a perp market could elicit the expected value of a continuous variable from the market, but sometimes we would like to know more -- for example, do we know for sure a given project will take 10 years exactly, or could it perhaps be anywhere between 2 and 20? Do we know that a given project will have 10,000 users exactly, or could it be anywhere between 2,000 and 20,000? These questions are important, and today's prediction markets don't allow us to answer them. 


### 1.1 Introduction

#### The problem we solve: 

Existing prediction market platforms like Polymarket create separate binary pools for each possible outcome: "Will ETH be worth $5k by the end of 2026? Yes/No", "Will ETH be worth $5.1k by the end of 2026? Yes/No", and so on. Each strike price needs its own pool, its own liquidity, and its own market makers. This design leads to:

- **Fragmented liquidity**: Capital is spread thinly across many isolated pools
- **Incomplete coverage**: Only a handful of discrete strike prices are offered
- **Inefficient capital deployment**: LPs must choose which specific pool to fund

#### The Nature of Continuous Outcomes

Many real-world prediction questions don't have binary answers — they have a continuous range of possible outcomes. "What will ETH be worth at the end of 2026?" could be $500, $3,000, $10,000, or any value in between. "In what year will OpenAI release it's new model?" could be 2026, 2027, 2028, or any integer value in between. Forcing this continuous outcome space into discrete yes/no buckets is an artificial constraint that wastes capital and limits expressiveness.

#### Many markets tracking a single 

Traditional prediction markets suffer from a fundamental structural inefficiency. Consider a market on ETH's future price:

| Approach | Pools Required | Liquidity per Pool | Coverage |
|----------|---------------|-------------------|----------|
| Currently In markets | N separate pools (one per strike) | Total capital / N | Discrete strikes only |
| **OmniCurve** | **1 unified pool** | **Total capital** | **Any strike price** |

With N separate pools, each pool receives only a fraction of the total liquidity. Traders at less popular strike prices face thin order books, wide spreads, and high slippage. Market makers must actively manage positions across many pools simultaneously.

### 1.2 The OmniCurve Solution: Continuous Gaussian Pricing

OmniCurve replaces discrete pools with a **single continuous Gaussian curve**. The probability of any outcome is derived from the cumulative distribution function (CDF) of a normal distribution:

$$P_{\text{YES}}(x) = 1 - \Phi\left(\frac{x - \mu}{\sigma}\right)$$

$$P_{\text{NO}}(x) = \Phi\left(\frac{x - \mu}{\sigma}\right)$$

Where:
- $x$ is the trader's chosen strike price (any continuous value)
- $\mu$ (mu) is the market's expected value — the consensus belief of all participants
- $\sigma$ (sigma) is the market's uncertainty — how spread out beliefs are
- $\Phi$ is the cumulative distribution function of the standard normal distribution

**Economic intuition:** A YES position at strike $x$ is a bet that the final outcome will be *at or above* $x$. The further $x$ is above the current consensus $\mu$, the less likely this is, and the cheaper the YES token becomes (lower $P_{\text{YES}}$). Conversely, NO tokens become cheaper as $x$ falls further below $\mu$.

#### On-Chain Gaussian Mathematics

The Gaussian CDF is computed entirely on-chain using fixed-point WAD arithmetic (18-decimal precision). The mathematical stack consists of:

- **WAD arithmetic**: `wad_mul(a, b) = a * b / 1e18`, `wad_div(a, b) = a * 1e18 / b`
- **Error function**: Abramowitz & Stegun 5-coefficient polynomial approximation (max error ~1.5 x 10^-7):

$$\text{erf}(x) \approx 1 - (a_1 t + a_2 t^2 + a_3 t^3 + a_4 t^4 + a_5 t^5) e^{-x^2}, \quad t = \frac{1}{1 + px}$$

- **Exponential**: 18-term Taylor series expansion, clamped to [-20, +20] WAD:

$$e^x = \sum_{n=0}^{18} \frac{x^n}{n!}$$

- **Square root**: Newton's method with 128-iteration convergence
- **Gaussian CDF**: Composed from the above primitives as:

$$\Phi(z) = \frac{1}{2}\left(1 + \text{erf}\left(\frac{z}{\sqrt{2}}\right)\right)$$

All functions use I256 (signed 256-bit integer) with 18-decimal fixed-point representation, providing ~11 significant digits of precision.

### 1.3 Demand-Responsive Curve Dynamics

A critical innovation of OmniCurve is that **bettors move the curve, liquidity providers do not**.

The parameters $\mu$ and $\sigma$ are not static — they are a **stake-weighted distribution of all strike prices** bet by traders:

$$\mu = \frac{\sum w_i \cdot x_i}{\sum w_i} \qquad \sigma = \sqrt{\frac{\sum w_i \cdot x_i^2}{\sum w_i} - \mu^2}$$

Where each bet contributes weight $w_i$ (= its net stake in USDC) at strike $x_i$.

This is maintained on-chain via three running accumulators updated on every trade:

| Accumulator | Formula | Purpose |
|:------------|:--------|:--------|
| `acc_stake_weight` | $\sum w_i$ | Total conviction weight |
| `acc_weighted_x` | $\sum w_i \cdot x_i$ | Weighted strike sum (for $\mu$) |
| `acc_weighted_x_sq` | $\sum w_i \cdot x_i^2$ | Weighted strike-squared sum (for $\sigma$) |

**Why LPs cannot move the curve:** Liquidity providers are pure collateral underwriters. If LP deposits could shift $\mu$ and $\sigma$, they would be a free manipulation lever — someone could move the curve without taking any directional risk. By restricting curve movement to bettors who put capital at risk on a position, the protocol is manipulation-resistant by construction.

**The prior weight mechanism:** The market owner seeds an initial $\mu$ and $\sigma$ (a prior belief). This seed is backed by a configurable `prior_weight` of virtual stake (default: 100 WAD), so the first real bet cannot swing the curve to a single point. As more bets accumulate, the prior's influence naturally dilutes.

**Pre-update pricing:** The Router prices each bet against the curve state *before* that bet shifts it, ensuring traders see fair prices that aren't self-referentially affected by their own trade.

### 1.4 Settlement Against Reality

$\mu$ is the market's *belief*, not the boundary it settles on. A market resolves against an externally-observed final price (set manually via the Router's `set_final_price` for this hackathon PoC — no oracle).

Each position is judged against **its own strike**:
- A YES position at strike $X$ pays $1/token if and only if `final_price >= X`
- A NO position at strike $X$ pays $1/token if and only if `final_price < X`

This means a bet that moves $\mu$ around cannot change who wins — settlement is always against the real-world outcome, not the market's consensus.

### 1.5 AMM Model Comparison

The table below compares OmniCurve with the best binary AMMs currently in production, Polymarket and CPMM markets.

![Amm Market Comparison](./images/AmmComparison.png)

### 1.6 Conclusion

OmniCurve represents a paradigm shift in prediction market design: from discrete binary pools to a continuous, unified liquidity curve. By deriving prices from the Gaussian CDF and making the curve demand-responsive (bettors move it, LPs don't), the protocol achieves unified liquidity, continuous pricing, capital efficiency, and manipulation resistance in a single design. The Gaussian mathematics are computed entirely on-chain using Arbitrum Stylus's Rust-to-WASM compilation, enabling sophisticated financial engineering at layer-2 speed and almost no cost as compared to the L1. 

---

## 2. Architecture

The protocol follows a modular architecture with a clear separation between trade execution (Router), liquidity and collateral management (AMM), LP token accounting (LP Token), and market deployment (Factory). The backend provides real-time indexing and a REST + WebSocket API, while the frontend delivers a quantitative-finance-inspired terminal UI.

### 2.1 High-Level Workflow

![High Level Architecture](./images/HighLevelArch.png)

**User Journey:**

![User flow chart](./images/UserFlow.png)

### 2.2 Contract System: EIP-1167 Proxy Factory

The protocol uses an **EIP-1167 minimal proxy (clone) factory pattern**. Implementation contracts are deployed once; the Factory clones them per-market via CREATE2, giving each market its own trio of proxy contracts with independent storage. Since in rust contracts via stylus, CREATE2 cannot be directly implemented, so this is the flow of the function that creates new markets - 

```
OmniCurveFactory.createMarket(usdc, sigma_min)
  ├── deploys AMM Proxy      ──DELEGATECALL──→ AMM Implementation (this is cloned into new instances of AMM proxy)
  ├── deploys Router Proxy   ──DELEGATECALL──→ Router Implementation (this is cloned into new instances of Router Proxy)
  ├── deploys LP Token Proxy ──DELEGATECALL──→ LP Token Implementation (this is cloend into new instances of LP token proxy)
  ├── initializes & wires all three:
  │     AMM ↔ Router (bidirectional)
  │     AMM → LP Token (mint/burn authority)
  │     AMM → USDC token address
  │     AMM → sigma_min floor
  ├── LP Token owner = AMM proxy
  └── transfers AMM + Router ownership to caller (two-step acceptance)
```

**Module Breakdown:**

| Module | Responsibility | Key Functions |
|:-------|:--------------|:-------------|
| `distribution_amm.rs` | Core AMM: liquidity pool, Gaussian params, fee accumulator, collateral custody, curve recomputation | `add_liquidity`, `remove_liquidity`, `underwrite_trade`, `distribute_fee`, `recompute_curve` |
| `binary_router.rs` | Trade execution: CDF pricing, USDC transfers, position bookkeeping, settlement | `buy_yes`, `buy_no`, `set_final_price`, `claim_winnings`, `release_losing_collateral` |
| `factory.rs` | EIP-1167 clone deployer, CREATE2, market registry | `create_market`, `get_market_amm/router/lp_token` |
| `lp_token.rs` | Non-transferable ERC-20 LP receipt token | `mint`, `burn` (AMM-only); `transfer` always reverts |
| `math_core.rs` | On-chain Gaussian math: PDF, CDF, erf, exp, sqrt, WAD arithmetic | `normal_cdf`, `normal_pdf`, `erf_approx`, `exp_wad`, `sqrt_wad` |
| `interfaces.rs` | Cross-contract call interfaces (IERC20, IProxyAmm, etc.) | Solidity-style interface definitions |

### 2.3 Trade Execution Infrastructure

Trading in OmniCurve allows users to express beliefs about continuous outcomes by purchasing YES or NO tokens at any strike price.

**Core Functions:** `buy_yes(target_price, stake_usdc)` and `buy_no(target_price, stake_usdc)` on the Router.

**Execution Flow:**

![User who bets follows these steps](./images/BettorFlow.png)

**Token IDs:** YES = 1, NO = 2

### 2.4 Liquidity Provision Infrastructure

Liquidity providers in OmniCurve are pure collateral underwriters — they fund the pool that pays out winning bets, and earn trading fees in return.

**Core Functions:** `add_liquidity(amount_wad, target_mu, target_sigma)` and `remove_liquidity(shares_to_remove)` on the AMM.

**Key Design: Curve-Neutral Deposits**

Unlike traditional AMMs where LP deposits affect the trading curve, OmniCurve LP deposits are **strictly curve-neutral**. The `target_mu` and `target_sigma` parameters exist for ABI backward compatibility but are ignored — LPs always provide at the current $\mu/\sigma$ and never shift the curve.

![Add and remove liquidity flow diagrams](./images/LiquidityFlow.png)

### 2.5 Fee Distribution Infrastructure

OmniCurve uses a **MasterChef-style fee accumulator** to distribute trading fees to LPs proportionally without requiring gas-intensive iteration.

**Mechanism:**

- Each trade's 1% fee is sent to the AMM via `distribute_fee`, updating a global accumulator: `acc_fee_per_share`
- Each LP's pending fees = `shares * acc_fee_per_share - reward_debt`
- On deposit, `reward_debt` is set to `shares * acc_fee_per_share` (so new LPs don't claim old fees)
- On withdrawal or `claim_fees`, pending fees are calculated and transferred

This pattern provides O(1) fee distribution regardless of the number of LPs.

### 2.6 Market Resolution Infrastructure

Resolution uses a **two-phase timelock** to provide a dispute window.

**Flow:**

1. **Propose:** Owner calls `propose_resolution(winning_id)` — starts a 24-hour timer
2. **Wait:** Anyone can inspect the proposal during the 24h window; owner can `cancel_resolution`
3. **Execute:** After the timer expires, `execute_resolution()` finalizes the market
4. The market's `is_resolved` flag is set, disabling further trading and liquidity operations

### 2.7 Settlement Infrastructure

After resolution, participants settle positions through a **pull-based claiming** model.

**For Winners:**

- `claim_winnings(target_x, is_yes)` on the Router
- A YES position at strike $X$ wins if `final_price >= X`; a NO position wins if `final_price < X`
- Winning tokens are burned, and USDC is paid out from the AMM's collateral pool

**For Losing Positions:**

- `release_losing_collateral(target_x, is_yes)` — permissionless
- Frees LP collateral that was locked against a position that lost
- Returns the collateral to the available liquidity pool for LP withdrawal

---

## 3. Features

- **Unified Continuous Liquidity:** One pool serves all strike prices — no liquidity fragmentation. Any continuous strike price gets an instant, mathematically derived price from the Gaussian CDF.

- **Demand-Responsive Curve:** $\mu$ and $\sigma$ are stake-weighted aggregates of all bets. The curve tracks collective market belief and requires capital at risk to move — manipulation-resistant by construction.

- **Curve-Neutral LP Deposits:** Liquidity providers are pure collateral underwriters. Their deposits never shift the curve, preventing free manipulation via liquidity.

- **On-Chain Gaussian Mathematics:** Full CDF/PDF computation on-chain using Abramowitz & Stegun erf approximation, 18-term Taylor series exponential, and Newton's method square root — all in 18-decimal fixed-point WAD arithmetic (~11 significant digits).

- **EIP-1167 Proxy Factory:** Deploy unlimited markets from singleton implementations via CREATE2 clones. Each market gets its own isolated storage with shared, gas-efficient implementation code.

- **MasterChef Fee Distribution:** Trading fees (1% per trade) distributed to LPs proportionally via a global accumulator — O(1) gas regardless of LP count.

- **Non-Transferable LP Positions:** LP tokens cannot be traded, simplifying fee accounting and preventing LP position speculation.

- **Two-Phase Resolution with Timelock:** 24-hour dispute window between proposal and execution for market resolution.

- **Real-Time Backend:** Express 5 + Socket.io server watches on-chain events, maintains a PostgreSQL database via Prisma, and broadcasts live curve updates to connected frontends.

- **Quantitative Terminal UI:** React + Vite frontend with d3-powered Gaussian curve visualization, live ETH spot price overlay, and a "signal/noise" design aesthetic inspired by quantitative finance terminals.

---

## 4. Technical Overview

| Layer | Technology |
|-------|------------|
| Smart Contracts | Rust (`#![no_std]`), Arbitrum Stylus SDK v0.10.7, compiled to `wasm32-unknown-unknown` |
| Monorepo | pnpm workspaces |
| Backend API | Node.js, TypeScript, Express 5, Socket.io |
| Database | Prisma ORM + PostgreSQL |
| Indexer | Goldsky subgraph (from-ABI deployment), GraphQL |
| Frontend | React + TypeScript + Vite + Tailwind + Wagmi/Viem + d3 |
| Shared Types | TypeScript package with ABI exports |
| Deployment | Arbitrum Sepolia testnet |

## Deep dive: design, internals & roadmap

The in-depth material — the product roadmap, the contract-by-contract walkthrough of how
the Gaussian math maps to Rust, Arbitrum Stylus engineering practices, and the planned
multi-agent AI oracle for resolution — lives in **[DESIGN.md](./DESIGN.md)**:

* [5. Product roadmap: from hackathon PoC to consumer trading platform](./DESIGN.md#5-product-roadmap-from-hackathon-poc-to-consumer-trading-platform)
* [6. Contract-by-contract: math meets Rust](./DESIGN.md#6-contract-by-contract-math-meets-rust)
* [7. Arbitrum Stylus & ecosystem best practices](./DESIGN.md#7-arbitrum-stylus--ecosystem-best-practices)
* [8. Future plans: an AI oracle for resolution](./DESIGN.md#8-future-plans-an-ai-oracle-for-resolution)


---

## 9. Getting Started

Follow these instructions to set up the project locally for development and testing.

### 9.1 Prerequisites

- **Rust** (1.88.0+) with `wasm32-unknown-unknown` target
- **Cargo Stylus CLI** for contract deployment
- **Node.js** (v18+) and **pnpm** for the monorepo
- **PostgreSQL** for the backend database
- **Foundry** (optional, for Solidity-based integration tests)

### 9.2 Installation

Clone the repository and install all workspace dependencies:

```bash
git clone <repository_url>
cd OmniCurve
pnpm install
```

### 9.3 Building Contracts

Each contract is compiled separately using Cargo feature flags, producing four WASM binaries from a single crate:

```bash
cd packages/contracts

# Build each contract
cargo build --target wasm32-unknown-unknown --features amm --release
cargo build --target wasm32-unknown-unknown --features router --release
cargo build --target wasm32-unknown-unknown --features lp-token --release
cargo build --target wasm32-unknown-unknown --features factory --release

# Run math unit tests
cargo test
```

### 9.4 Running the Backend

```bash
# Set up environment variables (see .env.example)
# Required: DATABASE_URL, RPC_URL, contract addresses

# Apply database migrations and seed from on-chain state
pnpm --filter @omnicurve/backend db:migrate
pnpm --filter @omnicurve/backend db:seed

# Start the API server (port 3001)
pnpm --filter @omnicurve/backend start:api
```

### 9.5 Running the Frontend

```bash
# Start the Vite dev server
pnpm --filter @omnicurve/frontend dev
```

The frontend connects to the backend API at `localhost:3001` and to Arbitrum Sepolia via Wagmi/Viem.

---

## 10. Deployment

### Contract Deployment

Deploy implementation contracts as singletons, then use the Factory to create markets:

```bash
RPC_URL="https://sepolia-rollup.arbitrum.io/rpc"
KEY=<PRIVATE_KEY>

# 1. Deploy each implementation contract
cargo stylus deploy --features amm \
  --private-key $KEY --endpoint $RPC_URL --no-verify \
  --wasm-file target/wasm32-unknown-unknown/release/omnicurve_contracts.wasm

cargo stylus deploy --features router \
  --private-key $KEY --endpoint $RPC_URL --no-verify \
  --wasm-file target/wasm32-unknown-unknown/release/omnicurve_contracts.wasm

cargo stylus deploy --features lp-token \
  --private-key $KEY --endpoint $RPC_URL --no-verify \
  --wasm-file target/wasm32-unknown-unknown/release/omnicurve_contracts.wasm

cargo stylus deploy --features factory \
  --private-key $KEY --endpoint $RPC_URL --no-verify \
  --wasm-file target/wasm32-unknown-unknown/release/omnicurve_contracts.wasm

# 2. Initialize the Factory with implementation addresses
cast send <FACTORY> \
  "initialize(address,address,address,address)" \
  <OWNER> <AMM_IMPL> <ROUTER_IMPL> <LP_TOKEN_IMPL> \
  --private-key $KEY --rpc-url $RPC_URL

# 3. Create a market
cast send <FACTORY> \
  "createMarket(address,int256)" \
  <USDC_ADDRESS> <SIGMA_MIN_WAD> \
  --private-key $KEY --rpc-url $RPC_URL

# 4. Accept ownership on AMM and Router proxies
cast send <AMM_PROXY> "acceptOwnership()" --private-key $KEY --rpc-url $RPC_URL
cast send <ROUTER_PROXY> "acceptOwnership()" --private-key $KEY --rpc-url $RPC_URL

# 5. Seed the initial distribution
cast send <AMM_PROXY> "setDistribution(int256,int256)" <MU_WAD> <SIGMA_WAD> \
  --private-key $KEY --rpc-url $RPC_URL
```

### Deployed Addresses (Arbitrum Sepolia)

| Contract | Address |
|----------|---------|
| AMM Implementation | `0x56a2a3d3d5b50ff40f84188d1f975fedb819d882` |
| Router Implementation | `0xa4ed547186b992eecd7244743577baf4c541ff9d` |
| LP Token Implementation | `0x0e382e38342f28493568b98e5cab30348d6b2cab` |
| Factory | `0xde6b999e488d9b723a3409e80ea390c079f88016` |
| Market #0 AMM Proxy | `0x982A774dd198a0F2E582aD0F3Ecc7348D2292d3b` |
| Market #0 Router Proxy | `0x7B863fA3e629258774f2C2DcF6419abf8F07D2D7` |
| Market #0 LP Token Proxy | `0x86C7Ff5421c3aa48e0f7cFa4Ea0C6bbc668488E1` |
| USDC | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` |

---


## 11. Project License

This project is licensed under the **MIT License**.

---

## 12. References

- **Gaussian Distribution (Normal Distribution):** [Wikipedia — Normal Distribution](https://en.wikipedia.org/wiki/Normal_distribution)
- **Abramowitz & Stegun Error Function Approximation:** Handbook of Mathematical Functions, Formula 7.1.26
- **EIP-1167 Minimal Proxy Standard:** [EIP-1167](https://eips.ethereum.org/EIPS/eip-1167)
- **Arbitrum Stylus Documentation:** [Arbitrum Stylus](https://docs.arbitrum.io/stylus/gentle-introduction)
- **MasterChef Fee Distribution Pattern:** [SushiSwap MasterChef](https://docs.sushi.com/)
- **Distribution Market Design:** [Paradigm Distribution Market Research](https://www.paradigm.xyz/2024/12/distribution-markets)
- **Prediction Market Design:** [Paradigm PM-AMM Research](https://www.paradigm.xyz/2024/11/pm-amm)
- **Multi-Agent AI Oracle (planned resolution layer):** Tarun Kota, *Design and Evaluation of Multi-Agent AI Oracle Systems for Prediction Market Resolution* — [arXiv:2605.30802](https://arxiv.org/pdf/2605.30802)
