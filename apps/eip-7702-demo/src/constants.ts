/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  defineChain,
  createWalletClient,
  createPublicClient,
  http,
  custom,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
// import { sepolia } from 'viem/chains'

export const chain_key = "_7702_chainId";

export const chainId = localStorage.getItem(chain_key) || "71";
const rpcUrl =
  chainId === "8889"
    ? "https://net8889eth.confluxrpc.com"
    : "https://evmtestnet.confluxrpc.com";

// for conflux devnet
export const relayPK =
  "0x5016cea763958e8dc78c1a1085181a03fa540c045f480341945d219a4d725d24";
export const eoaPK =
  "0x11a88b50a80de437897e9b11be700ab50b6e43f05ab3e7e7a8805ffe91bc58da";
// export const contractAddress = "0x7d682e65EFC5C13Bf4E394B8f376C48e6baE0355";
// export const contractAddress = "0x4dfD5Ca761d34F63e496F8f82de00D0203f859b8";
export const contractAddress = "0x96ee5ac72ab76d4fbf7207d000c0d95835c24579";
// export const contractAddress = "0x0000000000000000000000000000000000000000";
export const chain = defineChain({
  // id: 8889,
  id: Number(chainId),
  name: "Conflux Devnet",
  nativeCurrency: {
    decimals: 18,
    name: "Conflux",
    symbol: "CFX",
  },
  rpcUrls: {
    default: {
      // http: ['/rpc'],
      http: [rpcUrl],
    },
  },
});

// for Sepolia
// export const  relayPK =
//   "0x06913822287ac80b57c69f119e77cc7286eb5135e5d91c8fbd9b7b35cdfc725a";
// export const  eoaPK =
//   "0x11a88b50a80de437897e9b11be700ab50b6e43f05ab3e7e7a8805ffe91bc58da";
// export const contractAddress = "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238";
// export const chain = sepolia;

export const relay = privateKeyToAccount(relayPK);
export const eoa = privateKeyToAccount(eoaPK);

export const publicClient = createPublicClient({
  chain,
  transport: http(),
});
export const walletClient = createWalletClient({
  account: relay,
  chain,
  transport: http(),
});

export const fluentTestClient = createWalletClient({
  chain: chain,
  transport: custom((window as any).fluent!),
});

export const metamaskTestClient = createWalletClient({
  chain: chain,
  transport: custom((window as any).ethereum!),
});
