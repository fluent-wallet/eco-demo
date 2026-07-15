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
pnpm --filter @eco-demo/eip-4337-demo test:private-key
pnpm --filter @eco-demo/eip-4337-demo test:user-operation-nonce
```

`pnpm dev` 固定启动：

- root shell: `http://127.0.0.1:4173/`
- 4337 app: `http://127.0.0.1:5173/`
- 7702 app: `http://127.0.0.1:3008/`

## Current State

- 4337 demo has a compact topbar wallet control, multi-wallet connect modal, full connected address display, and switch-to-selected-network action for Conflux eSpace Testnet or Mainnet.
- 4337 defaults to Testnet (chain ID `71`, `https://bundler-testnet.confluxrpc.org`) and supports Mainnet (chain ID `1030`, `https://bundler.confluxrpc.org`). Mainnet uses EntryPoint v0.8, `0xF493e19B292855B467D7806b2CCF8c078518d43c` as the Simple7702 implementation, and `0xc341DFf0A3A0d05A33dE5a2df898664F0DB3472b` as the default Paymaster; sponsorship starts enabled.
- 4337 side panels now start with runtime config; wallet no longer occupies a large sidebar card.
- 4337 operation builder is ABI-driven. Testnet defaults to FooDapp + built-in ABI; queried ConfluxScan ABIs are cached by network and lowercased address in `localStorage` under `eco-demo:eip-4337-abi-cache`.
- 4337 ABI call inputs validate arrays, tuples, tuple fields, addresses, booleans, integers, bytes/fixed bytes, payable value, and CFX transfers. Single and batch modes both build `{ to, data, value }[]`; batch mode only uses calls added to the list.
- 4337 runtime config exposes `Nonce key`, default `0`. Parsing lives in `src/lib/nonceKey.ts`. Both SimpleAccount and Simple7702 call `EntryPoint.getNonce(sender, key)` with this value. Bulk UserOps use per-item nonce keys starting from the configured key, sign all prepared requests first, then broadcast the signed requests in parallel.
- 4337 bulk UserOps require wallet A. The bulk Owner private key is optional: if filled, wallet A and private-key owner B both prepare/sign/send the configured count; if empty, only wallet A sends. The optional bulk private key is validated only when non-empty.
- 4337 Owner private-key and bulk Owner private-key inputs are intentionally plain text for test workflow visibility. Private-key execution paths validate 32-byte hex format and secp256k1 range before preparing/sending UserOps.
- 4337 has Node fixture scripts under `apps/eip-4337-demo/scripts/` for ABI call encoding, ConfluxScan ABI response parsing, nonce key parsing, private-key validation, and UserOperation nonce offsets. They use Node 22 `--experimental-strip-types` and do not require a test framework.
- 7702 demo has network selector, authorization list, nonce query, delegated transaction sender, and result panel. Its injected Fluent/MetaMask helper clients must not crash module load when wallet providers are absent.
- 7702 tx sender and EOA private-key inputs are intentionally plain text for test workflow visibility. `App.tsx` normalizes non-empty key input by auto-prefixing `0x` when missing, then validates 32-byte hex format and secp256k1 range before delegate sending or nonce lookup.
- Demo home links are path-aware for local dev and GitHub Pages subpaths; they should not be changed back to absolute `/`.

## Guardrails

- Do not edit generated `dist/`, `apps/*/dist/`, or `node_modules/`.
- Do not casually change app ports or route assembly in `scripts/dev.mjs` / `scripts/build-pages.mjs`.
- Keep private-key warnings visibly strong and explicit; private-key flows are test-account only and currently expect visible key inputs.
- Do not make the 4337 bulk private key required again unless explicitly requested; current bulk behavior is wallet-only by default, wallet + private key when supplied.
- User-facing copy defaults to Chinese; protocol names, RPC names, method names may stay English.
- 4337 supports only Conflux eSpace Testnet and Mainnet; Sepolia remains intentionally unsupported.
- Run `pnpm lint` and `pnpm build` before handoff or commit unless blocked.
- Use `pnpm dev` for visual QA. Local port binding may need approval in sandboxed Codex sessions.
