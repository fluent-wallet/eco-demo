# AGENTS.md

## Read First

Before changing code, read:

- `docs/PROJECT_CONTEXT.md`
- `docs/ARCHITECTURE.md`
- `docs/TODO.md`

## Project Summary

`eco-demo` is a pnpm monorepo for small Conflux eSpace workflow demos. Current scope is EIP-4337 account abstraction, EIP-7702 authorization/delegated transaction flows, and ERC-2612/DAI-style/Uniswap Permit2 wallet-signature testing. Local development uses a unified shell; production publishes a generated root `dist/` to GitHub Pages.

## Tech Stack

- Package manager: pnpm `9.5.0`
- Apps: React + TypeScript + Vite
- EIP-4337: wagmi, viem, permissionless, Tailwind CSS plugin
- EIP-7702: viem, ethers, js-conflux-sdk
- Permit: wagmi, viem, react-joyride; do not add ethers to this app
- Deployment: GitHub Actions + GitHub Pages

## Repository Map

- `apps/eip-4337-demo`: 4337 workbench
- `apps/eip-7702-demo`: 7702 workbench
- `apps/permit-demo`: ERC-2612, DAI-style Permit, and Permit2 signature/transfer workbench
- `scripts/dev.mjs`: starts root shell on `4173` and app dev servers on fixed ports
- `scripts/build-pages.mjs`: builds apps and assembles production `dist/`
- `index.html`, `eip-4337/index.html`, `eip-7702/index.html`, `permit/index.html`: local shell pages only
- `docs/`: AI handoff context

## Current State

- Root shell and Pages build are wired.
- Permit demo is mounted at `/permit/`. It defaults to Conflux eSpace Testnet (chain ID `71`) and the deployed PermitToken, NormalToken, DaiToken, official Permit2, and latest PermitTestSpender fixtures. Address edits are React state only and reset after refresh.
- Permit signing intentionally remains available on a mismatched wallet chain for compatibility/negative tests; mint, Token→Permit2 approve, and all on-chain execution require chain `71`.
- Permit typed-data builders cover ERC-2612 `Permit`, DAI-style `Permit`, Permit2 `PermitSingle`, `PermitBatch`, `PermitTransferFrom`, `PermitBatchTransferFrom`, and `PermitWitnessTransferFrom`. The UI shows domain/types/primaryType/message, copyable RPC JSON, raw signatures, and v/r/s where applicable; Raw Typed Data is sent unchanged through `eth_signTypedData_v4` and is not parsed or broadcast automatically.
- Permit2 Token approval is an explicit action. The app reads balances, Token allowances, Permit2 allowances, nonce/nonce bitmap state, and deployed spender binding; execution is disabled when `PermitTestSpender.permit2()` disagrees with the configured Permit2 address. AllowanceTransfer execution performs a read-only preflight for the signed domain/token/spender, amount and expiry/nonce state, Token→Permit2 allowance, and balance; after it passes, public-RPC gas estimation is supplied to the wallet to avoid a second provider-side estimate failure.
- Permit demo has a first-visit six-step React Joyride Tour. The signing workflow and wallet-signature button are separate targets; the tour stores `eco-demo:permit-tour-seen` in `localStorage` and uses a header-aware scroll offset. `最近结果` is rendered at the top of the right/main column and keeps only the latest in-memory transaction or error activity; it is not a history log and resets on refresh, while transaction balance/allowance details are collapsed under that item.
- `apps/permit-demo/scripts/permitTypedData.fixtures.mjs` tests typed-data shape, Permit2 spender/hash semantics, BigInt JSON serialization, signature splitting, range validation, and non-broadcast behavior.
- EIP-4337 demo includes topbar wallet control, multi-wallet connect modal, full address display, mainnet/testnet status and switching, runtime config, contracts, diagnostics, guide modal, ABI-driven write calls, CFX transfers, prepare/send UserOperation, executeBatch call lists, and bulk UserOps.
- EIP-4337 defaults to Conflux eSpace Testnet (chain ID `71`, `https://bundler-testnet.confluxrpc.org`); it also supports Conflux eSpace Mainnet (chain ID `1030`, `https://bundler.confluxrpc.org`) with the mainnet v0.8 EntryPoint, Simple7702 implementation, and default Paymaster `0xc341DFf0A3A0d05A33dE5a2df898664F0DB3472b`. Mainnet sponsorship starts enabled.
- EIP-4337 ABI builder defaults to FooDapp address + built-in ABI. Other verified contract ABIs are fetched from ConfluxScan and cached by lowercased address in `localStorage` key `eco-demo:eip-4337-abi-cache`; uncached addresses must query ABI before contract method calls are enabled.
- ABI input parsing validates JSON arrays, nested tuples, tuple fields, addresses, booleans, signed/unsigned integer ranges, bytes/fixed bytes, payable CFX value, and transfer amounts with user-facing Chinese errors. Canonical tuple signatures keep overloaded methods distinguishable, and malformed ConfluxScan ABI/cache entries are rejected defensively.
- Single `execute` and batch `executeBatch` share the same call-building path; batch mode sends only calls explicitly added to the list, while single CFX transfer bypasses ABI.
- EIP-4337 runtime config exposes `Nonce key` with default `0`. SimpleAccount and Simple7702 both read `EntryPoint.getNonce(sender, key)`. Bulk UserOps assign per-item nonce keys starting from the configured key, sign all prepared requests first, then broadcast the signed UserOps in parallel.
- EIP-4337 bulk UserOps always require the connected wallet A. Bulk Owner private key is optional: when present, wallet A and private-key owner B both send; when empty, only wallet A sends. The bulk private key is still visible plain text for test workflow visibility and is validated only when non-empty.
- EIP-4337 Owner private-key inputs are intentionally shown as plain text for test workflow visibility. Private-key execution paths validate 32-byte hex format and secp256k1 range before preparing/sending UserOps.
- EIP-4337 has lightweight Node fixture scripts for ABI call encoding, real verified ConfluxScan nested-tuple/overload snapshots, ConfluxScan response parsing, nonce key parsing, private-key validation, sponsorship, authorization, and UserOperation nonce offsets. `pnpm test:fixtures` runs them together.
- EIP-7702 demo includes network selector, authorization list editor, nonce query, delegated transaction sender, and result panel. Injected Fluent/MetaMask helper clients use fallback providers so the page still renders when no wallet extension is present.
- EIP-7702 tx sender and EOA private-key inputs are intentionally shown as plain text for test workflow visibility. Non-empty key input is normalized in `App.tsx` by auto-prefixing `0x` when missing; nonce lookup and delegate sending validate 32-byte hex format and secp256k1 range before calling `privateKeyToAccount`.
- All demos expose top-left `返回首页` links that work in local dev and GitHub Pages subpath deployments.
- Production homepage labels the first app as `EIP-4337 Demo`.
- `pnpm build` runs post-build smoke checks for `/`, `/eip-4337/`, `/eip-7702/`, and `/permit/`, including their local HTML asset references.

## Commands

```sh
pnpm install
pnpm dev
pnpm dev:permit
pnpm lint
pnpm build
pnpm test:fixtures
pnpm test:permit-typed-data
pnpm test:pages
pnpm --filter @eco-demo/eip-4337-demo test:contract-calls
pnpm --filter @eco-demo/eip-4337-demo test:conflux-scan-abi
pnpm --filter @eco-demo/eip-4337-demo test:nonce-key
pnpm --filter @eco-demo/eip-4337-demo test:private-key
pnpm --filter @eco-demo/eip-4337-demo test:user-operation-nonce
```

Use `pnpm dev` for visual QA. Run relevant fixture scripts plus `pnpm lint` and `pnpm build` before handoff or commit.

## GitHub / Deployment Notes

- When asked to create a PR, create a ready PR, not a draft.
- If `gh` reports auth/token problems in Codex, retry once with elevated sandbox permissions before treating the token as invalid.
- Pushes to `main` trigger `.github/workflows/pages.yml` and deploy GitHub Pages.

## Do Not Change Casually

- `apps/eip-4337-demo/src/constants/contracts.ts`
- `apps/eip-4337-demo/src/lib/accountAbstraction.ts`
- `apps/eip-4337-demo/src/lib/contractCalls.ts`
- `apps/eip-4337-demo/src/config/*`
- `apps/eip-7702-demo/src/constants.ts`
- `apps/permit-demo/src/config.ts`
- `apps/permit-demo/src/abi.ts`
- `apps/permit-demo/src/lib/typedData.ts`
- `scripts/dev.mjs`
- `scripts/build-pages.mjs`
- `scripts/smoke-pages.mjs`
- `.github/workflows/pages.yml`
- Private-key warning copy and red warning styles; private-key flows must remain visibly test-account only and current test workflows expect visible private-key inputs
- Permit's deployed address defaults, ABI shapes, typed-data builders, explicit approve flow, wrong-chain signing/write split, raw JSON pass-through, and Joyride target/storage behavior

## Active Risks

- 4337 guide modal wording and first-open behavior are still product decisions, not final design.
- Mainnet configuration has RPC-level verification, but still needs an end-to-end funded-account UserOperation check for both account modes.
- 4337 supports Conflux eSpace Testnet and Mainnet only. Do not reintroduce Sepolia or other networks unless explicitly requested.
- Permit's deployed Testnet flows still need a funded-wallet manual acceptance pass after external contract redeployments or wallet-provider changes; fixture/build checks do not prove on-chain execution.
- Joyride targets depend on the sticky-header layout. If the page structure or header height changes, re-check automatic positioning and the six-step navigation before changing the tour offset or target strategy.
