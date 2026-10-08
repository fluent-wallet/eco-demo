import type { EIP1193Provider } from 'viem'
import { injected } from 'wagmi/connectors'

export function createDemoWalletConnectors() {
  return [
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
  ]
}
