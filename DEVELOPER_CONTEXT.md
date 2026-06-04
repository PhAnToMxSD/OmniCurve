# OmniCurve Developer Context & Architecture Guardrails

## Project Overview
OmniCurve is a unified continuous distribution prediction market protocol built on Arbitrum Stylus (Rust/WASM). It collapses fragmented binary prediction pools into a single continuous liquidity pool governed by an L² Norm Constant Function Invariant (||f||₂ = k) using Gaussian probability density functions.

## Technical Stack
- Monorepo Manager: pnpm Workspaces
- Smart Contracts: Arbitrum Stylus (Rust, #![no_std])
- Backend: Node.js, TypeScript, Express, WebSockets
- Indexer: The Graph Subgraph / Goldsky
- Frontend: React, TypeScript, Tailwind CSS, Wagmi/Viem

## Monorepo Directory Layout Target
The workspace must strictly follow this structure (as specified in image_3fb89d.png):
├── packages/
│   ├── contracts/     # Arbitrum Stylus Rust project
│   ├── backend/       # Node.js / TypeScript API & WS server
│   ├── frontend/      # React / TypeScript UI
│   └── types/         # Shared TypeScript interfaces & generated ABIs
├── docker-compose.yml # Local development infrastructure (Postgres, Redis, Anvil)
├── pnpm-workspace.yaml
└── package.json       # Root workspace configuration