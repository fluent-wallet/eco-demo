# Architecture

## Overview

The repo has two layers:

- Source apps under `apps/*`
- A root shell/build layer that unifies local preview and production publishing

## Runtime Model

### Local Dev

- `scripts/dev.mjs` starts three Vite processes
- root shell on `127.0.0.1:4173`
- 4337 app on `127.0.0.1:5173`
- 7702 app on `127.0.0.1:3008`
- root `index.html` and `eip-*/index.html` embed app dev servers for one-entry preview

### Production Build

- `scripts/build-pages.mjs` is the production route source of truth
- each app builds its own `dist/`
- root build script copies app outputs into root `dist/eip-4337` and `dist/eip-7702`
- root build script also generates the production homepage `dist/index.html`

## App Boundaries

### `apps/eip-4337-demo`

- owns 4337 wallet/account abstraction flows
- critical logic lives in `src/lib/accountAbstraction.ts`
- contract and endpoint defaults live under `src/constants` and `src/config`

### `apps/eip-7702-demo`

- owns 7702 authorization and delegated transaction flows
- chain and RPC defaults live in `src/constants.ts`

## Navigation

- Home page selection happens at root `/`
- each demo now includes a top-left home link
- navigation changes must work in both local shell and GitHub Pages deployment; absolute `/` should be treated as a deployment-sensitive choice

## Change Rules

- Do not edit generated `dist/`
- Do not change app ports or Pages route mapping in isolation
- When adding a demo, update both local shell routing and production build routing together
