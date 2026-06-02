# Architecture

## Overview

The repo has two layers:

- Source apps under `apps/*`
- Root shell/build layer for unified local preview and production publishing

## Runtime Model

### Local Dev

- `scripts/dev.mjs` starts three Vite processes.
- Root shell runs on `127.0.0.1:4173`.
- 4337 app runs on `127.0.0.1:5173`.
- 7702 app runs on `127.0.0.1:3008`.
- Root `index.html` and `eip-*/index.html` embed app dev servers for one-entry preview.

### Production Build

- `scripts/build-pages.mjs` is the production route source of truth.
- Each app builds its own `dist/`.
- Root build script copies outputs into root `dist/eip-4337` and `dist/eip-7702`.
- Root build script generates production homepage `dist/index.html`.
- App card links are relative (`./eip-4337/`, `./eip-7702/`) for GitHub Pages subpaths.

## App Boundaries

### `apps/eip-4337-demo`

- Owns 4337 wallet/account abstraction flows.
- Critical AA logic lives in `src/lib/accountAbstraction.ts`.
- Contract and endpoint defaults live under `src/constants` and `src/config`.
- Contract ABI lookup and ABI parameter encoding live in `src/lib/contractCalls.ts`.
- `contractCalls.ts` is responsible for turning form strings/JSON into viem args. It validates arrays, fixed arrays, tuples with named or indexed fields, addresses, booleans, signed/unsigned integers, bytes/fixed bytes, and wraps encode failures with user-facing errors.
- ConfluxScan ABI payload parsing is isolated in `parseConfluxScanAbiResponse`; HTTP querying remains in `fetchContractAbi`.
- Nonce key validation lives in `src/lib/nonceKey.ts`; UserOperation nonce offset math lives in `src/lib/userOperationNonce.ts`.
- Wallet UX is topbar-scoped:
  - `WalletControl` opens a connect modal using configured wagmi connectors.
  - Connected state shows connector name, full address, and chain status.
  - Wrong-chain state offers `switchChain({ chainId: 71 })`.
- Operation panel builds generic calls as `{ to, data, value }[]`.
- Single mode uses the current ABI call, unless "single CFX transfer" is enabled.
- Batch mode uses the explicit call list; "add current call" snapshots the current ABI form, and "add CFX transfer" snapshots transfer fields.
- `accountAbstraction.ts` turns one call into `execute` and multiple calls into `executeBatch`.
- Runtime config includes `Nonce key`, default `0`; `App.tsx` validates it before preparing or sending UserOps.
- `accountAbstraction.ts` reads nonce with `EntryPoint.getNonce(sender, nonceKey)` for both SimpleAccount and Simple7702.
- Bulk UserOps use per-item nonce keys starting from the configured key. The UI prepares and signs all bulk requests first, then broadcasts the signed UserOps in parallel so repeated sends do not share the same nonce sequence.
- `prepareSignedDemoUserOperation` prepares and signs a request; `sendPreparedDemoUserOperation` broadcasts an already signed request and waits for the receipt. Keep this split when changing bulk-send behavior.
- 4337 Owner private-key and bulk Owner private-key inputs are intentionally plain text. `src/lib/privateKey.ts` validates 32-byte hex format and secp256k1 range before private-key UserOperation prepare/send. Keep red private-key warnings prominent.
- FooDapp remains the default sample via built-in ABI.
- Custom verified contracts require ConfluxScan ABI query before method calls are enabled.
- ABI cache is local browser state keyed by lowercased address in `localStorage`; do not treat it as deploy-time config.
- Lightweight fixtures live in `apps/eip-4337-demo/scripts/*.fixtures.mjs`. They use Node 22 type stripping to import selected `.ts` modules and avoid adding a test framework.

### `apps/eip-7702-demo`

- Owns 7702 authorization and delegated transaction flows.
- Chain and RPC defaults live in `src/constants.ts`.
- `src/constants.ts` exports injected Fluent/MetaMask helper clients with fallback providers. Keep this defensive path so the page can render in browsers without wallet extensions.
- `App.tsx` owns the authorization form, nonce lookup, and delegate send flow.
- tx sender and EOA private-key inputs are intentionally plain-text controlled inputs. `normalizeHexInput` auto-prefixes non-empty values with `0x`; delegate sending and EOA nonce lookup must validate 32-byte hex format and secp256k1 range before calling `privateKeyToAccount`.

## Navigation

- Home page selection happens at the root shell/home page.
- Each demo has a top-left `返回首页` link.
- Demo home links must work in both local shell and GitHub Pages subpath deployment.
- Do not replace path-aware home link logic with absolute `/`.

## Change Rules

- Do not edit generated `dist/`.
- Do not change app ports or Pages route mapping in isolation.
- When adding a demo, update both local shell routing and production build routing together.
- Keep 4337 smart account signing/sending changes separated from UI call-builder changes unless the UserOperation contract changes require both.
- Keep ABI parsing behavior in `contractCalls.ts`; avoid duplicating per-field parsing inside React components.
- Keep nonce key and nonce offset validation in their small `src/lib/*` helpers so Node fixtures can test them without loading the React app or full AA client stack.
- Keep 4337 private-key validation in `src/lib/privateKey.ts`; do not call `privateKeyToAccount` from private-key execution paths without first validating 32-byte hex format and secp256k1 range.
- Keep private-key warnings visually strong and explicit.
- Do not re-mask 4337 or 7702 private-key inputs unless explicitly requested; current test workflows expect visible keys.
