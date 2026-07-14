# EIP-4337 + EIP-7702 Demo

React demo for observing EIP-4337 UserOperations with EIP-7702 smart accounts on Conflux eSpace Testnet and Mainnet.

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

The app defaults to Testnet (chain `71`) with Bundler `https://bundler-testnet.confluxrpc.org`. It can switch to Mainnet (chain `1030`) with Bundler `https://bundler.confluxrpc.org`, EntryPoint v0.8 `0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108`, and Simple7702 implementation `0xF493e19B292855B467D7806b2CCF8c078518d43c`. Mainnet sponsorship is disabled by default and does not prefill a Paymaster.
