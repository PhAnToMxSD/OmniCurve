# OmniCurve Frontend — Build Instructions

This is the React + TypeScript frontend for OmniCurve, a Gaussian continuous distribution prediction market protocol on Arbitrum Sepolia. The frontend connects to the backend API (port 3001), a Socket.io real-time feed, and Arbitrum Sepolia smart contracts via Wagmi/Viem.

**Do not start implementing until the scaffold is complete (Phase 0). Always implement phases in order.**

---

## Aesthetic Direction: "Signal / Noise"

A quantitative finance terminal where probability is a measurable signal. The Gaussian curve is never decoration — it *is* the UI. Think oscilloscope readouts crossed with a research terminal.

### Design Tokens (CSS Variables in `src/styles/globals.css`)

```css
--bg-base:        #060810;     /* deep cosmic blue-black */
--bg-surface:     rgba(255,255,255,0.04);
--bg-surface-2:   rgba(255,255,255,0.07);
--border:         rgba(255,255,255,0.08);
--text-primary:   #E2DDD4;     /* warm off-white */
--text-muted:     rgba(226,221,212,0.45);
--accent-yes:     #22D3A3;     /* teal-mint — YES / above-threshold */
--accent-no:      #FF4560;     /* signal red — NO / below-threshold */
--accent-data:    #FFB800;     /* amber — prices, key numbers */
--accent-data-dim: rgba(255,184,0,0.15);
--grid-line:      rgba(255,255,255,0.04); /* graph-paper background */
```

### Typography

Load from Google Fonts in `index.html`:
- `Syne` (weights 400, 600, 700, 800) — display, headings, nav
- `JetBrains Mono` (weights 400, 500) — ALL numbers, prices, addresses, percentages
- `DM Serif Text` (weight 400, italic) — body copy, descriptions

**Rule:** Every numeric value rendered in the UI must use `font-family: 'JetBrains Mono'`. Never use a sans-serif font for data.

### Background Texture

Apply a faint graph-paper grid via CSS `background-image` on `body`:
```css
background-image:
  linear-gradient(var(--grid-line) 1px, transparent 1px),
  linear-gradient(90deg, var(--grid-line) 1px, transparent 1px);
background-size: 40px 40px;
```

---

## Tech Stack

| Package | Purpose |
|---|---|
| `vite` + `@vitejs/plugin-react` | Build tool |
| `react` + `react-dom` (v18) | UI framework |
| `react-router-dom` v6 | Routing |
| `wagmi` v2 | Contract reads/writes |
| `viem` v2 | ABI encoding, type-safe contract calls |
| `@rainbow-me/rainbowkit` v2 | Wallet connect UI |
| `@tanstack/react-query` v5 | Server-state caching |
| `socket.io-client` v4 | Real-time from backend |
| `d3` v7 | Gaussian curve SVG math + rendering |
| `framer-motion` v11 | All animations |
| `react-hook-form` v7 + `zod` v3 | Form validation |
| `tailwindcss` v3 | Styling |
| `clsx` + `tailwind-merge` | Conditional class utilities |

---

## Directory Structure

```
packages/frontend/
├── CLAUDE.md
├── package.json
├── vite.config.ts          ← proxy /api/* and /socket.io/* to localhost:3001
├── tsconfig.json
├── tailwind.config.ts      ← design tokens wired to CSS variables
├── postcss.config.js
├── index.html              ← Google Fonts imports
└── src/
    ├── main.tsx            ← Providers: Wagmi, RainbowKit, ReactQuery
    ├── App.tsx             ← React Router routes
    ├── config/
    │   ├── wagmi.ts        ← arbitrumSepolia chain + RainbowKit connectors
    │   └── contracts.ts    ← all addresses + ABIs
    ├── lib/
    │   ├── api.ts          ← typed REST client
    │   ├── socket.ts       ← singleton Socket.io client
    │   └── math.ts         ← client-side Gaussian CDF + WAD helpers
    ├── hooks/
    │   ├── useMarkets.ts
    │   ├── useMarket.ts
    │   ├── useMarketSocket.ts
    │   ├── usePriceSocket.ts
    │   ├── usePortfolio.ts
    │   ├── useTrade.ts
    │   ├── useLP.ts
    │   └── useCreateMarket.ts
    ├── components/
    │   ├── layout/
    │   │   ├── Navbar.tsx
    │   │   └── PageWrapper.tsx
    │   ├── ui/
    │   │   ├── Button.tsx
    │   │   ├── Input.tsx
    │   │   ├── Slider.tsx
    │   │   ├── Badge.tsx
    │   │   ├── Modal.tsx
    │   │   ├── Tooltip.tsx
    │   │   ├── Toast.tsx
    │   │   └── Tabs.tsx
    │   ├── wallet/
    │   │   └── ConnectButton.tsx
    │   └── market/
    │       ├── GaussianChart.tsx
    │       ├── MarketCard.tsx
    │       ├── StrikeSlider.tsx
    │       ├── StakerPanel.tsx
    │       ├── LPPanel.tsx
    │       └── CreateMarketModal.tsx
    ├── pages/
    │   ├── Landing.tsx
    │   ├── Marketplace.tsx
    │   ├── MarketDetail.tsx
    │   ├── UserDashboard.tsx
    │   └── Docs.tsx
    └── styles/
        └── globals.css
```

---

## Phase 0 — Scaffold

1. Rewrite `package.json` with all dependencies listed above.
2. Create `vite.config.ts` — include `server.proxy` to forward `/api` and `/socket.io` to `http://localhost:3001`.
3. Create `tsconfig.json` — strict mode, `paths` alias `@/*` → `src/*`.
4. Create `tailwind.config.ts` — extend theme with the palette above as CSS-variable-backed tokens.
5. Create `postcss.config.js` — tailwind + autoprefixer.
6. Create `index.html` — Google Fonts links for Syne, JetBrains Mono, DM Serif Text.
7. Create `src/styles/globals.css` — CSS variables, graph-paper background, base resets.
8. Create `src/main.tsx` — provider tree (WagmiProvider → RainbowKitProvider → QueryClientProvider → RouterProvider).
9. Create `src/App.tsx` — all 5 routes stubbed with placeholder `<div>` components.

Run `pnpm --filter @omnicurve/frontend dev` — verify blank app loads.

---

## Phase 1 — Config & Infrastructure

### `src/config/contracts.ts`

```ts
export const FACTORY_ADDRESS = "0x1bbdb700863309ab2588c9d64786bd0ac376d150"
export const USDC_ADDRESS    = "0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d"
export const CHAIN_ID        = 421614 // arbitrum sepolia

// Import ABIs from the shared types package
import AMM_ABI    from "@omnicurve/types/abis/distribution_amm.json"
import ROUTER_ABI from "@omnicurve/types/abis/binary_router.json"
import FACTORY_ABI from "@omnicurve/types/abis/factory.json"

// Minimal USDC ABI — only what we need
export const USDC_ABI = [
  { name: "approve",   type: "function", inputs: [{name:"spender",type:"address"},{name:"amount",type:"uint256"}], outputs:[{type:"bool"}], stateMutability:"nonpayable" },
  { name: "allowance", type: "function", inputs: [{name:"owner",type:"address"},{name:"spender",type:"address"}], outputs:[{type:"uint256"}], stateMutability:"view" },
  { name: "balanceOf", type: "function", inputs: [{name:"account",type:"address"}], outputs:[{type:"uint256"}], stateMutability:"view" },
] as const
```

ABIs for AMM proxy and Router proxy are fetched per-market: `market.ammAddress` and `market.routerAddress` are returned by `GET /api/markets/:id`.

### `src/config/wagmi.ts`

Configure `arbitrumSepolia` with RainbowKit `getDefaultConfig`. Set up MetaMask, Coinbase, WalletConnect connectors. WalletConnect project ID from `import.meta.env.VITE_WALLETCONNECT_PROJECT_ID`.

### `src/lib/api.ts`

Typed `fetch` wrapper. All functions are async and throw `ApiError` on non-2xx:

```ts
getMarkets(params?: { category?: string; active?: boolean })
  // GET /api/markets → Market[]

getMarket(id: string)
  // GET /api/markets/:id → Market & { positions: Position[] }

getPricePreview(id: string, x: number, direction: 'yes'|'no', stakeAmount?: number)
  // GET /api/markets/:id/price?x=&direction=&stakeAmount=
  // → { pYes, pNo, grossCostWad, feeCostWad }

getLpStats(id: string, address: string)
  // GET /api/markets/:id/lp-stats?address=
  // → { lpBalance, accFeePerShare, pendingRewards }

getPortfolio(address: string)
  // GET /api/users/:address/portfolio → { positions, totalValue }
```

### `src/lib/socket.ts`

Singleton — only one connection shared across the app:

```ts
import { io } from 'socket.io-client'
const socket = io(import.meta.env.VITE_API_BASE_URL ?? '', { autoConnect: false })

export function connectSocket() { socket.connect() }
export function joinMarket(id: string) { socket.emit('joinMarket', id) }
export function leaveMarket(id: string) { socket.emit('leaveMarket', id) }
export function requestPrice(p: { marketId: string; x: number; direction: 'yes'|'no' }) {
  socket.emit('requestPrice', p)
}
export { socket }
```

Connect once in `main.tsx` after providers mount.

### `src/lib/math.ts`

Mirror of `math_core.rs` Gaussian CDF — used for instant local estimates before socket responds:

```ts
// Abramowitz & Stegun 5-coefficient erf approximation (same as on-chain)
export function erf(x: number): number
export function gaussianCDF(x: number, mu: number, sigma: number): number
export function pYes(x: number, mu: number, sigma: number): number // 1 - CDF
export function pNo(x: number, mu: number, sigma: number): number  // CDF

// WAD conversions (WAD = 1e18, USDC = 6 decimals)
export function floatToWad(n: number): bigint    // n * 1e18
export function wadToFloat(w: bigint): number    // w / 1e18
export function usdcToWad(usdc: bigint): bigint  // usdc * 1e12
export function wadToUsdc(wad: bigint): bigint   // wad / 1e12
export function usdcDisplayToRaw(n: number): bigint  // n * 1e6 (user-typed "$100" → 100_000_000n)
```

---

## Phase 2 — Hooks

### `useMarkets`
React Query wrapping `api.getMarkets`. `staleTime: 30_000`, refetch on window focus.

### `useMarket(id)`
React Query wrapping `api.getMarket(id)`. Returns the full market object including `ammAddress`, `routerAddress`, `lpTokenAddress`.

### `useMarketSocket(id)`
On mount: call `joinMarket(id)`. On unmount: call `leaveMarket(id)`. Listen to `socket.on('marketStateUpdated', ...)` and `socket.on('marketResolved', ...)`. Returns:
```ts
{
  liveState: { currentMu: number; currentSigma: number; totalLiquidity: number } | null,
  isResolved: boolean,
  winningTokenId: '1' | '2' | null
}
```
`liveState` starts as `null`; the server sends an immediate snapshot on `joinMarket`.

### `usePriceSocket({ marketId, x, direction })`
Debounced (50ms) — on each change to `x` or `direction`, emit `requestPrice`. Listen to `priceUpdate`. While waiting, return local estimate from `lib/math.ts`. Returns:
```ts
{ pYes: number; pNo: number; isLoading: boolean }
```

### `useTrade({ marketId, ammAddress, routerAddress })`
Orchestrates the full buy transaction flow using Wagmi hooks:

```
Step 1: useReadContract — USDC allowance(wallet, routerAddress)
Step 2: If allowance < cost → useWriteContract approve(routerAddress, MaxUint256)
Step 3: Wait for approval receipt
Step 4: useWriteContract buyYes(targetPriceWad, tokenAmountWad) or buyNo(...)
Step 5: Wait for trade receipt → invalidate useMarket + usePortfolio queries → toast
```

Return shape:
```ts
{
  step: 'idle' | 'approving' | 'approved' | 'buying' | 'confirmed' | 'error',
  execute: (params: TradeParams) => void,
  txHash: string | undefined,
  error: Error | undefined,
}
```

### `useLP({ marketId, ammAddress })`
Same approval-then-write pattern for:
- `add`: approve USDC to `ammAddress`, then `amm.addLiquidity(amountWad, targetMuWad, targetSigmaWad)`
- `remove`: `amm.removeLiquidity(sharesToRemoveWad)` (no approval needed)
- `claim`: `amm.claimFees()`

### `usePortfolio(address)`
React Query wrapping `api.getPortfolio(address)`. Only enabled when `address` is defined.

### `useCreateMarket()`
`factory.createMarket(USDC_ADDRESS, sigmaMinWad)`. On receipt, read the `MarketCreated` log, extract new market `index`. Navigate to `/markets/:index`. Invalidate `useMarkets`.

---

## Phase 3 — UI Primitives

Build all components in `src/components/ui/` before any page work.

### Button
Variants: `primary` (amber fill, dark text), `ghost` (amber border, transparent), `danger` (red), `muted`.
Loading state: replace children with a small spinner. Disabled state: reduced opacity.

### Input
Dark surface background, `JetBrains Mono` font for `type="number"`. Props: `label`, `error`, `suffix` (e.g. "USDC"), `prefix` (e.g. "$").

### Slider
Custom `<input type="range">` — styled track with teal fill on the left of the thumb, red on the right. Emits `onChange` continuously for real-time preview.

### Modal
`createPortal` to `document.body`. Framer Motion `AnimatePresence` with scale + fade. Dark backdrop with blur.

### Toast
Stack in bottom-right. Types: `success` (teal border), `error` (red), `pending` (amber, spinning icon). Auto-dismiss after 5s.

### Tabs
Renders a list of tab labels; underline indicator slides between active tabs using Framer Motion `layoutId`.

---

## Phase 4 — GaussianChart Component

This is the most important component. Build it carefully.

**File:** `src/components/market/GaussianChart.tsx`

**Props:**
```ts
interface GaussianChartProps {
  mu: number        // current mean (WAD float — already divided by 1e18)
  sigma: number     // current std dev (WAD float)
  strikeX?: number  // selected strike price (same unit as mu)
  direction?: 'yes' | 'no'
  width?: number
  height?: number
}
```

**Rendering steps:**
1. Compute x-domain: `[mu - 4*sigma, mu + 4*sigma]`
2. Generate 300 sample points across domain; compute `gaussianPDF(x, mu, sigma)` for each
3. D3 `scaleLinear` for x and y axes
4. D3 `area` generator for the filled bell curve
5. When `strikeX` is set: render TWO area fills — NO region (left of `strikeX`, red at 15% opacity) and YES region (right of `strikeX`, teal at 15% opacity)
6. The curve path itself: white stroke, 2px, SVG `filter: drop-shadow(0 0 6px var(--accent-yes))`
7. Vertical dashed amber line at `mu` — labeled "μ" above
8. When `strikeX` set: animated vertical amber line at strike. Probability labels: P(YES) in teal on right, P(NO) in red on left
9. X axis with 5 labeled ticks, Y axis hidden
10. All text uses `JetBrains Mono`

**Animation:** When `mu` or `sigma` change, animate the path using D3 `.transition().duration(400).ease(d3.easeCubicInOut)`. Strike line updates instantly on drag (no transition).

**Responsive:** Use a `ResizeObserver` on the container `div` to update `width`.

---

## Phase 5 — Market Interaction Components

### StakerPanel (`src/components/market/StakerPanel.tsx`)

**State:** `strikeX` (from slider), `direction` ('yes'|'no'), `stakeAmount` (USDC string)

**Layout:**
```
Strike Price input + StrikeSlider (range: mu ± 3σ)
Direction toggle: [YES ↑] [NO ↓]
Amount input (USDC)

── Price Preview ──────────────────
P(YES)  0.7341         P(NO)  0.2659
Gross cost:  $101.01
Fee:          $1.01
Tokens you receive: 137.6

── Actions ────────────────────────
[Approve USDC]  or  [Buy YES / Buy NO]
Step indicator: Approve → Confirm → Done
```

**Price data flow:**
- As slider or direction changes → `usePriceSocket` (debounced, 50ms)
- Instant local estimate via `lib/math.ts` while socket responds
- `stakeAmount` typed by user → call `api.getPricePreview(id, x, direction, stakeAmount)` via React Query with debounce

**Contract call parameters:**
- `targetPriceWad = floatToWad(strikeX)`
- `tokenAmountWad`: derived from backend preview: `grossCostWad / priceWad * 1e18`
  - Use `BigInt(Math.round(grossCostWad / pYes))` for YES, or `/pNo` for NO

### LPPanel (`src/components/market/LPPanel.tsx`)

Three tabs: Deposit | Withdraw | Claim

**Deposit tab:**
- Amount input (USDC)
- `targetMu` + `targetSigma` inputs — only shown/enabled if `!market.tradesStarted`. Display note: "Curve is locked after first trade — these parameters will be ignored."
- LP tokens estimate: `shares ≈ amountWad / totalLiquidity * totalLpSupply` (read `totalSupply` from LP token contract via `useReadContract`)
- Actions: [Approve USDC] → [Add Liquidity]

**Withdraw tab:**
- LP token amount input
- Estimated USDC back: `sharesToRemove / totalLpSupply * totalLiquidity`
- Action: [Remove Liquidity]

**Claim tab:**
- Pending fees in USDC (from `api.getLpStats`)
- Action: [Claim Fees]

### CreateMarketModal (`src/components/market/CreateMarketModal.tsx`)

Form fields (validated with `react-hook-form` + Zod):
- `title` (string, required) — stored in DB, not on-chain
- `category` (select: Crypto | Macro | Sports | Other)
- `sigmaMin` (number > 0) — minimum sigma in display units, converted to WAD on submit

On submit:
1. Convert `sigmaMin` to WAD: `floatToWad(sigmaMin)`
2. Call `factory.createMarket(USDC_ADDRESS, sigmaMinWad)`
3. On confirmation: extract new market index from receipt logs → navigate to `/markets/:index`

---

## Phase 6 — Pages

### Landing (`src/pages/Landing.tsx`)

- Full-viewport hero: animated Gaussian SVG (sigma gently oscillates 0.8x ↔ 1.2x on 4s loop using Framer Motion)
- Headline: **"Every Outcome, One Curve"** in `Syne` 800 weight
- Sub: "OmniCurve collapses prediction markets into a single continuous liquidity curve."
- Two CTA buttons: `[Enter Markets]` → `/markets`, `[Read the Docs]` → `/docs`
- Staggered load animation: headline chars animate in from bottom, delay cascade
- Stats bar: Total Markets, Total Liquidity (sum from `useMarkets`), Markets Resolved

### Docs (`src/pages/Docs.tsx`)

Sticky left sidebar with anchor links. Main content area with generous type leading.

Sections:
1. **The Problem** — binary pools, fragmented liquidity
2. **The Solution** — single Gaussian pool; inline static `GaussianChart` (mu=100, sigma=15) as illustration
3. **How Pricing Works** — explains `P_YES(x) = 1 − CDF(x, μ, σ)`. Include a live interactive mini-chart: user drags strike, sees probabilities update client-side via `lib/math.ts`.
4. **For Traders** — how to buy YES/NO tokens, settlement, claiming winnings
5. **For LPs** — liquidity provision, MasterChef fee distribution, non-transferable LP tokens
6. **Architecture** — Stylus/WASM, EIP-1167 proxy factory, two-phase resolution
7. **Known Risks** — manual oracle, no slippage protection, `claim_fees` WAD bug (fees may be locked)

### Marketplace (`src/pages/Marketplace.tsx`)

- Header: "Markets" + `[+ Create Market]` button (opens `CreateMarketModal`, only if wallet connected)
- Search input: client-side filter on `market.title`
- Category filter tabs: All | Crypto | Macro | Other
- Toggle: Active / Resolved
- Responsive card grid: `grid-cols-1 md:grid-cols-2 xl:grid-cols-3`
- Each card: `MarketCard.tsx` — title, mini Gaussian SVG, μ/σ values, liquidity, status badge, click → `/markets/:id`

### MarketDetail (`src/pages/MarketDetail.tsx`)

Route: `/markets/:marketId`

Layout:
```
Market Title                         [LIVE / RESOLVED] badge
μ: 95,000   σ: 2,500   Liquidity: $12,450
──────────────────────────────────────
[GaussianChart — full width, 340px tall, live-updating]
──────────────────────────────────────
[TRADE]  [PROVIDE LIQUIDITY]     ← Tabs
[StakerPanel  or  LPPanel]
──────────────────────────────────────
Market Info
  AMM:    0x7cd2... [Arbiscan link]
  Router: 0xF1F... [Arbiscan link]
  LP Token: 0x2Cd...
  [If resolved]: "Market Resolved — YES Won" banner + [Claim Winnings] button
  [If owner]: [Propose Resolution] or [Execute Resolution] buttons
```

`useMarketSocket(id)` feeds `liveState.currentMu` / `liveState.currentSigma` into `GaussianChart`. When `StakerPanel` sets a `strikeX`, pass it up to `GaussianChart` too.

### UserDashboard (`src/pages/UserDashboard.tsx`)

Route: `/dashboard`. Redirect to `/` if wallet not connected.

Sections:
- Wallet card: ENS/address, total portfolio value in amber
- Open Positions table: market title, direction, strike, tokens held, current implied value, status; [Claim Winnings] if resolved
- LP Positions table: market title, LP token balance, pending fees; [Claim Fees], [Remove Liquidity]

---

## Critical Invariants — Never Get These Wrong

### WAD / USDC Conversions

| Operation | Formula | Notes |
|---|---|---|
| User input "$100" → raw USDC | `100 * 1_000_000n` | USDC has 6 decimals |
| Raw USDC → WAD | `rawUsdc * 1_000_000_000_000n` | Multiply by 1e12 |
| WAD → raw USDC | `wad / 1_000_000_000_000n` | Divide by 1e12 |
| WAD → display | `Number(wad) / 1e18` | Float, for rendering |
| Strike price float → WAD | `floatToWad(strikeX)` | e.g. 95000.0 → 95000n * 1e18 |

### Contract Call Parameters

`buyYes(targetPriceWad, tokenAmountWad)` and `buyNo(...)`:
- `targetPriceWad` — strike price as WAD bigint: `BigInt(Math.round(strikeX * 1e18))`
- `tokenAmountWad` — **number of YES/NO tokens to mint**, not the USDC cost. Derive from preview: given backend returns `pYes` probability and `grossCostWad`, tokens = `grossCostWad * 10n**18n / floatToWad(pYes)`

### USDC Approval Targets

| Operation | Approve target |
|---|---|
| buyYes / buyNo | `routerAddress` |
| addLiquidity | `ammAddress` |
| removeLiquidity / claimFees | No approval needed |

### `trades_started` Flag

Once any trade executes on a market, the `targetMu` / `targetSigma` parameters in `addLiquidity` are silently ignored by the contract. Detect this from `market.tradesStarted` (populated by backend from chain events). In `LPPanel`, hide those inputs and show a locked state indicator.

### Socket Connection Lifecycle

- Connect once: call `connectSocket()` after providers mount in `main.tsx`
- `useMarketSocket` handles room join/leave — multiple components can call it for the same market (Socket.io handles deduplication server-side)
- `usePriceSocket` debounces at 50ms — do not emit on every keystroke or pixel of drag

### Settlement & Claiming

- `settleByPrice(finalPrice)` on Router — only callable by market owner. Compare `useAccount().address === market.ownerAddress` to show/hide.
- `claimWinnings(isYes, amountWad)` on Router — available to anyone with a winning position post-resolution. `amountWad` = their token balance.
- `proposeResolution(winningId)` and `executeResolution()` on AMM — owner only, 24h timelock between the two.

---

## Environment Variables

```
VITE_API_BASE_URL=http://localhost:3001
VITE_FACTORY_ADDRESS=0x1bbdb700863309ab2588c9d64786bd0ac376d150
VITE_USDC_ADDRESS=0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d
VITE_WALLETCONNECT_PROJECT_ID=<your-id>
```

---

## Build Order

Implement strictly in this order to avoid building on broken foundations:

1. Phase 0 — Scaffold (Vite, Tailwind, providers, empty routes)
2. `src/styles/globals.css` — CSS variables, fonts, grid background
3. UI primitives — Button, Input, Slider, Modal, Toast, Tabs, Badge
4. Navbar + layout shell
5. `src/config/contracts.ts` + `src/lib/api.ts` + `src/lib/math.ts`
6. `src/lib/socket.ts`
7. `src/config/wagmi.ts`
8. All hooks (useMarkets, useMarket, useMarketSocket, usePriceSocket, useTrade, useLP, usePortfolio, useCreateMarket)
9. `GaussianChart.tsx` — test with static `mu=100, sigma=15`
10. `MarketCard.tsx` + `StrikeSlider.tsx`
11. Marketplace page — data fetching + card grid
12. `StakerPanel.tsx` — price preview + trade flow
13. `LPPanel.tsx` — LP deposit/withdraw/claim flow
14. MarketDetail page — live chart + staker + LP panels
15. `CreateMarketModal.tsx`
16. Landing page — hero + animated curve + stats
17. Docs page — static content + interactive mini-chart
18. UserDashboard page
19. Polish — loading skeletons, error boundaries, empty states, Framer Motion stagger animations

---

## Arbiscan Links

Use `https://sepolia.arbiscan.io/address/` prefix for all contract address links.
Use `https://sepolia.arbiscan.io/tx/` prefix for transaction hash links.
