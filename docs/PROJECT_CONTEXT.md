# Project Context

## Purpose

`eco-demo` collects small, complete workflow demos for ecosystem development. The repo should remain a lightweight monorepo where each demo is independently maintainable but can be previewed and deployed from a single root.

## Architecture

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

Local development and production deployment are intentionally separate:

- Local dev: root `index.html` embeds live app dev servers started by `scripts/dev.mjs`.
- Production: `scripts/build-pages.mjs` builds each app and copies app `dist/` output into root `dist/`.

## Completed Modules

### Root Monorepo

- pnpm workspace over `apps/*`.
- Root commands for dev, lint, build, app preview.
- Unified local dev shell at `127.0.0.1:4173`.
- GitHub Pages workflow using Node 22 and pnpm 9.5.0.
- README with setup, validation, deployment, and add-demo process.

### EIP-4337 Demo

- Wallet connection panel.
- Runtime config for Bundler, EntryPoint, Paymaster, account mode, owner signer.
- Contract and diagnostics panels.
- UserOperation builder for single and batch calls.
- Optional batch CFX transfer.
- Bulk UserOps sender for bundle behavior testing.
- Chinese UI/error copy.
- Guide modal with first-open behavior stored in `localStorage`.

### EIP-7702 Demo

- Network selector for Conflux eSpace testnet/devnet.
- EIP-7702 authorization list editor.
- EOA nonce query.
- Delegated transaction sender.
- Chinese UI/error copy based on original `my-7702-app` wording.
- Red private-key safety warning in notes.

## Key Decisions

- Default user-facing copy is Chinese; protocol terms may remain English.
- Local dev should not require rebuilding `dist/`.
- GitHub Pages output is generated; source edits should happen in apps and scripts, not in generated output.
- 4337 long instructions live in a modal to avoid pushing operational controls down the page.
- Private-key flows are allowed only for test/debug usage and must remain visibly warned.

## Commands

```sh
pnpm install
pnpm dev
pnpm lint
pnpm build
```

Routes during `pnpm dev`:

- `http://127.0.0.1:4173/`
- `http://127.0.0.1:4173/eip-4337/`
- `http://127.0.0.1:4173/eip-7702/`

## Adding Demos

Add new demos under `apps/<name>`. Then update:

- `pnpm-workspace.yaml` only if the app path pattern changes.
- `scripts/dev.mjs` for dev server startup.
- root `index.html` and a local route shell if needed.
- `scripts/build-pages.mjs` for production Pages routing.
- README and this context file.

## Files To Treat Carefully

- `apps/eip-4337-demo/src/constants/contracts.ts`
- `apps/eip-4337-demo/src/lib/accountAbstraction.ts`
- `apps/eip-7702-demo/src/constants.ts`
- `scripts/build-pages.mjs`
- `scripts/dev.mjs`
- `.github/workflows/pages.yml`

