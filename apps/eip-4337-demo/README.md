# EIP-4337 + EIP-7702 Demo

React demo for observing EIP-4337 UserOperations with an EIP-7702 smart account on Conflux eSpace Testnet.

## Setup

Create `.env.local` when you have a Bundler endpoint:

```bash
VITE_BUNDLER_RPC_URL=https://your-bundler.example/rpc
```

Install and run:

```bash
npm install
npm run dev
```

The app targets chain `71` and uses the provided smart account, Paymaster, and FooDapp addresses by default.
