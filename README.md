# eco-demo

Monorepo for small EIP workflow demos.

## Apps

- `apps/eip-4337-demo`: EIP-4337 UserOperation demo with EIP-7702 account support.
- `apps/eip-7702-demo`: EIP-7702 authorization and transaction demo.

## Commands

```sh
pnpm install
pnpm dev:eip-4337
pnpm dev:eip-7702
pnpm lint
pnpm build
```

`pnpm build` creates a GitHub Pages-ready `dist/` directory with:

- `/`: demo index
- `/eip-4337/`: EIP-4337 demo
- `/eip-7702/`: EIP-7702 demo
