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
- 7702 demo has network selector, authorization list, nonce query, delegated transaction sender, and result panel.
- Demo home links are path-aware for local dev and GitHub Pages subpaths; they should not be changed back to absolute `/`.

## Guardrails

- Do not edit generated `dist/`, `apps/*/dist/`, or `node_modules/`.
- Do not casually change app ports or route assembly in `scripts/dev.mjs` / `scripts/build-pages.mjs`.
- Keep private-key warning copy and red warning styling visibly strong.
- User-facing copy defaults to Chinese; protocol names, RPC names, method names may stay English.
- Run `pnpm lint` and `pnpm build` before handoff or commit unless blocked.
- Use `pnpm dev` for visual QA. Local port binding may need approval in sandboxed Codex sessions.
