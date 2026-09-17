# Project Context

## Goal

`eco-demo` is a lightweight pnpm monorepo for Conflux eSpace workflow demos. Each demo should stay independently maintainable while local preview and GitHub Pages production deployment feel like one site.

Current product scope:

- EIP-4337 account abstraction workbench
- EIP-7702 authorization/delegated transaction workbench
- ERC-2612 / DAI-style / Uniswap Permit2 wallet-signature test workbench

## Stack

- pnpm `9.5.0`
- React + TypeScript + Vite
- 4337 app: wagmi, viem, permissionless, Tailwind CSS plugin
- 7702 app: viem, ethers, js-conflux-sdk
- Permit app: wagmi, viem, react-joyride; no ethers dependency
- GitHub Actions + GitHub Pages

## Structure

```text
eco-demo/
  apps/
    eip-4337-demo/
    eip-7702-demo/
    permit-demo/
  scripts/
    dev.mjs
    build-pages.mjs
  docs/
  index.html
  eip-4337/index.html
  eip-7702/index.html
  permit/index.html
```

## Completed Modules

- Root workspace commands, local shell, and Pages build flow.
- Post-build Pages smoke checks for `/`, `/eip-4337/`, `/eip-7702/`, `/permit/`, and their local HTML asset references.
- 4337 demo:
  - topbar wallet control with multi-wallet connect modal
  - full connected address display
  - Testnet/Mainnet status and switch-to-selected-network action
  - runtime config, contracts, diagnostics, guide modal
  - ABI-driven write-call builder with network-aware ABI fetch/cache, defensive ABI structure validation, canonical nested-tuple signatures, method selection, argument parsing, payable values, and Chinese validation errors
  - prepare/send UserOperation
  - executeBatch call list
  - CFX transfer calls
  - bulk UserOps
  - configurable UserOperation nonce key with bulk per-item nonce keys and parallel signed-request broadcasting
  - bulk UserOps that always send through connected wallet A and optionally also send through bulk private-key owner B when that field is non-empty
  - plain-text Owner and bulk Owner private-key inputs for test workflow visibility
  - private-key validation before UserOperation prepare/send
  - editable Simple7702 implementation address, with the testnet default set to `0x8F5d8d7f3467Dd2e34186E232D8b5a5f35462949`
  - Simple7702 flows that preserve an existing EOA delegation by default, with optional forced upgrades that attach a fresh authorization when the target differs
  - Paymaster `canSponsor` pre-check after gas preparation and before UserOperation signing, with rejection reasons shown and legacy Paymasters treated as supported
  - focused Node fixtures for ABI encoding, offline real-world ConfluxScan nested-tuple/overload snapshots, ConfluxScan ABI payload parsing, nonce key validation, private-key validation, sponsorship, authorization, and nonce offset calculation
  - root `pnpm test:fixtures` aggregation for all current 4337 and Permit typed-data fixtures
- 7702 demo:
  - network selector
  - authorization list editor
  - nonce query
  - delegated transaction sender
  - result panel
  - plain-text tx sender and EOA private-key inputs for test workflow visibility
  - automatic `0x` prefix normalization plus format/range validation for non-empty private-key input
  - no-wallet render safety for injected Fluent/MetaMask helper clients
- Permit demo:
  - Conflux eSpace Testnet (chain ID `71`) wallet connection and chain switch
  - temporary wrong-chain compatibility mode: Typed Data signing requests remain enabled on a mismatched wallet network, while mint, approve, and on-chain execution still require chain `71`
  - deployed PermitToken, NormalToken, DaiToken, official Permit2, and the latest PermitTestSpender defaults
  - Testnet defaults: PermitToken `0xc9D4e5487d7abb3D66927315120634E739dd3024`, NormalToken `0xeFF543593eF31D28a8cb6055DF35D6A8472DFdfC`, DaiToken `0xDC372eBB0368Ad1Def1ca2CeBC10494F237eF35C`, Permit2 `0x06bCB016d5f6003217ba3A8F2A43285173f48942`, PermitTestSpender `0xE71e157B7963CC3b465aaF661229e31168d26221`
  - editable per-session contract addresses with no localStorage persistence
  - ERC-2612, Permit2 AllowanceTransfer, and Permit2 SignatureTransfer typed-data signing/execution
  - one unified signing workflow panel for ERC-2612, DAI-style Permit, and the five Permit2 variants exposed by the UI, including domain/types/message/RPC JSON/signature display and deployed spender execution
  - DAI-style Permit uses the deployed DaiToken legacy domain without a version field; its native/string `allowed` signing value and separate Solidity execution value are both exposed for compatibility and mismatch tests
  - raw Typed Data JSON signing through direct `eth_signTypedData_v4`, with no page-side parsing or automatic transaction broadcast
  - explicit Token-to-Permit2 approve, mint actions, and live balances/allowances; AllowanceTransfer execution validates the signed/current state with a read-only preflight and passes public-client gas estimation to the wallet after a successful simulation
  - first-visit six-step React Joyride Tour covering deployment/account configuration, signing workflow, wallet-signature action, test assets, on-chain state, and Raw Typed Data; workflow and wallet-signature are separate steps, the seen marker is stored in `localStorage`, and automatic scrolling accounts for the sticky header
  - latest-result panel is placed at the top of the right/main column and shows only the newest in-memory transaction or error (no history and no persistence); transaction balance/allowance details remain available in a collapsed section
- All demos:
  - top-left `返回首页` link works in local dev and GitHub Pages subpath deployments.
- Production homepage:
  - generated by `scripts/build-pages.mjs`
  - first app card is named `EIP-4337 Demo`.

## Current Open Work

- Confirm 4337 guide modal copy, first-open behavior, and whether a visible reset entry is needed.
- Decide root README language policy: Chinese, English, or bilingual.
- Validate both 4337 account modes with funded Mainnet accounts before relying on the production path, including the configured mainnet Paymaster sponsorship path.
- Run a funded Conflux eSpace Testnet acceptance pass for the deployed PermitToken/DaiToken/NormalToken, latest PermitTestSpender, and Permit2 addresses: ERC-2612, DAI-style, AllowanceTransfer, SignatureTransfer, batch, witness, replay, expiry, and mismatch cases.
- If the Permit layout changes, re-check the six-step Joyride on a short viewport; the wallet-signature step must target the actual button and automatic scrolling must keep targets below the sticky header.

## Key Decisions

- User-facing copy defaults to Chinese.
- Local dev and production build stay separate by design.
- Generated `dist/` is output only; source of truth lives in app code and scripts.
- 4337 wallet connection belongs in the topbar, not a sidebar panel.
- 4337 wallet modal should expose all configured wagmi connectors.
- 4337 connected wallet status shows the full address, connector name, and chain status.
- 4337 supports Conflux eSpace Testnet (chain ID `71`) and Mainnet (chain ID `1030`). Testnet is the default, with Bundler `https://bundler-testnet.confluxrpc.org`; Mainnet uses `https://bundler.confluxrpc.org`.
- Both networks use EntryPoint v0.8 `0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108`. Mainnet Simple7702 uses implementation `0xF493e19B292855B467D7806b2CCF8c078518d43c`.
- Mainnet defaults to Paymaster `0xc341DFf0A3A0d05A33dE5a2df898664F0DB3472b`, so sponsorship starts enabled. Sepolia remains unsupported.
- 4337 instructions stay in a modal to keep the workbench compact.
- 4337 operation UI is a single advanced-first call builder.
- Testnet defaults to FooDapp address and built-in FooDapp ABI; Mainnet starts without a preset target contract.
- Other contract ABIs are fetched from the selected network's ConfluxScan API and cached by network plus lowercased address in `localStorage` key `eco-demo:eip-4337-abi-cache`.
- 4337 contract method calls require a cached ABI; uncached addresses must run ABI query first.
- ConfluxScan ABI payload validation lives in `parseConfluxScanAbiResponse`; network fetch stays in `fetchContractAbi`.
- ABI call arguments are parsed before UserOperation wallet/private-key prerequisites so users see builder errors first.
- Batch mode sends only calls explicitly added to the executeBatch list; changing the form after adding a call does not mutate existing list entries.
- CFX transfer calls do not require ABI and should not display stale ABI-cache warnings in single transfer mode.
- UserOperation nonce key is a runtime config field, default `0`, validated in `src/lib/nonceKey.ts` as a non-negative integer `< 2^192`.
- Both SimpleAccount and Simple7702 use `EntryPoint.getNonce(sender, nonceKey)`. Bulk sends assign per-item nonce keys starting from the configured key, sign all prepared requests first, then broadcast the signed UserOps in parallel so concurrent UserOps do not collide on the same nonce sequence.
- Bulk UserOps require connected wallet A. The bulk Owner private key is optional and only validated when non-empty; with a key present, the UI sends both wallet A and private-key owner B batches, and with no key it sends only wallet A.
- Private-key flows are test/debug only and must remain visibly warned. 4337 Owner private-key inputs and 7702 private-key inputs are intentionally not masked, but execution paths must reject values that are not 32-byte hex private keys in the secp256k1 range.
- The 4337 Simple7702 implementation is editable at runtime; the testnet default is `0x8F5d8d7f3467Dd2e34186E232D8b5a5f35462949`.
- Simple7702 has a `强制升级 smart account` option. When disabled, an existing EOA delegation is preserved; when enabled and the current delegation differs from the custom implementation, the UI switches to private-key signing and attaches a new EIP-7702 authorization.
- 7702 private-key inputs are intentionally not masked. Keep the auto-`0x` normalization and private-key validation in `App.tsx` aligned across tx sender input, EOA authorization rows, delegate sending, and nonce lookup.
- Permit signing is intentionally chain-agnostic for temporary wrong-chain tests, while all mint/approve/write paths remain Testnet-only. Do not reintroduce a global network-mismatch block without an explicit product decision.
- Permit deployment address fields are session-only React state; do not persist user edits in `localStorage`. Keep the deployed fixture defaults in `apps/permit-demo/src/config.ts`.
- Keep Permit2 approval explicit and separate from execution so missing-approval failures remain reproducible. Keep Raw Typed Data as an unchanged direct `eth_signTypedData_v4` request with no page-side parsing or automatic broadcast.
- The Permit Tour is intentionally first-visit only via `eco-demo:permit-tour-seen`; keep its six-step order, separate workflow/button targets, and sticky-header-aware scroll behavior aligned with the DOM.

## Commands

```sh
pnpm install
pnpm dev
pnpm lint
pnpm build
pnpm test:fixtures
pnpm test:pages
pnpm test:permit-typed-data
pnpm --filter @eco-demo/eip-4337-demo test:contract-calls
pnpm --filter @eco-demo/eip-4337-demo test:conflux-scan-abi
pnpm --filter @eco-demo/eip-4337-demo test:nonce-key
pnpm --filter @eco-demo/eip-4337-demo test:private-key
pnpm --filter @eco-demo/eip-4337-demo test:paymaster-sponsorship
pnpm --filter @eco-demo/eip-4337-demo test:smart-account-authorization
pnpm --filter @eco-demo/eip-4337-demo test:user-operation-nonce
```

Local shell routes during `pnpm dev`:

- `http://127.0.0.1:4173/`
- `http://127.0.0.1:4173/eip-4337/`
- `http://127.0.0.1:4173/eip-7702/`
- `http://127.0.0.1:4173/permit/`

## Sensitive Files

- `apps/eip-4337-demo/src/constants/contracts.ts`
- `apps/eip-4337-demo/src/lib/accountAbstraction.ts`
- `apps/eip-4337-demo/src/lib/contractCalls.ts`
- `apps/eip-4337-demo/src/config/*`
- `apps/eip-7702-demo/src/constants.ts`
- `scripts/dev.mjs`
- `scripts/build-pages.mjs`
- `.github/workflows/pages.yml`
