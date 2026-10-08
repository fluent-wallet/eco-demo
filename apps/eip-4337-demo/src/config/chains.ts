import { confluxESpaceMainnet, confluxESpaceTestnet } from '@eco-demo/wallet-connect'

export { confluxESpaceMainnet, confluxESpaceTestnet }

export function getExplorerTxUrl(
  hash: string,
  chain: typeof confluxESpaceTestnet | typeof confluxESpaceMainnet,
) {
  return `${chain.blockExplorers.default.url}/tx/${hash}`
}
