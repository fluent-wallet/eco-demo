import { createConfig, http } from 'wagmi'
import {
  confluxESpaceMainnet,
  confluxESpaceTestnet,
  createDemoWalletConnectors,
} from '@eco-demo/wallet-connect'

export const wagmiConfig = createConfig({
  chains: [confluxESpaceTestnet, confluxESpaceMainnet],
  connectors: createDemoWalletConnectors(),
  transports: {
    [confluxESpaceTestnet.id]: http(confluxESpaceTestnet.rpcUrls.default.http[0]),
    [confluxESpaceMainnet.id]: http(confluxESpaceMainnet.rpcUrls.default.http[0]),
  },
})
