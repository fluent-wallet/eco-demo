import { useCallback, useEffect, useState } from 'react'
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useWalletClient,
} from 'wagmi'
import { isAddress, parseEther, type Abi, type Address, type Hex } from 'viem'
import { getExplorerTxUrl } from './config/chains'
import {
  EIP_4337_NETWORKS,
  getEip4337Network,
  type Eip4337Network,
  type Eip4337NetworkId,
} from './config/networks'
import {
  encodeWritableFunctionCall,
  fetchContractAbi,
  FOO_DAPP_ABI,
  formatFunctionSignature,
  getFunctionKey,
  getWritableFunctions,
  type WritableAbiFunction,
} from './lib/contractCalls'
import {
  explainUserOperationError,
  formatCfx,
  loadDiagnostics,
  normalizeAddress,
  prepareDemoUserOperation,
  prepareSignedDemoUserOperation,
  sendDemoUserOperation,
  sendPreparedDemoUserOperation,
  stringifyUserOperation,
} from './lib/accountAbstraction'
import { parseNonceKey } from './lib/nonceKey'
import { normalizePrivateKey } from './lib/privateKey'
import type {
  AccountMode,
  OwnerMode,
  PaymasterBalance,
  PreparedUserOperation,
  UserOperationResult,
} from './types'

type AsyncState = 'idle' | 'loading' | 'success' | 'error'
type OperationMode = 'single' | 'batch'
type AbiLoadState = 'idle' | 'loading' | 'success' | 'error'
type UserOperationCall = { to: Address; data: Hex; value: bigint }
type AdvancedBatchCall = UserOperationCall & {
  id: string
  label: string
}
type BulkUserOperationResult = {
  owner: 'wallet' | 'privateKey'
  index: number
  nonceKey: string
  status: 'success' | 'error'
  result?: UserOperationResult
  error?: string
}
type AbiCacheByNetwork = Record<string, Record<string, Abi>>

const GUIDE_DISMISSED_KEY = 'eco-demo:eip-4337-guide-dismissed'
const ABI_CACHE_STORAGE_KEY = 'eco-demo:eip-4337-abi-cache'
const DEFAULT_NETWORK_ID: Eip4337NetworkId = 71
const DEV_SHELL_PORT = '4173'
const APP_ROUTE_SEGMENT = 'eip-4337'
const USER_OPERATION_NONCE_KEY_LIMIT = 2n ** 192n

function getHomeHref() {
  if (import.meta.env.DEV) {
    return `${window.location.protocol}//${window.location.hostname}:${DEV_SHELL_PORT}/`
  }

  const currentUrl = new URL(window.location.href)
  const pathParts = currentUrl.pathname.split('/').filter(Boolean)
  const appRouteIndex = pathParts.lastIndexOf(APP_ROUTE_SEGMENT)
  const homeParts =
    appRouteIndex >= 0
      ? pathParts.slice(0, appRouteIndex)
      : pathParts.slice(0, -1)

  currentUrl.pathname = `/${homeParts.join('/')}${
    homeParts.length > 0 ? '/' : ''
  }`
  currentUrl.search = ''
  currentUrl.hash = ''

  return currentUrl.toString()
}

function getAddressCacheKey(address: string) {
  return address.toLowerCase()
}

function getDefaultAbiCache(): AbiCacheByNetwork {
  return Object.values(EIP_4337_NETWORKS).reduce<AbiCacheByNetwork>(
    (cache, network) => {
      cache[network.id] = network.defaultFooDappAddress
        ? { [getAddressCacheKey(network.defaultFooDappAddress)]: FOO_DAPP_ABI }
        : {}
      return cache
    },
    {},
  )
}

function isNetworkedAbiCache(value: unknown): value is AbiCacheByNetwork {
  return (
    Boolean(value) &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value as Record<string, unknown>).some(
      (item) =>
        Boolean(item) && typeof item === 'object' && !Array.isArray(item),
    )
  )
}

function mergeAbiCaches(
  defaults: AbiCacheByNetwork,
  cache: AbiCacheByNetwork,
) {
  return Object.fromEntries(
    Object.keys(defaults).map((networkId) => [
      networkId,
      { ...defaults[networkId], ...cache[networkId] },
    ]),
  ) as AbiCacheByNetwork
}

function loadAbiCache() {
  const defaultCache = getDefaultAbiCache()
  try {
    const rawCache = localStorage.getItem(ABI_CACHE_STORAGE_KEY)
    if (!rawCache) return defaultCache
    const parsed = JSON.parse(rawCache) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return defaultCache
    }

    if (isNetworkedAbiCache(parsed)) {
      return mergeAbiCaches(defaultCache, parsed)
    }

    return mergeAbiCaches(defaultCache, {
      [DEFAULT_NETWORK_ID]: parsed as Record<string, Abi>,
    })
  } catch {
    return defaultCache
  }
}

function saveAbiCache(cache: AbiCacheByNetwork) {
  localStorage.setItem(ABI_CACHE_STORAGE_KEY, JSON.stringify(cache))
}

function compact(value: string | undefined) {
  if (!value) return '-'
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

function getErrorMessage(caught: unknown, fallback: string) {
  return caught instanceof Error ? caught.message : fallback
}

function parseCfxAmount(
  value: string,
  label: string,
  options?: { allowZero?: boolean },
) {
  const normalized = value.trim() || '0'

  try {
    const parsed = parseEther(normalized)
    if (parsed < 0n) {
      throw new Error(`${label} 不能为负数。`)
    }
    if (!options?.allowZero && parsed <= 0n) {
      throw new Error(`${label} 需要大于 0。`)
    }
    return parsed
  } catch (caught) {
    if (caught instanceof Error && caught.message.endsWith('。')) {
      throw caught
    }
    throw new Error(`${label} 需要填写有效的 CFX 数量。`)
  }
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

function WalletControl({ network }: { network: Eip4337Network }) {
  const [walletModalOpen, setWalletModalOpen] = useState(false)
  const { connectors, connect, error: connectError, isPending } = useConnect()
  const { address, chainId, isConnected, connector } = useAccount()
  const { disconnect } = useDisconnect()
  const {
    error: switchError,
    isPending: switchPending,
    switchChain,
  } = useSwitchChain()
  const isExpectedChain = chainId === network.chain.id

  useEffect(() => {
    if (isConnected) setWalletModalOpen(false)
  }, [isConnected])

  return (
    <div className="wallet-control">
      {isConnected ? (
        <div className="wallet-status">
          <div className="wallet-summary">
            <span className="wallet-label">{connector?.name ?? '钱包'}</span>
            <code>{address}</code>
          </div>
          <span className={`pill ${isExpectedChain ? 'pill-success' : 'pill-error'}`}>
            {isExpectedChain ? network.chain.name : `链 ID ${chainId ?? '-'}`}
          </span>
          {!isExpectedChain && (
            <button
              className="button secondary"
              disabled={switchPending}
              onClick={() => switchChain({ chainId: network.chain.id })}
              type="button"
            >
              {switchPending ? '切换中...' : '切换网络'}
            </button>
          )}
          <button
            className="button secondary"
            onClick={() => disconnect()}
            type="button"
          >
            断开
          </button>
        </div>
      ) : (
        <button
          className="button accent wallet-connect-button"
          onClick={() => setWalletModalOpen(true)}
          type="button"
        >
          连接钱包
        </button>
      )}
      {switchError && <p className="wallet-error">{switchError.message}</p>}
      {walletModalOpen && (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="wallet-modal-title"
            aria-modal="true"
            className="wallet-modal"
            role="dialog"
          >
            <div className="modal-heading">
              <div>
                <h2 id="wallet-modal-title">连接钱包</h2>
                <p>选择一个浏览器钱包连接到 4337 调试台。</p>
              </div>
              <button
                className="icon-button"
                onClick={() => setWalletModalOpen(false)}
                type="button"
              >
                关闭
              </button>
            </div>
            <div className="wallet-options">
              {connectors.map((item) => (
                <button
                  className="wallet-option"
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
            {connectError && <p className="wallet-error">{connectError.message}</p>}
          </section>
        </div>
      )}
    </div>
  )
}

function GuideContent({ network }: { network: Eip4337Network }) {
  return (
    <div className="guide-content">
      <section>
        <h3>使用说明</h3>
        <ol className="guide-list">
          <li>连接钱包，并确认钱包网络为 {network.chain.name}（链 ID {network.chain.id}）。</li>
          <li>选择账户模式：SimpleAccount 用于标准 4337 流程，Simple7702 用于 7702 授权账户流程，区别在于这笔 aa 交易的发起人是智能账户还是钱包账户自身。</li>
          <li>选择 Owner 签名方式。日常测试建议使用已连接钱包；调试批量或异常场景时再使用私钥模式。</li>
          <li>按需开启 Paymaster 赞助。关闭后需要智能账户自身有足够 CFX 支付 gas。SimpleAccount 模式下，智能账户需要有足够 CFX 支付 gas，需要提前转入。</li>
          <li>在右侧用 ABI 选择写方法并填写参数；未缓存的合约地址需要先点击“查询 ABI”。</li>
          <li>单笔模式会直接使用当前调用；批量模式需要先把当前调用或 CFX 转账加入调用列表。</li>
          <li>点击“准备 UserOperation”查看请求内容，确认无误后点击“发送 UserOperation”。</li>
          <li>可以更改目标合约地址自定义操作内容，比如在一个 UserOp 中包含多个合约的多个调用。</li>
        </ol>
      </section>
      <section>
        <h3>注意事项</h3>
        <ul className="guide-list">
          <li className="guide-danger">私钥模式只用于本地调试，请勿填写主网或真实资产账户私钥。</li>
          <li>钱包链 ID、Bundler、EntryPoint 和 Paymaster 需要与当前选择的网络保持一致。</li>
          {network.id === 1030 && (
            <li>主网暂不提供默认 Paymaster。开启赞助后请自行填写已支持当前 UserOperation 的 Paymaster。</li>
          )}
          <li>Paymaster 赞助开启时，Paymaster 需要有余额并支持当前 UserOperation；否则会在发送阶段失败。</li>
          <li>批量 CFX 转账消耗的是智能账户余额，不是 Owner 钱包余额；发送前请先确认“智能账户 CFX”。</li>
          <li>如果钱包还没有授权给其他智能账户，尝试 7702 流程时需要先去 7702 demo 进行授权；或者 Owner 签名方式使用私钥，会在 aa 交易里带上授权信息同时完成授权和 UserOp 执行。</li>
          <li>“准备 UserOperation”只构造和签名请求，不会上链；“发送 UserOperation”才会提交到 Bundler。</li>
          <li>批量执行是 executeBatch，是指一个 UserOp 里包含多个合约调用（比如 approve + transfer）。</li>
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
  network,
}: {
  open: boolean
  onClose: () => void
  network: Eip4337Network
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
        <GuideContent network={network} />
      </section>
    </div>
  )
}

function ConfigPanel({
  networkId,
  setNetworkId,
  bundlerUrl,
  setBundlerUrl,
  entryPoint,
  setEntryPoint,
  nonceKey,
  setNonceKey,
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
  networkId: Eip4337NetworkId
  setNetworkId: (value: Eip4337NetworkId) => void
  bundlerUrl: string
  setBundlerUrl: (value: string) => void
  entryPoint: string
  setEntryPoint: (value: string) => void
  nonceKey: string
  setNonceKey: (value: string) => void
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
        <span>网络</span>
        <select
          value={networkId}
          onChange={(event) =>
            setNetworkId(Number(event.target.value) as Eip4337NetworkId)
          }
        >
          {Object.values(EIP_4337_NETWORKS).map((network) => (
            <option key={network.id} value={network.id}>
              {network.chain.name}
            </option>
          ))}
        </select>
      </label>
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
        <span>Nonce key（不同的key对应不同的nonce，更改后nonce重新计数）</span>
        <input
          value={nonceKey}
          onChange={(event) => setNonceKey(event.target.value)}
          inputMode="numeric"
          placeholder="0"
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
            type="text"
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

function ContractsPanel({ network }: { network: Eip4337Network }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>合约</h2>
      </div>
      <div className="stack">
        <div className="kv">
          <span>SimpleAccount Factory</span>
          <code>{network.simpleAccountFactoryAddress}</code>
        </div>
        <div className="kv">
          <span>Simple7702 Impl</span>
          <code>{network.smartAccountImplementation}</code>
        </div>
        <div className="kv">
          <span>FooDapp</span>
          <code>{network.defaultFooDappAddress ?? '主网未预设'}</code>
        </div>
        <div className="kv">
          <span>Paymaster</span>
          <code>{network.defaultPaymasterAddress ?? '主网未配置'}</code>
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
  network,
  operationMode,
  setOperationMode,
  advancedContractAddress,
  setAdvancedContractAddress,
  advancedFunctions,
  selectedAdvancedFunctionKey,
  setSelectedAdvancedFunctionKey,
  advancedArgs,
  setAdvancedArg,
  advancedValue,
  setAdvancedValue,
  advancedTransferEnabled,
  setAdvancedTransferEnabled,
  advancedTransferTo,
  setAdvancedTransferTo,
  advancedTransferAmount,
  setAdvancedTransferAmount,
  advancedBatchCalls,
  abiStatus,
  abiError,
  onLoadAbi,
  onAddAdvancedCall,
  onAddAdvancedTransfer,
  onRemoveAdvancedCall,
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
  network: Eip4337Network
  operationMode: OperationMode
  setOperationMode: (value: OperationMode) => void
  advancedContractAddress: string
  setAdvancedContractAddress: (value: string) => void
  advancedFunctions: WritableAbiFunction[]
  selectedAdvancedFunctionKey: string
  setSelectedAdvancedFunctionKey: (value: string) => void
  advancedArgs: string[]
  setAdvancedArg: (index: number, value: string) => void
  advancedValue: string
  setAdvancedValue: (value: string) => void
  advancedTransferEnabled: boolean
  setAdvancedTransferEnabled: (value: boolean) => void
  advancedTransferTo: string
  setAdvancedTransferTo: (value: string) => void
  advancedTransferAmount: string
  setAdvancedTransferAmount: (value: string) => void
  advancedBatchCalls: AdvancedBatchCall[]
  abiStatus: AbiLoadState
  abiError: string | null
  onLoadAbi: () => void
  onAddAdvancedCall: () => void
  onAddAdvancedTransfer: () => void
  onRemoveAdvancedCall: (id: string) => void
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
  const selectedAdvancedFunction = advancedFunctions.find(
    (item, index) =>
      getFunctionKey(item, index) === selectedAdvancedFunctionKey,
  )
  const showAbiError =
    abiError && !(operationMode === 'single' && advancedTransferEnabled)

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
          <p>EntryPoint v0.8，当前调用由 ABI 编码，可切换单笔 execute 或批量 executeBatch。</p>
        </div>
        <StatusPill state={status} />
      </div>

      <div className="form-grid">
        <label className="field wide-field">
          <span>执行模式</span>
          <select
            value={operationMode}
            onChange={(event) =>
              setOperationMode(event.target.value as OperationMode)
            }
          >
            <option value="single">execute</option>
            <option value="batch">executeBatch</option>
          </select>
        </label>
        <label className="field wide-field">
          <span>目标合约地址（ABI）</span>
          <div className="inline-field">
            <input
              value={advancedContractAddress}
              onChange={(event) => setAdvancedContractAddress(event.target.value)}
              placeholder="0x..."
            />
            <button
              className="button secondary"
              disabled={abiStatus === 'loading'}
              onClick={onLoadAbi}
              type="button"
            >
              {abiStatus === 'loading' ? '查询中' : '查询 ABI'}
            </button>
          </div>
        </label>
        <label className="field wide-field">
          <span>写方法</span>
          <select
            disabled={advancedFunctions.length === 0}
            value={selectedAdvancedFunctionKey}
            onChange={(event) =>
              setSelectedAdvancedFunctionKey(event.target.value)
            }
          >
            {advancedFunctions.length === 0 ? (
              <option value="">请先查询 ABI</option>
            ) : (
              advancedFunctions.map((item, index) => (
                <option value={getFunctionKey(item, index)} key={getFunctionKey(item, index)}>
                  {formatFunctionSignature(item)}
                </option>
              ))
            )}
          </select>
        </label>
        {selectedAdvancedFunction
          ? selectedAdvancedFunction.inputs.map((input, index) => (
              <label
                className="field"
                key={`${input.name || input.type}-${index}`}
              >
                <span>
                  {input.name || `参数 ${index + 1}`} · {input.type}
                </span>
                <input
                  value={advancedArgs[index] ?? ''}
                  onChange={(event) =>
                    setAdvancedArg(index, event.target.value)
                  }
                  placeholder={
                    input.type.endsWith('[]')
                      ? 'JSON 数组；简单值也可用逗号分隔'
                      : input.type.startsWith('tuple')
                        ? 'JSON 对象或数组'
                        : input.type
                  }
                />
              </label>
            ))
          : null}
        {selectedAdvancedFunction?.stateMutability === 'payable' && (
          <label className="field">
            <span>调用附带 CFX</span>
            <input
              value={advancedValue}
              onChange={(event) => setAdvancedValue(event.target.value)}
              inputMode="decimal"
              placeholder="0"
            />
          </label>
        )}
        <div className="field wide-field">
          <span>CFX 转账</span>
          {operationMode === 'single' && (
            <label className="check-option fit-option">
              <input
                type="checkbox"
                checked={advancedTransferEnabled}
                onChange={(event) =>
                  setAdvancedTransferEnabled(event.target.checked)
                }
              />
              <span>本次单笔仅执行 CFX 转账</span>
            </label>
          )}
          {(operationMode === 'batch' || advancedTransferEnabled) && (
            <div className="transfer-grid">
              <label className="field">
                <span>接收地址</span>
                <input
                  value={advancedTransferTo}
                  onChange={(event) =>
                    setAdvancedTransferTo(event.target.value)
                  }
                  placeholder="0x..."
                />
              </label>
              <label className="field">
                <span>CFX 数量</span>
                <input
                  value={advancedTransferAmount}
                  onChange={(event) =>
                    setAdvancedTransferAmount(event.target.value)
                  }
                  inputMode="decimal"
                  placeholder="0.01"
                />
              </label>
            </div>
          )}
        </div>
        {operationMode === 'batch' && (
          <div className="field wide-field">
            <span>批量调用列表</span>
            <div className="advanced-batch-actions">
              <button
                className="button secondary"
                disabled={!selectedAdvancedFunction}
                onClick={onAddAdvancedCall}
                type="button"
              >
                添加当前调用
              </button>
              <button
                className="button secondary"
                onClick={onAddAdvancedTransfer}
                type="button"
              >
                添加 CFX 转账
              </button>
              <code>{advancedBatchCalls.length} 个调用</code>
            </div>
            {advancedBatchCalls.length > 0 && (
              <div className="advanced-call-list">
                {advancedBatchCalls.map((item, index) => (
                  <div className="advanced-call-item" key={item.id}>
                    <span>#{index + 1}</span>
                    <code title={item.to}>{item.label}</code>
                    <code title={item.to}>{compact(item.to)}</code>
                    <button
                      className="icon-button"
                      onClick={() => onRemoveAdvancedCall(item.id)}
                      type="button"
                    >
                      移除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {showAbiError && <div className="alert wide-field">{abiError}</div>}
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
          <span>批量 Owner 私钥（选填）</span>
          <input
            type="text"
            value={bulkOwnerPrivateKey}
            onChange={(event) => setBulkOwnerPrivateKey(event.target.value)}
            placeholder="0x..."
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className="field">
          <span>批量数量</span>
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
            <a href={getExplorerTxUrl(result.txHash, network.chain)} target="_blank" rel="noreferrer">
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
  const [networkId, setNetworkId] = useState<Eip4337NetworkId>(
    DEFAULT_NETWORK_ID,
  )
  const network = getEip4337Network(networkId)
  const [bundlerUrl, setBundlerUrl] = useState(network.bundlerUrl)
  const [entryPoint, setEntryPoint] = useState<string>(network.entryPointAddress)
  const [nonceKey, setNonceKey] = useState('0')
  const [paymaster, setPaymaster] = useState<string>(
    network.defaultPaymasterAddress ?? '',
  )
  const [usePaymaster, setUsePaymaster] = useState(
    Boolean(network.defaultPaymasterAddress),
  )
  const [accountMode, setAccountMode] =
    useState<AccountMode>('simpleAccount')
  const [ownerMode, setOwnerMode] = useState<OwnerMode>('wallet')
  const [ownerPrivateKey, setOwnerPrivateKey] = useState('')
  const [operationMode, setOperationMode] = useState<OperationMode>('single')
  const defaultFooFunctions = getWritableFunctions(FOO_DAPP_ABI)
  const [abiCaches, setAbiCaches] = useState<AbiCacheByNetwork>(loadAbiCache)
  const abiCache = abiCaches[networkId]
  const [advancedContractAddress, setAdvancedContractAddress] =
    useState<string>(network.defaultFooDappAddress ?? '')
  const [advancedFunctions, setAdvancedFunctions] = useState<
    WritableAbiFunction[]
  >(defaultFooFunctions)
  const [selectedAdvancedFunctionKey, setSelectedAdvancedFunctionKey] =
    useState(() => getFunctionKey(defaultFooFunctions[0], 0))
  const [advancedArgs, setAdvancedArgs] = useState<string[]>([])
  const [advancedValue, setAdvancedValue] = useState('')
  const [advancedTransferEnabled, setAdvancedTransferEnabled] = useState(false)
  const [advancedTransferTo, setAdvancedTransferTo] = useState('')
  const [advancedTransferAmount, setAdvancedTransferAmount] = useState('')
  const [advancedBatchCalls, setAdvancedBatchCalls] = useState<
    AdvancedBatchCall[]
  >([])
  const [abiStatus, setAbiStatus] = useState<AbiLoadState>('idle')
  const [abiError, setAbiError] = useState<string | null>(null)
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
  const homeHref = getHomeHref()

  const selectNetwork = (nextNetworkId: Eip4337NetworkId) => {
    const nextNetwork = getEip4337Network(nextNetworkId)
    setNetworkId(nextNetworkId)
    setBundlerUrl(nextNetwork.bundlerUrl)
    setEntryPoint(nextNetwork.entryPointAddress)
    setPaymaster(nextNetwork.defaultPaymasterAddress ?? '')
    setUsePaymaster(Boolean(nextNetwork.defaultPaymasterAddress))
    setAdvancedContractAddress(nextNetwork.defaultFooDappAddress ?? '')
    setAdvancedBatchCalls([])
    setPrepared(null)
    setResult(null)
    setBulkResults([])
    setError(null)
    setStatus('idle')
  }

  const canUseConfig =
    bundlerUrl.trim().length > 0 &&
    isAddress(entryPoint) &&
    (() => {
      try {
        parseNonceKey(nonceKey)
        return true
      } catch {
        return false
      }
    })() &&
    (!usePaymaster || isAddress(paymaster))

  const refreshDiagnostics = useCallback(async () => {
    const diagnostics = await loadDiagnostics({
      walletClient,
      chain: network.chain,
      entryPointAddress: normalizeAddress(entryPoint, network.entryPointAddress),
      simpleAccountFactoryAddress: network.simpleAccountFactoryAddress,
      paymasterAddress:
        usePaymaster && isAddress(paymaster) ? paymaster : undefined,
      accountMode,
      ownerMode,
      ownerPrivateKey: ownerPrivateKey
        ? (ownerPrivateKey.startsWith('0x')
            ? ownerPrivateKey
            : `0x${ownerPrivateKey}`) as Hex
        : undefined,
    })
    setOwnerCode(diagnostics.ownerCode)
    setSmartAccountAddress(diagnostics.smartAccountAddress)
    setSmartAccountBalance(diagnostics.smartAccountBalance)
    setBalances(diagnostics.balances)
  }, [
    accountMode,
    entryPoint,
    network,
    ownerMode,
    ownerPrivateKey,
    paymaster,
    usePaymaster,
    walletClient,
  ])

  useEffect(() => {
    void refreshDiagnostics()
  }, [refreshDiagnostics])

  useEffect(() => {
    if (!isAddress(advancedContractAddress)) {
      setAdvancedFunctions([])
      setSelectedAdvancedFunctionKey('')
      setAdvancedArgs([])
      setAdvancedValue('')
      setAbiStatus('idle')
      setAbiError(null)
      return
    }

    const cachedAbi = abiCache[getAddressCacheKey(advancedContractAddress)]
    if (!cachedAbi) {
      setAdvancedFunctions([])
      setSelectedAdvancedFunctionKey('')
      setAdvancedArgs([])
      setAdvancedValue('')
      setAbiStatus('idle')
      setAbiError('该合约地址还没有 ABI 缓存，请先点击“查询 ABI”。CFX 转账不需要 ABI。')
      return
    }

    const writableFunctions = getWritableFunctions(cachedAbi)
    if (writableFunctions.length === 0) {
      setAdvancedFunctions([])
      setSelectedAdvancedFunctionKey('')
      setAdvancedArgs([])
      setAdvancedValue('')
      setAbiStatus('error')
      setAbiError('该 ABI 中没有 nonpayable 或 payable 写方法。')
      return
    }

    setAdvancedFunctions(writableFunctions)
    setSelectedAdvancedFunctionKey(getFunctionKey(writableFunctions[0], 0))
    setAdvancedArgs(writableFunctions[0].inputs.map(() => ''))
    setAdvancedValue('')
    setAbiStatus('success')
    setAbiError(null)
  }, [abiCache, advancedContractAddress])

  const closeGuide = () => {
    localStorage.setItem(GUIDE_DISMISSED_KEY, '1')
    setGuideOpen(false)
  }

  const getOwnerPrivateKey = () =>
    ownerPrivateKey
      ? normalizePrivateKey(ownerPrivateKey, 'Owner 私钥')
      : undefined

  const setAdvancedArg = (index: number, value: string) => {
    setAdvancedArgs((current) => {
      const next = [...current]
      next[index] = value
      return next
    })
  }

  const selectAdvancedFunction = (value: string) => {
    setSelectedAdvancedFunctionKey(value)
    const selected = advancedFunctions.find(
      (item, index) => getFunctionKey(item, index) === value,
    )
    setAdvancedArgs(selected?.inputs.map(() => '') ?? [])
    setAdvancedValue('')
  }

  const loadAdvancedAbi = async () => {
    setAbiStatus('loading')
    setAbiError(null)
    setAdvancedFunctions([])
    setSelectedAdvancedFunctionKey('')
    setAdvancedArgs([])

    try {
      if (!isAddress(advancedContractAddress)) {
        throw new Error('请填写有效的目标合约地址。')
      }

      const abi = await fetchContractAbi(
        advancedContractAddress,
        network.confluxScanApi,
      )
      const writableFunctions = getWritableFunctions(abi)
      if (writableFunctions.length === 0) {
        throw new Error('该 ABI 中没有 nonpayable 或 payable 写方法。')
      }

      setAbiCaches((current) => {
        const next = {
          ...current,
          [networkId]: {
            ...(current[networkId] ?? {}),
            [getAddressCacheKey(advancedContractAddress)]: abi,
          },
        }
        saveAbiCache(next)
        return next
      })
      const firstKey = getFunctionKey(writableFunctions[0], 0)
      setAdvancedFunctions(writableFunctions)
      setSelectedAdvancedFunctionKey(firstKey)
      setAdvancedArgs(writableFunctions[0].inputs.map(() => ''))
      setAdvancedValue('')
      setAbiStatus('success')
    } catch (caught) {
      setAbiError(getErrorMessage(caught, 'ABI 查询失败。'))
      setAbiStatus('error')
    }
  }

  const buildAdvancedCall = (): UserOperationCall => {
    if (!isAddress(advancedContractAddress)) {
      throw new Error('请填写有效的目标合约地址。')
    }
    if (!abiCache[getAddressCacheKey(advancedContractAddress)]) {
      throw new Error('该合约地址还没有 ABI 缓存，请先点击“查询 ABI”。CFX 转账不需要 ABI。')
    }

    const selectedFunction = advancedFunctions.find(
      (item, index) =>
        getFunctionKey(item, index) === selectedAdvancedFunctionKey,
    )
    if (!selectedFunction) {
      throw new Error('请先查询 ABI 并选择一个写方法。')
    }

    const value =
      selectedFunction.stateMutability === 'payable'
        ? parseCfxAmount(advancedValue, '调用附带 CFX', { allowZero: true })
        : 0n

    return {
      to: advancedContractAddress,
      data: encodeWritableFunctionCall(selectedFunction, advancedArgs),
      value,
    }
  }

  const buildAdvancedTransferCall = (): UserOperationCall => {
    if (!isAddress(advancedTransferTo)) {
      throw new Error('请填写有效的 CFX 转账接收地址。')
    }

    const value = parseCfxAmount(advancedTransferAmount, 'CFX 转账数量')

    return {
      to: advancedTransferTo,
      data: '0x' as Hex,
      value,
    }
  }

  const addAdvancedBatchCall = () => {
    setAbiError(null)

    try {
      const selectedFunction = advancedFunctions.find(
        (item, index) =>
          getFunctionKey(item, index) === selectedAdvancedFunctionKey,
      )
      if (!selectedFunction) {
        throw new Error('请先查询 ABI 并选择一个写方法。')
      }

      const call = buildAdvancedCall()
      setAdvancedBatchCalls((current) => [
        ...current,
        {
          ...call,
          id: `${Date.now()}-${current.length}`,
          label: formatFunctionSignature(selectedFunction),
        },
      ])
    } catch (caught) {
      setAbiError(getErrorMessage(caught, '添加调用失败。'))
    }
  }

  const addAdvancedBatchTransfer = () => {
    setAbiError(null)

    try {
      const call = buildAdvancedTransferCall()
      setAdvancedBatchCalls((current) => [
        ...current,
        {
          ...call,
          id: `${Date.now()}-${current.length}`,
          label: `CFX 转账 ${advancedTransferAmount || '0'} CFX`,
        },
      ])
    } catch (caught) {
      setAbiError(getErrorMessage(caught, '添加转账失败。'))
    }
  }

  const removeAdvancedBatchCall = (id: string) => {
    setAdvancedBatchCalls((current) => current.filter((item) => item.id !== id))
  }

  const buildCalls = (): UserOperationCall[] => {
    if (operationMode === 'batch') {
      if (advancedBatchCalls.length === 0) {
        throw new Error('请至少添加一个批量调用。')
      }

      return advancedBatchCalls.map(({ to, data, value }) => ({
        to,
        data,
        value,
      }))
    }

    if (advancedTransferEnabled) {
      return [buildAdvancedTransferCall()]
    }

    return [buildAdvancedCall()]
  }

  const buildParams = async () => {
    if (!canUseConfig) {
      throw new Error('请填写有效的 Bundler URL、EntryPoint、Nonce key 和 Paymaster。')
    }
    const userOperationNonceKey = parseNonceKey(nonceKey)
    const calls = buildCalls()
    if (ownerMode === 'wallet' && !walletClient) {
      throw new Error('请先连接钱包。')
    }
    if (ownerMode === 'privateKey' && !ownerPrivateKey.trim()) {
      throw new Error('调试模式下需要填写 Owner 私钥。')
    }

    return {
      walletClient,
      accountMode,
      chain: network.chain,
      ownerMode,
      bundlerUrl,
      entryPointAddress: normalizeAddress(entryPoint, network.entryPointAddress),
      simpleAccountFactoryAddress: network.simpleAccountFactoryAddress,
      smartAccountImplementation: network.smartAccountImplementation,
      nonceKey: userOperationNonceKey,
      paymasterAddress: usePaymaster
        ? (paymaster as Address)
        : undefined,
      ownerPrivateKey: getOwnerPrivateKey(),
      calls,
    }
  }

  const buildPrivateKeyParams = async (
    privateKey: Hex,
    calls = buildCalls(),
    overrideNonceKey?: bigint,
  ) => {
    const userOperationNonceKey = overrideNonceKey ?? parseNonceKey(nonceKey)

    return {
      walletClient: undefined,
      accountMode,
      chain: network.chain,
      ownerMode: 'privateKey' as const,
      bundlerUrl,
      entryPointAddress: normalizeAddress(entryPoint, network.entryPointAddress),
      simpleAccountFactoryAddress: network.simpleAccountFactoryAddress,
      smartAccountImplementation: network.smartAccountImplementation,
      nonceKey: userOperationNonceKey,
      paymasterAddress: usePaymaster
        ? (paymaster as Address)
        : undefined,
      ownerPrivateKey: privateKey,
      calls,
    }
  }

  const buildWalletParams = async (
    calls = buildCalls(),
    overrideNonceKey?: bigint,
  ) => {
    if (!walletClient) {
      throw new Error('批量发送前请先连接钱包 A。')
    }
    const userOperationNonceKey = overrideNonceKey ?? parseNonceKey(nonceKey)

    return {
      walletClient,
      accountMode,
      chain: network.chain,
      ownerMode: 'wallet' as const,
      bundlerUrl,
      entryPointAddress: normalizeAddress(entryPoint, network.entryPointAddress),
      simpleAccountFactoryAddress: network.simpleAccountFactoryAddress,
      smartAccountImplementation: network.smartAccountImplementation,
      nonceKey: userOperationNonceKey,
      paymasterAddress: usePaymaster
        ? (paymaster as Address)
        : undefined,
      ownerPrivateKey: undefined,
      calls,
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
      const message = getErrorMessage(caught, '未知 UserOperation 错误。')
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
        throw new Error('请填写有效的 Bundler URL、EntryPoint、Nonce key 和 Paymaster。')
      }
      const calls = buildCalls()
      if (!walletClient) {
        throw new Error('批量发送前请先连接钱包 A。')
      }
      const count = Number.parseInt(bulkCount, 10)
      if (!Number.isInteger(count) || count < 2 || count > 20) {
        throw new Error('批量数量需要在 2 到 20 之间。')
      }

      const bulkPrivateKey = bulkOwnerPrivateKey.trim()
        ? normalizePrivateKey(bulkOwnerPrivateKey, '批量 Owner 私钥')
        : undefined

      const baseNonceKey = parseNonceKey(nonceKey)
      const entryPointAddress = normalizeAddress(
        entryPoint,
        network.entryPointAddress,
      )
      const getBulkNonceKey = (index: number) => {
        const nextNonceKey = baseNonceKey + BigInt(index)
        if (nextNonceKey >= USER_OPERATION_NONCE_KEY_LIMIT) {
          throw new Error('批量 Nonce key 超出了 2^192 范围。')
        }
        return nextNonceKey
      }
      const getBulkNonceKeyLabel = (value: bigint) => value.toString()
      const preparedItems: {
        owner: 'wallet' | 'privateKey'
        index: number
        nonceKey: string
        request?: Awaited<ReturnType<typeof prepareSignedDemoUserOperation>>
        error?: string
      }[] = []
      const signBulk = async (owner: 'wallet' | 'privateKey') => {
        for (let index = 0; index < count; index += 1) {
          const itemNonceKey = getBulkNonceKey(index)
          const item = {
            owner,
            index,
            nonceKey: getBulkNonceKeyLabel(itemNonceKey),
          }

          try {
            const params =
              owner === 'wallet'
                ? await buildWalletParams(calls, itemNonceKey)
                : await buildPrivateKeyParams(bulkPrivateKey!, calls, itemNonceKey)

            preparedItems.push({
              ...item,
              request: await prepareSignedDemoUserOperation(params),
            })
          } catch (reason) {
            const explanation = explainUserOperationError(reason)
            const message =
              reason instanceof Error ? reason.message : '未知 UserOperation 错误。'
            preparedItems.push({
              ...item,
              error: explanation ? `${explanation} ${message}` : message,
            })
          }
        }
      }

      await signBulk('wallet')
      if (bulkPrivateKey) {
        await signBulk('privateKey')
      }

      const sentItems = await Promise.allSettled(
        preparedItems.map(async (item) => {
          if (!item.request) return { item, error: item.error }

          try {
            const result = await sendPreparedDemoUserOperation({
              bundlerUrl,
              chain: network.chain,
              entryPointAddress,
              request: item.request,
            })
            return { item, result }
          } catch (reason) {
            const explanation = explainUserOperationError(reason)
            const message =
              reason instanceof Error ? reason.message : '未知 UserOperation 错误。'
            return {
              item,
              error: explanation ? `${explanation} ${message}` : message,
            }
          }
        }),
      )
      const nextResults = sentItems.map((settled): BulkUserOperationResult => {
        if (settled.status === 'fulfilled') {
          const { error, item, result } = settled.value
          return {
            owner: item.owner,
            index: item.index,
            nonceKey: item.nonceKey,
            status: result ? 'success' : 'error',
            result,
            error,
          }
        }

        const explanation = explainUserOperationError(settled.reason)
        const message =
          settled.reason instanceof Error
            ? settled.reason.message
            : '未知 UserOperation 错误。'
        return {
          owner: 'wallet',
          index: 0,
          nonceKey: '-',
          status: 'error',
          error: explanation ? `${explanation} ${message}` : message,
        }
      })

      setBulkResults(nextResults)
      const diagnostics = await loadDiagnostics({
        walletClient: bulkPrivateKey ? undefined : walletClient,
        chain: network.chain,
        entryPointAddress,
        simpleAccountFactoryAddress: network.simpleAccountFactoryAddress,
        paymasterAddress:
          usePaymaster && isAddress(paymaster) ? paymaster : undefined,
        accountMode: bulkPrivateKey ? 'simpleAccount' : accountMode,
        ownerMode: bulkPrivateKey ? 'privateKey' : 'wallet',
        ownerPrivateKey: bulkPrivateKey,
      })
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
      const message = getErrorMessage(caught, '未知 UserOperation 错误。')
      setError(explanation ? `${explanation}\n\n${message}` : message)
      setStatus('error')
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <a className="home-link" href={homeHref} target="_top">
            返回首页
          </a>
          <div>
            <h1>EIP-4337 Demo</h1>
            <p>{network.chain.name} 账户抽象调试台</p>
          </div>
        </div>
        <WalletControl network={network} />
      </header>

      <main className="layout">
        <aside className="sidebar">
          <ConfigPanel
            networkId={networkId}
            setNetworkId={selectNetwork}
            bundlerUrl={bundlerUrl}
            setBundlerUrl={setBundlerUrl}
            entryPoint={entryPoint}
            setEntryPoint={setEntryPoint}
            nonceKey={nonceKey}
            setNonceKey={setNonceKey}
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
          <ContractsPanel network={network} />
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
            network={network}
            operationMode={operationMode}
            setOperationMode={setOperationMode}
            advancedContractAddress={advancedContractAddress}
            setAdvancedContractAddress={setAdvancedContractAddress}
            advancedFunctions={advancedFunctions}
            selectedAdvancedFunctionKey={selectedAdvancedFunctionKey}
            setSelectedAdvancedFunctionKey={selectAdvancedFunction}
            advancedArgs={advancedArgs}
            setAdvancedArg={setAdvancedArg}
            advancedValue={advancedValue}
            setAdvancedValue={setAdvancedValue}
            advancedTransferEnabled={advancedTransferEnabled}
            setAdvancedTransferEnabled={setAdvancedTransferEnabled}
            advancedTransferTo={advancedTransferTo}
            setAdvancedTransferTo={setAdvancedTransferTo}
            advancedTransferAmount={advancedTransferAmount}
            setAdvancedTransferAmount={setAdvancedTransferAmount}
            advancedBatchCalls={advancedBatchCalls}
            abiStatus={abiStatus}
            abiError={abiError}
            onLoadAbi={() => void loadAdvancedAbi()}
            onAddAdvancedCall={addAdvancedBatchCall}
            onAddAdvancedTransfer={addAdvancedBatchTransfer}
            onRemoveAdvancedCall={removeAdvancedBatchCall}
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

      <GuideModal open={guideOpen} onClose={closeGuide} network={network} />
    </div>
  )
}

export default App
