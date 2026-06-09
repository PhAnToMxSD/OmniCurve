# OmniCurve Contracts — Deployment & Operations

## Deployed Addresses (Arbitrum Sepolia)

> **Current deployment — stake-weighted-curve contracts (2026-06-09).** Bettors move μ/σ;
> LPs are pure collateral. Verified on-chain (2 USDC YES bet moved μ 3500→3358.17; LP add
> left μ unchanged).

### Implementation Contracts (deployed once, shared by all markets)

| Contract | Address |
|----------|---------|
| AMM Implementation | `0x0d08e6c457bfe0794b258e66c20a788cc8a8fa32` |
| Router Implementation | `0x98846991e02802b20bf947cfe11b4ac6ff463d9f` |
| LP Token Implementation | `0xce5ce25964af3c917ebca5c972abec94022b868a` (reused — unchanged) |
| Factory | `0xf6bfadc33c3c42755d9634defbfcc52b8b2d5e24` |

### Market #0 Proxy Contracts (deployed by factory) — "What will eth price be by the end of 2026?"

| Contract | Address |
|----------|---------|
| AMM Proxy | `0x9736E98CA898Bf69daA126e715Eb639D2DaBFb46` |
| Router Proxy | `0xA65b5453a177d3C34654Ec4Be60754d0aD7ec6A5` |
| LP Token Proxy | `0x731489Ab2A0029a22a95b5Ea3f72335b18D40CCf` |

**Owner (AMM + Router):** `0xE958DaE545e5dAd0b4bE2E58432298dfd5178342`
**LP Token Owner:** AMM Proxy (`0x9736E98CA898Bf69daA126e715Eb639D2DaBFb46`)

> Previous frozen-curve deployment (superseded): Factory `0xfd6df452d106c6bf5ee1cf6749d4d0afbacf40d9`,
> AMM impl `0xbb3f4468928bc97e50c78c19688554a838d18906`, Router impl `0xae756b1e3d2eb887758f47545d91fdda8604677e`.

---

## Architecture

The **Factory** deploys EIP-1167 minimal proxy clones of all three implementation contracts (AMM, Router, LP Token) per market via `CREATE2`. Deploy implementations once, then create unlimited markets through the factory.

```
Factory.createMarket(usdc, sigma_min)
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

## Build Commands

```bash
cargo build --target wasm32-unknown-unknown --features amm --release
cargo build --target wasm32-unknown-unknown --features router --release
cargo build --target wasm32-unknown-unknown --features lp-token --release
cargo build --target wasm32-unknown-unknown --features factory --release
```

---

## Initial Deployment

Use the automated script or run manually:

### Automated

```bash
cd packages/contracts
./scripts/deploy.sh
```

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
  --private-key $KEY --rpc-url $RPC_URL

# 6. Create first market
cast send <FACTORY> \
  "createMarket(address,int256)" \
  <USDC_ADDRESS> 100000000000000000 \
  --private-key $KEY --rpc-url $RPC_URL

# 7. Read proxy addresses
cast call <FACTORY> "getMarketAmm(uint256)(address)" 0 --rpc-url $RPC_URL
cast call <FACTORY> "getMarketRouter(uint256)(address)" 0 --rpc-url $RPC_URL
cast call <FACTORY> "getMarketLpToken(uint256)(address)" 0 --rpc-url $RPC_URL

# 8. Accept ownership on AMM and Router proxies
cast send <AMM_PROXY> "acceptOwnership()" --private-key $KEY --rpc-url $RPC_URL
cast send <ROUTER_PROXY> "acceptOwnership()" --private-key $KEY --rpc-url $RPC_URL
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
  "createMarket(address,int256)" \
  <USDC_ADDRESS> <SIGMA_MIN_WAD> \
  --private-key $KEY --rpc-url $RPC_URL
```

`SIGMA_MIN_WAD` is in 18-decimal WAD format. Common values:
- `100000000000000000` = 0.1 (reasonable default)
- `10000000000000000` = 0.01 (tight curve)
- `1000000000000000000` = 1.0 (wide curve)

### Step 3: Query the new proxy addresses

Replace `<MARKET_ID>` with the value from Step 1 (0, 1, 2, ...):

```bash
cast call <FACTORY> "getMarketAmm(uint256)(address)" <MARKET_ID> --rpc-url $RPC_URL
cast call <FACTORY> "getMarketRouter(uint256)(address)" <MARKET_ID> --rpc-url $RPC_URL
cast call <FACTORY> "getMarketLpToken(uint256)(address)" <MARKET_ID> --rpc-url $RPC_URL
```

### Step 4: Accept ownership on AMM and Router proxies

The factory initiated a two-step ownership transfer. Finalize it:

```bash
cast send <AMM_PROXY> "acceptOwnership()" --private-key $KEY --rpc-url $RPC_URL
cast send <ROUTER_PROXY> "acceptOwnership()" --private-key $KEY --rpc-url $RPC_URL
```

> The LP Token proxy does **not** require ownership acceptance — the AMM proxy is already the owner from initialization.

### Step 5: Configure the market

Set the initial distribution before trading begins:

```bash
cast send <AMM_PROXY> "setDistribution(int256,int256)" <MU_WAD> <SIGMA_WAD> \
  --private-key $KEY --rpc-url $RPC_URL
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
  --private-key $KEY --rpc-url $RPC_URL

# Update Router implementation
cast send <FACTORY> \
  "setRouterImplementation(address)" <NEW_ROUTER_IMPL> \
  --private-key $KEY --rpc-url $RPC_URL

# Update LP Token implementation
cast send <FACTORY> \
  "setLpTokenImplementation(address)" <NEW_LP_IMPL> \
  --private-key $KEY --rpc-url $RPC_URL
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
  --private-key $CURRENT_OWNER_KEY --rpc-url $RPC_URL

# Step 2: New owner accepts
cast send <FACTORY> \
  "acceptOwnership()" \
  --private-key $NEW_OWNER_KEY --rpc-url $RPC_URL
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
