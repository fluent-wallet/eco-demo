# CLAUDE.md

AI 接手本仓库时先读 `AGENTS.md`、`docs/PROJECT_CONTEXT.md`、`docs/ARCHITECTURE.md`、`docs/TODO.md`。本文件只保留快速约束。

## Project

`eco-demo` 是 Conflux eSpace 工作流 demo 的 pnpm monorepo。当前范围是 EIP-4337 account abstraction 和 EIP-7702 authorization/delegated transaction flows；本地用统一 shell 预览，生产构建生成根 `dist/` 发布到 GitHub Pages。

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

`pnpm dev` 固定启动：

- root shell: `http://127.0.0.1:4173/`
- 4337 app: `http://127.0.0.1:5173/`
- 7702 app: `http://127.0.0.1:3008/`

## Current State

- 4337 demo has a compact topbar wallet control, multi-wallet connect modal, full connected address display, chain status, and switch-to-Conflux eSpace Testnet action.
- 4337 side panels now start with runtime config; wallet no longer occupies a large sidebar card.
- 4337 operation builder is ABI-driven, defaults to FooDapp + built-in ABI, and caches queried ConfluxScan ABIs in `localStorage` under `eco-demo:eip-4337-abi-cache`.
- 4337 ABI call inputs validate arrays, tuples, tuple fields, addresses, booleans, integers, bytes/fixed bytes, payable value, and CFX transfers. Single and batch modes both build `{ to, data, value }[]`; batch mode only uses calls added to the list.
- 4337 runtime config exposes `Nonce key`, default `0`. Parsing lives in `src/lib/nonceKey.ts`. Both SimpleAccount and Simple7702 call `EntryPoint.getNonce(sender, key)` with this value. Bulk UserOps keep the same key and apply per-item offsets through `src/lib/userOperationNonce.ts`.
- 4337 has Node fixture scripts under `apps/eip-4337-demo/scripts/` for ABI call encoding, ConfluxScan ABI response parsing, nonce key parsing, and UserOperation nonce offsets. They use Node 22 `--experimental-strip-types` and do not require a test framework.
- 7702 demo has network selector, authorization list, nonce query, delegated transaction sender, and result panel. Its injected Fluent/MetaMask helper clients must not crash module load when wallet providers are absent.
- 7702 tx sender and EOA private-key inputs are intentionally plain text for test workflow visibility. `App.tsx` normalizes non-empty key input by auto-prefixing `0x` when missing; keep this behavior for both delegate sending and nonce lookup.
- Demo home links are path-aware for local dev and GitHub Pages subpaths; they should not be changed back to absolute `/`.

## Guardrails

- Do not edit generated `dist/`, `apps/*/dist/`, or `node_modules/`.
- Do not casually change app ports or route assembly in `scripts/dev.mjs` / `scripts/build-pages.mjs`.
- Keep private-key warnings visibly strong and explicit; private-key flows are test-account only.
- User-facing copy defaults to Chinese; protocol names, RPC names, method names may stay English.
- 4337 remains Conflux eSpace Testnet only; Sepolia support was intentionally reverted and should not be reintroduced unless explicitly requested.
- Run `pnpm lint` and `pnpm build` before handoff or commit unless blocked.
- Use `pnpm dev` for visual QA. Local port binding may need approval in sandboxed Codex sessions.
