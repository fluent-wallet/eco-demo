# Project Context

## Goal

`eco-demo` is a lightweight pnpm monorepo for small Conflux eSpace workflow demos. Each demo should stay independently maintainable, but local preview and production deployment should still feel like one site.

## Stack

- pnpm `9.5.0`
- React + TypeScript + Vite
- 4337 app: wagmi, viem, permissionless, Tailwind CSS plugin
- 7702 app: viem, ethers, js-conflux-sdk
- GitHub Actions Pages deployment

## Structure

```text
eco-demo/
  apps/
    eip-4337-demo/
    eip-7702-demo/
  scripts/
    dev.mjs
    build-pages.mjs
  docs/
  index.html
  eip-4337/index.html
  eip-7702/index.html
```

## Completed Modules

- Root workspace commands, local shell, Pages build flow
- 4337 demo: wallet/config/contracts/diagnostics panels, ABI-driven write-call builder, prepare/send UserOperation, executeBatch call list, CFX transfer calls, bulk UserOps, guide modal
- 7702 demo: network selector, authorization list editor, nonce query, delegated transaction sender, result display
- Both demos: top-left home link back to the root home page

## Current Open Work

- Verify demo home links under GitHub Pages subpath deployment; current implementation uses absolute `/`
- Confirm 4337 guide modal copy and whether first-open behavior needs a visible reset action
- Consider whether 4337 ABI cache needs a visible clear/reset action
- Decide README language strategy: Chinese, English, or bilingual
- Add Pages smoke checks after `pnpm build` if deployment regressions become common

## Key Decisions

- User-facing copy defaults to Chinese
- Local dev and production build stay separate by design
- Generated `dist/` is output only; source of truth lives in app code and scripts
- 4337 instructions stay in a modal to keep the workbench compact
- 4337 operation UI is now a single advanced-first call builder, not a separate beginner/advanced split
- 4337 defaults to FooDapp address and built-in FooDapp ABI. Other contract ABIs are fetched from ConfluxScan and cached by lowercased address in `localStorage` key `eco-demo:eip-4337-abi-cache`
- 4337 contract method calls require a cached ABI; uncached addresses must run ABI query first. CFX transfer calls do not require ABI
- Private-key flows are test/debug only and must remain visibly warned

## Commands

```sh
pnpm install
pnpm dev
pnpm lint
pnpm build
```

Local shell routes during `pnpm dev`:

- `http://127.0.0.1:4173/`
- `http://127.0.0.1:4173/eip-4337/`
- `http://127.0.0.1:4173/eip-7702/`

## Sensitive Files

- `apps/eip-4337-demo/src/constants/contracts.ts`
- `apps/eip-4337-demo/src/lib/accountAbstraction.ts`
- `apps/eip-4337-demo/src/lib/contractCalls.ts`
- `apps/eip-4337-demo/src/config/*`
- `apps/eip-7702-demo/src/constants.ts`
- `scripts/dev.mjs`
- `scripts/build-pages.mjs`
- `.github/workflows/pages.yml`
