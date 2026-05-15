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

const GUIDE_DISMISSED_KEY = 'eco-demo:eip-4337-guide-dismissed'

function compact(value: string | undefined) {
  if (!value) return '-'
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

function StatusPill({ state }: { state: AsyncState }) {
  const label = {
    idle: '待操作',
    loading: '处理中',
    success: '已完成',
    error: '错误',
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
        <h2>钱包</h2>
        {isConnected && <span className="pill pill-success">已连接</span>}
      </div>
      {isConnected ? (
        <div className="stack">
          <div className="kv">
            <span>账户</span>
            <code>{address}</code>
          </div>
          <div className="kv">
            <span>连接器</span>
            <code>{connector?.name ?? '-'}</code>
          </div>
          <div className="kv">
            <span>链 ID</span>
            <code>{chainId ?? '-'}</code>
          </div>
          <button className="button secondary" onClick={() => disconnect()}>
            断开连接
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
              连接 {item.name}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function GuideContent() {
  return (
    <div className="guide-content">
      <section>
        <h3>使用说明</h3>
        <ol className="guide-list">
          <li>连接钱包，并确认钱包网络为 Conflux eSpace 测试网（链 ID 71）。</li>
          <li>选择账户模式：SimpleAccount 用于标准 4337 流程，Simple7702 用于 7702 授权账户流程，区别在于这笔 aa 交易的发起人是智能账户还是钱包账户自身。</li>
          <li>选择 Owner 签名方式。日常测试建议使用已连接钱包；调试批量或异常场景时再使用私钥模式。</li>
          <li>按需开启 Paymaster 赞助。关闭后需要智能账户自身有足够 CFX 支付 gas。SimpleAccount 模式下，智能账户需要有足够 CFX 支付 gas，需要提前转入。</li>
          <li>在右侧选择单次执行或批量执行，点击“准备 UserOperation”查看请求内容。</li>
          <li>确认请求无误后点击“发送 UserOperation”，等待 Bundler 返回 UserOp 哈希和链上交易结果。</li>
        </ol>
      </section>
      <section>
        <h3>注意事项</h3>
        <ul className="guide-list">
          <li className="guide-danger">私钥模式只用于本地调试，请勿填写主网或真实资产账户私钥。</li>
          <li>本 demo 固定面向 Conflux eSpace 测试网，钱包链 ID、Bundler、EntryPoint 和 Paymaster 需要保持一致。</li>
          <li>Paymaster 赞助开启时，Paymaster 需要有余额并支持当前 UserOperation；否则会在发送阶段失败。</li>
          <li>批量 CFX 转账消耗的是智能账户余额，不是 Owner 钱包余额；发送前请先确认“智能账户 CFX”。</li>
          <li>如果钱包还没有授权给其他智能账户，尝试 7702 流程时需要先去 7702 demo 进行授权；或者 Owner 签名方式使用私钥，会在 aa 交易里带上授权信息同时完成授权和 UserOp 执行。</li>
          <li>“准备 UserOperation”只构造和签名请求，不会上链；“发送 UserOperation”才会提交到 Bundler。</li>
          <li>批量执行是 batchExecute，是指一个 UserOp 里包含多个合约调用（比如 approve + transfer）。</li>
          <li>批量发送 UserOps 是根据填入的批量数量把 UserOp 重复发送 n 次，以达到一个 bundle tx 内包含多个 aa tx 的目的（实际打包规则由 Bundler RPC 实现，不能保证一定会多个交易打包在一个 bundle）。</li>
          <li>如果希望测试 bundle tx 上链后内部 aa 交易失败的情况，可以用一个只有 1 CFX 的账户私钥批量发 UserOps，并包含 0.9 CFX 转账给其他账户，这样重复发送时只会有一笔成功，其余会失败。</li>
        </ul>
      </section>
    </div>
  )
}

function GuideModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  if (!open) return null

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-labelledby="guide-modal-title"
        aria-modal="true"
        className="guide-modal"
        role="dialog"
      >
        <div className="modal-heading">
          <div>
            <h2 id="guide-modal-title">使用说明与注意事项</h2>
            <p>开始操作前请先确认账户模式、签名方式和 gas 支付方式。</p>
          </div>
          <button className="icon-button" onClick={onClose}>
            关闭
          </button>
        </div>
        <GuideContent />
      </section>
    </div>
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
        <h2>运行配置</h2>
      </div>
      <label className="field">
        <span>Bundler RPC 地址</span>
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
        <span>Paymaster 赞助</span>
        <select
          value={usePaymaster ? 'on' : 'off'}
          onChange={(event) => setUsePaymaster(event.target.value === 'on')}
        >
          <option value="on">开启</option>
          <option value="off">关闭</option>
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
        <span>账户模式</span>
        <select
          value={accountMode}
          onChange={(event) =>
            setAccountMode(event.target.value as AccountMode)
          }
        >
          <option value="simpleAccount">SimpleAccount Factory v0.8</option>
          <option value="simple7702">Simple7702 账户</option>
        </select>
      </label>
      <label className="field">
        <span>Owner 签名方式</span>
        <select
          value={ownerMode}
          onChange={(event) => setOwnerMode(event.target.value as OwnerMode)}
        >
          <option value="wallet">已连接钱包</option>
          <option value="privateKey">私钥（调试）</option>
        </select>
      </label>
      {ownerMode === 'privateKey' && (
        <label className="field">
          <span>Owner 私钥</span>
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
        <h2>合约</h2>
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
        <h2>诊断</h2>
        <button className="icon-button" onClick={onRefresh} title="刷新">
          刷新
        </button>
      </div>
      <div className="stack">
        <div className="kv">
          <span>EOA 代码</span>
          <code>{ownerCode && ownerCode !== '0x' ? ownerCode : '0x'}</code>
        </div>
        <div className="kv">
          <span>智能账户</span>
          <code>{smartAccountAddress ?? '-'}</code>
        </div>
        <div className="kv">
          <span>智能账户 CFX</span>
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
  onOpenGuide,
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
  onOpenGuide: () => void
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
          <div className="toolbar-title">
            <h2>UserOperation</h2>
            <button className="icon-button" onClick={onOpenGuide}>
              使用说明
            </button>
          </div>
          <p>EntryPoint v0.8，支持 SimpleAccount 或 7702 账户，可使用 Paymaster 赞助。</p>
        </div>
        <StatusPill state={status} />
      </div>

      <div className="form-grid">
        <label className="field">
          <span>执行模式</span>
          <select
            value={operationMode}
            onChange={(event) =>
              setOperationMode(event.target.value as OperationMode)
            }
          >
            <option value="single">单次执行</option>
            <option value="batch">批量执行</option>
          </select>
        </label>
        <label className="field">
          <span>FooDapp 调用</span>
          <select
            disabled={operationMode === 'batch'}
            value={callPreset}
            onChange={(event) =>
              setCallPreset(event.target.value as FooCallPreset)
            }
          >
            <option value="deposit">deposit()（存入）</option>
            <option value="transfer">transfer()（转移）</option>
            <option value="withdraw">withdraw()（取回）</option>
            <option value="custom">自定义 calldata</option>
          </select>
        </label>
        {operationMode === 'single' ? (
          <label className="field wide-field">
            <span>调用数据</span>
            <input
              disabled={callPreset !== 'custom'}
              value={callPreset === 'custom' ? customCallData : callData}
              onChange={(event) => setCustomCallData(event.target.value)}
            />
          </label>
        ) : (
          <>
            <div className="field wide-field">
              <span>批量 FooDapp 调用</span>
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
              <span>批量 CFX 转账</span>
              <label className="check-option fit-option">
                <input
                  type="checkbox"
                  checked={batchTransferEnabled}
                  onChange={(event) =>
                    setBatchTransferEnabled(event.target.checked)
                  }
                />
                <span>包含 CFX 转账</span>
              </label>
            </div>
            {batchTransferEnabled && (
              <div className="transfer-grid wide-field">
                <label className="field">
                  <span>接收地址</span>
                  <input
                    value={batchTransferTo}
                    onChange={(event) => setBatchTransferTo(event.target.value)}
                    placeholder="0x..."
                  />
                </label>
                <label className="field">
                  <span>CFX 数量</span>
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
          准备 UserOperation
        </button>
        <button className="button accent" onClick={onSend} disabled={status === 'loading'}>
          发送 UserOperation
        </button>
      </div>

      <div className="bulk-row">
        <label className="field wide-field">
          <span>批量 Owner 私钥</span>
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
          <span>私钥批量数量</span>
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
          批量发送 UserOps
        </button>
      </div>

      {error && <div className="alert">{error}</div>}

      {prepared && (
        <div className="output">
          <div className="output-heading">
            <span>已准备请求</span>
            <code>{compact(prepared.sender)}</code>
          </div>
          <pre>{stringifyUserOperation(prepared)}</pre>
        </div>
      )}

      {result && (
        <div className="receipt">
          <div className="receipt-grid">
            <span>UserOp 哈希</span>
            <code>{result.userOpHash}</code>
            <span>交易</span>
            <code>{result.txHash ?? '-'}</code>
            <span>状态</span>
            <code>{result.success ? '成功' : '已回滚'}</code>
            <span>区块</span>
            <code>{result.blockNumber?.toString() ?? '-'}</code>
          </div>
          {result.reason && <div className="alert">{result.reason}</div>}
          {result.txHash && (
            <a href={getExplorerTxUrl(result.txHash)} target="_blank" rel="noreferrer">
              打开交易
            </a>
          )}
        </div>
      )}

      {bulkResults.length > 0 && (
        <div className="receipt">
          <div className="output-heading">
            <span>批量 UserOperations</span>
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
                <span>{item.status === 'success' ? '成功' : '错误'}</span>
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
  const [guideOpen, setGuideOpen] = useState(
    () => localStorage.getItem(GUIDE_DISMISSED_KEY) !== '1',
  )

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

  const closeGuide = () => {
    localStorage.setItem(GUIDE_DISMISSED_KEY, '1')
    setGuideOpen(false)
  }

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
      throw new Error('请至少选择一个批量调用。')
    }

    let batchTransferRecipient: Address | undefined
    let batchTransferValue = 0n
    if (operationMode === 'batch' && batchTransferEnabled) {
      if (!isAddress(batchTransferTo)) {
        throw new Error('请填写有效的 CFX 转账接收地址。')
      }
      batchTransferRecipient = batchTransferTo
      batchTransferValue = parseEther(batchTransferAmount || '0')
      if (batchTransferValue <= 0n) {
        throw new Error('请填写大于 0 的 CFX 转账数量。')
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
      throw new Error('请填写有效的 Bundler URL、EntryPoint 和 Paymaster。')
    }
    if (ownerMode === 'wallet' && !walletClient) {
      throw new Error('请先连接钱包。')
    }
    if (ownerMode === 'privateKey' && !ownerPrivateKey.trim()) {
      throw new Error('调试模式下需要填写 Owner 私钥。')
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
      throw new Error('批量发送前请先连接钱包 A。')
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
        caught instanceof Error ? caught.message : '未知 UserOperation 错误。'
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
        throw new Error('请填写有效的 Bundler URL、EntryPoint 和 Paymaster。')
      }
      if (!walletClient) {
        throw new Error('批量发送前请先连接钱包 A。')
      }
      if (!bulkOwnerPrivateKey.trim()) {
        throw new Error('请填写批量 Owner 私钥。')
      }

      const count = Number.parseInt(bulkCount, 10)
      if (!Number.isInteger(count) || count < 2 || count > 20) {
        throw new Error('批量数量需要在 2 到 20 之间。')
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
            : '未知 UserOperation 错误。'
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
        setError(`${nextResults.length} 个 UserOperations 中有 ${failed.length} 个失败。`)
        setStatus('error')
      } else {
        setStatus('success')
      }
    } catch (caught) {
      const explanation = explainUserOperationError(caught)
      const message =
        caught instanceof Error ? caught.message : '未知 UserOperation 错误。'
      setError(explanation ? `${explanation}\n\n${message}` : message)
      setStatus('error')
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>EIP-4337 + EIP-7702 Demo</h1>
          <p>Conflux eSpace 测试网账户抽象调试台</p>
        </div>
        <div className="network-badge">链 ID 71</div>
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

        <div className="main-column">
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
            onOpenGuide={() => setGuideOpen(true)}
          />
        </div>
      </main>

      <GuideModal open={guideOpen} onClose={closeGuide} />
    </div>
  )
}

export default App
