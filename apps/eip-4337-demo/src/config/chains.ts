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

export function getExplorerTxUrl(hash: string) {
  return `${confluxESpaceTestnet.blockExplorers.default.url}/tx/${hash}`
}
