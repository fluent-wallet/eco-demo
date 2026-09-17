import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  createPublicClient,
  formatUnits,
  http,
  isAddress,
  maxUint256,
  parseUnits,
  type Address,
  type Hex,
} from 'viem'
import { estimateContractGas, simulateContract } from 'viem/actions'
import {
  useAccount,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useWalletClient,
} from 'wagmi'
import { permit2Abi, spenderAbi, tokenAbi } from './abi'
import {
  DEFAULT_DEPLOYMENT,
  DEFAULT_MINT_AMOUNT,
  confluxESpaceTestnet,
  getExplorerTxUrl,
  type DeploymentConfig,
} from './config'
import {
  buildDaiPermitTypedData,
  buildErc2612TypedData,
  buildPermit2AllowanceTypedData,
  buildPermit2BatchAllowanceTypedData,
  buildPermit2BatchSignatureTypedData,
  buildPermit2SignatureTypedData,
  buildPermit2WitnessTypedData,
  hashPermit2Witness,
  PERMIT2_WITNESS_TYPE_STRING,
  randomUint256,
  splitSignature,
  stringifyJson,
  stringifyRpcTypedData,
  type DaiAllowedValue,
  type BuiltTypedData,
} from './lib/typedData'
import { ACTIONS, EVENTS, Joyride, type EventData, type Step } from 'react-joyride'

const publicClient = createPublicClient({
  chain: confluxESpaceTestnet,
  transport: http(),
})

const DEV_SHELL_PORT = '4173'
const APP_ROUTE_SEGMENT = 'permit'
const TOUR_SEEN_STORAGE_KEY = 'eco-demo:permit-tour-seen'
const MAX_UINT160 = (1n << 160n) - 1n
const MAX_UINT48 = (1n << 48n) - 1n

type FlowId = 'erc2612' | 'allowance' | 'signature'
type DaiAllowedOption =
  | 'boolean-true'
  | 'boolean-false'
  | 'string-true'
  | 'string-false'
type SigningFlowId = 'dai' | 'batchAllowance' | 'batchSignature' | 'witness'
type WorkflowFlowId = FlowId | SigningFlowId
type ResultKind = FlowId | SigningFlowId | 'mint' | 'approve'
type TokenId = 'permitToken' | 'normalToken' | 'daiToken'
type AsyncState = 'idle' | 'loading' | 'success' | 'error'

type TokenSnapshot = {
  name: string
  symbol: string
  decimals: number
  balance?: bigint
  tokenAllowance?: bigint
  spenderAllowance?: bigint
  permit2Allowance?: {
    amount: bigint
    expiration: bigint
    nonce: bigint
  }
  spenderBalance?: bigint
}

type Snapshot = {
  chainId: number
  timestamp: bigint
  permitTokenVersion: string
  permitNonce?: bigint
  daiNonce?: bigint
  daiDomainSeparator: Hex
  permit2DomainSeparator: Hex
  spenderPermit2: Address
  nonceBitmapWord?: bigint
  nonceBitmap?: bigint
  tokens: Record<TokenId, TokenSnapshot>
}

type ReceiptSummary = {
  status: 'success' | 'reverted'
  blockNumber: bigint
  gasUsed: bigint
}

type FlowArtifact = {
  typedData: BuiltTypedData
  rpcPayload: string
  signature: string
  witnessTypeString?: string
}

type ExecutionResult = {
  flow: ResultKind
  hash: Hex
  receipt: ReceiptSummary
  before?: Snapshot
  after?: Snapshot
}

type LatestActivity =
  | { kind: 'transaction'; result: ExecutionResult }
  | { kind: 'error'; message: string }

type Eip712DomainResult = readonly [
  Hex,
  string,
  string,
  bigint,
  Address,
  Hex,
  readonly bigint[],
]

const FLOW_LABELS: Record<ResultKind, string> = {
  erc2612: 'ERC-2612 Permit',
  dai: 'Dai-style Permit',
  allowance: 'Permit2 AllowanceTransfer',
  signature: 'Permit2 SignatureTransfer',
  batchAllowance: 'Permit2 PermitBatch',
  batchSignature: 'Permit2 PermitBatchTransferFrom',
  witness: 'Permit2 PermitWitnessTransferFrom',
  mint: '测试 Token Mint',
  approve: 'Token → Permit2 approve',
}

const WORKFLOW_FLOW_LABELS: Record<WorkflowFlowId, string> = {
  erc2612: FLOW_LABELS.erc2612,
  dai: FLOW_LABELS.dai,
  allowance: FLOW_LABELS.allowance,
  signature: FLOW_LABELS.signature,
  batchAllowance: FLOW_LABELS.batchAllowance,
  batchSignature: FLOW_LABELS.batchSignature,
  witness: FLOW_LABELS.witness,
}

const TOKEN_LABELS: Record<TokenId, string> = {
  permitToken: 'Permit Test Token (PTT)',
  normalToken: 'Normal Test Token (NTT)',
  daiToken: 'DaiToken (DAI)',
}

function isSigningFlow(flow: WorkflowFlowId): flow is SigningFlowId {
  return flow === 'dai' || flow === 'batchAllowance' || flow === 'batchSignature' || flow === 'witness'
}

function daiAllowedValue(option: DaiAllowedOption): DaiAllowedValue {
  if (option === 'boolean-true') return true
  if (option === 'boolean-false') return false
  if (option === 'string-true') return 'true'
  return 'false'
}

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

function compact(value: string | undefined) {
  if (!value) return '-'
  return `${value.slice(0, 8)}...${value.slice(-6)}`
}

function errorMessage(error: unknown, fallback = '操作失败。') {
  if (error && typeof error === 'object') {
    const candidate = error as {
      shortMessage?: unknown
      details?: unknown
    }
    if (typeof candidate.shortMessage === 'string' && candidate.shortMessage.trim()) {
      const details =
        typeof candidate.details === 'string' && candidate.details.trim()
          ? candidate.details.trim()
          : ''
      if (details && !candidate.shortMessage.includes(details)) {
        return `${candidate.shortMessage} ${details}`
      }
      return candidate.shortMessage
    }
  }
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return fallback
}

function parseAddress(value: string, label: string): Address {
  if (!isAddress(value)) {
    throw new Error(`${label} 不是有效的 EVM 地址。`)
  }
  return value as Address
}

function parseDeployment(config: DeploymentConfig) {
  return {
    permitToken: parseAddress(config.permitToken, 'PermitToken'),
    normalToken: parseAddress(config.normalToken, 'NormalToken'),
    permit2: parseAddress(config.permit2, 'Permit2'),
    permitTestSpender: parseAddress(
      config.permitTestSpender,
      'PermitTestSpender',
    ),
    daiToken: parseAddress(config.daiToken, 'DaiToken'),
  }
}

function tokenAddress(
  addresses: ReturnType<typeof parseDeployment>,
  token: TokenId,
) {
  return addresses[token]
}

function parseTokenAmount(value: string, decimals: number, label: string) {
  if (!/^\d+(\.\d+)?$/.test(value.trim())) {
    throw new Error(`${label} 需要填写非负的 Token 数量。`)
  }
  let amount: bigint
  try {
    amount = parseUnits(value.trim(), decimals)
  } catch {
    throw new Error(`${label} 不是有效的 Token 数量。`)
  }
  if (amount > maxUint256) throw new Error(`${label} 超过 uint256 范围。`)
  return amount
}

function parseUnsigned(value: string, label: string) {
  if (!/^\d+$/.test(value.trim())) {
    throw new Error(`${label} 需要填写非负整数。`)
  }
  const parsed = BigInt(value.trim())
  if (parsed > maxUint256) throw new Error(`${label} 超过 uint256 范围。`)
  return parsed
}

function parseOffset(value: string, label: string) {
  if (!/^-?\d+$/.test(value.trim())) {
    throw new Error(`${label} 需要填写整数秒数，可使用负数生成过期数据。`)
  }
  return BigInt(value.trim())
}

function relativeUint256(timestamp: bigint, offset: string, label: string, maximum = maxUint256) {
  const value = timestamp + parseOffset(offset, label)
  if (value < 0n || value > maximum) {
    throw new Error(`${label} 必须在 uint${maximum === MAX_UINT48 ? '48' : '256'} 范围内。`)
  }
  return value
}

function stringifyValue(value: bigint | number | undefined) {
  if (value === undefined) return '-'
  return value.toString()
}

function formatToken(value: bigint | undefined, decimals: number) {
  if (value === undefined) return '-'
  return formatUnits(value, decimals)
}

function readContractValue<T>(parameters: unknown) {
  return publicClient.readContract(parameters as never) as Promise<T>
}

function statusLabel(state: AsyncState) {
  return {
    idle: '待操作',
    loading: '处理中',
    success: '成功',
    error: '错误',
  }[state]
}

function StatusPill({ state }: { state: AsyncState }) {
  return <span className={`pill pill-${state}`}>{statusLabel(state)}</span>
}

function PanelHeading({
  title,
  description,
  action,
  tourTarget,
}: {
  title: string
  description?: string
  action?: ReactNode
  tourTarget?: string
}) {
  return (
    <div className="panel-heading" data-tour-target={tourTarget}>
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  )
}

function WalletControl() {
  const [open, setOpen] = useState(false)
  const { address, chainId, connector, isConnected } = useAccount()
  const { connectors, connect, error, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const { switchChain, isPending: switchPending, error: switchError } =
    useSwitchChain()
  const expectedChain = chainId === confluxESpaceTestnet.id

  useEffect(() => {
    if (isConnected) setOpen(false)
  }, [isConnected])

  if (!isConnected || !address) {
    return (
      <div className="wallet-control">
        <button className="button accent" onClick={() => setOpen(true)} type="button">
          连接钱包
        </button>
        {open && (
          <div className="wallet-menu">
            <div className="wallet-menu-heading">
              <strong>选择钱包</strong>
              <button className="icon-button" onClick={() => setOpen(false)} type="button">
                关闭
              </button>
            </div>
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
            {error && <p className="error-text">{error.message}</p>}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="wallet-control">
      <div className="wallet-status">
        <div className="wallet-summary">
          <span>{connector?.name ?? '钱包'}</span>
          <code>{address}</code>
        </div>
        <span className={`pill ${expectedChain ? 'pill-success' : 'pill-error'}`}>
          {expectedChain ? 'Conflux eSpace Testnet' : `链 ID ${chainId ?? '-'}`}
        </span>
        {!expectedChain && (
          <button
            className="button secondary"
            disabled={switchPending}
            onClick={() => switchChain({ chainId: confluxESpaceTestnet.id })}
            type="button"
          >
            {switchPending ? '切换中...' : '切换到测试网'}
          </button>
        )}
        <button className="button secondary" onClick={() => disconnect()} type="button">
          断开
        </button>
      </div>
      {switchError && <p className="error-text">{switchError.message}</p>}
    </div>
  )
}

function TypedDataViewer({
  artifact,
  onCopy,
  onSignatureChange,
  signatureHelp,
  showSignatureParts = false,
}: {
  artifact?: FlowArtifact
  onCopy: () => void
  onSignatureChange: (value: string) => void
  signatureHelp?: ReactNode
  showSignatureParts?: boolean
}) {
  if (!artifact) {
    return <p className="muted">先构造 Typed Data，或点击钱包签名自动构造。</p>
  }

  let signatureParts: ReturnType<typeof splitSignature> | undefined
  let signatureError = ''
  if (showSignatureParts && artifact.signature.trim()) {
    try {
      signatureParts = splitSignature(artifact.signature)
    } catch (error) {
      signatureError = errorMessage(error)
    }
  }

  return (
    <div className="typed-data-viewer">
      <div className="output-heading">
        <h3>Typed Data</h3>
        <button className="button secondary" onClick={onCopy} type="button">
          复制 eth_signTypedData_v4 JSON
        </button>
      </div>
      <div className="typed-data-grid">
        <div className="typed-data-section">
          <span>domain</span>
          <pre>{stringifyJson(artifact.typedData.domain)}</pre>
        </div>
        <div className="typed-data-section">
          <span>types</span>
          <pre>{stringifyJson(artifact.typedData.types)}</pre>
        </div>
        <div className="typed-data-section">
          <span>primaryType</span>
          <code>{artifact.typedData.primaryType}</code>
        </div>
        {artifact.witnessTypeString && (
          <div className="typed-data-section typed-data-section-wide">
            <span>witnessTypeString（链上调用时需要）</span>
            <code className="break-code">{artifact.witnessTypeString}</code>
          </div>
        )}
        <div className="typed-data-section">
          <span>message</span>
          <pre>{stringifyJson(artifact.typedData.message)}</pre>
        </div>
      </div>
      <label className="field">
        <span>Signature（可粘贴外部 eth_signTypedData_v4 结果）</span>
        <textarea
          autoComplete="off"
          onChange={(event) => onSignatureChange(event.target.value)}
          placeholder="0x..."
          spellCheck={false}
          value={artifact.signature}
        />
      </label>
      {showSignatureParts && artifact.signature.trim() && (
        <div className="signature-breakdown">
          <div>
            <span>v</span>
            <code>{signatureParts?.v ?? '-'}</code>
          </div>
          <div>
            <span>r</span>
            <code>{signatureParts?.r ?? '-'}</code>
          </div>
          <div>
            <span>s</span>
            <code>{signatureParts?.s ?? '-'}</code>
          </div>
        </div>
      )}
      {signatureError && <p className="error-text">{signatureError}</p>}
      {showSignatureParts && signatureParts && (
        signatureHelp ?? (
          <p className="muted">
            可将以上 v/r/s 与 owner、spender、value、deadline 一起传给
            <code>PermitToken.permit(...)</code>。
          </p>
        )
      )}
      <details>
        <summary>查看可复制 RPC JSON</summary>
        <pre>{artifact.rpcPayload}</pre>
      </details>
    </div>
  )
}

function LatestResultPanel({
  activity,
  copied,
  status,
}: {
  activity?: LatestActivity
  copied: string
  status: AsyncState
}) {
  const result = activity?.kind === 'transaction' ? activity.result : undefined

  return (
    <section className="panel recent-result-panel">
      <PanelHeading title="最近结果" action={<StatusPill state={status} />} />
      <div className="stack">
        {activity?.kind === 'error' && <div className="alert">{activity.message}</div>}
        {result && (
          <div className="latest-result-body">
            <div className="kv"><span>流程</span><code>{FLOW_LABELS[result.flow]}</code></div>
            <div className="kv"><span>交易</span><a href={getExplorerTxUrl(result.hash)} rel="noreferrer" target="_blank">{compact(result.hash)}</a></div>
            <div className="kv"><span>Receipt</span><code>{result.receipt.status} · block {result.receipt.blockNumber.toString()} · gas {result.receipt.gasUsed.toString()}</code></div>
            <details>
              <summary>查看执行前后的余额与 allowance</summary>
              <div className="result-detail-grid">
                <div className="kv"><span>Owner 余额（PTT）</span><code>{formatToken(result.before?.tokens.permitToken.balance, result.before?.tokens.permitToken.decimals ?? 18)} → {formatToken(result.after?.tokens.permitToken.balance, result.after?.tokens.permitToken.decimals ?? 18)}</code></div>
                <div className="kv"><span>Owner 余额（NTT）</span><code>{formatToken(result.before?.tokens.normalToken.balance, result.before?.tokens.normalToken.decimals ?? 18)} → {formatToken(result.after?.tokens.normalToken.balance, result.after?.tokens.normalToken.decimals ?? 18)}</code></div>
                <div className="kv"><span>Spender 余额（PTT）</span><code>{formatToken(result.before?.tokens.permitToken.spenderBalance, result.before?.tokens.permitToken.decimals ?? 18)} → {formatToken(result.after?.tokens.permitToken.spenderBalance, result.after?.tokens.permitToken.decimals ?? 18)}</code></div>
                <div className="kv"><span>Spender 余额（NTT）</span><code>{formatToken(result.before?.tokens.normalToken.spenderBalance, result.before?.tokens.normalToken.decimals ?? 18)} → {formatToken(result.after?.tokens.normalToken.spenderBalance, result.after?.tokens.normalToken.decimals ?? 18)}</code></div>
                <div className="kv"><span>Token allowance（PTT）</span><code>{formatToken(result.before?.tokens.permitToken.tokenAllowance, result.before?.tokens.permitToken.decimals ?? 18)} → {formatToken(result.after?.tokens.permitToken.tokenAllowance, result.after?.tokens.permitToken.decimals ?? 18)}</code></div>
                <div className="kv"><span>Permit2 allowance（PTT）</span><code>{formatToken(result.before?.tokens.permitToken.permit2Allowance?.amount, result.before?.tokens.permitToken.decimals ?? 18)} → {formatToken(result.after?.tokens.permitToken.permit2Allowance?.amount, result.after?.tokens.permitToken.decimals ?? 18)}</code></div>
                <div className="kv"><span>Token allowance（NTT）</span><code>{formatToken(result.before?.tokens.normalToken.tokenAllowance, result.before?.tokens.normalToken.decimals ?? 18)} → {formatToken(result.after?.tokens.normalToken.tokenAllowance, result.after?.tokens.normalToken.decimals ?? 18)}</code></div>
                <div className="kv"><span>Permit2 allowance（NTT）</span><code>{formatToken(result.before?.tokens.normalToken.permit2Allowance?.amount, result.before?.tokens.normalToken.decimals ?? 18)} → {formatToken(result.after?.tokens.normalToken.permit2Allowance?.amount, result.after?.tokens.normalToken.decimals ?? 18)}</code></div>
                <div className="kv"><span>Owner 余额（DAI）</span><code>{formatToken(result.before?.tokens.daiToken.balance, result.before?.tokens.daiToken.decimals ?? 18)} → {formatToken(result.after?.tokens.daiToken.balance, result.after?.tokens.daiToken.decimals ?? 18)}</code></div>
                <div className="kv"><span>Spender 余额（DAI）</span><code>{formatToken(result.before?.tokens.daiToken.spenderBalance, result.before?.tokens.daiToken.decimals ?? 18)} → {formatToken(result.after?.tokens.daiToken.spenderBalance, result.after?.tokens.daiToken.decimals ?? 18)}</code></div>
                <div className="kv"><span>DaiToken allowance → Spender</span><code>{formatToken(result.before?.tokens.daiToken.spenderAllowance, result.before?.tokens.daiToken.decimals ?? 18)} → {formatToken(result.after?.tokens.daiToken.spenderAllowance, result.after?.tokens.daiToken.decimals ?? 18)}</code></div>
                {(result.flow === 'signature' || result.flow === 'batchSignature' || result.flow === 'witness') && <div className="kv"><span>nonce bitmap（word {stringifyValue(result.before?.nonceBitmapWord)})</span><code>{stringifyValue(result.before?.nonceBitmap)} → {stringifyValue(result.after?.nonceBitmap)}</code></div>}
              </div>
            </details>
          </div>
        )}
        {!activity && <p className="muted">还没有最新结果。</p>}
        {copied && <div className="success-text">已复制：{copied}</div>}
      </div>
    </section>
  )
}

function TokenSnapshotCard({
  token,
  snapshot,
}: {
  token: TokenId
  snapshot?: Snapshot
}) {
  const item = snapshot?.tokens[token]
  const decimals = item?.decimals ?? 18
  return (
    <div className="token-card">
      <div className="token-card-heading">
        <strong>{TOKEN_LABELS[token]}</strong>
        <span className="pill">{item?.symbol ?? '-'}</span>
      </div>
      <div className="kv-grid compact-grid">
        <div className="kv">
          <span>余额</span>
          <code>{formatToken(item?.balance, decimals)}</code>
        </div>
        {token === 'daiToken' ? (
          <div className="kv">
            <span>Token allowance → Spender</span>
            <code>{formatToken(item?.spenderAllowance, decimals)}</code>
          </div>
        ) : (
          <>
            <div className="kv">
              <span>Token → Permit2</span>
              <code>{formatToken(item?.tokenAllowance, decimals)}</code>
            </div>
            <div className="kv">
              <span>Permit2 allowance</span>
              <code>{formatToken(item?.permit2Allowance?.amount, decimals)}</code>
            </div>
            <div className="kv">
              <span>Permit2 expiration / nonce</span>
              <code>{stringifyValue(item?.permit2Allowance?.expiration)} / {stringifyValue(item?.permit2Allowance?.nonce)}</code>
            </div>
          </>
        )}
        <div className="kv">
          <span>Spender 余额</span>
          <code>{formatToken(item?.spenderBalance, decimals)}</code>
        </div>
      </div>
      <p className="muted address-line">{item ? item.name : '等待读取链上信息'}</p>
    </div>
  )
}

function App() {
  const homeHref = getHomeHref()
  const { address, chainId } = useAccount()
  const { data: walletClient } = useWalletClient()
  const [config, setConfig] = useState<DeploymentConfig>(() => ({
    ...DEFAULT_DEPLOYMENT,
  }))
  const [ownerInput, setOwnerInput] = useState('')
  const [snapshot, setSnapshot] = useState<Snapshot>()
  const [activeFlow, setActiveFlow] = useState<WorkflowFlowId>('erc2612')
  const [status, setStatus] = useState<AsyncState>('idle')
  const [copied, setCopied] = useState('')
  const [latestActivity, setLatestActivity] = useState<LatestActivity>()
  const [rawTypedDataInput, setRawTypedDataInput] = useState('')
  const [rawTypedDataSignature, setRawTypedDataSignature] = useState('')
  const [rawTypedDataError, setRawTypedDataError] = useState('')
  const [artifacts, setArtifacts] = useState<Partial<Record<FlowId, FlowArtifact>>>({})
  const [signingArtifacts, setSigningArtifacts] = useState<
    Partial<Record<SigningFlowId, FlowArtifact>>
  >({})
  const [mintAmount, setMintAmount] = useState(DEFAULT_MINT_AMOUNT)
  const [approveToken, setApproveToken] = useState<TokenId>('normalToken')
  const [ercForm, setErcForm] = useState({
    signedAmount: '100',
    executeAmount: '100',
    deadlineOffset: '3600',
    signedSpender: '',
  })
  const [daiForm, setDaiForm] = useState({
    verifyingContract: '',
    holder: '',
    spender: '',
    nonce: '',
    expiryOffset: '3600',
    allowed: 'boolean-true' as DaiAllowedOption,
    executeAllowed: 'true' as 'true' | 'false',
    transferAmount: '10',
  })
  const [allowanceForm, setAllowanceForm] = useState({
    token: 'normalToken' as TokenId,
    signedAmount: '100',
    transferAmount: '10',
    expirationOffset: '3600',
    sigDeadlineOffset: '3600',
    signedSpender: '',
  })
  const [signatureForm, setSignatureForm] = useState({
    token: 'normalToken' as TokenId,
    permittedAmount: '100',
    requestedAmount: '10',
    deadlineOffset: '600',
    nonce: '',
    signedSpender: '',
  })
  const [batchAllowanceForm, setBatchAllowanceForm] = useState({
    signedAmountPtt: '100',
    signedAmountNtt: '100',
    transferAmountPtt: '10',
    transferAmountNtt: '10',
    expirationOffset: '3600',
    sigDeadlineOffset: '3600',
    signedSpender: '',
  })
  const [batchSignatureForm, setBatchSignatureForm] = useState({
    permittedAmountPtt: '100',
    permittedAmountNtt: '100',
    requestedAmountPtt: '10',
    requestedAmountNtt: '10',
    deadlineOffset: '600',
    nonce: '',
    signedSpender: '',
  })
  const [witnessForm, setWitnessForm] = useState({
    token: 'permitToken' as TokenId,
    permittedAmount: '100',
    requestedAmount: '10',
    deadlineOffset: '600',
    nonce: '',
    signedSpender: '',
    witnessRecipient: '',
    witnessPurpose: 'Permit2 witness demo',
  })
  const [tourOpen, setTourOpen] = useState(false)

  const tourSteps = useMemo<Step[]>(
    () => [
      {
        title: '部署与账户',
        content:
          '显示 demo 中用到的各种合约，可以随意更改。只做签名时不会校验合约的有效性，只有实际发送链上交易时才会校验。',
        target: '[data-tour-target="deployment"]',
        placement: 'right',
        id: 'deployment',
      },
      {
        title: '签名工作流',
        content:
          '1–2 是 Permit 签名，3–7 是 Permit2 签名。Permit 签名基于 Permit Token 实现，使用签名发送交易时需要满足对应 Token 的要求（签名步骤不会校验）；Permit2 签名是额外的 Permit2 合约实现，可以支持 Permit Token 和已有的各种 ERC-20 Token。',
        target: '[data-tour-target="workflow"]',
        placement: 'bottom',
        id: 'workflow',
      },
      {
        title: '钱包签名',
        content:
          '点击此按钮即可发起钱包 Typed Data 签名。签名后会显示原始 signature 和 v/r/s（ERC-2612、Dai-style Permit），可以自行调用相关合约，也可以用“链上执行”使用上一次签名结果提交交易。',
        target: '[data-tour-target="wallet-signature"]',
        placement: 'top',
        id: 'wallet-signature',
      },
      {
        title: '测试资产',
        content:
          '显示 3 种 Token 的 mint 操作，无权限要求。如果要测试 Permit2 签名授权的链上执行，需要先把对应 Token approve 给 Permit2 合约；只做签名不需要 approve。',
        target: '[data-tour-target="assets"]',
        placement: 'right',
        id: 'assets',
      },
      {
        title: '链上状态',
        content:
          '显示几种 Token 对于当前 owner 的余额、Token allowance、Permit2 allowance 和 nonce 等状态。',
        target: '[data-tour-target="chain-state"]',
        placement: 'right',
        id: 'chain-state',
      },
      {
        title: 'Raw Typed Data 签名',
        content:
          '可以从“签名工作流”部分最下方的“复制 eth_signTypedData_v4 JSON”区域复制 JSON，直接填入这里后签名。它与“钱包签名”使用相同的 RPC 方法，但 JSON 可以自由修改，方便测试异常请求。',
        target: '[data-tour-target="raw-typed-data"]',
        placement: 'bottom',
        id: 'raw-typed-data',
      },
    ],
    [],
  )

  const configError = useMemo(() => {
    try {
      parseDeployment(config)
      return ''
    } catch (error) {
      return errorMessage(error)
    }
  }, [config])

  const handleTourEvent = useCallback((data: EventData) => {
    if (
      data.type === EVENTS.TOUR_END ||
      data.type === EVENTS.TARGET_NOT_FOUND ||
      data.action === ACTIONS.CLOSE ||
      data.action === ACTIONS.SKIP
    ) {
      setTourOpen(false)
    }
  }, [])

  useEffect(() => {
    let hasSeenTour = false
    try {
      hasSeenTour = window.localStorage.getItem(TOUR_SEEN_STORAGE_KEY) === '1'
    } catch {
      // The tour can still run when browser storage is unavailable.
    }

    if (hasSeenTour) return

    const timer = window.setTimeout(() => {
      setTourOpen(true)
      try {
        window.localStorage.setItem(TOUR_SEEN_STORAGE_KEY, '1')
      } catch {
        // Ignore storage restrictions; this is only a first-visit convenience.
      }
    }, 500)

    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!ownerInput && address) setOwnerInput(address)
  }, [address, ownerInput])

  const loadSnapshot = useCallback(async (bitmapNonce?: bigint) => {
    const addresses = parseDeployment(config)
    const owner = ownerInput && isAddress(ownerInput) ? (ownerInput as Address) : undefined
    const bitmapWord = owner && bitmapNonce !== undefined ? bitmapNonce >> 8n : undefined
    const [
      permitName,
      permitSymbol,
      permitDecimals,
      normalName,
      normalSymbol,
      normalDecimals,
      daiName,
      daiSymbol,
      daiDecimals,
      domain,
      daiDomainSeparator,
      domainSeparator,
      boundPermit2,
      block,
      currentChainId,
    ] = await Promise.all([
      readContractValue<string>({ address: addresses.permitToken, abi: tokenAbi, functionName: 'name' }),
      readContractValue<string>({ address: addresses.permitToken, abi: tokenAbi, functionName: 'symbol' }),
      readContractValue<number>({ address: addresses.permitToken, abi: tokenAbi, functionName: 'decimals' }),
      readContractValue<string>({ address: addresses.normalToken, abi: tokenAbi, functionName: 'name' }),
      readContractValue<string>({ address: addresses.normalToken, abi: tokenAbi, functionName: 'symbol' }),
      readContractValue<number>({ address: addresses.normalToken, abi: tokenAbi, functionName: 'decimals' }),
      readContractValue<string>({ address: addresses.daiToken, abi: tokenAbi, functionName: 'name' }),
      readContractValue<string>({ address: addresses.daiToken, abi: tokenAbi, functionName: 'symbol' }),
      readContractValue<number>({ address: addresses.daiToken, abi: tokenAbi, functionName: 'decimals' }),
      readContractValue<Eip712DomainResult>({ address: addresses.permitToken, abi: tokenAbi, functionName: 'eip712Domain' }),
      readContractValue<Hex>({ address: addresses.daiToken, abi: tokenAbi, functionName: 'DOMAIN_SEPARATOR' }),
      readContractValue<Hex>({ address: addresses.permit2, abi: permit2Abi, functionName: 'DOMAIN_SEPARATOR' }),
      readContractValue<Address>({ address: addresses.permitTestSpender, abi: spenderAbi, functionName: 'permit2' }),
      publicClient.getBlock(),
      publicClient.getChainId(),
    ])
    const nonceBitmap =
      owner && bitmapWord !== undefined
        ? await readContractValue<bigint>({
            address: addresses.permit2,
            abi: permit2Abi,
            functionName: 'nonceBitmap',
            args: [owner, bitmapWord],
          })
        : undefined

    const permitToken: TokenSnapshot = {
      name: permitName,
      symbol: permitSymbol,
      decimals: Number(permitDecimals),
    }
    const normalToken: TokenSnapshot = {
      name: normalName,
      symbol: normalSymbol,
      decimals: Number(normalDecimals),
    }
    const daiToken: TokenSnapshot = {
      name: daiName,
      symbol: daiSymbol,
      decimals: Number(daiDecimals),
    }

    let permitNonce: bigint | undefined
    let daiNonce: bigint | undefined
    if (owner) {
      const [permitTokenReads, normalTokenReads, daiTokenReads, permit2PermitState, permit2NormalState] = await Promise.all([
        Promise.all([
          readContractValue<bigint>({ address: addresses.permitToken, abi: tokenAbi, functionName: 'balanceOf', args: [owner] }),
          readContractValue<bigint>({ address: addresses.permitToken, abi: tokenAbi, functionName: 'allowance', args: [owner, addresses.permit2] }),
          readContractValue<bigint>({ address: addresses.permitToken, abi: tokenAbi, functionName: 'nonces', args: [owner] }),
          readContractValue<bigint>({ address: addresses.permitToken, abi: tokenAbi, functionName: 'balanceOf', args: [addresses.permitTestSpender] }),
        ]),
        Promise.all([
          readContractValue<bigint>({ address: addresses.normalToken, abi: tokenAbi, functionName: 'balanceOf', args: [owner] }),
          readContractValue<bigint>({ address: addresses.normalToken, abi: tokenAbi, functionName: 'allowance', args: [owner, addresses.permit2] }),
          readContractValue<bigint>({ address: addresses.normalToken, abi: tokenAbi, functionName: 'balanceOf', args: [addresses.permitTestSpender] }),
        ]),
        Promise.all([
          readContractValue<bigint>({ address: addresses.daiToken, abi: tokenAbi, functionName: 'balanceOf', args: [owner] }),
          readContractValue<bigint>({ address: addresses.daiToken, abi: tokenAbi, functionName: 'allowance', args: [owner, addresses.permitTestSpender] }),
          readContractValue<bigint>({ address: addresses.daiToken, abi: tokenAbi, functionName: 'nonces', args: [owner] }),
          readContractValue<bigint>({ address: addresses.daiToken, abi: tokenAbi, functionName: 'balanceOf', args: [addresses.permitTestSpender] }),
        ]),
        readContractValue<readonly [bigint, bigint, bigint]>({ address: addresses.permit2, abi: permit2Abi, functionName: 'allowance', args: [owner, addresses.permitToken, addresses.permitTestSpender] }),
        readContractValue<readonly [bigint, bigint, bigint]>({ address: addresses.permit2, abi: permit2Abi, functionName: 'allowance', args: [owner, addresses.normalToken, addresses.permitTestSpender] }),
      ])

      permitNonce = permitTokenReads[2]
      daiNonce = daiTokenReads[2]
      permitToken.balance = permitTokenReads[0]
      permitToken.tokenAllowance = permitTokenReads[1]
      permitToken.spenderBalance = permitTokenReads[3]
      permitToken.permit2Allowance = {
        amount: permit2PermitState[0],
        expiration: permit2PermitState[1],
        nonce: permit2PermitState[2],
      }
      normalToken.balance = normalTokenReads[0]
      normalToken.tokenAllowance = normalTokenReads[1]
      normalToken.spenderBalance = normalTokenReads[2]
      normalToken.permit2Allowance = {
        amount: permit2NormalState[0],
        expiration: permit2NormalState[1],
        nonce: permit2NormalState[2],
      }
      daiToken.balance = daiTokenReads[0]
      daiToken.spenderAllowance = daiTokenReads[1]
      daiToken.spenderBalance = daiTokenReads[3]
    }

    const nextSnapshot: Snapshot = {
      chainId: currentChainId,
      timestamp: block.timestamp,
      permitTokenVersion: domain[2] || '1',
      permitNonce,
      daiNonce,
      daiDomainSeparator,
      permit2DomainSeparator: domainSeparator,
      spenderPermit2: boundPermit2,
      nonceBitmapWord: bitmapWord,
      nonceBitmap,
      tokens: { permitToken, normalToken, daiToken },
    }
    setSnapshot(nextSnapshot)
    return nextSnapshot
  }, [config, ownerInput])

  useEffect(() => {
    void loadSnapshot().catch((error) => {
      setStatus('error')
      setLatestActivity({
        kind: 'error',
        message: errorMessage(error, '读取合约状态失败。'),
      })
    })
  }, [loadSnapshot])

  const setFlowArtifact = (flow: FlowId, artifact: FlowArtifact) => {
    setArtifacts((current) => ({ ...current, [flow]: artifact }))
  }

  const setSigningArtifact = (
    flow: SigningFlowId,
    artifact: FlowArtifact,
  ) => {
    setSigningArtifacts((current) => ({ ...current, [flow]: artifact }))
  }

  const runAction = async (
    action: () => Promise<void>,
    onError?: (message: string) => void,
  ) => {
    setStatus('loading')
    try {
      await action()
      setStatus('success')
      setLatestActivity((current) =>
        current?.kind === 'error' ? undefined : current,
      )
    } catch (error) {
      const nextMessage = errorMessage(error)
      setStatus('error')
      setLatestActivity({ kind: 'error', message: nextMessage })
      onError?.(nextMessage)
    }
  }

  const recordTransaction = (next: ExecutionResult) => {
    setLatestActivity({ kind: 'transaction', result: next })
  }

  const requireWallet = () => {
    if (!address || !walletClient) throw new Error('请先连接钱包。')
    return { address, walletClient, addresses: parseDeployment(config) }
  }

  const requireTestnetWallet = () => {
    const wallet = requireWallet()
    if (chainId !== confluxESpaceTestnet.id) {
      throw new Error('链上交易需要先把钱包切换到 Conflux eSpace Testnet（chain ID 71）。')
    }
    return wallet
  }

  const requireOwner = () => parseAddress(ownerInput || address || '', 'owner')

  const writeAndWait = async (
    request: unknown,
    options: { preflight?: boolean } = {},
  ) => {
    const { walletClient: client } = requireTestnetWallet()
    let writeRequest = request
    if (options.preflight) {
      try {
        const simulation = await simulateContract(publicClient, request as never)
        const gas = await estimateContractGas(
          publicClient,
          simulation.request as never,
        )
        writeRequest = {
          ...simulation.request,
          gas: gas + gas / 5n + 1n,
        }
      } catch (error) {
        throw new Error(`Permit2 AllowanceTransfer 预检查失败：${errorMessage(error)}`)
      }
    }
    const hash = await client.writeContract(writeRequest as never)
    const receipt = await publicClient.waitForTransactionReceipt({ hash })
    if (receipt.status === 'reverted') {
      throw new Error(`交易已回滚：${hash}`)
    }
    return {
      hash: hash as Hex,
      receipt: {
        status: receipt.status,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed,
      } satisfies ReceiptSummary,
    }
  }

  const buildTypedData = async (flow: FlowId) => {
    const addresses = parseDeployment(config)
    const current = await loadSnapshot()
    const owner = requireOwner()
    const spender = addresses.permitTestSpender
    let typedData: BuiltTypedData

    if (flow === 'erc2612') {
      const value = parseTokenAmount(
        ercForm.signedAmount,
        current.tokens.permitToken.decimals,
        'ERC-2612 签名数量',
      )
      const signedSpender = ercForm.signedSpender.trim()
        ? parseAddress(ercForm.signedSpender, 'ERC-2612 签名 spender')
        : spender
      typedData = buildErc2612TypedData({
        tokenName: current.tokens.permitToken.name,
        version: current.permitTokenVersion,
        chainId: current.chainId,
        token: addresses.permitToken,
        owner,
        spender: signedSpender,
        value,
        nonce: current.permitNonce ?? 0n,
        deadline: relativeUint256(current.timestamp, ercForm.deadlineOffset, 'ERC-2612 deadline'),
      })
    } else if (flow === 'allowance') {
      const token = tokenAddress(addresses, allowanceForm.token)
      const tokenSnapshot = current.tokens[allowanceForm.token]
      const amount = parseTokenAmount(
        allowanceForm.signedAmount,
        tokenSnapshot.decimals,
        'Permit2 签名数量',
      )
      if (amount > MAX_UINT160) throw new Error('Permit2 AllowanceTransfer amount 超过 uint160。')
      const state = tokenSnapshot.permit2Allowance
      if (!state) throw new Error('无法读取 Permit2 allowance nonce。')
      const signedSpender = allowanceForm.signedSpender.trim()
        ? parseAddress(allowanceForm.signedSpender, 'Permit2 签名 spender')
        : spender
      const expiration = relativeUint256(
        current.timestamp,
        allowanceForm.expirationOffset,
        'Permit2 expiration',
        MAX_UINT48,
      )
      const sigDeadline = relativeUint256(
        current.timestamp,
        allowanceForm.sigDeadlineOffset,
        'Permit2 sigDeadline',
      )
      typedData = buildPermit2AllowanceTypedData({
        chainId: current.chainId,
        permit2: addresses.permit2,
        token,
        spender: signedSpender,
        amount,
        expiration,
        nonce: state.nonce,
        sigDeadline,
      })
    } else {
      const token = tokenAddress(addresses, signatureForm.token)
      const amount = parseTokenAmount(
        signatureForm.permittedAmount,
        current.tokens[signatureForm.token].decimals,
        'SignatureTransfer permitted amount',
      )
      const signedSpender = signatureForm.signedSpender.trim()
        ? parseAddress(signatureForm.signedSpender, 'SignatureTransfer 签名 spender')
        : spender
      const nonce = signatureForm.nonce.trim()
        ? parseUnsigned(signatureForm.nonce, 'SignatureTransfer nonce')
        : randomUint256()
      const deadline = relativeUint256(
        current.timestamp,
        signatureForm.deadlineOffset,
        'SignatureTransfer deadline',
      )
      typedData = buildPermit2SignatureTypedData({
        chainId: current.chainId,
        permit2: addresses.permit2,
        token,
        spender: signedSpender,
        amount,
        nonce,
        deadline,
      })
    }

    const artifact = {
      typedData,
      rpcPayload: stringifyRpcTypedData(typedData),
      signature: '',
    }
    setFlowArtifact(flow, artifact)
    return artifact
  }

  const signFlow = async (flow: FlowId) => {
    await runAction(async () => {
      const { address: connected, walletClient: client } = requireWallet()
      const owner = requireOwner()
      if (owner.toLowerCase() !== connected.toLowerCase()) {
        throw new Error('钱包签名时，owner 必须与当前连接钱包地址一致。')
      }
      const artifact = await buildTypedData(flow)
      const signature = await client.signTypedData({
        account: connected,
        ...artifact.typedData,
      } as never)
      setFlowArtifact(flow, { ...artifact, signature })
    })
  }

  const buildSigningTypedData = async (flow: SigningFlowId) => {
    const addresses = parseDeployment(config)
    const current = await loadSnapshot()
    const owner = requireOwner()
    const defaultSpender = addresses.permitTestSpender
    let typedData: BuiltTypedData
    let witnessTypeString: string | undefined

    if (flow === 'dai') {
      const verifyingContract = daiForm.verifyingContract.trim()
        ? parseAddress(daiForm.verifyingContract, 'Dai Permit verifyingContract')
        : addresses.daiToken
      const holder = daiForm.holder.trim()
        ? parseAddress(daiForm.holder, 'Dai Permit holder')
        : owner
      const signedSpender = daiForm.spender.trim()
        ? parseAddress(daiForm.spender, 'Dai Permit spender')
        : defaultSpender
      const nonce = daiForm.nonce.trim()
        ? parseUnsigned(daiForm.nonce, 'Dai Permit nonce')
        : current.daiNonce ?? 0n
      const expiry = relativeUint256(
        current.timestamp,
        daiForm.expiryOffset,
        'Dai Permit expiry',
      )
      typedData = buildDaiPermitTypedData({
        name: current.tokens.daiToken.name,
        chainId: current.chainId,
        verifyingContract,
        holder,
        spender: signedSpender,
        nonce,
        expiry,
        allowed: daiAllowedValue(daiForm.allowed),
      })
    } else if (flow === 'batchAllowance') {
      const signedSpender = batchAllowanceForm.signedSpender.trim()
        ? parseAddress(batchAllowanceForm.signedSpender, 'PermitBatch 签名 spender')
        : defaultSpender
      const [permitState, normalState] = await Promise.all([
        readContractValue<readonly [bigint, bigint, bigint]>({
          address: addresses.permit2,
          abi: permit2Abi,
          functionName: 'allowance',
          args: [owner, addresses.permitToken, signedSpender],
        }),
        readContractValue<readonly [bigint, bigint, bigint]>({
          address: addresses.permit2,
          abi: permit2Abi,
          functionName: 'allowance',
          args: [owner, addresses.normalToken, signedSpender],
        }),
      ])
      const expiration = relativeUint256(
        current.timestamp,
        batchAllowanceForm.expirationOffset,
        'PermitBatch expiration',
        MAX_UINT48,
      )
      const sigDeadline = relativeUint256(
        current.timestamp,
        batchAllowanceForm.sigDeadlineOffset,
        'PermitBatch sigDeadline',
      )
      typedData = buildPermit2BatchAllowanceTypedData({
        chainId: current.chainId,
        permit2: addresses.permit2,
        details: [
          {
            token: addresses.permitToken,
            amount: parseTokenAmount(
              batchAllowanceForm.signedAmountPtt,
              current.tokens.permitToken.decimals,
              'PermitBatch PTT 签名数量',
            ),
            expiration,
            nonce: permitState[2],
          },
          {
            token: addresses.normalToken,
            amount: parseTokenAmount(
              batchAllowanceForm.signedAmountNtt,
              current.tokens.normalToken.decimals,
              'PermitBatch NTT 签名数量',
            ),
            expiration,
            nonce: normalState[2],
          },
        ],
        spender: signedSpender,
        sigDeadline,
      })
    } else if (flow === 'batchSignature') {
      const signedSpender = batchSignatureForm.signedSpender.trim()
        ? parseAddress(
            batchSignatureForm.signedSpender,
            'PermitBatchTransferFrom 签名 spender',
          )
        : defaultSpender
      const nonce = batchSignatureForm.nonce.trim()
        ? parseUnsigned(batchSignatureForm.nonce, 'PermitBatchTransferFrom nonce')
        : randomUint256()
      typedData = buildPermit2BatchSignatureTypedData({
        chainId: current.chainId,
        permit2: addresses.permit2,
        permitted: [
          {
            token: addresses.permitToken,
            amount: parseTokenAmount(
              batchSignatureForm.permittedAmountPtt,
              current.tokens.permitToken.decimals,
              'PermitBatchTransferFrom PTT permitted 数量',
            ),
          },
          {
            token: addresses.normalToken,
            amount: parseTokenAmount(
              batchSignatureForm.permittedAmountNtt,
              current.tokens.normalToken.decimals,
              'PermitBatchTransferFrom NTT permitted 数量',
            ),
          },
        ],
        spender: signedSpender,
        nonce,
        deadline: relativeUint256(
          current.timestamp,
          batchSignatureForm.deadlineOffset,
          'PermitBatchTransferFrom deadline',
        ),
      })
    } else {
      const token = tokenAddress(addresses, witnessForm.token)
      const signedSpender = witnessForm.signedSpender.trim()
        ? parseAddress(witnessForm.signedSpender, 'PermitWitnessTransferFrom 签名 spender')
        : defaultSpender
      const nonce = witnessForm.nonce.trim()
        ? parseUnsigned(witnessForm.nonce, 'PermitWitnessTransferFrom nonce')
        : randomUint256()
      const witnessRecipient = witnessForm.witnessRecipient.trim()
        ? parseAddress(witnessForm.witnessRecipient, 'PermitWitness witness recipient')
        : owner
      typedData = buildPermit2WitnessTypedData({
        chainId: current.chainId,
        permit2: addresses.permit2,
        token,
        spender: signedSpender,
        amount: parseTokenAmount(
          witnessForm.permittedAmount,
          current.tokens[witnessForm.token].decimals,
          'PermitWitnessTransferFrom permitted 数量',
        ),
        nonce,
        deadline: relativeUint256(
          current.timestamp,
          witnessForm.deadlineOffset,
          'PermitWitnessTransferFrom deadline',
        ),
        witness: {
          recipient: witnessRecipient,
          purpose: witnessForm.witnessPurpose,
        },
      })
      witnessTypeString = PERMIT2_WITNESS_TYPE_STRING
    }

    const artifact: FlowArtifact = {
      typedData,
      rpcPayload: stringifyRpcTypedData(typedData),
      signature: '',
      ...(witnessTypeString ? { witnessTypeString } : {}),
    }
    setSigningArtifact(flow, artifact)
    return artifact
  }

  const signSigningFlow = async (flow: SigningFlowId) => {
    await runAction(async () => {
      const { address: connected, walletClient: client } = requireWallet()
      const owner = requireOwner()
      if (owner.toLowerCase() !== connected.toLowerCase()) {
        throw new Error('钱包签名时，owner 必须与当前连接钱包地址一致。')
      }
      const artifact = await buildSigningTypedData(flow)
      const signature =
        flow === 'dai'
          ? await client.request({
              method: 'eth_signTypedData_v4',
              params: [connected, artifact.rpcPayload],
            } as never)
          : await client.signTypedData({
              account: connected,
              ...artifact.typedData,
            } as never)
      setSigningArtifact(flow, { ...artifact, signature: String(signature) })
    })
  }

  const signRawTypedData = async () => {
    setRawTypedDataSignature('')
    setRawTypedDataError('')
    await runAction(
      async () => {
        const { address: connected, walletClient: client } = requireWallet()
        const raw = rawTypedDataInput.trim()
        if (!raw) throw new Error('请先输入 Typed Data JSON。')
        const signature = await client.request({
          method: 'eth_signTypedData_v4',
          params: [connected, raw],
        } as never)
        setRawTypedDataSignature(String(signature))
      },
      setRawTypedDataError,
    )
  }

  const loadRawTypedData = (payload: string | undefined) => {
    if (!payload) {
      setRawTypedDataError('请先构造一个 Typed Data。')
      return
    }
    setRawTypedDataInput(payload)
    setRawTypedDataSignature('')
    setRawTypedDataError('')
  }

  const executeSigningFlow = async (flow: SigningFlowId) => {
    await runAction(async () => {
      const { addresses } = requireTestnetWallet()
      const owner = requireOwner()
      const artifact = signingArtifacts[flow]
      if (!artifact) throw new Error('请先构造或签名 Typed Data。')
      if (!artifact.signature.trim()) throw new Error('请先签名或粘贴 signature。')

      const message = artifact.typedData.message
      const signatureNonce =
        flow === 'batchSignature' || flow === 'witness'
          ? (message.nonce as bigint)
          : undefined
      const current = await loadSnapshot(signatureNonce)
      if (
        flow !== 'dai' &&
        current.spenderPermit2.toLowerCase() !== addresses.permit2.toLowerCase()
      ) {
        throw new Error('PermitTestSpender.permit2() 与页面 Permit2 地址不一致。')
      }

      let transaction: Awaited<ReturnType<typeof writeAndWait>>
      if (flow === 'dai') {
        const { v, r, s } = splitSignature(artifact.signature)
        const holder = message.holder as Address
        const expiry = message.expiry as bigint
        const amount = parseTokenAmount(
          daiForm.transferAmount,
          current.tokens.daiToken.decimals,
          'Dai Permit 执行数量',
        )
        transaction = await writeAndWait({
          account: address,
          chain: confluxESpaceTestnet,
          address: addresses.permitTestSpender,
          abi: spenderAbi,
          functionName: 'daiPermitAndTransfer',
          args: [
            addresses.daiToken,
            holder,
            message.nonce as bigint,
            expiry,
            daiForm.executeAllowed === 'true',
            v,
            r,
            s,
            amount,
          ],
        })
      } else if (flow === 'batchAllowance') {
        const details = message.details as readonly Record<string, unknown>[]
        if (details.length !== 2) {
          throw new Error('PermitBatch 必须包含 PTT 和 NTT 两个详情。')
        }
        const amounts = [
          parseTokenAmount(
            batchAllowanceForm.transferAmountPtt,
            current.tokens.permitToken.decimals,
            'PermitBatch PTT 执行数量',
          ),
          parseTokenAmount(
            batchAllowanceForm.transferAmountNtt,
            current.tokens.normalToken.decimals,
            'PermitBatch NTT 执行数量',
          ),
        ]
        if (amounts.some((amount) => amount > MAX_UINT160)) {
          throw new Error('PermitBatch 执行数量超过 uint160。')
        }
        const permitBatch = {
          details: details.map((detail) => ({
            token: detail.token as Address,
            amount: detail.amount as bigint,
            expiration: detail.expiration as bigint,
            nonce: detail.nonce as bigint,
          })),
          spender: message.spender as Address,
          sigDeadline: message.sigDeadline as bigint,
        }
        transaction = await writeAndWait({
          account: address,
          chain: confluxESpaceTestnet,
          address: addresses.permitTestSpender,
          abi: spenderAbi,
          functionName: 'permit2BatchAllowanceTransfer',
          args: [owner, permitBatch, artifact.signature as Hex, amounts],
        })
      } else if (flow === 'batchSignature') {
        const permitted = message.permitted as readonly Record<string, unknown>[]
        if (permitted.length !== 2) {
          throw new Error('PermitBatchTransferFrom 必须包含 PTT 和 NTT 两个 TokenPermissions。')
        }
        const requestedAmounts = [
          parseTokenAmount(
            batchSignatureForm.requestedAmountPtt,
            current.tokens.permitToken.decimals,
            'PermitBatchTransferFrom PTT 执行数量',
          ),
          parseTokenAmount(
            batchSignatureForm.requestedAmountNtt,
            current.tokens.normalToken.decimals,
            'PermitBatchTransferFrom NTT 执行数量',
          ),
        ]
        const permit = {
          permitted: permitted.map((permission) => ({
            token: permission.token as Address,
            amount: permission.amount as bigint,
          })),
          nonce: message.nonce as bigint,
          deadline: message.deadline as bigint,
        }
        transaction = await writeAndWait({
          account: address,
          chain: confluxESpaceTestnet,
          address: addresses.permitTestSpender,
          abi: spenderAbi,
          functionName: 'permit2BatchSignatureTransfer',
          args: [owner, permit, artifact.signature as Hex, requestedAmounts],
        })
      } else {
        const permitted = message.permitted as Record<string, unknown>
        const token = permitted.token as Address
        const tokenId =
          token.toLowerCase() === addresses.normalToken.toLowerCase()
            ? 'normalToken'
            : 'permitToken'
        const requestedAmount = parseTokenAmount(
          witnessForm.requestedAmount,
          current.tokens[tokenId].decimals,
          'PermitWitnessTransferFrom 执行数量',
        )
        const permit = {
          permitted: {
            token,
            amount: permitted.amount as bigint,
          },
          nonce: message.nonce as bigint,
          deadline: message.deadline as bigint,
        }
        const witness = message.witness as {
          recipient: Address
          purpose: string
        }
        transaction = await writeAndWait({
          account: address,
          chain: confluxESpaceTestnet,
          address: addresses.permitTestSpender,
          abi: spenderAbi,
          functionName: 'permit2WitnessTransfer',
          args: [
            owner,
            permit,
            artifact.signature as Hex,
            requestedAmount,
            hashPermit2Witness(witness),
            artifact.witnessTypeString ?? PERMIT2_WITNESS_TYPE_STRING,
          ],
        })
      }

      const after = await loadSnapshot(signatureNonce)
      recordTransaction({
        flow,
        hash: transaction.hash,
        receipt: transaction.receipt,
        before: current,
        after,
      })
    })
  }

  const executeFlow = async (flow: FlowId) => {
    await runAction(async () => {
      const { addresses } = requireTestnetWallet()
      const owner = requireOwner()
      const artifact = artifacts[flow]
      if (!artifact) throw new Error('请先构造或签名 Typed Data。')
      if (!artifact.signature.trim()) throw new Error('请先签名或粘贴 signature。')
      const signatureNonce =
        flow === 'signature'
          ? (artifact.typedData.message.nonce as bigint)
          : undefined
      const current = await loadSnapshot(signatureNonce)
      if (
        flow !== 'erc2612' &&
        current.spenderPermit2.toLowerCase() !== addresses.permit2.toLowerCase()
      ) {
        throw new Error('PermitTestSpender.permit2() 与页面 Permit2 地址不一致。')
      }

      let transaction: Awaited<ReturnType<typeof writeAndWait>>
      const message = artifact.typedData.message
      if (flow === 'erc2612') {
        const { v, r, s } = splitSignature(artifact.signature)
        const deadline = message.deadline as bigint
        const amount = parseTokenAmount(
          ercForm.executeAmount,
          current.tokens.permitToken.decimals,
          'ERC-2612 执行数量',
        )
        transaction = await writeAndWait({
          account: address,
          chain: confluxESpaceTestnet,
          address: addresses.permitTestSpender,
          abi: spenderAbi,
          functionName: 'permitAndTransfer',
          args: [addresses.permitToken, owner, amount, deadline, v, r, s],
        })
      } else if (flow === 'allowance') {
        const details = message.details as Record<string, unknown>
        const token = parseAddress(String(details.token ?? ''), 'Permit2 签名 Token')
        const tokenId =
          token.toLowerCase() === addresses.permitToken.toLowerCase()
            ? 'permitToken'
            : token.toLowerCase() === addresses.normalToken.toLowerCase()
              ? 'normalToken'
              : undefined
        if (!tokenId) {
          throw new Error('签名数据中的 Token 与当前 PTT/NTT 配置不一致，请重新构造并签名。')
        }
        const tokenSnapshot = current.tokens[tokenId]
        const transferAmount = parseTokenAmount(
          allowanceForm.transferAmount,
          tokenSnapshot.decimals,
          'Permit2 执行数量',
        )
        if (transferAmount > MAX_UINT160) throw new Error('Permit2 执行数量超过 uint160。')
        const signedAmount = details.amount as bigint
        const expiration = details.expiration as bigint
        const nonce = details.nonce as bigint
        const signedSpender = parseAddress(
          String(message.spender ?? ''),
          'Permit2 签名 spender',
        )
        const signedChainId = Number(artifact.typedData.domain.chainId)
        const signedPermit2 = parseAddress(
          String(artifact.typedData.domain.verifyingContract ?? ''),
          'Permit2 签名 verifyingContract',
        )
        if (signedChainId !== confluxESpaceTestnet.id) {
          throw new Error(
            `签名使用的 chain ID 为 ${signedChainId}，当前 Permit2 测试网为 ${confluxESpaceTestnet.id}，请重新构造并签名。`,
          )
        }
        if (signedPermit2.toLowerCase() !== addresses.permit2.toLowerCase()) {
          throw new Error('签名使用的 Permit2 地址与当前配置不一致，请重新构造并签名。')
        }
        if (signedSpender.toLowerCase() !== addresses.permitTestSpender.toLowerCase()) {
          throw new Error(
            '签名 spender 与当前 PermitTestSpender 地址不一致；该部署会拒绝 WrongSpender，请修改配置后重新签名。',
          )
        }
        if (signedAmount < transferAmount) {
          throw new Error(
            `执行数量 ${formatToken(transferAmount, tokenSnapshot.decimals)} 超过签名数量 ${formatToken(signedAmount, tokenSnapshot.decimals)}。`,
          )
        }
        if (expiration < current.timestamp) {
          throw new Error('Permit2 expiration 已过期，请重新构造并签名。')
        }
        const sigDeadline = message.sigDeadline as bigint
        if (sigDeadline < current.timestamp) {
          throw new Error('Permit2 sigDeadline 已过期，请重新构造并签名。')
        }
        const permit2State = tokenSnapshot.permit2Allowance
        if (!permit2State) throw new Error('无法读取当前 Permit2 allowance 状态。')
        if (permit2State.nonce !== nonce) {
          throw new Error(
            `签名 nonce 为 ${nonce.toString()}，链上当前 nonce 为 ${permit2State.nonce.toString()}；该签名已过期或已被使用，请重新签名。`,
          )
        }
        if (
          tokenSnapshot.tokenAllowance === undefined ||
          tokenSnapshot.tokenAllowance < transferAmount
        ) {
          throw new Error(
            `${tokenSnapshot.symbol} 尚未给 Permit2 足够的 Token allowance；当前为 ${formatToken(tokenSnapshot.tokenAllowance, tokenSnapshot.decimals)}，请先在左侧选择 ${tokenSnapshot.symbol} 并点击 approve Permit2。`,
          )
        }
        if (
          tokenSnapshot.balance === undefined ||
          tokenSnapshot.balance < transferAmount
        ) {
          throw new Error(
            `${tokenSnapshot.symbol} 余额不足：当前 ${formatToken(tokenSnapshot.balance, tokenSnapshot.decimals)}，执行需要 ${formatToken(transferAmount, tokenSnapshot.decimals)}。`,
          )
        }
        const permitSingle = {
          details: {
            token,
            amount: signedAmount,
            expiration,
            nonce,
          },
          spender: signedSpender,
          sigDeadline,
        }
        transaction = await writeAndWait({
          account: address,
          chain: confluxESpaceTestnet,
          address: addresses.permitTestSpender,
          abi: spenderAbi,
          functionName: 'permit2AllowanceTransfer',
          args: [owner, permitSingle, artifact.signature as Hex, transferAmount],
        }, { preflight: true })
      } else {
        const permitted = message.permitted as Record<string, unknown>
        const requestedAmount = parseTokenAmount(
          signatureForm.requestedAmount,
          current.tokens[signatureForm.token].decimals,
          'SignatureTransfer 执行数量',
        )
        const permit = {
          permitted: {
            token: permitted.token as Address,
            amount: permitted.amount as bigint,
          },
          nonce: message.nonce as bigint,
          deadline: message.deadline as bigint,
        }
        transaction = await writeAndWait({
          account: address,
          chain: confluxESpaceTestnet,
          address: addresses.permitTestSpender,
          abi: spenderAbi,
          functionName: 'permit2SignatureTransfer',
          args: [owner, permit, artifact.signature as Hex, requestedAmount],
        })
      }

      const after = await loadSnapshot(signatureNonce)
      recordTransaction({
        flow,
        hash: transaction.hash,
        receipt: transaction.receipt,
        before: current,
        after,
      })
    })
  }

  const mint = async (token: TokenId) => {
    await runAction(async () => {
      const { addresses } = requireTestnetWallet()
      const owner = requireOwner()
      const before = await loadSnapshot()
      const amount = parseTokenAmount(mintAmount, before.tokens[token].decimals, 'mint 数量')
      const transaction = await writeAndWait({
        account: address,
        chain: confluxESpaceTestnet,
        address: tokenAddress(addresses, token),
        abi: tokenAbi,
        functionName: 'mint',
        args: [owner, amount],
      })
      const after = await loadSnapshot()
      recordTransaction({ flow: 'mint', hash: transaction.hash, receipt: transaction.receipt, before, after })
    })
  }

  const approvePermit2 = async () => {
    await runAction(async () => {
      const { addresses } = requireTestnetWallet()
      const before = await loadSnapshot()
      const transaction = await writeAndWait({
        account: address,
        chain: confluxESpaceTestnet,
        address: tokenAddress(addresses, approveToken),
        abi: tokenAbi,
        functionName: 'approve',
        args: [addresses.permit2, maxUint256],
      })
      const after = await loadSnapshot()
      recordTransaction({ flow: 'approve', hash: transaction.hash, receipt: transaction.receipt, before, after })
    })
  }

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(label)
      window.setTimeout(() => setCopied(''), 1600)
    } catch (error) {
      setLatestActivity({
        kind: 'error',
        message: errorMessage(error, '复制失败，请手动选择文本。'),
      })
    }
  }

  const buildWorkflowTypedData = async (flow: WorkflowFlowId) => {
    if (isSigningFlow(flow)) {
      await buildSigningTypedData(flow)
    } else {
      await buildTypedData(flow)
    }
  }

  const signWorkflow = async (flow: WorkflowFlowId) => {
    if (isSigningFlow(flow)) {
      await signSigningFlow(flow)
    } else {
      await signFlow(flow)
    }
  }

  const executeWorkflow = async (flow: WorkflowFlowId) => {
    if (isSigningFlow(flow)) {
      await executeSigningFlow(flow)
    } else {
      await executeFlow(flow)
    }
  }

  const currentArtifact = isSigningFlow(activeFlow)
    ? signingArtifacts[activeFlow]
    : artifacts[activeFlow]
  const artifactReady = Boolean(currentArtifact?.signature.trim())
  const spenderMatches =
    snapshot?.spenderPermit2?.toLowerCase() === config.permit2.toLowerCase()
  const canUseWallet = Boolean(address && walletClient)
  const canUseTestnetWallet = Boolean(canUseWallet && chainId === 71)

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <a className="home-link" href={homeHref} target="_top">
            返回首页
          </a>
          <div>
            <h1>Permit / Permit2 Demo</h1>
            <p>观察 ERC-2612、Dai-style Permit、Permit2 AllowanceTransfer 和 SignatureTransfer 的钱包签名与资产转移，并展示 Permit2 扩展签名结构。</p>
          </div>
        </div>
        <div className="topbar-right">
          <span className="network-badge">Conflux eSpace Testnet · 71</span>
          <WalletControl />
        </div>
      </header>

      <main className="layout">
        <aside className="sidebar">
          <section className="panel">
            <PanelHeading
              title="部署与账户"
              description="地址仅保存在当前页面状态，刷新后恢复默认部署。"
              tourTarget="deployment"
              action={
                <button
                  className="button secondary"
                  onClick={() => setConfig({ ...DEFAULT_DEPLOYMENT })}
                  type="button"
                >
                  恢复默认
                </button>
              }
            />
            <div className="stack">
              {(Object.keys(DEFAULT_DEPLOYMENT) as Array<keyof DeploymentConfig>).map((key) => (
                <label className="field" key={key}>
                  <span>{key === 'permitToken' ? 'PermitToken' : key === 'normalToken' ? 'NormalToken' : key === 'permit2' ? 'Permit2' : key === 'permitTestSpender' ? 'PermitTestSpender' : 'DaiToken'}</span>
                  <input
                    onChange={(event) => setConfig((current) => ({ ...current, [key]: event.target.value }))}
                    spellCheck={false}
                    value={config[key]}
                  />
                </label>
              ))}
              <label className="field">
                <span>owner（默认当前连接钱包）</span>
                <input
                  onChange={(event) => setOwnerInput(event.target.value)}
                  placeholder="0x..."
                  spellCheck={false}
                  value={ownerInput}
                />
              </label>
              {configError && <div className="alert">{configError}</div>}
              {snapshot && (
                <div className={`binding-status ${spenderMatches ? 'binding-ok' : 'binding-error'}`}>
                  <span>Spender 绑定 Permit2</span>
                  <code>{snapshot.spenderPermit2}</code>
                  <strong>{spenderMatches ? '匹配' : '不匹配，Permit2 操作已禁用'}</strong>
                </div>
              )}
              <button
                className="button secondary"
                disabled={status === 'loading' || Boolean(configError)}
                onClick={() => runAction(async () => { await loadSnapshot() })}
                type="button"
              >
                刷新链上状态
              </button>
            </div>
          </section>

          <section className="panel">
            <PanelHeading title="测试资产" description="三个 Token 都是无权限 mint 的测试合约。" tourTarget="assets" />
            <div className="stack">
              <label className="field">
                <span>mint 数量</span>
                <input
                  onChange={(event) => setMintAmount(event.target.value)}
                  value={mintAmount}
                />
              </label>
              <div className="button-row">
                <button className="button" disabled={!canUseTestnetWallet || status === 'loading'} onClick={() => mint('permitToken')} type="button">
                  Mint PTT
                </button>
                <button className="button" disabled={!canUseTestnetWallet || status === 'loading'} onClick={() => mint('normalToken')} type="button">
                  Mint NTT
                </button>
                <button className="button" disabled={!canUseTestnetWallet || status === 'loading'} onClick={() => mint('daiToken')} type="button">
                  Mint DAI
                </button>
              </div>
              <label className="field">
                <span>Token → Permit2 approve</span>
                <select onChange={(event) => setApproveToken(event.target.value as TokenId)} value={approveToken}>
                  <option value="permitToken">PTT</option>
                  <option value="normalToken">NTT</option>
                </select>
              </label>
              <button className="button secondary" disabled={!canUseTestnetWallet || status === 'loading'} onClick={approvePermit2} type="button">
                approve Permit2（MaxUint256）
              </button>
              <p className="muted">Permit2 流程不会自动发送 approve；需要先显式点击上面的按钮。</p>
            </div>
          </section>

          <section className="panel">
            <PanelHeading title="链上状态" description="读取当前 owner 和测试 spender 的余额、授权。" tourTarget="chain-state" />
            <div className="stack">
              <TokenSnapshotCard token="permitToken" snapshot={snapshot} />
              <TokenSnapshotCard token="normalToken" snapshot={snapshot} />
              <TokenSnapshotCard token="daiToken" snapshot={snapshot} />
              <div className="kv">
                <span>DaiToken DOMAIN_SEPARATOR</span>
                <code className="break-code">{snapshot?.daiDomainSeparator ?? '-'}</code>
              </div>
              <div className="kv">
                <span>Permit2 DOMAIN_SEPARATOR</span>
                <code className="break-code">{snapshot?.permit2DomainSeparator ?? '-'}</code>
              </div>
              <div className="kv">
                <span>ERC-2612 nonce</span>
                <code>{stringifyValue(snapshot?.permitNonce)}</code>
              </div>
              <div className="kv">
                <span>DaiToken nonce</span>
                <code>{stringifyValue(snapshot?.daiNonce)}</code>
              </div>
            </div>
          </section>

        </aside>

        <section className="main-column">
          <LatestResultPanel activity={latestActivity} copied={copied} status={status} />

          <section className="workbench">
            <div className="toolbar" data-tour-target="workflow">
              <div>
                <h2>签名工作流</h2>
                <p>先构造并检查 Typed Data，再签名，最后交给测试 spender 执行；支持 ERC-2612、Dai-style Permit 与页面展示的五种 Permit2 结构。</p>
              </div>
              {!canUseWallet && <span className="pill pill-error">请连接钱包</span>}
              {canUseWallet && chainId !== 71 && <span className="pill pill-loading">当前链 ID {chainId}：签名请求可用，交易需切换到 chain 71</span>}
            </div>

            <div className="tabs" role="tablist">
              {(Object.keys(WORKFLOW_FLOW_LABELS) as WorkflowFlowId[]).map((flow) => (
                <button
                  aria-selected={activeFlow === flow}
                  className={`tab ${activeFlow === flow ? 'tab-active' : ''}`}
                  onClick={() => setActiveFlow(flow)}
                  role="tab"
                  key={flow}
                  type="button"
                >
                  {WORKFLOW_FLOW_LABELS[flow]}
                </button>
              ))}
            </div>

            <div className="flow-description">
              {activeFlow === 'erc2612' && <p><strong>ERC-2612：</strong>钱包签名由 Token 合约验证，PermitTestSpender 随后调用 Token.transferFrom；NormalToken 不支持此流程。</p>}
              {activeFlow === 'dai' && <p><strong>Dai-style Permit：</strong>使用 DaiToken 的 legacy domain（只有 <code>name / chainId / verifyingContract</code>）和 <code>holder / spender / nonce / expiry / allowed</code> 结构生成签名；页面通过原始 <code>eth_signTypedData_v4</code> 请求签名，随后可调用最新 spender 的 <code>daiPermitAndTransfer</code>。签名 allowed 与执行 allowed 分开，便于测试布尔值/字符串值和 calldata 不一致。</p>}
              {activeFlow === 'allowance' && <p><strong>AllowanceTransfer：</strong>先在 Token 层 approve Permit2，再用 PermitSingle 签名设置 spender allowance 并转账。</p>}
              {activeFlow === 'signature' && <p><strong>SignatureTransfer：</strong>先在 Token 层 approve Permit2，签名只允许一次转移，Permit2 使用 unordered nonce bitmap 防 replay。</p>}
              {activeFlow === 'batchAllowance' && <p><strong>PermitBatch：</strong>一次签名包含 PTT 和 NTT 两个 AllowanceTransfer 详情；每个详情使用 Permit2 的 uint160 amount、uint48 expiration 和 uint48 nonce。</p>}
              {activeFlow === 'batchSignature' && <p><strong>PermitBatchTransferFrom：</strong>一次签名包含两个 TokenPermissions。签名哈希包含 spender，但链上 PermitTransferFrom tuple 不包含 spender。</p>}
              {activeFlow === 'witness' && <p><strong>PermitWitnessTransferFrom：</strong>在 PermitTransferFrom 基础上签入自定义 witness；执行时会计算 witness struct hash 并传入 witnessTypeString。</p>}
            </div>

            {activeFlow === 'erc2612' && (
              <div className="form-grid">
                <div className="field wide-field"><span>Token</span><div className="read-only-value"><code>{config.permitToken}</code><span>PTT · ERC-2612</span></div></div>
                <label className="field"><span>签名 amount</span><input onChange={(event) => setErcForm((current) => ({ ...current, signedAmount: event.target.value }))} value={ercForm.signedAmount} /></label>
                <label className="field"><span>执行 amount（可故意改错）</span><input onChange={(event) => setErcForm((current) => ({ ...current, executeAmount: event.target.value }))} value={ercForm.executeAmount} /></label>
                <label className="field"><span>deadline 相对秒数</span><input onChange={(event) => setErcForm((current) => ({ ...current, deadlineOffset: event.target.value }))} value={ercForm.deadlineOffset} /></label>
                <label className="field"><span>签名 spender（空值=测试 spender）</span><input onChange={(event) => setErcForm((current) => ({ ...current, signedSpender: event.target.value }))} placeholder={config.permitTestSpender} value={ercForm.signedSpender} /></label>
              </div>
            )}

            {activeFlow === 'dai' && (
              <div className="form-grid">
                <label className="field wide-field"><span>verifyingContract（空值=DaiToken）</span><input onChange={(event) => setDaiForm((current) => ({ ...current, verifyingContract: event.target.value }))} placeholder={config.daiToken} spellCheck={false} value={daiForm.verifyingContract} /></label>
                <label className="field"><span>holder（空值=当前 owner）</span><input onChange={(event) => setDaiForm((current) => ({ ...current, holder: event.target.value }))} placeholder={ownerInput || address || '0x...'} spellCheck={false} value={daiForm.holder} /></label>
                <label className="field"><span>spender（空值=测试 spender）</span><input onChange={(event) => setDaiForm((current) => ({ ...current, spender: event.target.value }))} placeholder={config.permitTestSpender} spellCheck={false} value={daiForm.spender} /></label>
                <label className="field"><span>nonce（空值=读取 DaiToken 实时 nonce）</span><input onChange={(event) => setDaiForm((current) => ({ ...current, nonce: event.target.value }))} value={daiForm.nonce} /></label>
                <label className="field"><span>expiry 相对秒数</span><input onChange={(event) => setDaiForm((current) => ({ ...current, expiryOffset: event.target.value }))} value={daiForm.expiryOffset} /></label>
                <label className="field wide-field"><span>allowed（声明类型为 bool，可测试运行时类型差异）</span><select onChange={(event) => setDaiForm((current) => ({ ...current, allowed: event.target.value as DaiAllowedOption }))} value={daiForm.allowed}><option value="boolean-true">布尔值 true</option><option value="boolean-false">布尔值 false</option><option value="string-true">字符串 "true"</option><option value="string-false">字符串 "false"</option></select></label>
                <label className="field"><span>执行 allowed（Solidity bool）</span><select onChange={(event) => setDaiForm((current) => ({ ...current, executeAllowed: event.target.value as 'true' | 'false' }))} value={daiForm.executeAllowed}><option value="true">true（最大额度）</option><option value="false">false（撤销额度）</option></select></label>
                <label className="field"><span>执行 amount</span><input onChange={(event) => setDaiForm((current) => ({ ...current, transferAmount: event.target.value }))} value={daiForm.transferAmount} /></label>
              </div>
            )}

            {activeFlow === 'allowance' && (
              <div className="form-grid">
                <label className="field"><span>Token</span><select onChange={(event) => setAllowanceForm((current) => ({ ...current, token: event.target.value as TokenId }))} value={allowanceForm.token}><option value="normalToken">NormalToken · NTT</option><option value="permitToken">PermitToken · PTT</option></select></label>
                <label className="field"><span>签名 amount（uint160）</span><input onChange={(event) => setAllowanceForm((current) => ({ ...current, signedAmount: event.target.value }))} value={allowanceForm.signedAmount} /></label>
                <label className="field"><span>执行 amount（可故意改错）</span><input onChange={(event) => setAllowanceForm((current) => ({ ...current, transferAmount: event.target.value }))} value={allowanceForm.transferAmount} /></label>
                <label className="field"><span>expiration 相对秒数</span><input onChange={(event) => setAllowanceForm((current) => ({ ...current, expirationOffset: event.target.value }))} value={allowanceForm.expirationOffset} /></label>
                <label className="field"><span>sigDeadline 相对秒数</span><input onChange={(event) => setAllowanceForm((current) => ({ ...current, sigDeadlineOffset: event.target.value }))} value={allowanceForm.sigDeadlineOffset} /></label>
                <label className="field"><span>签名 spender（空值=测试 spender）</span><input onChange={(event) => setAllowanceForm((current) => ({ ...current, signedSpender: event.target.value }))} placeholder={config.permitTestSpender} value={allowanceForm.signedSpender} /></label>
              </div>
            )}

            {activeFlow === 'signature' && (
              <div className="form-grid">
                <label className="field"><span>Token</span><select onChange={(event) => setSignatureForm((current) => ({ ...current, token: event.target.value as TokenId }))} value={signatureForm.token}><option value="normalToken">NormalToken · NTT</option><option value="permitToken">PermitToken · PTT</option></select></label>
                <label className="field"><span>permitted amount</span><input onChange={(event) => setSignatureForm((current) => ({ ...current, permittedAmount: event.target.value }))} value={signatureForm.permittedAmount} /></label>
                <label className="field"><span>requested amount（可故意超过）</span><input onChange={(event) => setSignatureForm((current) => ({ ...current, requestedAmount: event.target.value }))} value={signatureForm.requestedAmount} /></label>
                <label className="field"><span>deadline 相对秒数</span><input onChange={(event) => setSignatureForm((current) => ({ ...current, deadlineOffset: event.target.value }))} value={signatureForm.deadlineOffset} /></label>
                <label className="field"><span>unordered nonce（空值=随机 256-bit）</span><input onChange={(event) => setSignatureForm((current) => ({ ...current, nonce: event.target.value }))} placeholder="十进制整数" value={signatureForm.nonce} /></label>
                <label className="field"><span>签名 spender（空值=测试 spender）</span><input onChange={(event) => setSignatureForm((current) => ({ ...current, signedSpender: event.target.value }))} placeholder={config.permitTestSpender} value={signatureForm.signedSpender} /></label>
              </div>
            )}

            {activeFlow === 'batchAllowance' && (
              <div className="form-grid">
                <label className="field"><span>PTT signed amount（uint160）</span><input onChange={(event) => setBatchAllowanceForm((current) => ({ ...current, signedAmountPtt: event.target.value }))} value={batchAllowanceForm.signedAmountPtt} /></label>
                <label className="field"><span>NTT signed amount（uint160）</span><input onChange={(event) => setBatchAllowanceForm((current) => ({ ...current, signedAmountNtt: event.target.value }))} value={batchAllowanceForm.signedAmountNtt} /></label>
                <label className="field"><span>PTT 执行 amount（uint160，可故意超过）</span><input onChange={(event) => setBatchAllowanceForm((current) => ({ ...current, transferAmountPtt: event.target.value }))} value={batchAllowanceForm.transferAmountPtt} /></label>
                <label className="field"><span>NTT 执行 amount（uint160，可故意超过）</span><input onChange={(event) => setBatchAllowanceForm((current) => ({ ...current, transferAmountNtt: event.target.value }))} value={batchAllowanceForm.transferAmountNtt} /></label>
                <label className="field"><span>expiration 相对秒数</span><input onChange={(event) => setBatchAllowanceForm((current) => ({ ...current, expirationOffset: event.target.value }))} value={batchAllowanceForm.expirationOffset} /></label>
                <label className="field"><span>sigDeadline 相对秒数</span><input onChange={(event) => setBatchAllowanceForm((current) => ({ ...current, sigDeadlineOffset: event.target.value }))} value={batchAllowanceForm.sigDeadlineOffset} /></label>
                <label className="field wide-field"><span>签名 spender（空值=测试 spender）</span><input onChange={(event) => setBatchAllowanceForm((current) => ({ ...current, signedSpender: event.target.value }))} placeholder={config.permitTestSpender} value={batchAllowanceForm.signedSpender} /></label>
              </div>
            )}

            {activeFlow === 'batchSignature' && (
              <div className="form-grid">
                <label className="field"><span>PTT permitted amount</span><input onChange={(event) => setBatchSignatureForm((current) => ({ ...current, permittedAmountPtt: event.target.value }))} value={batchSignatureForm.permittedAmountPtt} /></label>
                <label className="field"><span>NTT permitted amount</span><input onChange={(event) => setBatchSignatureForm((current) => ({ ...current, permittedAmountNtt: event.target.value }))} value={batchSignatureForm.permittedAmountNtt} /></label>
                <label className="field"><span>PTT requested amount（可故意超过）</span><input onChange={(event) => setBatchSignatureForm((current) => ({ ...current, requestedAmountPtt: event.target.value }))} value={batchSignatureForm.requestedAmountPtt} /></label>
                <label className="field"><span>NTT requested amount（可故意超过）</span><input onChange={(event) => setBatchSignatureForm((current) => ({ ...current, requestedAmountNtt: event.target.value }))} value={batchSignatureForm.requestedAmountNtt} /></label>
                <label className="field"><span>deadline 相对秒数</span><input onChange={(event) => setBatchSignatureForm((current) => ({ ...current, deadlineOffset: event.target.value }))} value={batchSignatureForm.deadlineOffset} /></label>
                <label className="field"><span>unordered nonce（空值=随机 256-bit）</span><input onChange={(event) => setBatchSignatureForm((current) => ({ ...current, nonce: event.target.value }))} placeholder="十进制整数" value={batchSignatureForm.nonce} /></label>
                <label className="field wide-field"><span>签名 spender（空值=测试 spender）</span><input onChange={(event) => setBatchSignatureForm((current) => ({ ...current, signedSpender: event.target.value }))} placeholder={config.permitTestSpender} value={batchSignatureForm.signedSpender} /></label>
              </div>
            )}

            {activeFlow === 'witness' && (
              <div className="form-grid">
                <label className="field"><span>Token</span><select onChange={(event) => setWitnessForm((current) => ({ ...current, token: event.target.value as TokenId }))} value={witnessForm.token}><option value="permitToken">PermitToken · PTT</option><option value="normalToken">NormalToken · NTT</option></select></label>
                <label className="field"><span>permitted amount</span><input onChange={(event) => setWitnessForm((current) => ({ ...current, permittedAmount: event.target.value }))} value={witnessForm.permittedAmount} /></label>
                <label className="field"><span>requested amount（可故意超过）</span><input onChange={(event) => setWitnessForm((current) => ({ ...current, requestedAmount: event.target.value }))} value={witnessForm.requestedAmount} /></label>
                <label className="field"><span>deadline 相对秒数</span><input onChange={(event) => setWitnessForm((current) => ({ ...current, deadlineOffset: event.target.value }))} value={witnessForm.deadlineOffset} /></label>
                <label className="field"><span>unordered nonce（空值=随机 256-bit）</span><input onChange={(event) => setWitnessForm((current) => ({ ...current, nonce: event.target.value }))} placeholder="十进制整数" value={witnessForm.nonce} /></label>
                <label className="field"><span>签名 spender（空值=测试 spender）</span><input onChange={(event) => setWitnessForm((current) => ({ ...current, signedSpender: event.target.value }))} placeholder={config.permitTestSpender} value={witnessForm.signedSpender} /></label>
                <label className="field"><span>witness recipient（空值=owner）</span><input onChange={(event) => setWitnessForm((current) => ({ ...current, witnessRecipient: event.target.value }))} placeholder={ownerInput || address || '0x...'} value={witnessForm.witnessRecipient} /></label>
                <label className="field wide-field"><span>witness purpose</span><input onChange={(event) => setWitnessForm((current) => ({ ...current, witnessPurpose: event.target.value }))} value={witnessForm.witnessPurpose} /></label>
              </div>
            )}

            <div className="action-row">
              <button className="button secondary" disabled={status === 'loading' || Boolean(configError)} onClick={() => runAction(async () => { await buildWorkflowTypedData(activeFlow) })} type="button">构造 Typed Data</button>
              <button className="button" data-tour-target="wallet-signature" disabled={!canUseWallet || status === 'loading' || Boolean(configError)} onClick={() => signWorkflow(activeFlow)} type="button">{activeFlow === 'dai' ? '钱包签名（原始 RPC）' : '钱包签名'}</button>
              <button className="button accent" disabled={!canUseTestnetWallet || status === 'loading' || Boolean(configError) || (activeFlow !== 'erc2612' && activeFlow !== 'dai' && !spenderMatches) || !artifactReady} onClick={() => executeWorkflow(activeFlow)} type="button">链上执行 / 重复执行</button>
            </div>

            <TypedDataViewer
              artifact={currentArtifact}
              onCopy={() => currentArtifact && copyText('Typed Data RPC JSON', currentArtifact.rpcPayload)}
              onSignatureChange={(value) => {
                if (!currentArtifact) return
                if (isSigningFlow(activeFlow)) {
                  setSigningArtifact(activeFlow, { ...currentArtifact, signature: value })
                } else {
                  setFlowArtifact(activeFlow, { ...currentArtifact, signature: value })
                }
              }}
              showSignatureParts={activeFlow === 'erc2612' || activeFlow === 'dai'}
              signatureHelp={activeFlow === 'dai' ? <p className="muted">可将以上 v/r/s 与 holder、spender、nonce、expiry、allowed 一起传给 DaiToken 的 <code>permit(...)</code>，或直接点击链上执行调用最新 spender 的 <code>daiPermitAndTransfer(...)</code>。执行时使用上面的 Solidity bool allowed 和 amount。</p> : undefined}
            />
          </section>

          <section className="workbench raw-signing-panel">
            <PanelHeading
              title="Raw Typed Data 签名"
              description="粘贴 JSON 字符串后直接交给钱包，原始 RPC 模式不会在页面侧校验或改写内容，适合测试非法请求。"
              tourTarget="raw-typed-data"
              action={<span className="pill">不广播交易</span>}
            />
            <label className="field">
              <span>eth_signTypedData_v4 JSON（原样传给钱包）</span>
              <textarea
                autoComplete="off"
                onChange={(event) => {
                  setRawTypedDataInput(event.target.value)
                  setRawTypedDataSignature('')
                  setRawTypedDataError('')
                }}
                placeholder={'{\n  "domain": {},\n  "types": {},\n  "primaryType": "Permit",\n  "message": {}\n}'}
                spellCheck={false}
                value={rawTypedDataInput}
              />
            </label>
            <div className="action-row">
              <button className="button secondary" disabled={!currentArtifact} onClick={() => loadRawTypedData(currentArtifact?.rpcPayload)} type="button">载入当前流程 JSON</button>
              <button className="button accent" disabled={!canUseWallet || status === 'loading'} onClick={signRawTypedData} type="button">原始 JSON 直接签名</button>
            </div>
            <p className="muted">输入会原样作为 <code>eth_signTypedData_v4</code> 的 Typed Data 参数交给钱包；页面不会解析、校验或改写内容，适合测试非法请求。</p>
            {rawTypedDataError && <div className="alert">{rawTypedDataError}</div>}
            {rawTypedDataSignature && (
              <div className="typed-data-section raw-signature-output">
                <div className="output-heading">
                  <h3>Raw Signature</h3>
                  <button className="button secondary" onClick={() => copyText('Raw Typed Data Signature', rawTypedDataSignature)} type="button">复制 Signature</button>
                </div>
                <code className="signature-output">{rawTypedDataSignature}</code>
              </div>
            )}
          </section>

        </section>
      </main>
      <Joyride
        continuous
        floatingOptions={{
          flipOptions: { padding: 16 },
          shiftOptions: { padding: 16 },
          strategy: 'fixed',
        }}
        locale={{
          back: '上一步',
          close: '关闭',
          last: '完成',
          next: '下一步',
          nextWithProgress: '下一步（{current}/{total}）',
          open: '打开使用引导',
          skip: '跳过',
        }}
        onEvent={handleTourEvent}
        options={{
          backgroundColor: '#202a30',
          buttons: ['back', 'close', 'primary', 'skip'],
          closeButtonAction: 'skip',
          dismissKeyAction: 'close',
          offset: 14,
          overlayClickAction: false,
          overlayColor: 'rgba(4, 7, 10, 0.72)',
          primaryColor: '#b68136',
          scrollDuration: 300,
          // Keep Joyride targets below the sticky app header after an automatic scroll.
          scrollOffset: 240,
          showProgress: true,
          skipBeacon: true,
          spotlightPadding: 8,
          spotlightRadius: 10,
          targetWaitTimeout: 1500,
          textColor: '#e7edf0',
          width: 440,
          zIndex: 40,
        }}
        run={tourOpen}
        scrollToFirstStep
        steps={tourSteps}
        styles={{
          arrow: { color: '#202a30' },
          buttonBack: {
            backgroundColor: 'transparent',
            border: 0,
            borderRadius: 8,
            color: '#9be2d8',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1.2,
            marginRight: 8,
            padding: '10px 12px',
          },
          buttonClose: {
            backgroundColor: 'rgba(255, 255, 255, 0.06)',
            border: '1px solid rgba(141, 152, 165, 0.22)',
            borderRadius: 8,
            color: '#d8dee9',
            cursor: 'pointer',
            fontSize: 12,
            lineHeight: 1.2,
            padding: '8px 10px',
            right: 16,
            top: 16,
            width: 'auto',
          },
          buttonPrimary: {
            backgroundColor: '#9a6d2d',
            border: '1px solid rgba(221, 168, 83, 0.7)',
            borderRadius: 8,
            color: '#f7fbfb',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1.2,
            padding: '10px 14px',
          },
          buttonSkip: {
            backgroundColor: 'transparent',
            border: 0,
            borderRadius: 8,
            color: '#93a4ad',
            cursor: 'pointer',
            fontSize: 13,
            lineHeight: 1.2,
            padding: '10px 12px',
          },
          tooltip: {
            backgroundColor: '#202a30',
            border: '1px solid rgba(155, 226, 216, 0.42)',
            borderRadius: 12,
            boxSizing: 'border-box',
            color: '#e7edf0',
            maxWidth: 'calc(100vw - 32px)',
            maxHeight: 'calc(100vh - 32px)',
            overflowY: 'auto',
            padding: 18,
            width: 'min(440px, calc(100vw - 32px))',
          },
          tooltipContainer: {
            lineHeight: 1.6,
            textAlign: 'left',
          },
          tooltipContent: {
            paddingBottom: 14,
            paddingTop: 0,
            whiteSpace: 'pre-line',
          },
          tooltipFooter: {
            alignItems: 'center',
            borderTop: '1px solid rgba(141, 152, 165, 0.16)',
            display: 'flex',
            gap: 8,
            justifyContent: 'space-between',
            paddingTop: 14,
          },
          tooltipTitle: {
            color: '#f7fbfb',
            fontSize: 20,
            fontWeight: 700,
            lineHeight: 1.3,
            margin: 0,
            paddingRight: 70,
          },
        }}
      />
    </div>
  )
}

export default App
