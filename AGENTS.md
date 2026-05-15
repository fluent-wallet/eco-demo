# AGENTS.md

## Project Summary

This repository is a pnpm monorepo for small ecosystem demos, currently focused on EIP-4337 and EIP-7702 flows on Conflux eSpace testnet/devnet. The demos should be easy to run locally during development and deployable together through GitHub Pages.

## Tech Stack

- Package manager: pnpm `9.5.0`
- Apps: React + TypeScript + Vite
- EIP-4337 app: React, wagmi, viem, permissionless, Tailwind CSS plugin
- EIP-7702 app: React, viem, ethers, js-conflux-sdk
- Deployment: GitHub Actions Pages workflow builds root `dist/`

## Repository Map

- `apps/eip-4337-demo`: account abstraction workbench.
- `apps/eip-7702-demo`: 7702 authorization and delegated transaction workbench.
- `scripts/dev.mjs`: starts the root dev shell plus app dev servers.
- `scripts/build-pages.mjs`: builds apps and assembles GitHub Pages output.
- `index.html`, `eip-4337/index.html`, `eip-7702/index.html`: local dev shell only.
- `.github/workflows/pages.yml`: Pages deployment.

## Development Workflow

Use root commands:

```sh
pnpm dev
pnpm lint
pnpm build
```

Use `pnpm dev` for visual QA. Use `pnpm lint` and `pnpm build` before committing.

## Current State

- Root local dev shell exists and embeds both app dev servers.
- GitHub Pages build exists and produces `/`, `/eip-4337/`, `/eip-7702/`.
- EIP-4337 demo has wallet/config/contracts/diagnostics panels, UserOperation builder, batch execution, bulk UserOps, and guide modal.
- EIP-7702 demo has network selector, safety notes, authorization list builder, nonce query, and transaction result display.
- README has been expanded with setup, build, deployment, and add-demo instructions.

## Do Not Change Casually

- Contract addresses in `apps/eip-4337-demo/src/constants/contracts.ts`.
- Chain/RPC config in `apps/*/src/config` and `apps/eip-7702-demo/src/constants.ts`.
- `scripts/build-pages.mjs` route mappings without also updating README/local shell if needed.
- `scripts/dev.mjs` fixed ports without updating docs and shell iframe targets.
- Private-key warning copy and red warning styles.

