# eco-demo

`eco-demo` is a pnpm monorepo for small ecosystem workflow demos. Each demo lives in `apps/*`, can be developed independently, and can also be published together as one GitHub Pages site.

## Current Demos

- `apps/eip-4337-demo`: EIP-4337 UserOperation demo with SimpleAccount and EIP-7702 account support.
- `apps/eip-7702-demo`: EIP-7702 authorization list signing and delegated EOA transaction demo.
- `apps/permit-demo`: ERC-2612, Dai-style Permit, and Uniswap Permit2 wallet signature, approval, and transfer demo.

## Project Layout

```text
eco-demo/
  apps/
    eip-4337-demo/
    eip-7702-demo/
    permit-demo/
  scripts/
    build-pages.mjs
    dev.mjs
  index.html
  eip-4337/index.html
  eip-7702/index.html
  permit/index.html
  package.json
  pnpm-workspace.yaml
```

- `apps/*`: individual demo apps.
- `scripts/dev.mjs`: starts the root local development shell and the demo dev servers.
- `scripts/build-pages.mjs`: builds all published demos and assembles the GitHub Pages `dist/` output.
- `index.html`, `eip-4337/index.html`, `eip-7702/index.html`, `permit/index.html`: local development shell pages. They are for source-driven local preview, not the production Pages output.

## Requirements

- Node.js
- pnpm `9.5.0` or compatible

Install dependencies:

```sh
pnpm install
```

## Local Development

Run the whole workspace locally:

```sh
pnpm dev
```

This starts:

- root local shell: `http://127.0.0.1:4173/`
- EIP-4337 demo dev server: `http://127.0.0.1:5173/`
- EIP-7702 demo dev server: `http://127.0.0.1:3008/`
- Permit / Permit2 demo dev server: `http://127.0.0.1:3010/`

Use the root shell when you want one entry point for all demos:

- `http://127.0.0.1:4173/`: overview with all demos
- `http://127.0.0.1:4173/eip-4337/`: EIP-4337 demo
- `http://127.0.0.1:4173/eip-7702/`: EIP-7702 demo
- `http://127.0.0.1:4173/permit/`: Permit / Permit2 demo

The root shell embeds each demo's Vite dev server. Source changes in any app under `apps/*` are reflected by Vite HMR or by refreshing the page.

The Permit demo defaults to Conflux eSpace Testnet (chain `71`) and the deployed test fixtures. Its contract address fields are editable for the current page session and intentionally reset to defaults after a refresh. For temporary wallet compatibility testing, Typed Data signing requests remain available when the wallet is on another chain; mint, approve, and transaction execution still require chain `71`.

You can also run one demo directly:

```sh
pnpm dev:eip-4337
pnpm dev:eip-7702
pnpm dev:permit
```

## Build

Build all demos and assemble the GitHub Pages output:

```sh
pnpm build
```

The generated `dist/` directory contains:

- `/`: generated demo index
- `/eip-4337/`: built EIP-4337 demo
- `/eip-7702/`: built EIP-7702 demo
- `/permit/`: built Permit / Permit2 demo

The root build finishes by checking all four Pages routes and their local HTML asset references.

Build individual apps without assembling Pages:

```sh
pnpm build:apps
```

## Validation

Run lint for all apps:

```sh
pnpm lint
```

Run all focused EIP-4337 fixtures, including the real-world ConfluxScan ABI snapshots:

```sh
pnpm test:fixtures
```

Run only the Permit / Permit2 typed-data fixtures:

```sh
pnpm test:permit-typed-data
```

If a root `dist/` already exists, run the Pages route smoke check directly with:

```sh
pnpm test:pages
```

Before pushing changes, run:

```sh
pnpm test:fixtures
pnpm lint
pnpm build
```

## GitHub Pages

The repository is designed to publish the generated `dist/` directory through GitHub Pages. The build entry point is:

```sh
pnpm build
```

`scripts/build-pages.mjs` is the source of truth for the production Pages routes. It builds each listed app, copies each app's `dist/` into the root `dist/` directory, and writes the production index page.

## Adding A New Demo

1. Create a new app under `apps/<demo-name>`.
2. Set a unique package name in the app `package.json`, for example `@eco-demo/<demo-name>`.
3. Add standard scripts in the app:

```json
{
  "scripts": {
    "dev": "vite --port <port>",
    "build": "tsc -b && vite build",
    "lint": "eslint .",
    "preview": "vite preview"
  }
}
```

4. Pick a stable local dev port and add it to `scripts/dev.mjs` so `pnpm dev` starts the new demo.
5. Add a local shell route, for example `eip-new/index.html`, if the demo should be reachable from the root dev shell.
6. Add the demo to the overview in root `index.html`.
7. Add the demo to the `apps` array in `scripts/build-pages.mjs` so it is included in GitHub Pages output.
8. Run:

```sh
pnpm lint
pnpm build
```

## Notes

- Demo pages may include private-key inputs for test flows. Use test accounts only.
- Keep production routing changes in `scripts/build-pages.mjs`.
- Keep local development routing changes in `index.html`, route shell pages, and `scripts/dev.mjs`.

## Permit / Permit2 Demo

The deployed Testnet fixtures used by the page are:

```text
PermitToken:       0xc9D4e5487d7abb3D66927315120634E739dd3024
NormalToken:       0xeFF543593eF31D28a8cb6055DF35D6A8472DFdfC
Permit2:           0x06bCB016d5f6003217ba3a8F2A43285173f48942
PermitTestSpender: 0xE71e157B7963CC3b465aaF661229e31168d26221
DaiToken:          0xDC372eBB0368Ad1Def1ca2CeBC10494F237eF35C
```

Connect a wallet on chain `71`, mint test tokens if needed, and use the explicit `approve Permit2` action before any executable Permit2 flow. On the first visit, a six-step React Joyride Tour explains deployment/account configuration, the signing workflow, the wallet-signature action, test assets, on-chain state, and Raw Typed Data signing; the one-time display marker is stored in `localStorage`. The page shows the complete typed data and a copyable `eth_signTypedData_v4` payload. The executable flows cover `Permit`, DAI-style `permit`, `PermitSingle`, `PermitTransferFrom`, `PermitBatch`, `PermitBatchTransferFrom`, and `PermitWitnessTransferFrom`; each signature can be copied from an external wallet/RPC call and submitted separately through the deployed `PermitTestSpender` wrapper. The Dai-style tab uses DaiToken's legacy domain without a `version` field, keeps `allowed` declared as `bool` while offering native `true`/`false` and string `"true"`/`"false"` values for wallet compatibility testing, and calls `daiPermitAndTransfer` with a separately editable Solidity `allowed` and transfer amount. The Raw Typed Data panel accepts a JSON string and sends it unchanged to `eth_signTypedData_v4` for invalid-request wallet testing.
