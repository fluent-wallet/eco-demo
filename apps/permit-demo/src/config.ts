import { defineChain, type Address } from 'viem'

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

export type DeploymentConfig = {
  permitToken: string
  normalToken: string
  permit2: string
  permitTestSpender: string
  daiToken: string
}

export const DEFAULT_DEPLOYMENT = {
  permitToken: '0xc9D4e5487d7abb3D66927315120634E739dd3024',
  normalToken: '0xeFF543593eF31D28a8cb6055DF35D6A8472DFdfC',
  permit2: '0x06bCB016d5f6003217ba3a8F2A43285173f48942',
  permitTestSpender: '0xE71e157B7963CC3b465aaF661229e31168d26221',
  daiToken: '0xDC372eBB0368Ad1Def1ca2CeBC10494F237eF35C',
} as const satisfies Record<keyof DeploymentConfig, Address>

export const DEFAULT_MINT_AMOUNT = '1000000'

export function getExplorerTxUrl(hash: string) {
  return `${confluxESpaceTestnet.blockExplorers.default.url}/tx/${hash}`
}
