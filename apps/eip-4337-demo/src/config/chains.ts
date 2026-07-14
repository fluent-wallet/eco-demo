import { defineChain } from 'viem'

export const confluxESpaceTestnet = defineChain({
  id: 71,
  name: 'Conflux eSpace Testnet',
  nativeCurrency: { name: 'CFX', symbol: 'CFX', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://evmtestnet.confluxrpc.com'] },
  },
  blockExplorers: {
    default: {
      name: 'ConfluxScan',
      url: 'https://evmtestnet.confluxscan.org',
    },
  },
  testnet: true,
})

export const confluxESpaceMainnet = defineChain({
  id: 1030,
  name: 'Conflux eSpace Mainnet',
  nativeCurrency: { name: 'CFX', symbol: 'CFX', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://evm.confluxrpc.com'] },
  },
  blockExplorers: {
    default: {
      name: 'ConfluxScan',
      url: 'https://evm.confluxscan.org',
    },
  },
})

export function getExplorerTxUrl(
  hash: string,
  chain: typeof confluxESpaceTestnet | typeof confluxESpaceMainnet,
) {
  return `${chain.blockExplorers.default.url}/tx/${hash}`
}
