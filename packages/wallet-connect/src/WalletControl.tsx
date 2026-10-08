import { useEffect, useState } from 'react'
import { useConfig, useConnect, useDisconnect } from 'wagmi'
import { useDemoWallet } from './useDemoWallet'
import './wallet-connect.css'

export type WalletControlProps = {
  targetChainId?: number
  targetChainName?: string
  switchLabel?: string
}

export function WalletControl({
  targetChainId,
  targetChainName,
  switchLabel = '切换网络',
}: WalletControlProps) {
  const [open, setOpen] = useState(false)
  const [switchPending, setSwitchPending] = useState(false)
  const [switchError, setSwitchError] = useState('')
  const { address, chainId, connector, isConnected, provider } = useDemoWallet()
  const { connectors, connect, error: connectError, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { chains } = useConfig()
  const chain = chains.find((item) => item.id === chainId)
  const targetChain = chains.find((item) => item.id === targetChainId)
  const isTargetChain = targetChainId === undefined || chainId === targetChainId

  useEffect(() => {
    if (isConnected) {
      setOpen(false)
      setSwitchError('')
    }
  }, [isConnected])

  useEffect(() => setSwitchError(''), [targetChainId])

  async function switchWalletChain() {
    if (!provider || targetChainId === undefined) return
    setSwitchPending(true)
    setSwitchError('')
    try {
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x' + targetChainId.toString(16) }],
      } as never)
    } catch (error) {
      setSwitchError(error instanceof Error ? error.message : String(error))
    } finally {
      setSwitchPending(false)
    }
  }

  return (
    <div className="wallet-control eco-wallet-control">
      {isConnected && address ? (
        <div className="wallet-status eco-wallet-status">
          <div className="wallet-summary eco-wallet-summary">
            <span className="wallet-label eco-wallet-label">{connector?.name ?? '钱包'}</span>
            <code>{address}</code>
          </div>
          <span className={`pill eco-wallet-network ${isTargetChain ? 'pill-success' : 'pill-error'}`}>
            {isTargetChain
              ? targetChainName ?? targetChain?.name ?? chain?.name ?? `链 ID ${chainId ?? '-'}`
              : chain?.name ?? `链 ID ${chainId ?? '-'}`}
          </span>
          {!isTargetChain && targetChainId !== undefined && (
            <button
              className="button secondary"
              disabled={switchPending || !provider}
              onClick={() => void switchWalletChain()}
              type="button"
            >
              {switchPending ? '切换中...' : switchLabel}
            </button>
          )}
          <button className="button secondary" onClick={() => disconnect()} type="button">
            断开
          </button>
        </div>
      ) : (
        <button
          className="button accent wallet-connect-button"
          onClick={() => setOpen(true)}
          type="button"
        >
          连接钱包
        </button>
      )}
      {(switchError || (connectError && !open)) && (
        <p className="wallet-error eco-wallet-error">{switchError || connectError?.message}</p>
      )}
      {open && !isConnected && (
        <div className="modal-backdrop eco-wallet-backdrop" role="presentation">
          <section
            aria-labelledby="eco-wallet-modal-title"
            aria-modal="true"
            className="wallet-modal eco-wallet-modal"
            role="dialog"
          >
            <div className="modal-heading eco-wallet-modal-heading">
              <div>
                <h2 id="eco-wallet-modal-title">连接钱包</h2>
                <p>选择一个浏览器钱包连接到当前 Demo。</p>
              </div>
              <button
                aria-label="关闭连接钱包弹窗"
                className="icon-button"
                onClick={() => setOpen(false)}
                type="button"
              >
                关闭
              </button>
            </div>
            <div className="wallet-options eco-wallet-options">
              {connectors.map((item) => (
                <button
                  className="wallet-option eco-wallet-option"
                  disabled={isPending}
                  key={item.uid}
                  onClick={() => connect({ connector: item })}
                  type="button"
                >
                  <span>{item.name}</span>
                  <span>{isPending ? '连接中...' : '连接'}</span>
                </button>
              ))}
            </div>
            {connectError && <p className="wallet-error eco-wallet-error">{connectError.message}</p>}
          </section>
        </div>
      )}
    </div>
  )
}
