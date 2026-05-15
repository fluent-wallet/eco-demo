import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAccount, useConnect, useDisconnect, useWalletClient } from 'wagmi'
import { isAddress, parseEther, type Address, type Hex } from 'viem'
import { getExplorerTxUrl } from './config/chains'
import {
  DEFAULT_BUNDLER_URL,
  DEFAULT_PAYMASTER_ADDRESS,
  ENTRY_POINT_V08_ADDRESS,
  FOO_DAPP_ADDRESS,
  SIMPLE_ACCOUNT_FACTORY_V08_ADDRESS,
  SMART_ACCOUNT_IMPLEMENTATION,
} from './constants/contracts'
import {
  explainUserOperationError,
  formatCfx,
  getFooCallData,
  loadDiagnostics,
  normalizeAddress,
  prepareDemoUserOperation,
  sendDemoUserOperation,
  stringifyUserOperation,
  type FooCallPreset,
} from './lib/accountAbstraction'
import type {
  AccountMode,
  OwnerMode,
  PaymasterBalance,
  PreparedUserOperation,
  UserOperationResult,
} from './types'

type AsyncState = 'idle' | 'loading' | 'success' | 'error'
type OperationMode = 'single' | 'batch'
type BatchFooCall = 'deposit' | 'transfer' | 'withdraw'
type UserOperationCall = { to: Address; data: Hex; value: bigint }
type BulkUserOperationResult = {
  owner: 'wallet' | 'privateKey'
  index: number
  nonceKey: number
  status: 'success' | 'error'
  result?: UserOperationResult
  error?: string
}

function compact(value: string | undefined) {
  if (!value) return '-'
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

function StatusPill({ state }: { state: AsyncState }) {
  const label = {
    idle: 'Idle',
    loading: 'Working',
    success: 'Ready',
    error: 'Error',
  }[state]

  return <span className={`pill pill-${state}`}>{label}</span>
}

function WalletPanel() {
  const { connectors, connect, isPending } = useConnect()
  const { address, chainId, isConnected, connector } = useAccount()
  const { disconnect } = useDisconnect()

  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Wallet</h2>
        {isConnected && <span className="pill pill-success">Connected</span>}
      </div>
      {isConnected ? (
        <div className="stack">
          <div className="kv">
            <span>Account</span>
            <code>{address}</code>
          </div>
          <div className="kv">
            <span>Connector</span>
            <code>{connector?.name ?? '-'}</code>
          </div>
          <div className="kv">
            <span>Chain ID</span>
            <code>{chainId ?? '-'}</code>
          </div>
          <button className="button secondary" onClick={() => disconnect()}>
            Disconnect
          </button>
        </div>
      ) : (
        <div className="stack">
          {connectors.map((item) => (
            <button
              className="button"
              disabled={isPending}
              key={item.uid}
              onClick={() => connect({ connector: item })}
            >
              Connect {item.name}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function ConfigPanel({
  bundlerUrl,
  setBundlerUrl,
  entryPoint,
  setEntryPoint,
  paymaster,
  setPaymaster,
  usePaymaster,
  setUsePaymaster,
  accountMode,
  setAccountMode,
  ownerMode,
  setOwnerMode,
  ownerPrivateKey,
  setOwnerPrivateKey,
}: {
  bundlerUrl: string
  setBundlerUrl: (value: string) => void
  entryPoint: string
  setEntryPoint: (value: string) => void
  paymaster: string
  setPaymaster: (value: string) => void
  usePaymaster: boolean
  setUsePaymaster: (value: boolean) => void
  accountMode: AccountMode
  setAccountMode: (value: AccountMode) => void
  ownerMode: OwnerMode
  setOwnerMode: (value: OwnerMode) => void
  ownerPrivateKey: string
  setOwnerPrivateKey: (value: string) => void
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Runtime Config</h2>
      </div>
      <label className="field">
        <span>Bundler RPC URL</span>
        <input
          value={bundlerUrl}
          onChange={(event) => setBundlerUrl(event.target.value)}
          placeholder="https://..."
        />
      </label>
      <label className="field">
        <span>EntryPoint v0.8</span>
        <input
          value={entryPoint}
          onChange={(event) => setEntryPoint(event.target.value)}
        />
      </label>
      <label className="field">
        <span>Paymaster sponsorship</span>
        <select
          value={usePaymaster ? 'on' : 'off'}
          onChange={(event) => setUsePaymaster(event.target.value === 'on')}
        >
          <option value="on">Enabled</option>
          <option value="off">Disabled</option>
        </select>
      </label>
      {usePaymaster && (
        <label className="field">
          <span>Paymaster</span>
          <input
            value={paymaster}
            onChange={(event) => setPaymaster(event.target.value)}
          />
        </label>
      )}
      <label className="field">
        <span>Account mode</span>
        <select
          value={accountMode}
          onChange={(event) =>
            setAccountMode(event.target.value as AccountMode)
          }
        >
          <option value="simpleAccount">SimpleAccount Factory v0.8</option>
          <option value="simple7702">Simple7702 Account</option>
        </select>
      </label>
      <label className="field">
        <span>Owner signer</span>
        <select
          value={ownerMode}
          onChange={(event) => setOwnerMode(event.target.value as OwnerMode)}
        >
          <option value="wallet">Connected wallet</option>
          <option value="privateKey">Private key (debug)</option>
        </select>
      </label>
      {ownerMode === 'privateKey' && (
        <label className="field">
          <span>Owner private key</span>
          <input
            type="password"
            value={ownerPrivateKey}
            onChange={(event) => setOwnerPrivateKey(event.target.value)}
            placeholder="0x..."
            autoComplete="off"
            spellCheck={false}
          />
        </label>
      )}
    </section>
  )
}

function ContractsPanel() {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Contracts</h2>
      </div>
      <div className="stack">
        <div className="kv">
          <span>SimpleAccount Factory</span>
          <code>{SIMPLE_ACCOUNT_FACTORY_V08_ADDRESS}</code>
        </div>
        <div className="kv">
          <span>Simple7702 Impl</span>
          <code>{SMART_ACCOUNT_IMPLEMENTATION}</code>
        </div>
        <div className="kv">
          <span>FooDapp</span>
          <code>{FOO_DAPP_ADDRESS}</code>
        </div>
        <div className="kv">
          <span>Paymaster</span>
          <code>{DEFAULT_PAYMASTER_ADDRESS}</code>
        </div>
      </div>
    </section>
  )
}

function DiagnosticsPanel({
  ownerCode,
  smartAccountAddress,
  smartAccountBalance,
  balances,
  onRefresh,
}: {
  ownerCode: Hex | undefined
  smartAccountAddress: Address | undefined
  smartAccountBalance: bigint | null
  balances: PaymasterBalance[]
  onRefresh: () => void
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Diagnostics</h2>
        <button className="icon-button" onClick={onRefresh} title="Refresh">
          Refresh
        </button>
      </div>
      <div className="stack">
        <div className="kv">
          <span>EOA code</span>
          <code>{ownerCode && ownerCode !== '0x' ? ownerCode : '0x'}</code>
        </div>
        <div className="kv">
          <span>Smart account</span>
          <code>{smartAccountAddress ?? '-'}</code>
        </div>
        <div className="kv">
          <span>Smart account CFX</span>
          <code>{formatCfx(smartAccountBalance)}</code>
        </div>
        {balances.map((item) => (
          <div className="kv" key={item.address}>
            <span>{item.label}</span>
            <code title={item.address}>{formatCfx(item.balance)}</code>
          </div>
        ))}
      </div>
    </section>
  )
}

function OperationPanel({
  operationMode,
  setOperationMode,
  callPreset,
  setCallPreset,
  batchCalls,
  setBatchCalls,
  batchTransferEnabled,
  setBatchTransferEnabled,
  batchTransferTo,
  setBatchTransferTo,
  batchTransferAmount,
  setBatchTransferAmount,
  customCallData,
  setCustomCallData,
  prepared,
  result,
  bulkCount,
  setBulkCount,
  bulkOwnerPrivateKey,
  setBulkOwnerPrivateKey,
  bulkResults,
  status,
  error,
  onPrepare,
  onSend,
  onBulkSend,
}: {
  operationMode: OperationMode
  setOperationMode: (value: OperationMode) => void
  callPreset: FooCallPreset
  setCallPreset: (value: FooCallPreset) => void
  batchCalls: BatchFooCall[]
  setBatchCalls: (value: BatchFooCall[]) => void
  batchTransferEnabled: boolean
  setBatchTransferEnabled: (value: boolean) => void
  batchTransferTo: string
  setBatchTransferTo: (value: string) => void
  batchTransferAmount: string
  setBatchTransferAmount: (value: string) => void
  customCallData: string
  setCustomCallData: (value: string) => void
  prepared: PreparedUserOperation | null
  result: UserOperationResult | null
  bulkCount: string
  setBulkCount: (value: string) => void
  bulkOwnerPrivateKey: string
  setBulkOwnerPrivateKey: (value: string) => void
  bulkResults: BulkUserOperationResult[]
  status: AsyncState
  error: string | null
  onPrepare: () => void
  onSend: () => void
  onBulkSend: () => void
}) {
  const callData = useMemo(
    () => getFooCallData(callPreset, customCallData),
    [callPreset, customCallData],
  )
  const toggleBatchCall = (value: BatchFooCall) => {
    const nextCalls = batchCalls.includes(value)
      ? batchCalls.filter((item) => item !== value)
      : [...batchCalls, value]
    setBatchCalls(nextCalls)
  }

  return (
    <section className="workbench">
      <div className="toolbar">
        <div>
          <h2>UserOperation</h2>
          <p>EntryPoint v0.8, SimpleAccount or 7702 account, Paymaster sponsored.</p>
        </div>
        <StatusPill state={status} />
      </div>

      <div className="form-grid">
        <label className="field">
          <span>Execution mode</span>
          <select
            value={operationMode}
            onChange={(event) =>
              setOperationMode(event.target.value as OperationMode)
            }
          >
            <option value="single">Single execute</option>
            <option value="batch">Batch execute</option>
          </select>
        </label>
        <label className="field">
          <span>FooDapp call</span>
          <select
            disabled={operationMode === 'batch'}
            value={callPreset}
            onChange={(event) =>
              setCallPreset(event.target.value as FooCallPreset)
            }
          >
            <option value="deposit">deposit() (Deposit)</option>
            <option value="transfer">transfer() (Transferr)</option>
            <option value="withdraw">withdraw() (Withdraw)</option>
            <option value="custom">Custom calldata</option>
          </select>
        </label>
        {operationMode === 'single' ? (
          <label className="field wide-field">
            <span>Call data</span>
            <input
              disabled={callPreset !== 'custom'}
              value={callPreset === 'custom' ? customCallData : callData}
              onChange={(event) => setCustomCallData(event.target.value)}
            />
          </label>
        ) : (
          <>
            <div className="field wide-field">
              <span>Batch FooDapp calls</span>
              <div className="check-row">
                {(['deposit', 'transfer', 'withdraw'] as const).map((item) => (
                  <label className="check-option" key={item}>
                    <input
                      type="checkbox"
                      checked={batchCalls.includes(item)}
                      onChange={() => toggleBatchCall(item)}
                    />
                    <span>{item}()</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="field wide-field">
              <span>Batch CFX transfer</span>
              <label className="check-option fit-option">
                <input
                  type="checkbox"
                  checked={batchTransferEnabled}
                  onChange={(event) =>
                    setBatchTransferEnabled(event.target.checked)
                  }
                />
                <span>include CFX transfer</span>
              </label>
            </div>
            {batchTransferEnabled && (
              <div className="transfer-grid wide-field">
                <label className="field">
                  <span>Recipient</span>
                  <input
                    value={batchTransferTo}
                    onChange={(event) => setBatchTransferTo(event.target.value)}
                    placeholder="0x..."
                  />
                </label>
                <label className="field">
                  <span>Amount CFX</span>
                  <input
                    value={batchTransferAmount}
                    onChange={(event) =>
                      setBatchTransferAmount(event.target.value)
                    }
                    inputMode="decimal"
                    placeholder="0.01"
                  />
                </label>
              </div>
            )}
          </>
        )}
      </div>

      <div className="action-row">
        <button className="button" onClick={onPrepare} disabled={status === 'loading'}>
          Prepare UserOperation
        </button>
        <button className="button accent" onClick={onSend} disabled={status === 'loading'}>
          Send UserOperation
        </button>
      </div>

      <div className="bulk-row">
        <label className="field wide-field">
          <span>Bulk owner private key</span>
          <input
            type="password"
            value={bulkOwnerPrivateKey}
            onChange={(event) => setBulkOwnerPrivateKey(event.target.value)}
            placeholder="0x..."
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className="field">
          <span>Private-key bulk count</span>
          <input
            value={bulkCount}
            onChange={(event) => setBulkCount(event.target.value)}
            inputMode="numeric"
            placeholder="3"
          />
        </label>
        <button
          className="button secondary"
          onClick={onBulkSend}
          disabled={status === 'loading'}
        >
          Send Multiple UserOps
        </button>
      </div>

      {error && <div className="alert">{error}</div>}

      {prepared && (
        <div className="output">
          <div className="output-heading">
            <span>Prepared request</span>
            <code>{compact(prepared.sender)}</code>
          </div>
          <pre>{stringifyUserOperation(prepared)}</pre>
        </div>
      )}

      {result && (
        <div className="receipt">
          <div className="receipt-grid">
            <span>UserOp hash</span>
            <code>{result.userOpHash}</code>
            <span>Transaction</span>
            <code>{result.txHash ?? '-'}</code>
            <span>Status</span>
            <code>{result.success ? 'success' : 'reverted'}</code>
            <span>Block</span>
            <code>{result.blockNumber?.toString() ?? '-'}</code>
          </div>
          {result.reason && <div className="alert">{result.reason}</div>}
          {result.txHash && (
            <a href={getExplorerTxUrl(result.txHash)} target="_blank" rel="noreferrer">
              Open transaction
            </a>
          )}
        </div>
      )}

      {bulkResults.length > 0 && (
        <div className="receipt">
          <div className="output-heading">
            <span>Bulk UserOperations</span>
            <code>{bulkResults.length}</code>
          </div>
          <div className="bulk-results">
            {bulkResults.map((item) => (
              <div
                className="bulk-result"
                key={`${item.owner}-${item.index}-${item.nonceKey}`}
              >
                <span>{item.owner === 'wallet' ? 'A' : 'B'} #{item.index + 1}</span>
                <code>{item.result?.userOpHash ?? item.error ?? '-'}</code>
                <span>{item.status}</span>
                <code>{item.result?.txHash ?? `nonce key ${item.nonceKey}`}</code>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function App() {
  const { data: walletClient } = useWalletClient()
  const [bundlerUrl, setBundlerUrl] = useState(DEFAULT_BUNDLER_URL)
  const [entryPoint, setEntryPoint] = useState<string>(ENTRY_POINT_V08_ADDRESS)
  const [paymaster, setPaymaster] = useState<string>(DEFAULT_PAYMASTER_ADDRESS)
  const [usePaymaster, setUsePaymaster] = useState(true)
  const [accountMode, setAccountMode] =
    useState<AccountMode>('simpleAccount')
  const [ownerMode, setOwnerMode] = useState<OwnerMode>('wallet')
  const [ownerPrivateKey, setOwnerPrivateKey] = useState('')
  const [operationMode, setOperationMode] = useState<OperationMode>('single')
  const [callPreset, setCallPreset] = useState<FooCallPreset>('deposit')
  const [batchCalls, setBatchCalls] = useState<BatchFooCall[]>([
    'deposit',
    'transfer',
    'withdraw',
  ])
  const [batchTransferEnabled, setBatchTransferEnabled] = useState(false)
  const [batchTransferTo, setBatchTransferTo] = useState('')
  const [batchTransferAmount, setBatchTransferAmount] = useState('')
  const [customCallData, setCustomCallData] = useState('0x')
  const [prepared, setPrepared] = useState<PreparedUserOperation | null>(null)
  const [result, setResult] = useState<UserOperationResult | null>(null)
  const [bulkCount, setBulkCount] = useState('3')
  const [bulkOwnerPrivateKey, setBulkOwnerPrivateKey] = useState('')
  const [bulkResults, setBulkResults] = useState<BulkUserOperationResult[]>([])
  const [status, setStatus] = useState<AsyncState>('idle')
  const [error, setError] = useState<string | null>(null)
  const [ownerCode, setOwnerCode] = useState<Hex | undefined>()
  const [smartAccountAddress, setSmartAccountAddress] = useState<
    Address | undefined
  >()
  const [smartAccountBalance, setSmartAccountBalance] = useState<bigint | null>(
    null,
  )
  const [balances, setBalances] = useState<PaymasterBalance[]>([])

  const canUseConfig =
    bundlerUrl.trim().length > 0 &&
    isAddress(entryPoint) &&
    (!usePaymaster || isAddress(paymaster))

  const refreshDiagnostics = useCallback(async () => {
    const diagnostics = await loadDiagnostics(
      walletClient,
      undefined,
      accountMode,
      ownerMode,
      ownerPrivateKey
        ? (ownerPrivateKey.startsWith('0x')
            ? ownerPrivateKey
            : `0x${ownerPrivateKey}`) as Hex
        : undefined,
    )
    setOwnerCode(diagnostics.ownerCode)
    setSmartAccountAddress(diagnostics.smartAccountAddress)
    setSmartAccountBalance(diagnostics.smartAccountBalance)
    setBalances(diagnostics.balances)
  }, [accountMode, ownerMode, ownerPrivateKey, walletClient])

  useEffect(() => {
    void refreshDiagnostics()
  }, [refreshDiagnostics])

  const getOwnerPrivateKey = () =>
    ownerPrivateKey
      ? (ownerPrivateKey.startsWith('0x')
          ? ownerPrivateKey
          : `0x${ownerPrivateKey}`) as Hex
      : undefined

  const buildCalls = (): UserOperationCall[] => {
    if (
      operationMode === 'batch' &&
      batchCalls.length === 0 &&
      !batchTransferEnabled
    ) {
      throw new Error('Select at least one batch call.')
    }

    let batchTransferRecipient: Address | undefined
    let batchTransferValue = 0n
    if (operationMode === 'batch' && batchTransferEnabled) {
      if (!isAddress(batchTransferTo)) {
        throw new Error('Set a valid CFX transfer recipient.')
      }
      batchTransferRecipient = batchTransferTo
      batchTransferValue = parseEther(batchTransferAmount || '0')
      if (batchTransferValue <= 0n) {
        throw new Error('Set a CFX transfer amount greater than 0.')
      }
    }

    if (operationMode === 'batch') {
      return [
        ...batchCalls.map((item) => ({
          to: FOO_DAPP_ADDRESS,
          data: getFooCallData(item, customCallData),
          value: 0n,
        })),
        ...(batchTransferEnabled
          ? [
              {
                to: batchTransferRecipient!,
                data: '0x' as Hex,
                value: batchTransferValue,
              },
            ]
          : []),
      ]
    }

    return [
      {
        to: FOO_DAPP_ADDRESS,
        data: getFooCallData(callPreset, customCallData),
        value: 0n,
      },
    ]
  }

  const buildParams = async () => {
    if (!canUseConfig) {
      throw new Error('Set a valid Bundler URL, EntryPoint, and Paymaster.')
    }
    if (ownerMode === 'wallet' && !walletClient) {
      throw new Error('Connect a wallet first.')
    }
    if (ownerMode === 'privateKey' && !ownerPrivateKey.trim()) {
      throw new Error('Owner private key is required in debug mode.')
    }

    return {
      walletClient,
      accountMode,
      ownerMode,
      bundlerUrl,
      entryPointAddress: normalizeAddress(entryPoint, ENTRY_POINT_V08_ADDRESS),
      paymasterAddress: usePaymaster
        ? normalizeAddress(paymaster, DEFAULT_PAYMASTER_ADDRESS)
        : undefined,
      ownerPrivateKey: getOwnerPrivateKey(),
      calls: buildCalls(),
    }
  }

  const buildPrivateKeyParams = async (privateKey: Hex) => ({
    walletClient: undefined,
    accountMode,
    ownerMode: 'privateKey' as const,
    bundlerUrl,
    entryPointAddress: normalizeAddress(entryPoint, ENTRY_POINT_V08_ADDRESS),
    paymasterAddress: usePaymaster
      ? normalizeAddress(paymaster, DEFAULT_PAYMASTER_ADDRESS)
      : undefined,
    ownerPrivateKey: privateKey,
    calls: buildCalls(),
  })

  const buildWalletParams = async () => {
    if (!walletClient) {
      throw new Error('Connect wallet A before bulk send.')
    }

    return {
      walletClient,
      accountMode,
      ownerMode: 'wallet' as const,
      bundlerUrl,
      entryPointAddress: normalizeAddress(entryPoint, ENTRY_POINT_V08_ADDRESS),
      paymasterAddress: usePaymaster
        ? normalizeAddress(paymaster, DEFAULT_PAYMASTER_ADDRESS)
        : undefined,
      ownerPrivateKey: undefined,
      calls: buildCalls(),
    }
  }

  const run = async (mode: 'prepare' | 'send') => {
    setStatus('loading')
    setError(null)
    if (mode === 'send') setResult(null)
    setBulkResults([])

    try {
      const params = await buildParams()

      if (mode === 'prepare') {
        const nextPrepared = await prepareDemoUserOperation(params)
        setPrepared(nextPrepared)
      } else {
        const sent = await sendDemoUserOperation(params)
        setResult(sent)
        setPrepared(null)
        await refreshDiagnostics()
      }
      setStatus('success')
    } catch (caught) {
      const explanation = explainUserOperationError(caught)
      const message =
        caught instanceof Error ? caught.message : 'Unknown UserOperation error.'
      setError(explanation ? `${explanation}\n\n${message}` : message)
      setStatus('error')
    }
  }

  const runBulk = async () => {
    setStatus('loading')
    setError(null)
    setResult(null)
    setPrepared(null)
    setBulkResults([])

    try {
      if (!canUseConfig) {
        throw new Error('Set a valid Bundler URL, EntryPoint, and Paymaster.')
      }
      if (!walletClient) {
        throw new Error('Connect wallet A before bulk send.')
      }
      if (!bulkOwnerPrivateKey.trim()) {
        throw new Error('Set the bulk owner private key.')
      }

      const count = Number.parseInt(bulkCount, 10)
      if (!Number.isInteger(count) || count < 2 || count > 20) {
        throw new Error('Set bulk count between 2 and 20.')
      }

      const bulkPrivateKey = (bulkOwnerPrivateKey.startsWith('0x')
        ? bulkOwnerPrivateKey
        : `0x${bulkOwnerPrivateKey}`) as Hex

      const walletParams = await buildWalletParams()
      const privateKeyParams = await buildPrivateKeyParams(bulkPrivateKey)
      const baseNonceKey = Date.now()
      const settled = await Promise.allSettled(
        [
          ...Array.from({ length: count }, (_, index) => ({
            owner: 'wallet' as const,
            index,
            params: walletParams,
            nonceKey: baseNonceKey + index,
          })),
          ...Array.from({ length: count }, (_, index) => ({
            owner: 'privateKey' as const,
            index,
            params: privateKeyParams,
            nonceKey: baseNonceKey + count + index,
          })),
        ].map((item) =>
          sendDemoUserOperation({
            ...item.params,
            nonceKey: item.nonceKey,
          }).then((result) => ({ ...item, result })),
        ),
      )
      const nextResults = settled.map((item, index): BulkUserOperationResult => {
        if (item.status === 'fulfilled') {
          return {
            owner: item.value.owner,
            index: item.value.index,
            nonceKey: item.value.nonceKey,
            status: 'success',
            result: item.value.result,
          }
        }

        const owner = index < count ? 'wallet' : 'privateKey'
        const ownerIndex = index < count ? index : index - count
        const nonceKey =
          owner === 'wallet'
            ? baseNonceKey + ownerIndex
            : baseNonceKey + count + ownerIndex
        const explanation = explainUserOperationError(item.reason)
        const message =
          item.reason instanceof Error
            ? item.reason.message
            : 'Unknown UserOperation error.'
        return {
          owner,
          index: ownerIndex,
          nonceKey,
          status: 'error',
          error: explanation ? `${explanation} ${message}` : message,
        }
      })

      setBulkResults(nextResults)
      const diagnostics = await loadDiagnostics(
        undefined,
        undefined,
        'simpleAccount',
        'privateKey',
        bulkPrivateKey,
      )
      setOwnerCode(diagnostics.ownerCode)
      setSmartAccountAddress(diagnostics.smartAccountAddress)
      setSmartAccountBalance(diagnostics.smartAccountBalance)
      setBalances(diagnostics.balances)
      const failed = nextResults.filter((item) => item.status === 'error')
      if (failed.length > 0) {
        setError(`${failed.length} of ${nextResults.length} UserOperations failed.`)
        setStatus('error')
      } else {
        setStatus('success')
      }
    } catch (caught) {
      const explanation = explainUserOperationError(caught)
      const message =
        caught instanceof Error ? caught.message : 'Unknown UserOperation error.'
      setError(explanation ? `${explanation}\n\n${message}` : message)
      setStatus('error')
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>EIP-4337 + EIP-7702 Demo</h1>
          <p>Conflux eSpace Testnet account-abstraction workbench</p>
        </div>
        <div className="network-badge">Chain 71</div>
      </header>

      <main className="layout">
        <aside className="sidebar">
          <WalletPanel />
          <ConfigPanel
            bundlerUrl={bundlerUrl}
            setBundlerUrl={setBundlerUrl}
            entryPoint={entryPoint}
            setEntryPoint={setEntryPoint}
            paymaster={paymaster}
            setPaymaster={setPaymaster}
            usePaymaster={usePaymaster}
            setUsePaymaster={setUsePaymaster}
            accountMode={accountMode}
            setAccountMode={setAccountMode}
            ownerMode={ownerMode}
            setOwnerMode={setOwnerMode}
            ownerPrivateKey={ownerPrivateKey}
            setOwnerPrivateKey={setOwnerPrivateKey}
          />
          <ContractsPanel />
          <DiagnosticsPanel
            ownerCode={ownerCode}
            smartAccountAddress={smartAccountAddress}
            smartAccountBalance={smartAccountBalance}
            balances={balances}
            onRefresh={refreshDiagnostics}
          />
        </aside>

        <OperationPanel
          operationMode={operationMode}
          setOperationMode={setOperationMode}
          callPreset={callPreset}
          setCallPreset={setCallPreset}
          batchCalls={batchCalls}
          setBatchCalls={setBatchCalls}
          batchTransferEnabled={batchTransferEnabled}
          setBatchTransferEnabled={setBatchTransferEnabled}
          batchTransferTo={batchTransferTo}
          setBatchTransferTo={setBatchTransferTo}
          batchTransferAmount={batchTransferAmount}
          setBatchTransferAmount={setBatchTransferAmount}
          customCallData={customCallData}
          setCustomCallData={setCustomCallData}
          prepared={prepared}
          result={result}
          bulkCount={bulkCount}
          setBulkCount={setBulkCount}
          bulkOwnerPrivateKey={bulkOwnerPrivateKey}
          setBulkOwnerPrivateKey={setBulkOwnerPrivateKey}
          bulkResults={bulkResults}
          status={status}
          error={error}
          onPrepare={() => void run('prepare')}
          onSend={() => void run('send')}
          onBulkSend={() => void runBulk()}
        />
      </main>
    </div>
  )
}

export default App
