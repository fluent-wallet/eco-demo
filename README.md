# eco-demo

`eco-demo` is a pnpm monorepo for small ecosystem workflow demos. Each demo lives in `apps/*`, can be developed independently, and can also be published together as one GitHub Pages site.

## Current Demos

- `apps/eip-4337-demo`: EIP-4337 UserOperation demo with SimpleAccount and EIP-7702 account support.
- `apps/eip-7702-demo`: EIP-7702 authorization list signing and delegated EOA transaction demo.

## Project Layout

```text
eco-demo/
  apps/
    eip-4337-demo/
    eip-7702-demo/
  scripts/
    build-pages.mjs
    dev.mjs
  index.html
  eip-4337/index.html
  eip-7702/index.html
  package.json
  pnpm-workspace.yaml
```

- `apps/*`: individual demo apps.
- `scripts/dev.mjs`: starts the root local development shell and the demo dev servers.
- `scripts/build-pages.mjs`: builds all published demos and assembles the GitHub Pages `dist/` output.
- `index.html`, `eip-4337/index.html`, `eip-7702/index.html`: local development shell pages. They are for source-driven local preview, not the production Pages output.

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

Use the root shell when you want one entry point for all demos:

- `http://127.0.0.1:4173/`: overview with both demos
- `http://127.0.0.1:4173/eip-4337/`: EIP-4337 demo
- `http://127.0.0.1:4173/eip-7702/`: EIP-7702 demo

The root shell embeds each demo's Vite dev server. Source changes in `apps/eip-4337-demo` or `apps/eip-7702-demo` are reflected by Vite HMR or by refreshing the page.

You can also run one demo directly:

```sh
pnpm dev:eip-4337
pnpm dev:eip-7702
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

Build individual apps without assembling Pages:

```sh
pnpm build:apps
```

## Validation

Run lint for all apps:

```sh
pnpm lint
```

Before pushing changes, run:

```sh
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
