import type { EIP1193Provider } from 'viem'
import { useAccount, useWalletClient } from 'wagmi'

export function useDemoWallet() {
  const account = useAccount()
  const { data: walletClient } = useWalletClient()

  return {
    address: account.address,
    addresses: account.addresses,
    chainId: account.chainId,
    connector: account.connector,
    isConnected: account.isConnected,
    provider: walletClient as EIP1193Provider | undefined,
  }
}
