import { createConfig, http } from 'wagmi'
import { injected } from 'wagmi/connectors'
import type { EIP1193Provider } from 'viem'
import { confluxESpaceTestnet } from './chains'

export const wagmiConfig = createConfig({
  chains: [confluxESpaceTestnet],
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
  },
})
