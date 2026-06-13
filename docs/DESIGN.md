# OmniCurve — Design & Deep Dive

> This document holds the in-depth design rationale for OmniCurve: the product roadmap,
> the contract-by-contract walkthrough of how the Gaussian math maps to Rust, the Arbitrum
> Stylus engineering practices, and the forward-looking plans for an AI oracle.
>
> For the protocol overview, the core mathematical formulas, the architecture diagrams,
> and setup/deployment instructions, see the **[README](./README.md)**.

## Table of Contents

* [5. Product roadmap: from hackathon PoC to consumer trading platform](#5-product-roadmap-from-hackathon-poc-to-consumer-trading-platform)
* [6. Contract-by-contract: math meets Rust](#6-contract-by-contract-math-meets-rust)
* [7. Arbitrum Stylus & ecosystem best practices](#7-arbitrum-stylus--ecosystem-best-practices)
* [8. Future plans: an AI oracle for resolution](#8-future-plans-an-ai-oracle-for-resolution)
  * [8.1 The resolution pipeline](#81-the-resolution-pipeline)
  * [8.2 How it plugs into the existing contracts](#82-how-it-plugs-into-the-existing-contracts)

---

## 5. Product roadmap: from hackathon PoC to consumer trading platform
 
This section reframes OmniCurve as a long-term consumer product rather than a one-shot
hackathon submission — what's solid enough to build on today, and the roadmap for
turning a mathematically rigorous AMM into a trading experience people actually want to
use daily, including a forward bet on AI agents and agentic commerce as a primary
distribution channel for prediction markets.
 
### 5.1 What's live today
 
The hackathon build is a complete, working vertical slice — not a demo with mocked
pieces. Concretely, the following are implemented and deployed on Arbitrum Sepolia:
 
- **The full Gaussian pricing engine on-chain** — `normal_cdf`, `erf_approx`, `exp_wad`,
  `sqrt_wad`, all in fixed-point WAD arithmetic, unit-tested to ~11 significant digits
  against reference values (Sections 2-3).
- **Demand-responsive curve dynamics** — the stake-weighted μ/σ accumulator update,
  prior seeding, and pre-update pricing guarantee (Section 2.2, 3.3).
- **Per-strike ERC-1155 positions** — any `(strike, YES/NO)` pair gets a deterministic
  `keccak256`-derived token ID, minted lazily on first trade. No enumeration of "markets"
  needed.
- **Curve-neutral liquidity provisioning** with MasterChef-style O(1) fee distribution
  to LPs, and non-transferable LP receipt tokens that keep `reward_debt` accounting
  sound.
- **A two-phase resolution timelock** (24h dispute window) plus pull-based claiming for
  both winners (`claim_winnings`) and LPs whose collateral was locked against losing
  positions (`release_losing_collateral`).
- **EIP-1167 factory** that clones AMM/Router/LP-token implementations per market via
  CREATE2, with two-step ownership handoff to the market creator.
- **A real-time backend and frontend** — Express/Socket.io indexer off a Goldsky
  subgraph, Prisma/Postgres persistence, and a React/d3 terminal UI showing the live
  curve.
In short: the *hard part* — getting rigorous, demand-responsive Gaussian pricing to run
cheaply and correctly on-chain — is done. Everything in 6.2 and 6.3 is about the layers
*around* that core: how people discover, enter, and exit positions, and who (or what)
places the trades.
 
### 5.2 Trading experience roadmap
 
The current trading flow (`buy_yes(target_price, stake_usdc)` / `buy_no(...)`, manual
`set_final_price`, pull-based claims) is correct but minimal — a power user's flow, not a
consumer one. Planned improvements, roughly in order of how directly they touch the
existing contracts:
 
- **Oracle-based resolution.** Replace the owner-set `set_final_price` with a Chainlink
  price feed or UMA optimistic-oracle integration. This is the single highest-priority
  change for trust — "the operator decides who wins" is acceptable for a hackathon PoC
  and unacceptable for a product handling real capital. The two-phase timelock
  (`propose_resolution` / `execute_resolution`) is already structured to slot an oracle
  read in place of the manual `winning_id`.
- **Limit and conditional orders.** Today every trade executes immediately at the
  current CDF price. A natural extension: an off-chain order book / intent layer where
  users specify "buy YES at strike $X if the implied price drops below $0.30," matched
  off-chain and settled through `buy_internal` only when the condition is met — similar
  to how many perp DEXs separate intent expression from on-chain execution.
- **Multi-strike position management ("baskets").** Since every `(strike, direction)` is
  its own ERC-1155 token, a natural UX layer is letting a user express a *view on the
  shape of the distribution* — e.g. "I think the curve should be narrower than the
  market currently implies" — as a single basket order that buys/sells across several
  strikes in one transaction (a Router-level batching function, not a math change).
- **Multi-asset collateral.** Currently every market is denominated in a single USDC
  pool (`usdc_token` set per-AMM at creation). Supporting additional collateral types
  (other stables, or yield-bearing assets like USDC-denominated vaults) would let LPs
  earn baseline yield on idle `available_liquidity` between trades — a meaningful
  capital-efficiency unlock given that, structurally, most of the pool sits unused at
  any given strike.
- **Curve analytics and "market microstructure" tooling.** The frontend already plots
  μ/σ live; the roadmap extends this to historical curve replay, per-strike implied
  volatility (derivable from `normal_pdf`, which is implemented but currently unused —
  see Section 3.1), and slippage previews via `get_price_for_x` before a trade is signed.
- **Mobile-first redesign.** The current "quant terminal" aesthetic is intentionally
  power-user-facing. A consumer mobile app would foreground a small number of curated
  markets, simple "thermometer" visualizations of the current belief curve instead of
  raw Gaussian plots, push notifications on resolution and large curve moves, and
  one-tap position sizing.
### 5.3 AI agents and agentic commerce
 
This is the part of the roadmap that's less "finish the AMM" and more "rethink who the
AMM's counterparty is." A continuous, mathematically well-defined pricing curve — one
that returns a price for *any* strike via a single `normal_cdf` call — is unusually
well-suited to being queried and acted on by autonomous agents, for a simple reason:
agents need machine-readable, composable price functions, not "go look at an order book
and eyeball the spread." OmniCurve's `get_price_for_x(x, is_yes)` is already exactly
that.
 
- **Natural-language trading agents.** A conversational interface ("I think ETH ends
  2026 between $4,000 and $6,000, put $50 on that") that decomposes a stated belief into
  a basket of `buy_yes`/`buy_no` calls across strikes — effectively letting a user
  express a *distribution* in plain language and having an agent translate it into the
  position basket from 6.2. This is a thin layer over existing Router calls plus an LLM
  that maps natural-language probability statements to (strike, stake) pairs.
- **Autonomous market-making / LP agents.** Because LP deposits are strictly
  curve-neutral (Section 2.2) and curve health is fully observable on-chain
  (`global_mu`, `global_sigma`, `available_liquidity`, `locked_collateral`), an agent
  could manage LP capital across *multiple* OmniCurve markets — entering/exiting based
  on fee accrual rate (`acc_fee_per_share`), pool utilization
  (`locked_collateral / (locked_collateral + available_liquidity)`), and `sigma_min`
  proximity (a market whose σ is pinned at the floor is signaling either very strong
  consensus or insufficient real activity) — without ever needing permission to move the
  curve, since LP deposits structurally can't.
- **Belief-aware portfolio agents.** An agent that holds a calibrated forecast for an
  underlying (e.g. from an external model or aggregated data) could continuously compare
  its own implied (μ, σ) against the market's current `global_mu`/`global_sigma` and
  size positions proportional to the *divergence* — essentially an automated "trade
  against the consensus when you have a better-calibrated prior" strategy, which is a
  natural fit for OmniCurve specifically because the market's belief is *itself* a
  Gaussian (μ, σ) that's directly comparable to an agent's own forecast distribution, not
  a discrete probability that needs reinterpretation.
- **Agent-to-agent settlement and agentic commerce rails.** As agent-native payment
  protocols mature (e.g. x402-style HTTP-native micropayments, or Arbitrum-native
  account-abstraction wallets for agents), OmniCurve's pull-based claim model
  (`claim_winnings`, `release_losing_collateral`) is already permissionless and
  stateless enough to be called by an agent's wallet without any bespoke integration —
  the roadmap item here is less "change the contracts" and more "make sure the
  Router/AMM ABI is documented and stable enough that agent frameworks can integrate
  against it as a standard primitive," plus building reference agent SDKs (TypeScript
  and Python) wrapping the existing `IDistributionAmm`/Router interfaces.
- **Agent-readable market metadata and discovery.** For agents to *find* relevant
  markets (not just trade ones they're told about), the backend's REST/GraphQL layer
  would need a standardized, machine-readable schema describing each market's question,
  current (μ, σ), resolution criteria, and time-to-resolution — effectively an
  "llms.txt for prediction markets" that lets an agent enumerate tradeable beliefs across
  many OmniCurve markets and reason about which ones are relevant to whatever task it's
  performing.
### 5.4 Sequencing and dependencies
 
Roughly: **oracle resolution** unblocks everything else, since no serious capital (human
or agent) should be staked against a manually-resolved market. **Multi-strike
baskets and `get_price_for_x`-based previews** are the shared infrastructure that both
the consumer UX (6.2) and the natural-language/portfolio agents (6.3) build on — so
basket-order support at the Router level is the highest-leverage near-term contract
change. **Agent SDKs and metadata schemas** can be built in parallel with the UX work
since they consume the same read-only surface (`global_mu`, `global_sigma`,
`get_price_for_x`, `acc_fee_per_share`) that already exists today.

## 6. Contract-by-contract: math meets Rust
 
### 6.1 `math_core.rs` — the numerical kernel
 
This module has zero contract state and zero external calls — it is pure functions over
`I256`, which is exactly what makes it cheap to call from both `distribution_amm.rs` and
`binary_router.rs` (and trivial to unit-test off-chain with `cargo test`, as the 9 tests
at the bottom of the file do).
 
| Formula | Function | Notes |
|---|---|---|
| `wad_mul(a,b) = a*b/1e18`, `wad_div(a,b) = a*1e18/b` | `wad_mul`, `wad_div` | All other functions are built from these two; `wad_div` returns `0` on divide-by-zero rather than panicking, which matters because Stylus has no exception unwinding for arithmetic panics inside `no_std` — a panic there would burn the whole call's gas |
| `e^x = sum_{n=0}^{18} x^n/n!` | `exp_wad` | Iterative term update (`term = wad_mul(term, x) / n`) avoids recomputing `x^n` and `n!` from scratch each iteration — O(1) per term instead of O(n) |
| `erf(x) ~ 1 - poly(t)*e^{-x^2}`, `t = 1/(1+px)` | `erf_approx` | Handles sign separately (`erf` is odd) so the polynomial only needs to be evaluated for `x >= 0` |
| `Phi(z) = (1 + erf(z/sqrt2))/2` | `normal_cdf` | Guards `sigma <= 0` up front — a degenerate distribution returns `0` rather than dividing by zero |
| `phi(z) = e^{-z^2/2} / (sigma*sqrt(2*pi))` | `normal_pdf` | Currently unused by the AMM/Router (which only need the CDF for pricing) but exposed for potential future use (e.g. marginal-price / slippage estimates) |
| Newton's method `sqrt` | `sqrt_wad` | Uses `x` itself as the initial guess when `x > 1e18`, which is a much better starting point than `x * 1e18` for large values and avoids needless iterations |
| `I256 -> U256` | `safe_to_u256` | Asserts non-negativity rather than reinterpreting two's-complement bits — a defense-in-depth check against a negative CDF/variance ever silently becoming an enormous unsigned number |
 
**A subtle but important design choice:** `wad_mul` and `wad_div` use plain `*` / `/` on
`I256` rather than checked arithmetic. In a `#![no_std]` Stylus contract, an arithmetic
overflow panic aborts the entire transaction with no revert message and burns remaining
gas — so every caller of these functions is implicitly relying on the fact that WAD
values here are bounded (prices and CDFs in `[0, 1e18]`, strikes/sigmas in realistic
ranges, intermediate products inside `I256`'s ~1.16e77 range). The `exp_wad` clamp to
`[-20, 20]` and the `clamp_unit` calls in `normal_pdf`/`normal_cdf` are precisely the
guardrails that keep values inside this safe envelope before they reach `wad_mul`.
 
### 6.2 `distribution_amm.rs` — curve state and collateral
 
This contract owns the three accumulators from Section 2.2 and is the *only* place
`recompute_curve` is called from.
 
**`set_distribution(mu, sigma)`** — owner-only, pre-trading. Implements the prior-seeding
identity directly:
 
```rust
let pw = if self.prior_weight.get() <= I256::ZERO { default_prior_weight() } else { self.prior_weight.get() };
let ex2 = wad_mul(mu, mu) + wad_mul(sigma, sigma);   // E[x^2] = mu^2 + sigma^2
self.acc_stake_weight.set(pw);
self.acc_weighted_x.set(wad_mul(pw, mu));            // Sw*x = pw * mu
self.acc_weighted_x_sq.set(wad_mul(pw, ex2));        // Sw*x^2 = pw * (mu^2 + sigma^2)
```
 
This is the exact `Sigma w x <- w_prior * mu0`, `Sigma w x^2 <- w_prior*(mu0^2+sigma0^2)`
seeding from Section 2.2 — reconstructing mu/sigma from these three numbers via
`recompute_curve` reproduces `(mu0, sigma0)` exactly, by construction. The function also
guards `sigma <= sigma_min` (variance floor) and `trades_started` (the prior can't be
re-seeded once real bets exist — `set_prior_weight` has the same guard).
 
**`recompute_curve`** (private, called at the end of every `underwrite_trade`) is
Section 2.2's formulas verbatim:
 
```rust
let mu = wad_div(self.acc_weighted_x.get(), total_weight);          // mu = Swx / Sw
let ex2 = wad_div(self.acc_weighted_x_sq.get(), total_weight);      // E[x^2] = Swx2 / Sw
let variance = ex2 - wad_mul(mu, mu);                                // Var = E[x^2] - mu^2
let mut sigma = if variance > I256::ZERO { sqrt_wad(variance) } else { I256::ZERO };
if sigma < self.sigma_min.get() { sigma = self.sigma_min.get(); }    // sigma floor
```
 
The `variance > 0` guard before calling `sqrt_wad` is necessary because fixed-point
rounding in `wad_div`/`wad_mul` can occasionally produce a `variance` that is a tiny
negative number even when the true variance is `~0` — `sqrt_wad` is only defined for
non-negative inputs (it returns `0` for `x <= 0`), so this avoids feeding it a spurious
negative and instead floors directly to `sigma_min`.
 
**`underwrite_trade`** — the only function that updates the accumulators, and only when
`weight = premium_i256 > 0` (i.e. only real bets, never zero-stake calls):
 
```rust
self.acc_stake_weight.set(self.acc_stake_weight.get() + weight);
self.acc_weighted_x.set(self.acc_weighted_x.get() + wad_mul(weight, target_x));
self.acc_weighted_x_sq.set(self.acc_weighted_x_sq.get() + wad_mul(weight, x_sq));
self.recompute_curve();
```
 
This is `Sigma w <- Sigma w + w_i`, `Sigma w x <- Sigma w x + w_i*x_i`, `Sigma w x^2 <-
Sigma w x^2 + w_i*x_i^2` — an O(1) running update, no loop over historical bets. Note
also the **collateral accounting** that happens in the same call, independent of the
curve math: `available_liquidity += premium - liability` and `locked_collateral +=
liability`. This is what makes `underwrite_trade` the single atomic point where "a bet
was placed" simultaneously (a) reserves the worst-case payout from the LP pool and (b)
updates the market's belief — a clean separation of *solvency* bookkeeping from *pricing*
bookkeeping, both inside one state transition.
 
**`get_price_for_x`** is the read-only mirror of the Router's pricing logic — `1 -
normal_cdf(x, mu, sigma)` for YES, `normal_cdf(x, mu, sigma)` for NO — exposed so the
frontend/backend can preview prices for arbitrary strikes without simulating a trade.
 
**Fee distribution (`distribute_fee` / `claim_fees_internal`)** is the MasterChef pattern
— not Gaussian math, but worth noting because it's the other piece of "rigorous"
accounting in this contract: `acc_fee_per_share += fee * 1e18 / total_shares`, and each
LP's claimable amount is `shares * acc_fee_per_share / 1e18 - reward_debt`. This is O(1)
regardless of LP count, the standard SushiSwap MasterChef trick.
 
### 6.3 `binary_router.rs` — pricing and trade execution
 
**`buy_internal`** is where Section 2.1's pricing formula is actually evaluated against
live state, and where the **pre-update pricing** guarantee from the README is enforced
by *call ordering*:
 
```rust
let mu = amm.global_mu(self.vm(), config_mu).map_err(...)?;       // 1. read curve BEFORE this trade
let sigma = amm.global_sigma(self.vm(), config_sigma).map_err(...)?;
let p_no = normal_cdf(target_price, mu, sigma);                     // 2. price off that pre-trade curve
let price = if is_yes { wad() - p_no } else { p_no };               // P_YES = 1 - Phi(z), P_NO = Phi(z)
...
amm.underwrite_trade(self.vm(), config_trade, token_id, target_price, net_stake_wad, tokens_minted_wad)?;  // 3. THEN update the curve
```
 
Because steps 1-2 (price computation) happen via `Call::new()` (read-only) *before* step
3 (`Call::new_mutating`, which triggers `recompute_curve`), a trader's own bet cannot
retroactively cheapen or inflate the price they pay — the price they see is the price
the AMM had the instant before their trade landed. This single ordering constraint is
the entire on-chain enforcement mechanism for "pre-update pricing."
 
**Token sizing** implements `tokens = net_stake / price` in WAD terms:
 
```rust
let fee_wad = stake_wad / 100;                    // 1% fee
let net_stake_wad = stake_wad - fee_wad;
let tokens_minted_wad = (net_stake_wad * 1e18) / price_u256;   // tokens = net_stake / price
```
 
Because `price in (0, 1]` (WAD), `tokens_minted >= net_stake` always — a token that costs
$0.20 yields 5 tokens per $1 of net stake, each worth $1 if it wins, so the AMM's maximum
liability for this position is `tokens_minted * $1`, which is exactly the
`max_liability_wad` passed into `underwrite_trade`. The `price_u256 == 0` guard before
this division is the hard backstop against the CDF ever returning exactly zero (which
would only happen at `z -> -infinity`, i.e. an absurdly extreme strike relative to
sigma).
 
**Settlement** (`claim_winnings_internal`) applies Section 1.4's rule directly —
`final_price >= target_x` for YES, `final_price < target_x` for NO — and pays exactly `1
USDC` per WAD-token (`user_balance / 1e12`), which is the $1-per-winning-token
normalization that complementarity (`P_YES + P_NO = 1`) was designed to support: every
token, regardless of its strike, redeems at the same fixed $1, so the AMM's total
liability across all strikes is just `sum of winning token supplies`, independent of how
spread out those strikes were.
 
**Token identity** (`derive_token_id`) is `keccak256(market_id || target_x || is_yes)` —
a content-addressed ID for the continuum of (strike, direction) pairs. This is the
on-chain analogue of "infinite strikes, one pool": there is no enumerable list of
markets-within-the-market; any `(x, is_yes)` a trader chooses deterministically hashes to
its own ERC-1155 token ID, created lazily on first use.
 
### 6.4 `factory.rs` — EIP-1167 clones via Stylus
 
This module is the one piece of the system with no Gaussian math at all, but it has the
most Stylus-specific engineering, since **CREATE2 is not directly exposed by the Stylus
SDK** the way Solidity's `create2` opcode is.
 
**The 55-byte creation code (`build_eip1167_creation_code`)** is hand-assembled raw EVM
bytecode matching OpenZeppelin's `Clones.sol` byte-for-byte:
 
- `3d602d80600a3d3981f3` (10 bytes) — init code that copies the 45-byte runtime to
  memory and returns it as the deployed bytecode
- `363d3d373d3d3d363d73` + `<20-byte implementation address>` (30 bytes) — runtime
  prefix that copies calldata into memory
- `5af43d82803e903d91602b57fd5bf3` (15 bytes) — the `DELEGATECALL` and
  return/revert-bubbling suffix
This is the *exact* minimal-proxy pattern from EIP-1167 — every market's AMM, Router, and
LP Token proxy is a 45-byte runtime that `DELEGATECALL`s into one shared implementation,
so adding a new market costs roughly 3 x 45 bytes of new code plus storage
initialization, not 3 x (full contract bytecode).
 
**`market_salt(market_id, domain)`** packs the market ID into the first 31 bytes of a
`B256` salt and a single domain tag byte (`0` = AMM, `1` = Router, `2` = LP Token) into
the last byte. This guarantees the three proxies for a given market land at three
*different*, deterministically-derivable addresses, while still being a pure function of
`(market_id, domain)` — useful for off-chain tooling (the backend/indexer) that wants to
predict a market's addresses before `create_market` is even mined.
 
**`RawDeploy::new().salt(salt).deploy(vm, &bytecode, U256::ZERO)`** is the Stylus SDK's
`unsafe` low-level deploy primitive — `unsafe` because the SDK cannot statically verify
that `bytecode` is well-formed EVM bytecode (unlike normal Stylus contract deployment,
which goes through WASM validation). This is the price of doing CREATE2 from inside a
Stylus contract: there's no high-level "deploy this Rust struct as a clone" API, so the
factory drops to raw bytecode assembly, the same primitive a Solidity contract calling
the EVM `CREATE2` opcode directly would use.
 
**Initialize-then-wire-then-handoff** is the sequence the diagram shows: the factory is
briefly the `owner` of all three freshly-deployed proxies (so it alone can call
`set_router_address`, `set_lp_token`, `set_usdc_token`, `set_sigma_min`,
`set_amm_address`, `set_market_id`), and only *after* all six wiring calls succeed does
it call `transfer_ownership(creator)` on the AMM and Router (LP Token's owner is
permanently the AMM proxy, by design — only the AMM can `mint`/`burn` LP shares). The
two-step ownership transfer (`transfer_ownership` + `accept_ownership`) is the standard
OpenZeppelin `Ownable2Step` pattern, reimplemented manually since Stylus doesn't ship
inheritable contract mixins the way Solidity's OpenZeppelin does.
 
### 6.5 `lp_token.rs` — accounting primitive, deliberately incomplete ERC-20
 
The LP token is an ERC-20-shaped contract with `transfer` and `transferFrom` hardcoded to
`Err(Error::Unauthorized)` — this is intentional, not a bug. Section 1's
manipulation-resistance argument depends on `add_liquidity`/`remove_liquidity` being the
*only* way LP share balances change (so that `claim_fees_internal`'s `reward_debt`
bookkeeping in `distribution_amm.rs` always sees a balance that moved only through
`mint`/`burn`, both of which immediately update `reward_debt`). A transferable LP token
would let shares move between addresses without going through `add_liquidity_internal` /
`remove_liquidity_internal`, silently desyncing `reward_debt` from `balance_of` and
letting a buyer of "used" LP tokens claim fees they didn't earn (or a seller forfeit fees
they did). Making the token explicitly non-transferable closes this off at the type
level rather than relying on the AMM to police it.
 
`mint`/`burn` are restricted to `msg_sender() == owner` (the AMM proxy, set once at
`initialize` time by the factory) — this is the cross-contract authorization edge in the
diagram above (`AMM -> LP token: mint/burn authority`).
 
---
 
## 7. Arbitrum Stylus & ecosystem best practices
 
OmniCurve's central pitch is "math that would be prohibitively expensive (or simply
impractical) in Solidity becomes cheap in Stylus." The codebase backs this up with
several concrete patterns worth calling out:
 
**Why Stylus for this specific math.** An 18-term Taylor series, a 5-term rational erf
approximation, and a 128-iteration Newton's method square root are, combined, on the
order of 150-200 arithmetic operations *per CDF evaluation*, and `normal_cdf` /
`recompute_curve` run on every single trade. In the EVM interpreter, each `MUL`/`DIV` on
a 256-bit word costs a fixed 5 gas regardless of the actual computation, but the
*dispatch overhead* of an interpreted bytecode loop dominates for tight numerical loops.
Stylus compiles this Rust to WASM, which is executed by a near-native WASM runtime —
the same Newton's-method loop that would cost tens of thousands of gas as hand-rolled
EVM bytecode runs as compiled machine instructions, which is the entire reason the
README can claim this is viable on every trade rather than only at market-creation time.
 
**`I256` over floating point.** There is no floating point in `no_std` Stylus (and no
floating point in the EVM at all) — every primitive in `math_core.rs` operates on
`alloy_primitives::I256`, Alloy's 256-bit signed integer, with WAD (1e18) fixed-point
scaling. This is the same convention used by Solidity DeFi (Uniswap, Compound, etc.), so
the `wad_mul`/`wad_div` helpers are a drop-in mental model for anyone coming from
Solidity, while the actual arithmetic runs as native `i256` operations in WASM.
 
**Reentrancy guards are explicit, not inherited.** Every state-mutating, fund-moving
function (`claim_fees`, `add_liquidity`, `remove_liquidity`, `payout_winnings`,
`sweep_dust` in the AMM; `claim_winnings` in the Router) follows the same
`if self.locked.get() { return Err(...) } self.locked.set(true); ...; self.locked.set(false);`
pattern. Stylus's `sol_storage!` macro doesn't provide an OpenZeppelin-style
`nonReentrant` modifier out of the box, so this is hand-rolled — but it's applied
*consistently* across both contracts, which is the property that matters more than the
mechanism.
 
**Cross-contract calls via `sol_interface!`.** `interfaces.rs` defines `IERC20`,
`IProxyAmm`, `IProxyRouter`, `ILpToken` using the `sol_interface!` macro, which generates
typed Rust bindings that ABI-encode/decode exactly as a Solidity contract would expect.
This is what lets the Stylus AMM proxy call `usdc.transfer_from(...)` against an ordinary
Solidity ERC-20 (the deployed USDC mock), and what lets `binary_router.rs` call
`IDistributionAmm::new(amm_address).global_mu(...)` against the AMM proxy — Stylus
contracts and Solidity contracts are ABI-compatible and freely interoperate on Arbitrum,
which is why the factory can clone Stylus implementations using the *Solidity*
EIP-1167 proxy pattern without any special-casing.
 
**`Call::new()` vs `Call::new_mutating(&mut *self)`.** The codebase consistently
distinguishes read-only cross-contract calls (`Call::new()`, used for `global_mu`,
`global_sigma`, `balance_of`) from state-mutating ones (`Call::new_mutating(&mut *self)`,
used for `transfer`, `mint`, `underwrite_trade`). This isn't just style — it's what makes
the "pre-update pricing" guarantee in Section 3.3 visible in the type system: a reviewer
can see, from the call signature alone, that the `global_mu`/`global_sigma` reads in
`buy_internal` cannot have been affected by anything this transaction has done so far.
 
**Feature-gated single-crate, four-binary build.** `main.rs`/`lib.rs` use Cargo feature
flags (`amm`, `router`, `factory`, `lp-token`) to compile *one* crate into *four*
separate WASM binaries, each with only the relevant module included via `#[cfg(...)]`.
This avoids duplicating `math_core.rs` and `interfaces.rs` across four crates while still
producing minimal, single-purpose WASM blobs for deployment — each contract pays gas
only for the code paths it actually contains.
 
**Defense-in-depth on type conversions.** `safe_to_u256` (used everywhere a WAD `I256`
price, variance, or balance needs to become a `U256` for a token transfer) explicitly
asserts non-negativity rather than relying on `U256::from(value.into_raw())`, which would
silently reinterpret a negative `I256`'s two's-complement bit pattern as an enormous
positive `U256` — a class of bug that, combined with `clamp_unit`'s guarantee that CDFs
stay in `[0, 1e18]`, makes "negative price becomes near-infinite USDC transfer" an
unreachable state by construction in two independent ways (clamping at the math layer,
asserting at the conversion layer).
 
**Two-phase resolution with on-chain timelock.** `propose_resolution` /
`cancel_resolution` / `execute_resolution` implement a 24-hour dispute window using
`self.vm().block_timestamp()` directly — no off-chain keeper or oracle dependency for the
*timing* of resolution (only the *final price* itself is owner-supplied, which the
README is upfront about as a hackathon simplification rather than a production design).
 
## 8. Future plans: an AI oracle for resolution

Everything in Sections 6–7 is about getting *pricing* right and fully trustless on-chain.
The one piece OmniCurve still resolves **manually** is the *outcome* itself: today the
market owner calls `Router.set_final_price(final_price)` by hand (Section 1.4). That is an
honest hackathon simplification — and it is also the single highest-leverage thing to
remove before the protocol handles real capital. "The operator decides who wins" is
acceptable for a PoC and unacceptable for a product.

Our planned answer is **not** a single price feed and **not** a single large language
model, but a **multi-agent AI oracle**, following Kota, *Design and Evaluation of
Multi-Agent AI Oracle Systems for Prediction Market Resolution*
([arXiv:2605.30802](https://arxiv.org/pdf/2605.30802)). The paper's central observation is
that a lone model is a fragile oracle:

> "Single AI models are prone to hallucinations, sycophancy, and systematic biases that
> undermine oracle reliability."

The remedy is redundancy and disagreement *by design* — a panel of architecturally
diverse models that argue, vote with calibrated weights, and are explicitly allowed to
**decline** when they are not sure:

> "Multiple AI agents debate competing resolutions, exposing errors through adversarial
> discussion."

> "Agent predictions are aggregated using weighted voting schemes that account for
> confidence calibration."

> "Confidence thresholds enable oracles to abstain when uncertainty exceeds acceptable
> bounds."

The crux for OmniCurve is that this machinery has to produce exactly **one** thing: a
single `final_price` (plus a calibrated confidence), or an **abstention** that quietly
hands control back to the existing human-dispute path. The diversity, the debate, and the
weighted vote all exist to make that one number trustworthy — and the model *monoculture*
defense the paper stresses (uncorrelated architectures so failures don't line up) is what
keeps the panel from confidently agreeing on the same wrong answer.

### 8.1 The resolution pipeline

The paper's pipeline maps cleanly onto OmniCurve's settlement, because settlement only
ever needs that one output:

```
Question intake          market question + resolution criteria (off-chain metadata)
        │                normalized into a single resolvable prompt
        ▼
Evidence gathering   ┌─ each agent independently retrieves sources and
& verification       │  fact-checks them for credibility
        │            └─ "validate information credibility through fact-checking"
        ▼
Multi-agent          ┌─ α  β  γ  δ   ← architecturally diverse models
deliberation         │  └─ debate competing resolutions, surface each other's errors
(adversarial debate) └─ "expose errors through adversarial discussion"
        ▼
Consensus            ┌─ confidence-weighted vote over agent verdicts
aggregation          └─ → candidate final_price + aggregate confidence
        ▼
Confidence           ┌─ confidence ≥ τ ?  ── no ──▶ ABSTAIN (fall back to manual /
thresholding         │                              24h dispute window)
(selective abstain)  └─ yes ──▶ accept
        ▼
Resolution output ───▶ Router.set_final_price(final_price)
                       (then the existing per-position settlement of Section 1.4)
```

| Stage | Paper term | What it does | OmniCurve binding |
|:------|:-----------|:-------------|:------------------|
| 1 | Question intake | Turns the market's question + resolution criteria into one normalized prompt | Sourced from the off-chain market metadata (`title`, resolution rule) |
| 2 | Evidence gathering & verification | Each agent retrieves and credibility-checks sources independently | Off-chain; reduces single-source failure |
| 3 | Multi-agent deliberation | Diverse models debate competing resolutions, exposing each other's errors | The redundancy + monoculture defense layer |
| 4 | Consensus aggregation | Confidence-weighted vote → a single candidate `final_price` | Produces the one number settlement needs |
| 5 | Confidence thresholding | Abstain if aggregate confidence < τ; otherwise accept | Maps to "don't resolve, dispute instead" |
| 6 | Resolution output | Writes the accepted price on-chain | `Router.set_final_price` → Section 1.4 payout rules |

### 8.2 How it plugs into the existing contracts

Crucially, this is a change *around* the contracts, not *to* the pricing core. The
two-phase resolution timelock (`propose_resolution` → 24h → `execute_resolution`,
Section 2.6) was deliberately built so an oracle read can slot in where the manual
`winning_id` is supplied today — the *timing* of resolution is already trustless
on-chain, and only the *final price* is owner-supplied. Three properties make the
integration low-risk:

- **Settlement math is unchanged.** The oracle only ever supplies `final_price`; the
  per-position rule (`final_price ≥ X` for YES, `< X` for NO, Section 1.4) and the
  $1-per-winning-token payout stay exactly as they are. The AI never touches μ/σ or
  pricing — belief and settlement remain cleanly separated.
- **Abstention is a first-class outcome.** When the panel's aggregate confidence falls
  below the threshold, the oracle writes nothing and the market simply remains in its
  pre-resolution state, leaving the 24-hour timelock and human dispute path in control.
  An uncertain oracle degrades to today's manual flow rather than guessing.
- **The timelock *is* the dispute window.** Because `propose_resolution` already starts a
  24h timer that anyone can inspect and the owner can `cancel_resolution` during, an
  incorrect oracle resolution can be caught and cancelled before `execute_resolution`
  finalizes it — the same safety rail the paper's confidence thresholding is designed to
  complement.

The animated walkthrough of this exact pipeline lives in the frontend protocol docs
(`/docs`), where each stage of the paper's workflow is drawn and explained as you scroll.
