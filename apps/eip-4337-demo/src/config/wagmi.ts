import { createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import type { EIP1193Provider } from 'viem'
import { confluxESpaceMainnet, confluxESpaceTestnet } from './chains'

export const wagmiConfig = createConfig({
  chains: [confluxESpaceTestnet, confluxESpaceMainnet],
  connectors: [
    injected({ target: 'metaMask' }),
    injected({
      target: {
        id: 'fluent',
        name: 'Fluent Wallet',
        provider: () => {
          const maybeWindow = window as typeof window & {
            fluent?: EIP1193Provider
          }
          return maybeWindow.fluent
        },
      },
    }),
    injected(),
  ],
  transports: {
    [confluxESpaceTestnet.id]: http(
      confluxESpaceTestnet.rpcUrls.default.http[0],
    ),
    [confluxESpaceMainnet.id]: http(
      confluxESpaceMainnet.rpcUrls.default.http[0],
    ),
  },
})
