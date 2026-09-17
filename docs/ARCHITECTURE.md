# Architecture

## Overview

The repo has two layers:

- Source apps under `apps/*`
- Root shell/build layer for unified local preview and production publishing

## Runtime Model

### Local Dev

- `scripts/dev.mjs` starts four Vite processes.
- Root shell runs on `127.0.0.1:4173`.
- 4337 app runs on `127.0.0.1:5173`.
- 7702 app runs on `127.0.0.1:3008`.
- Permit app runs on `127.0.0.1:3010`.
- Root `index.html` and the route shell pages (`eip-4337/index.html`, `eip-7702/index.html`, `permit/index.html`) embed app dev servers for one-entry preview.

### Production Build

- `scripts/build-pages.mjs` is the production route source of truth.
- Each app builds its own `dist/`.
- Root build script copies outputs into root `dist/eip-4337`, `dist/eip-7702`, and `dist/permit`.
- Root build script generates production homepage `dist/index.html`.
- App card links are relative (`./eip-4337/`, `./eip-7702/`, `./permit/`) for GitHub Pages subpaths.
- Root `pnpm build` then runs `scripts/smoke-pages.mjs`, which verifies all four route entries and their local HTML asset references.

## App Boundaries

### `apps/eip-4337-demo`

- Owns 4337 wallet/account abstraction flows.
- `src/config/networks.ts` is the single source of truth for Testnet/Mainnet chain, Bundler, EntryPoint, account implementation, default Paymaster, and ConfluxScan API settings. Do not copy network constants back into UI or AA helpers.
- Critical AA logic lives in `src/lib/accountAbstraction.ts`.
- Contract and endpoint defaults live under `src/constants` and `src/config`.
- Contract ABI lookup and ABI parameter encoding live in `src/lib/contractCalls.ts`.
- `contractCalls.ts` is responsible for turning form strings/JSON into viem args. It validates arrays, fixed arrays, tuples with named or indexed fields, addresses, booleans, signed/unsigned integers, bytes/fixed bytes, and wraps encode failures with user-facing errors.
- ConfluxScan ABI payload parsing is isolated in `parseConfluxScanAbiResponse`; HTTP querying remains in `fetchContractAbi`.
- Nonce key validation lives in `src/lib/nonceKey.ts`; UserOperation nonce offset math lives in `src/lib/userOperationNonce.ts`.
- Wallet UX is topbar-scoped:
  - `WalletControl` opens a connect modal using configured wagmi connectors.
  - Connected state shows connector name, full address, and chain status.
  - Wrong-chain state offers a switch to the selected Conflux eSpace network: Testnet (`71`) or Mainnet (`1030`).
- Operation panel builds generic calls as `{ to, data, value }[]`.
- Single mode uses the current ABI call, unless "single CFX transfer" is enabled.
- Batch mode uses the explicit call list; "add current call" snapshots the current ABI form, and "add CFX transfer" snapshots transfer fields.
- `accountAbstraction.ts` turns one call into `execute` and multiple calls into `executeBatch`.
- Runtime config includes `Nonce key`, default `0`; `App.tsx` validates it before preparing or sending UserOps.
- Runtime config exposes an editable Simple7702 implementation address, defaulting to the selected network configuration, plus a forced-upgrade checkbox.
- `accountAbstraction.ts` reads nonce with `EntryPoint.getNonce(sender, nonceKey)` for both SimpleAccount and Simple7702.
- Simple7702 flows read the EOA's EIP-7702 delegation. Existing delegations are preserved by default; when forced upgrade is enabled and the delegation is missing or targets another implementation, the UI uses private-key signing and includes a fresh authorization in the UserOperation.
- When Paymaster sponsorship is enabled, `paymasterSponsorship.ts` packs the gas-prepared UserOperation and calls `canSponsor` before UserOperation signing; a returned reason aborts the flow, while failed optional-interface probes preserve legacy Paymaster compatibility.
- Bulk UserOps use per-item nonce keys starting from the configured key. The UI prepares and signs all bulk requests first, then broadcasts the signed UserOps in parallel so repeated sends do not share the same nonce sequence.
- Bulk UserOps always build a wallet-owner batch from the connected wallet A. `bulkOwnerPrivateKey` is optional; when it is non-empty, `App.tsx` validates it and adds a second private-key-owner batch, otherwise only wallet A is signed and sent.
- `prepareSignedDemoUserOperation` prepares and signs a request; `sendPreparedDemoUserOperation` broadcasts an already signed request and waits for the receipt. Keep this split when changing bulk-send behavior.
- 4337 Owner private-key and bulk Owner private-key inputs are intentionally plain text. `src/lib/privateKey.ts` validates 32-byte hex format and secp256k1 range before private-key UserOperation prepare/send. Keep red private-key warnings prominent.
- Testnet FooDapp remains the default sample via built-in ABI; Mainnet intentionally has no preset target contract.
- Custom verified contracts require ConfluxScan ABI query for the selected network before method calls are enabled.
- ABI cache is local browser state keyed by lowercased address in `localStorage`; do not treat it as deploy-time config.
- ABI cache is partitioned by network, and ABI lookups use the selected network's ConfluxScan API so a Testnet ABI is never reused on Mainnet.
- Runtime network selection resets Bundler, EntryPoint, Paymaster defaults, and the default ABI target. Mainnet defaults to Paymaster `0xc341DFf0A3A0d05A33dE5a2df898664F0DB3472b`, so sponsorship begins enabled.
- Lightweight fixtures live in `apps/eip-4337-demo/scripts/*.fixtures.mjs`. They use Node 22 type stripping to import selected `.ts` modules and avoid adding a test framework. The suite includes offline ABI excerpts from real verified ConfluxScan contracts with nested tuple/array and overloaded methods; `pnpm test:fixtures` runs the full set.

### `apps/eip-7702-demo`

- Owns 7702 authorization and delegated transaction flows.
- Chain and RPC defaults live in `src/constants.ts`.
- `src/constants.ts` exports injected Fluent/MetaMask helper clients with fallback providers. Keep this defensive path so the page can render in browsers without wallet extensions.
- `App.tsx` owns the authorization form, nonce lookup, and delegate send flow.
- tx sender and EOA private-key inputs are intentionally plain-text controlled inputs. `normalizeHexInput` auto-prefixes non-empty values with `0x`; delegate sending and EOA nonce lookup must validate 32-byte hex format and secp256k1 range before calling `privateKeyToAccount`.

### `apps/permit-demo`

- Owns wallet-signature testing for ERC-2612 Permit, Dai-style Permit, and official Uniswap Permit2 flows.
- Uses a fixed Conflux eSpace Testnet chain configuration (`71`) and keeps contract address edits in React state only; refreshing restores the deployed fixture defaults.
- `requireWallet()` is used for wallet/signature requests without enforcing the connected chain, so wrong-chain Typed Data requests can be tested temporarily. `requireTestnetWallet()` gates mint, approve, and transaction writes to chain `71`.
- `src/lib/typedData.ts` is the pure source of truth for ERC-2612 `Permit`, DAI-style `Permit`, Permit2 `PermitSingle`, `PermitBatch`, `PermitTransferFrom`, `PermitBatchTransferFrom`, and `PermitWitnessTransferFrom` typed data. The DAI flow uses the deployed DaiToken legacy domain without a version field, keeps `allowed` declared as `bool`, and allows native booleans or the custom strings `"true"`/`"false"` for wallet-signing compatibility tests. The SignatureTransfer typed data includes the signed `spender` field required by Permit2's hash even though the on-chain tuple passed to `PermitTestSpender` does not. The latest deployed `PermitTestSpender` wrapper exposes execution paths for DAI-style Permit plus the five Permit2 flows shown in the UI, and also contains a batch witness adapter for ABI-level testing. The UI presents all seven flows as tabs in one unified signing workflow, while Raw Typed Data remains a separate low-level signing panel.
- `src/abi.ts` contains the minimal ABI extracted from the deployed fixture artifacts. Permit2 execution is disabled when `PermitTestSpender.permit2()` does not match the configured Permit2 address.
- Token approve and Permit2 execution are separate actions so the page can intentionally reproduce missing-approve failures. AllowanceTransfer execution first performs read-only checks against the signed token/domain/spender, amount, expiry, nonce, Token→Permit2 allowance, and balance; a successful check is simulated and gas-estimated through the public client, then the resulting buffered gas limit is passed to the wallet write to avoid relying on the wallet provider's second estimate.
- The Raw Typed Data panel keeps the entered JSON string unchanged and sends it directly through `eth_signTypedData_v4`; it does not parse, validate, rewrite, or broadcast a transaction.
- The Permit Demo uses React Joyride for a first-visit six-step Tour. The signing workflow overview and wallet-signature button are separate steps/targets; the tour enables viewport-aware fixed positioning, uses a `scrollOffset` of `240` to clear the sticky header, and writes `eco-demo:permit-tour-seen` to `localStorage` when the automatic Tour starts so refreshes do not reopen it.
- `LatestResultPanel` is the first child of the right/main column. `latestActivity` is a single in-memory latest-item state: a new transaction replaces the previous item, and a new error replaces the transaction. It is intentionally not persisted, so refresh clears it. Only the latest activity is shown; transaction balance/allowance snapshots are kept behind a collapsed details disclosure.

## Navigation

- Home page selection happens at the root shell/home page.
- Each demo has a top-left `返回首页` link.
- Demo home links must work in both local shell and GitHub Pages subpath deployment.
- New demos must be added to the local shell, Pages build list, and Pages smoke routes together.
- Do not replace path-aware home link logic with absolute `/`.

## Change Rules

- Do not edit generated `dist/`.
- Do not change app ports or Pages route mapping in isolation.
- When adding a demo, update both local shell routing and production build routing together.
- Keep 4337 smart account signing/sending changes separated from UI call-builder changes unless the UserOperation contract changes require both.
- Keep ABI parsing behavior in `contractCalls.ts`; avoid duplicating per-field parsing inside React components.
- Keep nonce key and nonce offset validation in their small `src/lib/*` helpers so Node fixtures can test them without loading the React app or full AA client stack.
- Keep 4337 private-key validation in `src/lib/privateKey.ts`; do not call `privateKeyToAccount` from private-key execution paths without first validating 32-byte hex format and secp256k1 range.
- Keep 4337 bulk private-key validation conditional on non-empty input. Empty bulk private key means wallet-only bulk send, not an error.
- Keep private-key warnings visually strong and explicit.
- Do not re-mask 4337 or 7702 private-key inputs unless explicitly requested; current test workflows expect visible keys.
- Keep Permit deployed defaults and minimal ABI in `apps/permit-demo/src/config.ts` and `src/abi.ts`; update them together only when the external fixture deployment changes.
- Keep Permit typed-data construction and range checks in `apps/permit-demo/src/lib/typedData.ts`; do not duplicate EIP-712 field definitions in React components.
- Preserve the Permit chain policy: signing may run on a mismatched wallet chain for tests, but mint/approve/transaction writes require chain `71`.
- Preserve explicit Token→Permit2 approval, raw Typed Data pass-through, and the Joyride target names/storage key/header offset unless the test workflow is intentionally changed.
