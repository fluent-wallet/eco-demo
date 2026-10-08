import { createConfig, http } from 'wagmi'
import { createDemoWalletConnectors, confluxESpaceTestnet } from '@eco-demo/wallet-connect'

export const wagmiConfig = createConfig({
  chains: [confluxESpaceTestnet],
  connectors: createDemoWalletConnectors(),
  transports: {
    [confluxESpaceTestnet.id]: http(
      confluxESpaceTestnet.rpcUrls.default.http[0],
    ),
  },
})
