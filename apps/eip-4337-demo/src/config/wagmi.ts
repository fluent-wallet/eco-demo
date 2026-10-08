import { createConfig, http } from 'wagmi'
import { createDemoWalletConnectors } from '@eco-demo/wallet-connect'
import { confluxESpaceMainnet, confluxESpaceTestnet } from './chains'

export const wagmiConfig = createConfig({
  chains: [confluxESpaceTestnet, confluxESpaceMainnet],
  connectors: createDemoWalletConnectors(),
  transports: {
    [confluxESpaceTestnet.id]: http(
      confluxESpaceTestnet.rpcUrls.default.http[0],
    ),
    [confluxESpaceMainnet.id]: http(
      confluxESpaceMainnet.rpcUrls.default.http[0],
    ),
  },
})
