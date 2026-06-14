# OmniCurve Contracts — Deployment & Operations

## Deployed Addresses (Arbitrum Sepolia)

> **Current deployment — on-chain market titles (2026-06-14).** The factory now
> stores each market's title immutably on-chain; `createMarket` takes a `title`
> argument and `getMarketTitle(id)` reads it back. The AMM, Router, and LP Token
> implementations are unchanged from the stake-weighted-curve deployment and are
> **reused** — only the factory was redeployed.

### Implementation Contracts (deployed once, shared by all markets)

| Contract | Address |
|----------|---------|
| AMM Implementation | `0x56a2a3d3d5b50ff40f84188d1f975fedb819d882` |
| Router Implementation | `0xa4ed547186b992eecd7244743577baf4c541ff9d` |
| LP Token Implementation | `0x0e382e38342f28493568b98e5cab30348d6b2cab` |
| **Factory (on-chain titles)** | **`0xde6b999e488d9b723a3409e80ea390c079f88016`** |

**Owner / deployer:** `0x2154E13EC2399ebd6e81f9900389396Cfa760f98`

> **The new factory starts with zero markets** (`getMarketCount()` returns `0`).
> Market proxies created by the previous factory do **not** carry over — create
> fresh markets on the new factory using the steps below. The new market #0 will
> be assigned when you make the first `createMarket` call.

> Superseded factories (old markets still live, but no new markets should be
> created on them): `0x9c8d052ff1f0e6419a6a323e86ffa893cb6ce817` (stake-weighted,
> no on-chain titles) and `0xfd6df452d106c6bf5ee1cf6749d4d0afbacf40d9`
> (frozen-curve). The stake-weighted factory's market #0
> ("What will eth price be by the end of 2026?") was: AMM
> `0x982A774dd198a0F2E582aD0F3Ecc7348D2292d3b`, Router
> `0x7B863fA3e629258774f2C2DcF6419abf8F07D2D7`, LP Token
> `0x86C7Ff5421c3aa48e0f7cFa4Ea0C6bbc668488E1`.

---

## Architecture

The **Factory** deploys EIP-1167 minimal proxy clones of all three implementation contracts (AMM, Router, LP Token) per market via `CREATE2`. Deploy implementations once, then create unlimited markets through the factory.

```
Factory.createMarket(usdc, sigma_min, title)
  ├── stores `title` on-chain (immutable, keyed by market_id)
  ├── deploys AMM proxy clone      (DELEGATECALL → AMM Implementation)
  ├── deploys Router proxy clone   (DELEGATECALL → Router Implementation)
  ├── deploys LP Token proxy clone (DELEGATECALL → LP Token Implementation)
  ├── initializes & wires all three:
  │     AMM ↔ Router (bidirectional)
  │     AMM → LP Token (mint/burn authority)
  │     AMM → USDC token
  │     AMM → sigma_min
  ├── LP Token owner = AMM proxy (set at initialization)
  └── transfers AMM + Router ownership to caller (two-step)
```

**LP Token Design:** Non-transferable ERC-20 (transfer/transferFrom disabled). Acts as a staking receipt for liquidity providers. Only the AMM proxy can mint/burn.

---

## Setting Up the Redeployed Factory (on-chain titles)

The factory at `0xde6b999e488d9b723a3409e80ea390c079f88016` is a fresh deploy
that reuses the existing implementations. Run these steps once to wire it up,
then use it to create as many markets as you like.

```bash
RPC_URL="https://sepolia-rollup.arbitrum.io/rpc"
KEY=<PRIVATE_KEY>

FACTORY=0xde6b999e488d9b723a3409e80ea390c079f88016
OWNER=0x2154E13EC2399ebd6e81f9900389396Cfa760f98
AMM_IMPL=0x56a2a3d3d5b50ff40f84188d1f975fedb819d882
ROUTER_IMPL=0xa4ed547186b992eecd7244743577baf4c541ff9d
LP_IMPL=0x0e382e38342f28493568b98e5cab30348d6b2cab
USDC=0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d
```

### Step 1 — Initialize the factory (one-time, reuses existing implementations)

```bash
cast send $FACTORY \
  "initialize(address,address,address,address)" \
  $OWNER $AMM_IMPL $ROUTER_IMPL $LP_IMPL \
  --private-key $KEY --rpc-url $RPC_URL --gas-limit 50000000
```

> **Why `--gas-limit` on every `cast send`?** Without it, cast estimates gas
> first, and that estimation step *reverts* for any call that can't succeed —
> e.g. an already-initialized factory fails with
> `Failed to estimate gas: ... execution reverted, data: "0x416c726561...` (that
> hex is the UTF-8 for `Already initialized`). Passing an explicit `--gas-limit`
> skips estimation so the transaction is actually broadcast and the on-chain
> result (success or a clear revert in the receipt) is what you see. `50000000`
> is a generous cap for these Stylus calls; you only pay for gas actually used.

> `initialize` reverts with `Already initialized` if it has already been run —
> safe to skip if so. Verify with
> `cast call $FACTORY "getAmmImplementation()(address)" --rpc-url $RPC_URL`.

### Step 2 — Create a market with an on-chain title

`createMarket` now takes a third `string` argument — the immutable market title.

```bash
cast send $FACTORY \
  "createMarket(address,int256,string)" \
  $USDC 100000000000000000 "What will the price of ETH be by the end of 2026?" \
  --private-key $KEY --rpc-url $RPC_URL --gas-limit 50000000
```

The new market's `market_id` is the value `getMarketCount()` returned *before*
this call (the first market is `0`).

### Step 3 — Read the new proxy addresses (and confirm the stored title)

```bash
MARKET_ID=0
cast call $FACTORY "getMarketAmm(uint256)(address)"    $MARKET_ID --rpc-url $RPC_URL
cast call $FACTORY "getMarketRouter(uint256)(address)" $MARKET_ID --rpc-url $RPC_URL
cast call $FACTORY "getMarketLpToken(uint256)(address)" $MARKET_ID --rpc-url $RPC_URL
cast call $FACTORY "getMarketTitle(uint256)(string)"   $MARKET_ID --rpc-url $RPC_URL
```

### Step 4 — Accept ownership of the AMM and Router proxies

`createMarket` starts a two-step ownership transfer to you; finalize it on both
proxies (the LP Token proxy is owned by the AMM and needs nothing):

```bash
AMM_PROXY=<from step 3>
ROUTER_PROXY=<from step 3>

cast send $AMM_PROXY    "acceptOwnership()" --private-key $KEY --rpc-url $RPC_URL --gas-limit 50000000
cast send $ROUTER_PROXY "acceptOwnership()" --private-key $KEY --rpc-url $RPC_URL --gas-limit 50000000
```

### Step 5 — Seed the distribution (owner only, before the first trade)

```bash
# <MU_WAD> and <SIGMA_WAD> are 18-decimal WAD; SIGMA must be > sigma_min
cast send $AMM_PROXY "setDistribution(int256,int256)" <MU_WAD> <SIGMA_WAD> \
  --private-key $KEY --rpc-url $RPC_URL --gas-limit 50000000
```

After this, LPs can `addLiquidity` and traders can `buyYes`/`buyNo` through the
Router proxy.

> **Config to update after redeploy:** the new factory address must also be set
> in `packages/frontend/src/config/contracts.ts` (`FACTORY_ADDRESS`), the root
> `.env` (`VITE_FACTORY_ADDRESS` for the frontend and `FACTORY_ADDRESS` for the
> backend), and the top-level `CLAUDE.md`. Then run the backend seed
> (`pnpm --filter @omnicurve/backend db:seed`) so the DB picks up the on-chain
> title.

---

## Build Commands

```bash
cargo build --target wasm32-unknown-unknown --features amm --release
cargo build --target wasm32-unknown-unknown --features router --release
cargo build --target wasm32-unknown-unknown --features lp-token --release
cargo build --target wasm32-unknown-unknown --features factory --release
```

---

## Test Commands

Unit tests live alongside each contract module (`#[cfg(test)]`) and run natively
on the host via the Stylus `TestVM` harness. Because every contract is its own
`#[entrypoint]`, only one contract module compiles per feature flag, so the
suite is run once per feature:

```bash
cargo +stable test --lib --features amm        # distribution_amm + math_core
cargo +stable test --lib --features router     # binary_router + math_core
cargo +stable test --lib --features lp-token   # lp_token + math_core
cargo +stable test --lib --features factory    # factory + math_core
```

> **Toolchain:** tests must be built with Rust **≥ 1.91** (e.g. `+stable`). The
> WASM contracts themselves still build on the pinned `1.88.0` toolchain in
> `rust-toolchain.toml`; only the dev-only `stylus-test` harness (and its alloy
> provider dependencies) require the newer compiler. `stylus-test` is declared
> under `[dev-dependencies]`, so it never enters the deployed WASM binary.

What's covered:

- **math_core** — WAD arithmetic, Gaussian PDF/CDF, `erf`, `exp_wad` saturation
  bounds, `sqrt_wad`, unit-range clamping, invalid-σ guards.
- **lp_token** — init/double-init, two-step ownership, owner-gated mint/burn,
  overflow & insufficient-balance reverts, non-transferability.
- **binary_router** — ownership, ERC-1155 surface (balances, approvals,
  `safeTransferFrom`, `supportsInterface`), deterministic `token_id` derivation,
  trade guards, a mocked happy-path buy, and the full settlement/claim/release
  branch logic.
- **distribution_amm** — ownership, parameter validation, `set_distribution`
  curve seeding, the stake-weighted `underwrite_trade` curve recompute (exact μ),
  the two-phase resolution timelock, collateral release, and fee distribution.
- **factory** — EIP-1167 creation-code bytes, CREATE2 salt distinctness, and a
  mocked `create_market` deploy/wire/record flow.

Cross-contract calls are exercised with `TestVM` mocks. Note that this version
of `TestVM` serves a single shared return-data buffer for all mocked calls (the
most-recently-registered mock's bytes); the tests are written around that.

The legacy Foundry mock tests remain runnable with `forge test`.

---

## Initial Deployment

### Manual

```bash
RPC_URL="https://sepolia-rollup.arbitrum.io/rpc"
KEY=<PRIVATE_KEY>

# 1. Deploy AMM Implementation
cargo stylus deploy --features amm \
  --private-key $KEY --endpoint $RPC_URL --no-verify \
  --wasm-file target/wasm32-unknown-unknown/release/omnicurve_contracts.wasm \
  --max-fee-per-gas-gwei 0.1

# 2. Deploy Router Implementation
cargo stylus deploy --features router \
  --private-key $KEY --endpoint $RPC_URL --no-verify \
  --wasm-file target/wasm32-unknown-unknown/release/omnicurve_contracts.wasm \
  --max-fee-per-gas-gwei 0.1

# 3. Deploy LP Token Implementation
cargo stylus deploy --features lp-token \
  --private-key $KEY --endpoint $RPC_URL --no-verify \
  --wasm-file target/wasm32-unknown-unknown/release/omnicurve_contracts.wasm \
  --max-fee-per-gas-gwei 0.1

# 4. Deploy Factory
cargo stylus deploy --features factory \
  --private-key $KEY --endpoint $RPC_URL --no-verify \
  --wasm-file target/wasm32-unknown-unknown/release/omnicurve_contracts.wasm \
  --max-fee-per-gas-gwei 0.1

# 5. Initialize factory with all 3 implementation addresses
cast send <FACTORY> \
  "initialize(address,address,address,address)" \
  <OWNER> <AMM_IMPL> <ROUTER_IMPL> <LP_TOKEN_IMPL> \
  --private-key $KEY --rpc-url $RPC_URL --gas-limit 50000000

# 6. Create first market (title is stored on-chain, immutable)
cast send <FACTORY> \
  "createMarket(address,int256,string)" \
  <USDC_ADDRESS> 100000000000000000 "<MARKET_TITLE>" \
  --private-key $KEY --rpc-url $RPC_URL --gas-limit 50000000

# 7. Read proxy addresses
cast call <FACTORY> "getMarketAmm(uint256)(address)" 0 --rpc-url $RPC_URL
cast call <FACTORY> "getMarketRouter(uint256)(address)" 0 --rpc-url $RPC_URL
cast call <FACTORY> "getMarketLpToken(uint256)(address)" 0 --rpc-url $RPC_URL

# 8. Accept ownership on AMM and Router proxies
cast send <AMM_PROXY> "acceptOwnership()" --private-key $KEY --rpc-url $RPC_URL --gas-limit 50000000
cast send <ROUTER_PROXY> "acceptOwnership()" --private-key $KEY --rpc-url $RPC_URL --gas-limit 50000000
```

> **Note:** LP Token ownership does not need to be accepted — the AMM proxy is set as owner directly during `initialize()`.

---

## Creating Additional Markets

No new contract deployments needed. Each `createMarket` call deploys a fresh AMM + Router + LP Token proxy trio automatically.

### Step 1: Check current market count

```bash
cast call <FACTORY> "getMarketCount()(uint256)" --rpc-url $RPC_URL
```

The returned value is the next `market_id` that will be assigned.

### Step 2: Create the market

```bash
cast send <FACTORY> \
  "createMarket(address,int256,string)" \
  <USDC_ADDRESS> <SIGMA_MIN_WAD> "<MARKET_TITLE>" \
  --private-key $KEY --rpc-url $RPC_URL --gas-limit 50000000
```

`MARKET_TITLE` is the human-readable question; it is stored immutably on-chain
and read back via `getMarketTitle(<MARKET_ID>)`. `SIGMA_MIN_WAD` is in 18-decimal
WAD format. Common values:
- `100000000000000000` = 0.1 (reasonable default)
- `10000000000000000` = 0.01 (tight curve)
- `1000000000000000000` = 1.0 (wide curve)

### Step 3: Query the new proxy addresses

Replace `<MARKET_ID>` with the value from Step 1 (0, 1, 2, ...):

```bash
cast call <FACTORY> "getMarketAmm(uint256)(address)" <MARKET_ID> --rpc-url $RPC_URL
cast call <FACTORY> "getMarketRouter(uint256)(address)" <MARKET_ID> --rpc-url $RPC_URL
cast call <FACTORY> "getMarketLpToken(uint256)(address)" <MARKET_ID> --rpc-url $RPC_URL
cast call <FACTORY> "getMarketTitle(uint256)(string)" <MARKET_ID> --rpc-url $RPC_URL
```

### Step 4: Accept ownership on AMM and Router proxies

The factory initiated a two-step ownership transfer. Finalize it:

```bash
cast send <AMM_PROXY> "acceptOwnership()" --private-key $KEY --rpc-url $RPC_URL --gas-limit 50000000
cast send <ROUTER_PROXY> "acceptOwnership()" --private-key $KEY --rpc-url $RPC_URL --gas-limit 50000000
```

> The LP Token proxy does **not** require ownership acceptance — the AMM proxy is already the owner from initialization.

### Step 5: Configure the market

Set the initial distribution before trading begins:

```bash
cast send <AMM_PROXY> "setDistribution(int256,int256)" <MU_WAD> <SIGMA_WAD> \
  --private-key $KEY --rpc-url $RPC_URL --gas-limit 50000000
```

After this, LPs can `addLiquidity` and traders can `buyYes`/`buyNo` through the Router proxy.

---

## Updating Implementation Contracts

When you deploy a new version of an implementation contract, update the factory so all **future** markets use the new code. Existing markets are unaffected (their proxies point to the old implementation forever via EIP-1167).

### Step 1: Deploy the new implementation

Build and deploy the updated contract:

```bash
# Example: updating the AMM implementation
cargo build --target wasm32-unknown-unknown --features amm --release
cargo stylus deploy --features amm \
  --private-key $KEY --endpoint $RPC_URL --no-verify \
  --wasm-file target/wasm32-unknown-unknown/release/omnicurve_contracts.wasm \
  --max-fee-per-gas-gwei 0.1
```

Note the new implementation address from the output.

### Step 2: Update the factory's stored implementation address

The factory exposes owner-only setters for each implementation:

```bash
# Update AMM implementation
cast send <FACTORY> \
  "setAmmImplementation(address)" <NEW_AMM_IMPL> \
  --private-key $KEY --rpc-url $RPC_URL --gas-limit 50000000

# Update Router implementation
cast send <FACTORY> \
  "setRouterImplementation(address)" <NEW_ROUTER_IMPL> \
  --private-key $KEY --rpc-url $RPC_URL --gas-limit 50000000

# Update LP Token implementation
cast send <FACTORY> \
  "setLpTokenImplementation(address)" <NEW_LP_IMPL> \
  --private-key $KEY --rpc-url $RPC_URL --gas-limit 50000000
```

### Step 3: Verify the update

```bash
cast call <FACTORY> "getAmmImplementation()(address)" --rpc-url $RPC_URL
cast call <FACTORY> "getRouterImplementation()(address)" --rpc-url $RPC_URL
cast call <FACTORY> "getLpTokenImplementation()(address)" --rpc-url $RPC_URL
```

All subsequent `createMarket` calls will now clone the new implementations.

> **Important:** Existing market proxies are **immutable** — they will continue to delegate to the original implementation they were deployed with. EIP-1167 clones cannot be re-pointed. If you need to migrate an existing market, you must create a new one and migrate liquidity.

---

## Transferring Factory Ownership

The factory itself uses a two-step ownership transfer:

```bash
# Step 1: Current owner initiates transfer
cast send <FACTORY> \
  "transferOwnership(address)" <NEW_OWNER> \
  --private-key $CURRENT_OWNER_KEY --rpc-url $RPC_URL --gas-limit 50000000

# Step 2: New owner accepts
cast send <FACTORY> \
  "acceptOwnership()" \
  --private-key $NEW_OWNER_KEY --rpc-url $RPC_URL --gas-limit 50000000
```

---

## Verification Script

After deployment, verify all wiring is correct:

```bash
./scripts/verify.sh <FACTORY> <AMM_PROXY> <ROUTER_PROXY> <LP_PROXY>
```

This reads on-chain state and confirms:
- Factory implementation addresses are set
- AMM ↔ Router wiring is correct
- AMM → LP Token wiring is correct
- LP Token metadata (name, symbol, decimals, supply)
