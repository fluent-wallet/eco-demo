# AGENTS.md

## Read First

Before changing code, read `docs/PROJECT_CONTEXT.md`, `docs/ARCHITECTURE.md`, and `docs/TODO.md`.

## Project Summary

`eco-demo` is a pnpm monorepo for small Conflux eSpace workflow demos. Current scope is EIP-4337 account abstraction and EIP-7702 authorization/delegated transaction flows. Local development uses a unified shell; production publishes a generated root `dist/` to GitHub Pages.

## Tech Stack

- Package manager: pnpm `9.5.0`
- Apps: React + TypeScript + Vite
- EIP-4337: wagmi, viem, permissionless, Tailwind CSS plugin
- EIP-7702: viem, ethers, js-conflux-sdk
- Deployment: GitHub Actions + GitHub Pages

## Repository Map

- `apps/eip-4337-demo`: 4337 workbench
- `apps/eip-7702-demo`: 7702 workbench
- `scripts/dev.mjs`: starts root shell on `4173` and app dev servers on fixed ports
- `scripts/build-pages.mjs`: builds apps and assembles production `dist/`
- `index.html`, `eip-4337/index.html`, `eip-7702/index.html`: local shell pages only
- `docs/`: AI handoff context

## Current State

- Root shell and Pages build are already wired.
- EIP-4337 demo includes wallet/config/contracts/diagnostics panels, UserOperation prepare/send, batch execute, bulk UserOps, and guide modal.
- EIP-7702 demo includes network selector, authorization list editor, nonce query, delegated transaction sender, and result panel.
- Both demos now expose a top-left "返回首页" link for quicker navigation back to the home page.

## Commands

```sh
pnpm install
pnpm dev
pnpm lint
pnpm build
```

Use `pnpm dev` for visual QA. Run `pnpm lint` and `pnpm build` before handoff or commit.

## Do Not Change Casually

- `apps/eip-4337-demo/src/constants/contracts.ts`
- `apps/eip-4337-demo/src/lib/accountAbstraction.ts`
- `apps/eip-4337-demo/src/config/*`
- `apps/eip-7702-demo/src/constants.ts`
- `scripts/dev.mjs`
- `scripts/build-pages.mjs`
- `.github/workflows/pages.yml`
- Private-key warning copy and red warning styles

## Active Risks

- Demo home links currently use absolute `/`; verify behavior under GitHub Pages subpath deployment before treating this as finished.
- 4337 guide modal wording and first-open behavior are still product decisions, not final design.

