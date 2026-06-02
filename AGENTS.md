# AGENTS.md

## Read First

Before changing code, read:

- `docs/PROJECT_CONTEXT.md`
- `docs/ARCHITECTURE.md`
- `docs/TODO.md`

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

- Root shell and Pages build are wired.
- EIP-4337 demo includes topbar wallet control, multi-wallet connect modal, full address display, chain status/switching, runtime config, contracts, diagnostics, guide modal, ABI-driven write calls, CFX transfers, prepare/send UserOperation, executeBatch call lists, and bulk UserOps.
- EIP-4337 ABI builder defaults to FooDapp address + built-in ABI. Other verified contract ABIs are fetched from ConfluxScan and cached by lowercased address in `localStorage` key `eco-demo:eip-4337-abi-cache`; uncached addresses must query ABI before contract method calls are enabled.
- ABI input parsing now validates JSON arrays, tuples, tuple fields, addresses, booleans, signed/unsigned integers, bytes/fixed bytes, payable CFX value, and transfer amounts with user-facing Chinese errors.
- Single `execute` and batch `executeBatch` share the same call-building path; batch mode sends only calls explicitly added to the list, while single CFX transfer bypasses ABI.
- EIP-4337 runtime config exposes `Nonce key` with default `0`. SimpleAccount and Simple7702 both read `EntryPoint.getNonce(sender, key)`. Bulk UserOps assign per-item nonce keys starting from the configured key, sign all prepared requests first, then broadcast the signed UserOps in parallel.
- EIP-4337 Owner private-key and bulk Owner private-key inputs are intentionally shown as plain text for test workflow visibility.
- EIP-4337 has lightweight Node fixture scripts for ABI call encoding, ConfluxScan ABI response parsing, nonce key parsing, and UserOperation nonce offsets.
- EIP-7702 demo includes network selector, authorization list editor, nonce query, delegated transaction sender, and result panel. Injected Fluent/MetaMask helper clients use fallback providers so the page still renders when no wallet extension is present.
- EIP-7702 tx sender and EOA private-key inputs are intentionally shown as plain text for test workflow visibility. Non-empty key input is normalized in `App.tsx` by auto-prefixing `0x` when missing; nonce lookup and delegate sending both rely on that normalized value.
- Both demos expose top-left `返回首页` links that work in local dev and GitHub Pages subpath deployments.
- Production homepage labels the first app as `EIP-4337 Demo`.

## Commands

```sh
pnpm install
pnpm dev
pnpm lint
pnpm build
pnpm --filter @eco-demo/eip-4337-demo test:contract-calls
pnpm --filter @eco-demo/eip-4337-demo test:conflux-scan-abi
pnpm --filter @eco-demo/eip-4337-demo test:nonce-key
pnpm --filter @eco-demo/eip-4337-demo test:user-operation-nonce
```

Use `pnpm dev` for visual QA. Run relevant fixture scripts plus `pnpm lint` and `pnpm build` before handoff or commit.

## Do Not Change Casually

- `apps/eip-4337-demo/src/constants/contracts.ts`
- `apps/eip-4337-demo/src/lib/accountAbstraction.ts`
- `apps/eip-4337-demo/src/lib/contractCalls.ts`
- `apps/eip-4337-demo/src/config/*`
- `apps/eip-7702-demo/src/constants.ts`
- `scripts/dev.mjs`
- `scripts/build-pages.mjs`
- `.github/workflows/pages.yml`
- Private-key warning copy and red warning styles; private-key flows must remain visibly test-account only and current test workflows expect visible private-key inputs

## Active Risks

- 4337 guide modal wording and first-open behavior are still product decisions, not final design.
- ABI-driven call builder has focused fixtures, but should still be checked against more real verified contracts before broadening ABI support.
- There are no post-build smoke checks for generated Pages routes yet.
- 4337 remains Conflux eSpace Testnet only. Sepolia support was reverted; do not reintroduce multi-network support unless explicitly requested.
