# OmniCurve — Full Project Context

## What is OmniCurve?

OmniCurve is a **unified continuous distribution prediction market protocol** built on **Arbitrum Stylus** (Rust compiled to WASM). The name comes from its core innovation: instead of creating many separate binary "yes/no" prediction pools (like Polymarket), OmniCurve collapses all possible outcomes into a **single continuous liquidity curve** — an "omni-curve" — governed by a Gaussian (normal) probability density function.

### The Core Idea

Traditional prediction markets create discrete binary pools: "Will BTC hit $100k? Yes/No." Each price point needs its own pool, fragmenting liquidity. OmniCurve replaces this with a single pool where the **probability of any outcome is derived from the cumulative distribution function (CDF) of a Gaussian distribution**:

- **P_YES(x)** = 1 − CDF(x, μ, σ) — probability that the outcome exceeds strike price x
- **P_NO(x)** = CDF(x, μ, σ) — probability that the outcome is at or below strike price x

Where μ (mu) is the market's expected value (mean) and σ (sigma) is the market's uncertainty (standard deviation).

**μ/σ are demand-responsive: bettors move the curve, LPs do not.** The owner seeds an initial μ/σ (a prior), and from then on every bet folds into a **stake-weighted distribution of strike prices** — `μ = Σ(wᵢ·xᵢ)/Σwᵢ`, `σ = sqrt(E[x²] − μ²)` where each bet contributes weight `wᵢ` = its net stake at strike `xᵢ`. This means the curve reflects the *aggregate belief of the market*, and moving it always requires putting capital at risk on a position (manipulation-resistant). **Liquidity providers are pure collateral/underwriters: their deposits never shift μ/σ** — a belief input without directional risk would be a free manipulation lever, so it is disallowed by construction (LP deposits simply never touch the curve accumulators). See *Key Design Decisions* for the full rationale.

**Settlement is against the real world, not μ.** μ is the market's *belief*, not the boundary it settles on. A market resolves against an externally-observed final price (manual for this hackathon PoC — no oracle), set via the Router's `set_final_price`. Each YES position at strike X pays $1/token iff `final_price ≥ X`.

### Why it matters

1. **Unified liquidity**: One pool serves all strike prices, not N separate pools
2. **Continuous pricing**: Any strike price gets an instant, mathematically derived price
3. **Capital efficiency**: LPs provide liquidity once; it covers the full outcome space
4. **On-chain math**: The Gaussian CDF is computed entirely on-chain using fixed-point WAD arithmetic and an Abramowitz & Stegun error function approximation

---

## Technical Stack

| Layer | Technology |
|-------|------------|
| Smart Contracts | Rust (`#![no_std]`), Arbitrum Stylus SDK v0.10.7, compiled to `wasm32-unknown-unknown` |
| Monorepo | pnpm workspaces |
| Backend API | Node.js, TypeScript, Express 5, Socket.io |
| Database | Prisma ORM + PostgreSQL, migrations in `prisma/migrations/` |
| Indexer | Goldsky subgraph (from-ABI deployment), GraphQL |
| Frontend | React + TypeScript + Vite + Tailwind + Wagmi/Viem + d3 (built) |
| Shared Types | TypeScript package with ABI exports |
| Deployment | Arbitrum Sepolia testnet |

---

## Monorepo Structure

```
OmniCurve/
├── packages/
│   ├── contracts/          # Arbitrum Stylus Rust smart contracts
│   │   ├── src/
│   │   │   ├── main.rs             # Feature-gated entrypoint (amm/router/factory/lp-token)
│   │   │   ├── lib.rs              # Module declarations with feature gates
│   │   │   ├── distribution_amm.rs # Core AMM: liquidity, fees, resolution, USDC custody
│   │   │   ├── binary_router.rs    # Trade execution: buyYes/buyNo, CDF pricing, positions
│   │   │   ├── factory.rs          # EIP-1167 minimal proxy factory, CREATE2 deployment
│   │   │   ├── lp_token.rs         # Non-transferable ERC-20 LP receipt token
│   │   │   ├── math_core.rs        # Gaussian PDF/CDF, erf approximation, WAD arithmetic
│   │   │   └── interfaces.rs       # Cross-contract interfaces (IERC20, IProxyAmm, etc.)
│   │   ├── test/
│   │   │   └── OmniCurve.t.sol     # Foundry tests with mock contracts
│   │   ├── Cargo.toml              # Rust dependencies and feature flags
│   │   ├── Stylus.toml             # Stylus network endpoints
│   │   ├── rust-toolchain.toml     # Rust 1.88.0 with wasm32 target
│   │   └── README.md               # Deployment guide and deployed addresses
│   │
│   ├── backend/            # Node.js API & real-time server
│   │   ├── src/
│   │   │   ├── server.ts           # Express 5 entry point (port 3001)
│   │   │   ├── config.ts           # Zod-validated environment config
│   │   │   ├── controllers/
│   │   │   │   └── marketController.ts  # Market REST handlers
│   │   │   ├── services/
│   │   │   │   ├── marketService.ts     # Prisma queries for markets
│   │   │   │   ├── indexerService.ts    # Goldsky event ingestion (idempotent)
│   │   │   │   ├── mathService.ts       # Gaussian CDF via jStat, price preview
│   │   │   │   └── chainService.ts      # viem on-chain reads + startChainWatcher()
│   │   │   ├── sockets/
│   │   │   │   └── socketManager.ts     # Socket.io rooms, requestPrice, broadcasts
│   │   │   ├── webhooks/
│   │   │   │   └── goldskyHandler.ts    # POST /webhooks/goldsky (HMAC verified)
│   │   │   ├── middlewares/
│   │   │   │   ├── errorHandler.ts      # Global error handler
│   │   │   │   ├── goldskyAuth.ts       # HMAC-SHA256 webhook signature verification
│   │   │   │   └── rateLimiter.ts       # 100 req/min per IP
│   │   │   ├── models/
│   │   │   │   └── db.ts               # Prisma client singleton
│   │   │   ├── routes/
│   │   │   │   ├── health.ts           # GET /api/health
│   │   │   │   ├── marketRoutes.ts     # Market + price + lp-stats + settle routes
│   │   │   │   ├── userRoutes.ts       # GET /api/users/:address/portfolio
│   │   │   │   └── apiDocs.ts          # GET /api/docs (OpenAPI-style JSON schema)
│   │   │   ├── db/
│   │   │   │   ├── seed.ts             # Seed DB from Factory on-chain state
│   │   │   │   └── abis.ts             # Minimal ABI fragments for viem
│   │   │   └── types/
│   │   │       └── jstat.d.ts          # Type declaration for jstat library
│   │   ├── prisma/
│   │   │   ├── schema.prisma           # User / Market / Position models
│   │   │   └── migrations/
│   │   │       ├── migration_lock.toml
│   │   │       └── 20260609000000_init/
│   │   │           └── migration.sql   # Initial schema migration
│   │   ├── SOCKET_EVENTS.md           # Socket.io event reference for frontend
│   │   ├── goldsky-amm.json           # Goldsky from-ABI subgraph config
│   │   ├── prisma.config.ts           # Prisma config
│   │   └── package.json
│   │
│   ├── frontend/           # React + Vite app (built) — pages, hooks, GaussianChart, wallet
│   │   ├── src/            # config, lib, hooks, components/{ui,layout,market}, pages
│   │   ├── CLAUDE.md       # Frontend build instructions / design system
│   │   └── package.json
│   │
│   └── types/              # Shared TypeScript types & ABIs
│       ├── src/
│       │   └── index.ts             # Re-exports ABI JSON files
│       ├── abis/
│       │   ├── distribution_amm.json  # AMM ABI (snake_case, current)
│       │   ├── binary_router.json     # Router ABI (snake_case, current)
│       │   └── factory.json           # Factory ABI (snake_case, current)
│       └── package.json
│
├── types/abis/                        # Root-level ABIs (PascalCase, potentially stale)
│   ├── DistributionAmm.json
│   ├── BinaryRouter.json
│   └── OmniCurveFactory.json
│
├── .env                    # Root env (deployed addresses, Goldsky endpoint)
├── package.json            # Root workspace config
├── pnpm-workspace.yaml     # Workspace package declarations
├── tsconfig.json           # Root TypeScript config with path aliases
└── DEVELOPER_CONTEXT.md    # Architecture guardrails
```

---

## Smart Contract Architecture

### Contract System

The protocol uses an **EIP-1167 minimal proxy (clone) factory pattern**:

1. **Implementation contracts** are deployed once (AMM, Router, LP Token)
2. **OmniCurveFactory** clones them per-market via CREATE2
3. Each market gets its own trio of proxy contracts
4. Proxies use DELEGATECALL to share implementation code but have independent storage

```
OmniCurveFactory
├── AMM Implementation (singleton)
├── Router Implementation (singleton)
├── LP Token Implementation (singleton)
│
├── Market #0
│   ├── AMM Proxy ──DELEGATECALL──→ AMM Implementation
│   ├── Router Proxy ──DELEGATECALL──→ Router Implementation
│   └── LP Token Proxy ──DELEGATECALL──→ LP Token Implementation
│
├── Market #1 (when created)
│   ├── AMM Proxy ──DELEGATECALL──→ AMM Implementation
│   └── ...
```

### Build System

Each contract is compiled separately using Cargo feature flags:

```bash
cargo build --target wasm32-unknown-unknown --features amm --release
cargo build --target wasm32-unknown-unknown --features router --release
cargo build --target wasm32-unknown-unknown --features lp-token --release
cargo build --target wasm32-unknown-unknown --features factory --release
```

The `main.rs` and `lib.rs` files use `#[cfg(feature = "...")]` to conditionally compile only the relevant contract module. This produces four separate WASM binaries from a single crate.

### Feature Flags

| Flag | Compiles | Entrypoint |
|------|----------|------------|
| `amm` | `distribution_amm` + `math_core` + `interfaces` | `DistributionAmm` |
| `router` | `binary_router` + `math_core` + `interfaces` | `BinaryRouter` |
| `factory` | `factory` + `interfaces` | `OmniCurveFactory` |
| `lp-token` | `lp_token` | `LpToken` |

---

## Contract Details

### DistributionAmm (distribution_amm.rs)

The core AMM contract. Manages:

- **Gaussian distribution parameters**: `global_mu` (mean) and `global_sigma` (std dev), set by owner pre-trading or shifted by LP deposits
- **Liquidity pool**: `available_liquidity` (WAD) tracks free collateral; `locked_collateral` (WAD) tracks encumbered funds
- **LP tokens**: Mints/burns via the paired LpToken proxy
- **Fee distribution**: MasterChef-style accumulator (`acc_fee_per_share`, `reward_debt` per user) — fees from trades distributed pro-rata to LPs
- **Market resolution**: Two-phase with 24h timelock — `proposeResolution(winning_id)` → wait 24h → `executeResolution()`
- **Payout**: After resolution, winning token holders claim via `payoutWinnings`
- **USDC custody**: All USDC is held by the AMM proxy

**Key storage (WAD = 1e18 fixed-point):**
```rust
sol_storage! {
    pub struct DistributionAmm {
        address owner;
        address pending_owner;
        int256 global_mu;            // Gaussian mean (WAD)
        int256 global_sigma;         // Gaussian std dev (WAD)
        int256 sigma_min;            // Minimum allowed sigma (WAD)
        int256 available_liquidity;  // Free collateral (WAD)
        int256 locked_collateral;    // Encumbered by trades (WAD)
        address usdc_token;
        address router_address;
        address lp_token_address;
        int256 acc_fee_per_share;    // MasterChef accumulator (WAD)
        mapping(address => int256) reward_debt;
        bool is_resolved;
        uint256 winning_token_id;    // 1 = YES, 2 = NO
        bool trades_started;         // True after first trade (locks set_distribution / set_prior_weight)
        uint256 resolution_time;     // Timelock expiry (unix timestamp)
        uint256 proposed_winning_id;
        mapping(uint256 => int256) token_liabilities; // Per-token liability tracking

        // Stake-weighted curve accumulators (bettors move μ/σ, LPs do not):
        int256 acc_stake_weight;     // Σ wᵢ            (WAD)
        int256 acc_weighted_x;       // Σ wad_mul(wᵢ, xᵢ)
        int256 acc_weighted_x_sq;    // Σ wad_mul(wᵢ, xᵢ²)
        int256 prior_weight;         // virtual stake backing the owner-seeded μ/σ (default 100 WAD)
    }
}
```

**Key functions:**
- `initialize(owner)` — One-time setup
- `set_distribution(mu, sigma)` — Seed the prior μ/σ (owner only, pre-trading only); seeds the stake-weighted accumulators with `prior_weight` of virtual stake at this μ/σ
- `set_prior_weight(weight)` — Owner/pre-trading: tune how strongly the seeded μ/σ resists demand (higher = stickier)
- `add_liquidity(amount_wad, target_mu, target_sigma)` — Deposit USDC, receive LP tokens. **Curve-neutral**: `target_mu`/`target_sigma` are accepted for ABI back-compat but **ignored** — LPs always provide at the current μ/σ and never move the curve
- `remove_liquidity(shares_to_remove)` — Burn LP tokens, withdraw USDC (solvency checked)
- `get_price_for_x(x, is_yes)` — Read-only: returns CDF-derived price for a strike
- `distribute_fee(fee_amount)` — Called by Router: updates fee accumulator
- `underwrite_trade(token_id, target_x, premium_wad, max_liability_wad)` — Called by Router: locks collateral **and folds the bet into the stake-weighted curve** (weight = `premium_wad`, x = `target_x`), then recomputes μ/σ and emits `CurveUpdated`
- `recompute_curve()` *(internal)* — Recomputes μ = Σwx/Σw and σ = sqrt(E[x²]−μ²) from the accumulators, floored at `sigma_min`
- `propose_resolution(winning_id)` → `execute_resolution()` — Two-phase market settlement
- `payout_winnings(user, token_id, amount_wad)` — Called by Router: pays USDC to winners
- `claim_fees()` — LPs claim accumulated trading fees
- `sweep_dust()` — Owner recovers USDC rounding remainders

### BinaryRouter (binary_router.rs)

The user-facing trade execution contract:

- **Reads** μ and σ from the AMM (the *pre-update* curve — pricing uses the state before this bet shifts it)
- **Computes** CDF-derived prices on-chain using `math_core::gaussian_cdf`
- **Passes** the strike into `underwrite_trade(token_id, target_x, ...)` so the bet moves μ/σ after pricing
- **Executes** USDC transfers (user → AMM) and position bookkeeping
- **Manages** YES/NO position balances (non-transferable)
- **1% fee** deducted from each trade, sent to AMM for LP distribution
- **Reentrancy guard** via `bool locked` storage variable

**Token IDs:** YES = 1, NO = 2

**Key functions:**
- `buy_yes(target_price, stake_usdc)` / `buy_no(target_price, stake_usdc)` — Execute trades (user inputs a USDC stake; tokens minted = net_stake / price)
- `set_final_price(final_price)` — Owner records the real-world outcome (no oracle; manual)
- `claim_winnings(target_x, is_yes)` — Pull-based: redeems a winning position (YES wins iff `final_price ≥ target_x`) for USDC
- `release_losing_collateral(target_x, is_yes)` — Permissionless: frees LP collateral locked by a losing position
- `balance_of(account, id)` — ERC-1155 position balance for a token id

**Trade cost calculation:**
```
p_yes = 1 - CDF(target_price, μ, σ)
p_no = CDF(target_price, μ, σ)
raw_cost_wad = price × amount_wad / 1e18
fee_wad = raw_cost_wad / 100           (1%)
total_cost_wad = raw_cost_wad + fee_wad
cost_usdc = ceil(total_cost_wad / 1e12) (WAD → USDC 6 decimals)
```

### LpToken (lp_token.rs)

Non-transferable ERC-20:
- `transfer()` and `transferFrom()` always revert — LP positions cannot be traded
- Only the AMM proxy (owner) can `mint()` and `burn()`
- 18 decimals, named "OmniCurve LP" / "OCLP"
- `approve()` is technically functional but useless since transfers are disabled

### OmniCurveFactory (factory.rs)

Market deployer:
- Stores implementation addresses for AMM, Router, LP Token
- `create_market(usdc, sigma_min)` — Deploys 3 EIP-1167 clones via CREATE2, initializes and wires them
- Two-step ownership: Factory transfers AMM + Router ownership to caller; caller must `acceptOwnership()`
- LP Token owner is always the AMM proxy (set during factory `initialize`)
- Currently owner-only for market creation

### math_core.rs

On-chain Gaussian math library (compiled into both AMM and Router):

- **WAD arithmetic**: `wad_mul(a, b) = a × b / 1e18`, `wad_div(a, b) = a × 1e18 / b`
- **Gaussian PDF**: `gaussian_pdf(x, mu, sigma)` — normalized probability density
- **Gaussian CDF**: `gaussian_cdf(x, mu, sigma)` — cumulative distribution (0 to 1 WAD)
- **Error function**: `erf_approx(x)` — Abramowitz & Stegun 5-coefficient polynomial approximation (max error ~1.5×10⁻⁷)
- **Exponential**: `exp_wad(x)` — 18-term Taylor series expansion, clamped to [-20, +20] WAD

All functions use I256 (signed 256-bit integer) with 18-decimal fixed-point (WAD) representation.

---

## Deployed Addresses (Arbitrum Sepolia)

**Current deployment (stake-weighted-curve contracts — 2026-06-09).** These run the new
mechanism where bettors move μ/σ and LPs do not. Verified on-chain: a 2 USDC YES bet at
strike 3000 moved μ 3500 → 3358.17 and σ 800 → 713.62, while an 8 USDC liquidity add left
μ unchanged.

### Implementation Contracts (singletons)
| Contract | Address |
|----------|---------|
| AMM Implementation | `0x0d08e6c457bfe0794b258e66c20a788cc8a8fa32` |
| Router Implementation | `0x98846991e02802b20bf947cfe11b4ac6ff463d9f` |
| LP Token Implementation | `0xce5ce25964af3c917ebca5c972abec94022b868a` (reused — unchanged) |
| Factory | `0xf6bfadc33c3c42755d9634defbfcc52b8b2d5e24` |

### Market #0 Proxies — "What will eth price be by the end of 2026?"
| Contract | Address |
|----------|---------|
| AMM Proxy | `0x9736E98CA898Bf69daA126e715Eb639D2DaBFb46` |
| Router Proxy | `0xA65b5453a177d3C34654Ec4Be60754d0aD7ec6A5` |
| LP Token Proxy | `0x731489Ab2A0029a22a95b5Ea3f72335b18D40CCf` |

**Owner (AMM + Router + Factory):** `0xE958DaE545e5dAd0b4bE2E58432298dfd5178342`
**Market #0 state:** μ≈3358, σ≈714, prior_weight=5 WAD, ~8 USDC liquidity, `trades_started=true`.

### Previous deployment (frozen-curve, superseded)
| Contract | Address |
|----------|---------|
| Old Factory | `0xfd6df452d106c6bf5ee1cf6749d4d0afbacf40d9` |
| Old AMM Impl | `0xbb3f4468928bc97e50c78c19688554a838d18906` |
| Old Router Impl | `0xae756b1e3d2eb887758f47545d91fdda8604677e` |
| Old Market #0 AMM Proxy | `0xB817743dB6919599977dF86942d50355FA34dAA1` |
| Old Market #0 Router Proxy | `0x093299B9F0A8cd57319e3A3611BA867b9B5b1323` |
| USDC (unchanged) | `0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d` |

### Goldsky Subgraph
- Endpoint: `https://api.goldsky.com/api/public/project_cmq17mffxi3ym01zj0wsd8eib/subgraphs/omnicurve-amm-arbitrum-sepolia/1.0.2/gn`
- Indexes: CurveUpdated events from AMM, TradeExecuted events from Router
- ⚠️ Still points to the **old** pre-redeploy addresses — re-deploy the subgraph against the new factory/proxies to index the live market.

---

## Backend Architecture

Single TypeScript stack — Express 5 + Socket.io + Prisma + viem.

### Entry & Config
- **`src/server.ts`** — Express 5 + Socket.io + Helmet + CORS + rate limiter; calls `startChainWatcher()` after `httpServer.listen()`
- **`src/config.ts`** — Zod-validated env; crashes at startup if any required var is missing

### REST API Routes
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Server liveness check |
| GET | `/api/markets` | List all markets (`?category=&active=`) |
| GET | `/api/markets/:id` | Market detail + positions |
| GET | `/api/markets/:id/price?x=&direction=` | Price preview: `{pYes, pNo, grossCostWad, feeCostWad}` |
| GET | `/api/markets/:id/lp-stats?address=` | LP balance, accFeePerShare, pending rewards |
| POST | `/api/markets/:id/settle` | Owner-only: returns `winning_token_id` (no chain tx) |
| GET | `/api/users/:address/portfolio` | All positions + current value for a wallet |
| POST | `/api/webhooks/goldsky` | Goldsky event receiver (HMAC-SHA256 verified) |
| GET | `/api/docs` | OpenAPI-style JSON schema |

### Socket.io Events
See `SOCKET_EVENTS.md` for the full reference. Key events:
- Client emits `joinMarket(marketId)` → server immediately emits current state from Prisma
- Client emits `requestPrice({marketId, x, direction})` → server emits `priceUpdate` back to that socket only
- Server broadcasts `marketStateUpdated` and `marketResolved` to the market room on every chain event

### Services
- **`chainService.ts`** — viem `createPublicClient` on arbitrum-sepolia; `getMarketState()`, `getLpTokenBalance()`, `computePendingRewards()`; `startChainWatcher()` watches `CurveUpdated`, `LiquidityAdded/Removed`, `TradeExecuted`, `MarketResolved` — updates Prisma and broadcasts Socket.io on each event
- **`indexerService.ts`** — Goldsky webhook event handlers; idempotency guard prevents double-counting on retries
- **`mathService.ts`** — `calculatePricePreview(x, direction, mu, sigma, stakeAmount?)` via jStat; includes 1% fee breakdown

### Database
Prisma ORM with PostgreSQL. Migration applied via `prisma migrate deploy`.

**Models:**
```
User:     walletAddress (PK), rolePreference, globalAccumulatorSnapshot, totalLiquidityProvided
Market:   marketId (PK), title, category, currentMu, currentSigma, totalLiquidity,
          globalAccumulator, minVarianceBound, ammAddress, routerAddress, lpTokenAddress,
          isResolved, winningTokenId
Position: positionId (PK), userAddress (FK), marketId (FK), targetValueX,
          direction (ABOVE|BELOW), tokensMinted, stakeAmount
```

---

## Known Issues & Gaps

### Critical/High Priority
1. **`claim_fees` bug**: Sends WAD amount as USDC (missing `/1e12` conversion) — fees are permanently locked
2. **`I256::into_raw()` on negative values**: Produces garbage U256 — affects event emissions and sweep_dust edge case
3. **No slippage protection**: Trades have no max cost parameter

### Medium Priority
4. **Two ABI directories**: `types/abis/` (root, PascalCase) and `packages/types/abis/` (canonical, snake/camel). Now synced to the same contents; the canonical one is what the frontend imports
5. **1% fee hardcoded**: No governance or per-market configuration
6. **`execute_settlement` is dead code**: Does nothing, misleading for integrators

### Not Yet Built
- **docker-compose.yml**: Mentioned in DEVELOPER_CONTEXT.md but not created
- **Integration tests**: No end-to-end tests across contract interactions
- **Oracle integration**: Resolution is fully manual (owner calls `set_final_price`). The frontend's ETH spot line (`useEthPrice` → Coinbase API) is display-only and does not feed settlement
- **Position transfers**: Positions are non-transferable

---

## Development Commands

```bash
# Workspace
pnpm install                          # Install all dependencies

# Contracts — Build
cargo build --target wasm32-unknown-unknown --features amm --release
cargo build --target wasm32-unknown-unknown --features router --release
cargo build --target wasm32-unknown-unknown --features lp-token --release
cargo build --target wasm32-unknown-unknown --features factory --release

# Contracts — Deploy (Stylus)
cargo stylus deploy --features amm --private-key $KEY --endpoint $RPC_URL --no-verify \
  --wasm-file target/wasm32-unknown-unknown/release/omnicurve_contracts.wasm

# Contracts — Tests
cargo test                            # Rust unit tests (math_core)
forge test                            # Foundry tests (mock contracts)

# Backend
pnpm --filter @omnicurve/backend start            # migrate + seed + start:api (production)
pnpm --filter @omnicurve/backend start:api        # Express server only (port 3001)
pnpm --filter @omnicurve/backend db:migrate       # Apply prisma/migrations via migrate deploy
pnpm --filter @omnicurve/backend db:push          # Push schema without migrations (dev only)
pnpm --filter @omnicurve/backend db:seed          # Seed DB from Factory on-chain state

# Goldsky subgraph
pnpm --filter @omnicurve/backend deploy:subgraph:amm
```

---

## Key Design Decisions

1. **Gaussian CDF for pricing**: Probability = area under Gaussian curve, computed on-chain via Abramowitz & Stegun erf approximation with 18-term Taylor series exponential. Provides ~11 significant digits of precision.

2. **Demand-responsive curve (bettors only)**: μ/σ are a **stake-weighted distribution of strike prices**. The owner seeds an initial μ/σ (held with `prior_weight` of virtual stake); every bet then contributes `(weight = net stake, x = strike)` to running accumulators, and `recompute_curve()` derives `μ = Σwx/Σw`, `σ = sqrt(E[x²] − μ²)` (floored at `sigma_min`). The curve therefore tracks aggregate belief, and moving it always requires capital at risk on a position — manipulation-resistant by construction. **LPs cannot move the curve**: `add_liquidity` is curve-neutral (its `target_mu`/`target_sigma` are ignored), because a belief input with no directional risk would be a free manipulation lever. Pricing is *pre-update*: the Router prices a bet against the curve state *before* that bet shifts it. `trades_started` still locks `set_distribution`/`set_prior_weight` once trading begins (the owner can no longer reset the prior). Earlier versions froze the curve on first trade; that is no longer the case.

3. **MasterChef-style fee distribution**: Trading fees are distributed to LPs proportionally via a global accumulator pattern. Each LP's pending fees = `shares × acc_fee_per_share - reward_debt`.

4. **Non-transferable LP tokens**: LP positions cannot be transferred or traded. This simplifies the fee accounting (no need to update reward_debt on transfer) but limits composability.

5. **Two-phase resolution with timelock**: Resolution requires `proposeResolution` (starts 24h timer) → `executeResolution` (after timer). Owner can `cancelResolution` during the window. This provides a dispute period but is currently hardcoded to 24h.

6. **WIN/LOSE determined by the real-world price, per position — not μ**: The Router's `set_final_price(final_price)` records an externally-observed outcome (manual for this PoC; no oracle). Each position is then judged against **its own strike**: a YES position at strike X wins iff `final_price ≥ X`, a NO position wins iff `final_price < X` (`claim_winnings` / `release_losing_collateral`). μ is only the market's *belief*, never the settlement boundary — so a bet that drags μ around cannot change who wins. (The frontend draws the live ETH spot price as a vertical reference line on market #0's chart to make this belief-vs-reality distinction visible.)

7. **USDC (6 decimals) vs WAD (18 decimals)**: All internal accounting uses WAD (1e18). USDC transfers convert via `/1e12`. The `sweep_dust` function recovers rounding remainders.

8. **EIP-1167 proxies are immutable**: Once deployed, a proxy's implementation cannot be changed. To upgrade a market's logic, a new market must be created with the updated implementation, and liquidity must be migrated manually.
