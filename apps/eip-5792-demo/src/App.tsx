import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { WalletControl, useDemoWallet } from '@eco-demo/wallet-connect'
import type { CallDraft, JsonRecord } from './lib/eip5792'
import {
  CALL_STATUS_INFO,
  encodeErc20Transfer,
  errorDetails,
  formatJson,
  makeBatchId,
  makeSendCallsParams,
  newCall,
  normalizeChainId,
  parseChainIds,
} from './lib/eip5792'

type WalletRpcProvider = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>
  on?: (event: string, listener: (...args: unknown[]) => void) => void
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void
  providers?: WalletRpcProvider[]
}

type RpcLog = {
  requestId: string
  method: string
  params: unknown
  time: string
  state: 'pending' | 'success' | 'error'
  result?: unknown
  error?: { code?: number; message: string; label?: string; raw?: unknown }
}

const STATUS_COPY: Record<string, string> = {
  '-32602': '参数无效',
  4001: '用户拒绝',
  4100: '账户未授权',
  5700: '钱包不支持必需的 capability',
  5710: '钱包不支持请求的链',
  5720: 'Batch ID 已使用',
  5730: '钱包中找不到该 Batch ID',
  5740: 'Batch 超出钱包处理限制',
  5750: '用户拒绝 atomic 升级',
  5760: '钱包不支持所需的原子执行',
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value))
}

function getNetworkName(chainId: string) {
  if (chainId.toLowerCase() === '0x47') return 'Conflux eSpace Testnet'
  if (chainId.toLowerCase() === '0x406') return 'Conflux eSpace Mainnet'
  return '自定义网络'
}

function App() {
  const wallet = useDemoWallet()
  const activeWallet = useMemo(() => wallet.provider ? {
    info: { name: wallet.connector?.name ?? '钱包' },
    provider: wallet.provider as unknown as WalletRpcProvider,
  } : undefined, [wallet.connector, wallet.provider])
  const [accounts, setAccounts] = useState<string[]>([])
  const [selectedAccount, setSelectedAccount] = useState('')
  const [activeChainId, setActiveChainId] = useState('')
  const [connectionMessage, setConnectionMessage] = useState('')
  const [rpcLogs, setRpcLogs] = useState<RpcLog[]>([])
  const [busyMethod, setBusyMethod] = useState('')
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error' | 'info'; text: string } | null>(null)
  const requestSequence = useRef(0)
  const pollAttempts = useRef(0)
  const wasConnected = useRef(false)

  const invokeRpc = useCallback(async (method: string, params: unknown): Promise<unknown> => {
    if (!activeWallet) throw new Error('请先连接钱包。')
    requestSequence.current += 1
    const requestId = String(Date.now()) + '-' + String(requestSequence.current)
    const log: RpcLog = {
      requestId,
      method,
      params,
      time: new Date().toISOString(),
      state: 'pending',
    }
    setRpcLogs((current) => [log, ...current].slice(0, 16))
    setBusyMethod(method)
    try {
      const result = await activeWallet.provider.request({ method, params })
      setRpcLogs((current) => current.map((item) => item.requestId === requestId ? { ...item, state: 'success', result } : item))
      return result
    } catch (error) {
      const detail = errorDetails(error)
      setRpcLogs((current) => current.map((item) => item.requestId === requestId ? { ...item, state: 'error', error: detail } : item))
      throw error
    } finally {
      setBusyMethod('')
    }
  }, [activeWallet])

  useEffect(() => {
    if (!activeWallet) {
      setAccounts([])
      setSelectedAccount('')
      setActiveChainId('')
      setConnectionMessage('')
      return
    }

    let current = true
    const refresh = async () => {
      try {
        const [accountResult, chainResult] = await Promise.all([
          activeWallet.provider.request({ method: 'eth_accounts', params: [] }),
          activeWallet.provider.request({ method: 'eth_chainId', params: [] }),
        ])
        if (!current) return
        const nextAccounts = Array.isArray(accountResult) ? accountResult.filter((item): item is string => typeof item === 'string') : []
        setAccounts(nextAccounts)
        setSelectedAccount((selected) => nextAccounts.includes(selected) ? selected : nextAccounts[0] || '')
        setActiveChainId(typeof chainResult === 'string' ? chainResult : '')
        setConnectionMessage(nextAccounts.length ? '钱包已连接。' : '钱包已发现，点击“连接钱包”授权账户。')
      } catch (error) {
        if (!current) return
        setConnectionMessage(errorDetails(error).message)
      }
    }

    const onAccountsChanged = (...args: unknown[]) => {
      const nextAccounts = Array.isArray(args[0]) ? args[0].filter((item): item is string => typeof item === 'string') : []
      setAccounts(nextAccounts)
      setSelectedAccount((selected) => nextAccounts.includes(selected) ? selected : nextAccounts[0] || '')
      setConnectionMessage(nextAccounts.length ? '账户已更新。' : '钱包当前未授权账户。')
    }
    const onChainChanged = (...args: unknown[]) => {
      const nextChainId = typeof args[0] === 'string' ? args[0] : ''
      setActiveChainId(nextChainId)
      setConnectionMessage(nextChainId ? '网络已切换到 ' + getNetworkName(nextChainId) + '。' : '')
    }

    void refresh()
    activeWallet.provider.on?.('accountsChanged', onAccountsChanged)
    activeWallet.provider.on?.('chainChanged', onChainChanged)
    return () => {
      current = false
      activeWallet.provider.removeListener?.('accountsChanged', onAccountsChanged)
      activeWallet.provider.removeListener?.('chainChanged', onChainChanged)
    }
  }, [activeWallet])

  const [capabilityChainInput, setCapabilityChainInput] = useState('0x47')
  const [capabilityResult, setCapabilityResult] = useState<unknown>()
  const [version, setVersion] = useState('2.0.0')
  const [sendChainId, setSendChainId] = useState('0x47')
  const [atomicRequired, setAtomicRequired] = useState(false)
  const [includeFrom, setIncludeFrom] = useState(true)
  const [fromAddress, setFromAddress] = useState('')
  const [includeCustomId, setIncludeCustomId] = useState(false)
  const [customBatchId, setCustomBatchId] = useState(() => makeBatchId())
  const [globalCapabilities, setGlobalCapabilities] = useState('')
  const [calls, setCalls] = useState<CallDraft[]>(() => [newCall()])
  const [sendMode, setSendMode] = useState<'form' | 'raw'>('form')
  const [rawSendParams, setRawSendParams] = useState(() => formatJson([{
    version: '2.0.0',
    chainId: '0x47',
    atomicRequired: false,
    calls: [],
  }]))
  const [tokenContract, setTokenContract] = useState('')
  const [tokenRecipient, setTokenRecipient] = useState('')
  const [tokenAmount, setTokenAmount] = useState('1')
  const [tokenDecimals, setTokenDecimals] = useState('18')
  const [nativeRecipient, setNativeRecipient] = useState('')
  const [nativeAmount, setNativeAmount] = useState('0.001')
  const [statusBatchId, setStatusBatchId] = useState('')
  const [callsStatus, setCallsStatus] = useState<unknown>()
  const [autoPoll, setAutoPoll] = useState(true)
  const getStatusRef = useRef<(silent?: boolean) => Promise<void>>(async () => undefined)

  useEffect(() => {
    if (!wallet.isConnected) {
      wasConnected.current = false
      return
    }
    if (!wasConnected.current && wallet.chainId) {
      const chainId = '0x' + wallet.chainId.toString(16)
      setSendChainId(chainId)
      setCapabilityChainInput(chainId)
    }
    wasConnected.current = true
  }, [wallet.chainId, wallet.isConnected])

  useEffect(() => {
    if (selectedAccount) {
      setFromAddress(selectedAccount)
      setNativeRecipient((current) => current || selectedAccount)
      setTokenRecipient((current) => current || selectedAccount)
    }
  }, [selectedAccount])

  const formParams = useMemo(() => {
    try {
      const params = makeSendCallsParams({
        version,
        id: includeCustomId ? customBatchId : undefined,
        from: includeFrom ? fromAddress : undefined,
        chainId: sendChainId,
        atomicRequired,
        calls,
        capabilities: globalCapabilities,
      })
      return { params, error: '' }
    } catch (error) {
      return { params: null, error: errorDetails(error).message }
    }
  }, [version, includeCustomId, customBatchId, includeFrom, fromAddress, sendChainId, atomicRequired, calls, globalCapabilities])

  const statusCode = isRecord(callsStatus) && typeof callsStatus.status === 'number' ? callsStatus.status : undefined
  const statusInfo = statusCode === undefined ? undefined : CALL_STATUS_INFO[statusCode]
  const capabilityEntries = isRecord(capabilityResult) ? Object.entries(capabilityResult) : []
  const currentChainMismatch = (() => {
    try {
      return Boolean(activeChainId) && normalizeChainId(activeChainId) !== normalizeChainId(sendChainId)
    } catch {
      return false
    }
  })()
  const walletTargetChainId = (() => {
    try {
      const chainId = Number(BigInt(normalizeChainId(sendChainId)))
      return Number.isSafeInteger(chainId) ? chainId : undefined
    } catch {
      return undefined
    }
  })()

  async function queryCapabilities() {
    setFeedback(null)
    if (!selectedAccount) {
      setFeedback({ tone: 'error', text: '请先连接钱包并选择账户。' })
      return
    }
    try {
      const chainIds = parseChainIds(capabilityChainInput)
      const params: unknown[] = chainIds ? [selectedAccount, chainIds] : [selectedAccount]
      const result = await invokeRpc('wallet_getCapabilities', params)
      setCapabilityResult(result)
      setFeedback({ tone: 'success', text: '能力查询已完成。' })
    } catch (error) {
      setCapabilityResult(undefined)
      setFeedback({ tone: 'error', text: errorDetails(error).message })
    }
  }

  async function sendCalls() {
    setFeedback(null)
    let params: unknown
    if (sendMode === 'raw') {
      try {
        params = JSON.parse(rawSendParams) as unknown
      } catch {
        setFeedback({ tone: 'error', text: '原始参数不是有效 JSON。' })
        return
      }
    } else {
      if (!formParams.params) {
        setFeedback({ tone: 'error', text: formParams.error || '请求参数无效。' })
        return
      }
      params = formParams.params
    }
    try {
      const result = await invokeRpc('wallet_sendCalls', params)
      if (isRecord(result) && typeof result.id === 'string') {
        pollAttempts.current = 0
        setStatusBatchId(result.id)
        setCallsStatus(undefined)
        setFeedback({ tone: 'success', text: 'wallet_sendCalls 已返回 batch ID。' })
      } else {
        setFeedback({ tone: 'success', text: 'wallet_sendCalls 已返回；响应中没有可识别的 id，请查看原始结果。' })
      }
      if (includeCustomId && sendMode === 'form') setCustomBatchId(makeBatchId())
    } catch (error) {
      const detail = errorDetails(error)
      const label = detail.code === undefined ? '' : '（' + (detail.label || STATUS_COPY[String(detail.code)] || 'RPC 错误 ' + detail.code) + '）'
      setFeedback({ tone: 'error', text: label + detail.message })
    }
  }

  const getCallsStatus = useCallback(async (silent = false) => {
    if (!statusBatchId.trim()) {
      if (!silent) setFeedback({ tone: 'error', text: '请填写 wallet_sendCalls 返回的 batch ID。' })
      return
    }
    if (!silent) pollAttempts.current = 0
    if (!silent) setFeedback(null)
    try {
      const result = await invokeRpc('wallet_getCallsStatus', [statusBatchId.trim()])
      setCallsStatus(result)
      if (!silent) setFeedback({ tone: 'success', text: 'wallet_getCallsStatus 查询完成。' })
    } catch (error) {
      const detail = errorDetails(error)
      const label = detail.code === undefined ? '' : '（' + (detail.label || STATUS_COPY[String(detail.code)] || 'RPC 错误 ' + detail.code) + '）'
      if (!silent) setFeedback({ tone: 'error', text: label + detail.message })
    }
  }, [invokeRpc, statusBatchId])

  useEffect(() => {
    getStatusRef.current = getCallsStatus
  }, [getCallsStatus])

  useEffect(() => {
    if (!autoPoll || statusCode !== 100 || !statusBatchId || !activeWallet || busyMethod) return
    if (pollAttempts.current >= 60) {
      setAutoPoll(false)
      setFeedback({ tone: 'info', text: '自动轮询已运行 2.5 分钟，已暂停。你可以手动继续查询。' })
      return
    }
    const timer = window.setTimeout(() => {
      pollAttempts.current += 1
      void getStatusRef.current(true)
    }, 2500)
    return () => window.clearTimeout(timer)
  }, [autoPoll, statusCode, statusBatchId, activeWallet, busyMethod])

  async function showCallsStatus() {
    if (!statusBatchId.trim()) {
      setFeedback({ tone: 'error', text: '请先填写或发送一个 batch ID。' })
      return
    }
    setFeedback(null)
    try {
      await invokeRpc('wallet_showCallsStatus', [statusBatchId.trim()])
      setFeedback({ tone: 'success', text: '已请求钱包显示该 batch 的状态界面。' })
    } catch (error) {
      const detail = errorDetails(error)
      const label = detail.code === undefined ? '' : '（' + (detail.label || STATUS_COPY[String(detail.code)] || 'RPC 错误 ' + detail.code) + '）'
      setFeedback({ tone: 'error', text: label + detail.message })
    }
  }

  function updateCall(index: number, field: keyof CallDraft, value: string) {
    setCalls((current) => current.map((call, itemIndex) => itemIndex === index ? { ...call, [field]: value } : call))
  }

  function appendCall(call: CallDraft) {
    setCalls((current) => current.length === 1 && !current[0].to && !current[0].data && current[0].value === '0' && !current[0].capabilities
      ? [call]
      : [...current, call])
  }

  function addNativeTransfer() {
    const address = nativeRecipient.trim()
    if (!/^0x[0-9a-f]{40}$/i.test(address)) {
      setFeedback({ tone: 'error', text: '原生币接收地址不是有效地址。' })
      return
    }
    try {
      const wei = decimalToUnits(nativeAmount, 18)
      appendCall({ ...newCall(), to: address, data: '0x', value: wei.toString() })
      setFeedback({ tone: 'success', text: '已添加原生币转账 call。' })
    } catch (error) {
      setFeedback({ tone: 'error', text: errorDetails(error).message })
    }
  }

  function addErc20Transfer() {
    const token = tokenContract.trim()
    if (!/^0x[0-9a-f]{40}$/i.test(token)) {
      setFeedback({ tone: 'error', text: 'Token 合约地址不是有效地址。' })
      return
    }
    try {
      const data = encodeErc20Transfer(tokenRecipient, tokenAmount, tokenDecimals)
      appendCall({ ...newCall(), to: token, data, value: '0' })
      setFeedback({ tone: 'success', text: '已添加 ERC-20 transfer call。' })
    } catch (error) {
      setFeedback({ tone: 'error', text: errorDetails(error).message })
    }
  }

  function loadFormIntoRaw() {
    if (!formParams.params) {
      setFeedback({ tone: 'error', text: formParams.error })
      return
    }
    setRawSendParams(formatJson(formParams.params))
    setSendMode('raw')
    setFeedback({ tone: 'info', text: '已将表单参数复制到原始模式。' })
  }

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value)
      setFeedback({ tone: 'success', text: '已复制到剪贴板。' })
    } catch {
      setFeedback({ tone: 'error', text: '剪贴板不可用，请手动复制。' })
    }
  }

  const homeHref = import.meta.env.DEV
    ? window.location.protocol + '//' + window.location.hostname + ':4173/'
    : '../'
  const latestLog = rpcLogs[0]
  const receipts = isRecord(callsStatus) && Array.isArray(callsStatus.receipts) ? callsStatus.receipts : []

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <a className="home-link" href={homeHref}>← 返回首页</a>
          <div className="title-line">
            <span className="eyebrow">WALLET CALL API</span>
            <h1>EIP-5792 Demo</h1>
          </div>
          <p>直接调用钱包 RPC，检查批量 calls、能力和执行状态。</p>
        </div>
        <WalletControl targetChainId={walletTargetChainId} />
      </header>

      <main className="page-content">
        {feedback && <div className={'feedback feedback-' + feedback.tone} role="status">{feedback.text}</div>}

        <section className="connection-strip panel">
          <div className="connection-copy">
            <span className={'status-dot ' + (selectedAccount ? 'dot-connected' : '')} />
            <div>
              <strong>{selectedAccount ? '钱包已连接' : '等待连接钱包'}</strong>
              <p>{connectionMessage || (activeWallet ? '连接已就绪，可以开始测试钱包 RPC。' : '点击右上角“连接钱包”并选择一个浏览器钱包。')}</p>
            </div>
          </div>
          <div className="connection-facts">
            {accounts.length > 0 && (
              <label className="field account-select">
                <span>当前账户</span>
                <select value={selectedAccount} onChange={(event) => {
                  setSelectedAccount(event.target.value)
                  setFromAddress(event.target.value)
                }}>
                  {accounts.map((account) => <option key={account} value={account}>{account}</option>)}
                </select>
              </label>
            )}
            <div className="fact">
              <span>当前网络</span>
              <code>{activeChainId ? getNetworkName(activeChainId) + ' · ' + activeChainId : '未连接'}</code>
            </div>
          </div>
        </section>

        <div className="workbench-grid">
          <aside className="side-column">
            <section className="panel capability-panel">
              <div className="section-heading">
                <div>
                  <span className="section-index">01 / DISCOVER</span>
                  <h2>查询钱包能力</h2>
                  <p>按账户与链查询能力映射。</p>
                </div>
                <span className="method-chip">wallet_getCapabilities</span>
              </div>
              <label className="field">
                <span>chain IDs <small>逗号分隔；留空时省略第二个参数</small></span>
                <input value={capabilityChainInput} onChange={(event) => setCapabilityChainInput(event.target.value)} placeholder="0x47, 0x406" />
              </label>
              <div className="quick-chains">
                <button className="text-button" onClick={() => setCapabilityChainInput('0x47')}>Testnet 0x47</button>
                <button className="text-button" onClick={() => setCapabilityChainInput('0x406')}>Mainnet 0x406</button>
                <button className="text-button" onClick={() => setCapabilityChainInput('')}>省略链列表</button>
              </div>
              <button className="button full-width" onClick={() => void queryCapabilities()} disabled={!activeWallet || !selectedAccount || Boolean(busyMethod)}>
                {busyMethod === 'wallet_getCapabilities' ? '查询中…' : '查询 capabilities'}
              </button>
              <div className="capability-result">
                {capabilityEntries.length > 0 ? (
                  capabilityEntries.map(([chain, value]) => {
                    const capabilityMap = isRecord(value) ? value : {}
                    const atomic = isRecord(capabilityMap.atomic) ? capabilityMap.atomic : undefined
                    const atomicStatus = typeof atomic?.status === 'string' ? atomic.status : ''
                    return (
                      <article className="capability-chain" key={chain}>
                        <div className="capability-chain-heading">
                          <strong>{chain === '0x0' ? '全局能力' : getNetworkName(chain)}</strong>
                          <code>{chain}</code>
                        </div>
                        {Object.entries(capabilityMap).map(([name, capability]) => (
                          <div className="capability-row" key={name}>
                            <span>{name}</span>
                            {name === 'atomic' && atomicStatus
                              ? <b className={'atomic-state atomic-' + atomicStatus}>{atomicStatus}</b>
                              : <code>{formatJson(capability)}</code>}
                          </div>
                        ))}
                      </article>
                    )
                  })
                ) : capabilityResult !== undefined ? (
                  <pre className="json-preview">{formatJson(capabilityResult)}</pre>
                ) : (
                  <div className="empty-state">查询结果会显示在这里。没有返回的链通常表示钱包未报告该链能力。</div>
                )}
              </div>
              {capabilityResult !== undefined && (
                <details className="raw-disclosure">
                  <summary>查看原始返回 JSON</summary>
                  <pre className="json-preview">{formatJson(capabilityResult)}</pre>
                </details>
              )}
              <p className="micro-note">能力查询反映钱包报告的链上能力；EIP-5792 方法支持仍以实际 RPC 调用结果为准。</p>
            </section>

            <section className="panel error-reference">
              <div className="section-heading">
                <div>
                  <span className="section-index">REFERENCE</span>
                  <h2>常见 RPC 错误</h2>
                </div>
              </div>
              <div className="error-list">
                {Object.entries(STATUS_COPY).map(([code, label]) => (
                  <div className="error-row" key={code}><code>{code}</code><span>{label}</span></div>
                ))}
              </div>
            </section>
          </aside>

          <div className="main-column">
            <section className="panel send-panel">
              <div className="section-heading section-heading-wide">
                <div>
                  <span className="section-index">02 / SEND</span>
                  <h2>发送批量 Calls</h2>
                  <p>表单模式会先做基础格式检查；原始模式将 JSON 参数直接传给钱包。</p>
                </div>
                <span className="method-chip">wallet_sendCalls</span>
              </div>

              <div className="mode-tabs" role="tablist" aria-label="请求编辑模式">
                <button className={sendMode === 'form' ? 'mode-tab active' : 'mode-tab'} onClick={() => setSendMode('form')} role="tab" aria-selected={sendMode === 'form'}>表单构建</button>
                <button className={sendMode === 'raw' ? 'mode-tab active' : 'mode-tab'} onClick={() => setSendMode('raw')} role="tab" aria-selected={sendMode === 'raw'}>原始 JSON-RPC</button>
                {sendMode === 'form' && <button className="text-button push-right" onClick={() => void loadFormIntoRaw()}>将表单载入原始模式 ↗</button>}
              </div>

              {sendMode === 'form' ? (
                <>
                  <div className="form-grid request-grid">
                    <label className="field">
                      <span>version</span>
                      <input value={version} onChange={(event) => setVersion(event.target.value)} placeholder="2.0.0" />
                    </label>
                    <label className="field">
                      <span>chainId <small>十进制或 0x 数量</small></span>
                      <input value={sendChainId} onChange={(event) => setSendChainId(event.target.value)} />
                    </label>
                    <label className="field full-span">
                      <span>from address</span>
                      <div className="inline-input">
                        <input value={fromAddress} onChange={(event) => setFromAddress(event.target.value)} disabled={!includeFrom} placeholder="0x…" />
                        <label className="switch-label">
                          <input type="checkbox" checked={includeFrom} onChange={(event) => setIncludeFrom(event.target.checked)} />
                          <span>传入 from</span>
                        </label>
                      </div>
                    </label>
                    <div className="field">
                      <span>原子执行要求</span>
                      <label className="switch-card">
                        <input type="checkbox" checked={atomicRequired} onChange={(event) => setAtomicRequired(event.target.checked)} />
                        <span><strong>atomicRequired</strong><small>{atomicRequired ? '钱包必须提供原子执行保障' : '允许钱包采用其支持的执行方式'}</small></span>
                      </label>
                    </div>
                    <div className="field">
                      <span>自定义 Batch ID</span>
                      <div className="inline-input">
                        <input value={customBatchId} onChange={(event) => setCustomBatchId(event.target.value)} disabled={!includeCustomId} />
                        <label className="switch-label">
                          <input type="checkbox" checked={includeCustomId} onChange={(event) => setIncludeCustomId(event.target.checked)} />
                          <span>传入 ID</span>
                        </label>
                      </div>
                    </div>
                  </div>

                  {currentChainMismatch && (
                    <div className="notice notice-amber">
                      请求链 {sendChainId} 与钱包当前链 {activeChainId} 不同。此状态适合验证钱包对跨链请求的处理。
                    </div>
                  )}

                  <section className="template-section">
                    <div className="subsection-heading">
                      <div><strong>快速添加调用</strong><span>生成 calldata 后仍可在下方编辑。</span></div>
                    </div>
                    <div className="template-grid">
                      <div className="template-card">
                        <div className="template-title"><span className="template-icon">↗</span><div><strong>原生币转账</strong><small>接收地址 + CFX 数量</small></div></div>
                        <label className="field">
                          <span>接收地址</span>
                          <input value={nativeRecipient} onChange={(event) => setNativeRecipient(event.target.value)} placeholder="0x…" />
                        </label>
                        <label className="field">
                          <span>数量（CFX）</span>
                          <input value={nativeAmount} onChange={(event) => setNativeAmount(event.target.value)} inputMode="decimal" />
                        </label>
                        <button className="button secondary full-width" onClick={addNativeTransfer}>添加原生币 call</button>
                      </div>
                      <div className="template-card">
                        <div className="template-title"><span className="template-icon token-icon">▧</span><div><strong>ERC-20 transfer</strong><small>本地生成 transfer(address,uint256)</small></div></div>
                        <label className="field">
                          <span>Token 合约</span>
                          <input value={tokenContract} onChange={(event) => setTokenContract(event.target.value)} placeholder="0x…" />
                        </label>
                        <div className="template-row">
                          <label className="field">
                            <span>接收地址</span>
                            <input value={tokenRecipient} onChange={(event) => setTokenRecipient(event.target.value)} placeholder="0x…" />
                          </label>
                          <label className="field">
                            <span>数量</span>
                            <input value={tokenAmount} onChange={(event) => setTokenAmount(event.target.value)} inputMode="decimal" />
                          </label>
                          <label className="field decimals-field">
                            <span>decimals</span>
                            <input value={tokenDecimals} onChange={(event) => setTokenDecimals(event.target.value)} inputMode="numeric" />
                          </label>
                        </div>
                        <button className="button secondary full-width" onClick={addErc20Transfer}>添加 ERC-20 call</button>
                      </div>
                    </div>
                  </section>

                  <section className="calls-section">
                    <div className="subsection-heading">
                      <div><strong>Calls <span className="count-badge">{calls.length}</span></strong><span>会按列表顺序提交。</span></div>
                      <button className="small-button" onClick={() => setCalls((current) => [...current, newCall()])}>＋ 添加 call</button>
                    </div>
                    <div className="call-list">
                      {calls.map((call, index) => (
                        <article className="call-card" key={index}>
                          <div className="call-card-heading">
                            <span className="call-number">{String(index + 1).padStart(2, '0')}</span>
                            <strong>Call {index + 1}</strong>
                            <span className="call-order-note">执行顺序 {index + 1}</span>
                            <div className="call-actions">
                              <button className="icon-button" title="上移" disabled={index === 0} onClick={() => setCalls((current) => {
                                const next = [...current]
                                ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
                                return next
                              })}>↑</button>
                              <button className="icon-button" title="下移" disabled={index === calls.length - 1} onClick={() => setCalls((current) => {
                                const next = [...current]
                                ;[next[index + 1], next[index]] = [next[index], next[index + 1]]
                                return next
                              })}>↓</button>
                              <button className="icon-button danger-icon" title="删除" disabled={calls.length <= 1} onClick={() => setCalls((current) => current.filter((_item, itemIndex) => itemIndex !== index))}>×</button>
                            </div>
                          </div>
                          <div className="call-fields">
                            <label className="field full-span">
                              <span>to <small>可留空</small></span>
                              <input value={call.to} onChange={(event) => updateCall(index, 'to', event.target.value)} placeholder="0x…" />
                            </label>
                            <label className="field">
                              <span>value <small>wei 十进制或 hex</small></span>
                              <input value={call.value} onChange={(event) => updateCall(index, 'value', event.target.value)} placeholder="0" />
                            </label>
                            <label className="field">
                              <span>capabilities <small>可留空；JSON object</small></span>
                              <textarea value={call.capabilities} onChange={(event) => updateCall(index, 'capabilities', event.target.value)} rows={2} placeholder='{"example":{"optional":true}}' />
                            </label>
                            <label className="field full-span">
                              <span>data <small>十六进制字节，可留空</small></span>
                              <textarea value={call.data} onChange={(event) => updateCall(index, 'data', event.target.value)} rows={3} placeholder="0x" />
                            </label>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>

                  <label className="field global-capability-field">
                    <span>全局 capabilities <small>JSON object，可留空</small></span>
                    <textarea value={globalCapabilities} onChange={(event) => setGlobalCapabilities(event.target.value)} rows={3} placeholder='{"paymasterService":{"url":"https://…","optional":true}}' />
                  </label>
                  <div className="capability-presets">
                    <span>能力测试预设：</span>
                    <button className="text-button" onClick={() => setGlobalCapabilities(formatJson({ optionalProbe: { optional: true, enabled: true } }))}>可选未知能力</button>
                    <button className="text-button" onClick={() => setGlobalCapabilities(formatJson({ requiredProbe: { enabled: true } }))}>必需未知能力</button>
                    <button className="text-button" onClick={() => setGlobalCapabilities('')}>清空</button>
                  </div>

                  <details className="request-preview">
                    <summary>预览发送参数</summary>
                    {formParams.error
                      ? <p className="inline-error">{formParams.error}</p>
                      : <pre className="json-preview">{formatJson(formParams.params)}</pre>}
                  </details>
                </>
              ) : (
                <div className="raw-mode">
                  <div className="notice notice-blue">原始模式将 JSON 解析成值后直接传入 wallet_sendCalls 的 params，不做字段补全或规范化。适合验证钱包的参数校验与错误码。</div>
                  <label className="field">
                    <span>JSON-RPC params</span>
                    <textarea className="raw-params" value={rawSendParams} onChange={(event) => setRawSendParams(event.target.value)} spellCheck={false} />
                  </label>
                  <button className="button secondary" onClick={() => void copyText(rawSendParams)}>复制原始参数</button>
                </div>
              )}

              <div className="send-footer">
                <div className="send-footer-copy">
                  <span className="send-safety">钱包会弹出确认界面</span>
                  <small>发送前请确认账户、目标链、调用数据和金额。</small>
                </div>
                <button className="button button-send" onClick={() => void sendCalls()} disabled={!activeWallet || Boolean(busyMethod)}>
                  {busyMethod === 'wallet_sendCalls' ? '等待钱包响应…' : '调用 wallet_sendCalls'}
                  <span aria-hidden="true">↗</span>
                </button>
              </div>
            </section>

            <section className="panel status-panel">
              <div className="section-heading section-heading-wide">
                <div>
                  <span className="section-index">03 / TRACK</span>
                  <h2>查询 Batch 状态</h2>
                  <p>使用 wallet_sendCalls 返回的 ID 读取 receipt，或请求钱包打开状态界面。</p>
                </div>
                <span className="method-chip">wallet_getCallsStatus</span>
              </div>
              <label className="field">
                <span>Batch ID</span>
                <input value={statusBatchId} onChange={(event) => {
                  pollAttempts.current = 0
                  setStatusBatchId(event.target.value)
                  setCallsStatus(undefined)
                }} placeholder="0x…" />
              </label>
              <div className="status-toolbar">
                <label className="switch-label">
                  <input type="checkbox" checked={autoPoll} onChange={(event) => setAutoPoll(event.target.checked)} />
                  <span>Pending 时每 2.5 秒轮询</span>
                </label>
                <div className="button-row">
                  <button className="button secondary" onClick={() => void getCallsStatus()} disabled={!activeWallet || Boolean(busyMethod)}>查询状态</button>
                  <button className="button secondary" onClick={() => void showCallsStatus()} disabled={!activeWallet || Boolean(busyMethod)}>wallet_showCallsStatus</button>
                </div>
              </div>
              {callsStatus !== undefined && (
                <div className="status-result">
                  <div className="status-summary">
                    <div className="status-summary-copy">
                      <span className="section-index">BATCH STATUS</span>
                      <strong>{statusCode === undefined ? '未知状态' : (statusInfo?.label || '状态码 ' + statusCode)}</strong>
                      <p>{statusInfo?.detail || '请检查钱包返回的原始 JSON。'}</p>
                    </div>
                    <div className={'status-number ' + (statusInfo?.tone || '')}>{statusCode ?? '—'}</div>
                  </div>
                  {isRecord(callsStatus) && (
                    <div className="receipt-grid">
                      <div className="receipt-fact"><span>Batch atomic</span><strong>{typeof callsStatus.atomic === 'boolean' ? String(callsStatus.atomic) : '未返回'}</strong></div>
                      <div className="receipt-fact"><span>Chain</span><code>{typeof callsStatus.chainId === 'string' ? callsStatus.chainId : '未返回'}</code></div>
                      <div className="receipt-fact"><span>Receipts</span><strong>{receipts.length}</strong></div>
                    </div>
                  )}
                  {receipts.map((receipt, index) => {
                    const item = isRecord(receipt) ? receipt : {}
                    const logs = Array.isArray(item.logs) ? item.logs : []
                    return (
                      <article className="receipt-card" key={String(item.transactionHash || index)}>
                        <div className="receipt-title"><strong>Receipt {index + 1}</strong><code className={item.status === '0x1' ? 'receipt-ok' : 'receipt-failed'}>{String(item.status ?? 'status 未返回')}</code></div>
                        <div className="receipt-details">
                          <span>交易哈希</span><code>{String(item.transactionHash ?? '未返回')}</code>
                          <span>区块</span><code>{String(item.blockNumber ?? '未返回')}</code>
                          <span>Gas Used</span><code>{String(item.gasUsed ?? '未返回')}</code>
                          <span>Logs</span><code>{Array.isArray(item.logs) ? item.logs.length : 0}</code>
                        </div>
                        {logs.length > 0 && (
                          <details className="receipt-logs">
                            <summary>查看事件 Logs</summary>
                            <div className="receipt-log-list">
                              {logs.map((entry, logIndex) => {
                                const log = isRecord(entry) ? entry : {}
                                return (
                                  <div className="receipt-log" key={String(log.address || logIndex)}>
                                    <span>Address</span><code>{String(log.address ?? '未返回')}</code>
                                    <span>Topics</span><code>{formatJson(log.topics)}</code>
                                    <span>Data</span><code>{String(log.data ?? '未返回')}</code>
                                  </div>
                                )
                              })}
                            </div>
                          </details>
                        )}
                      </article>
                    )
                  })}
                  <details className="raw-disclosure">
                    <summary>查看完整状态 JSON</summary>
                    <pre className="json-preview">{formatJson(callsStatus)}</pre>
                  </details>
                </div>
              )}
            </section>

            <section className="panel activity-panel">
              <div className="section-heading section-heading-wide">
                <div>
                  <span className="section-index">04 / RPC LOG</span>
                  <h2>最近 RPC 请求</h2>
                  <p>保留本次页面会话的最近 16 条请求，便于核对实际 params 和钱包响应。</p>
                </div>
                {rpcLogs.length > 0 && <button className="text-button" onClick={() => setRpcLogs([])}>清空记录</button>}
              </div>
              {latestLog ? (
                <div className="rpc-log-list">
                  {rpcLogs.map((log) => (
                    <details className="rpc-log" key={log.requestId} open={log === latestLog}>
                      <summary>
                        <span className={'log-indicator log-' + log.state} />
                        <strong>{log.method}</strong>
                        <span className="log-time">{formatDate(log.time)}</span>
                        <span className={'log-state state-' + log.state}>{log.state === 'pending' ? '等待中' : log.state === 'success' ? '成功' : '错误'}</span>
                      </summary>
                      <div className="log-body">
                        <div className="log-block"><div className="log-label"><span>params</span><button className="text-button" onClick={() => void copyText(formatJson(log.params))}>复制</button></div><pre className="json-preview">{formatJson(log.params)}</pre></div>
                        <div className="log-block">
                          <div className="log-label"><span>{log.state === 'error' ? 'error' : 'result'}</span>{log.error?.code !== undefined && <code>{log.error.code} · {log.error.label || STATUS_COPY[String(log.error.code)] || 'RPC 错误'}</code>}</div>
                          <pre className={log.state === 'error' ? 'json-preview error-preview' : 'json-preview'}>{log.state === 'error' ? formatJson(log.error) : log.state === 'pending' ? '等待钱包响应…' : formatJson(log.result)}</pre>
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
              ) : (
                <div className="empty-state">调用钱包方法后，这里会记录完整的 params 和原始响应。</div>
              )}
            </section>
          </div>
        </div>
        <footer className="page-footer">
          <span>EIP-5792 Wallet Call API</span>
          <span>所有 RPC 请求均由当前选择的钱包 provider 处理。</span>
        </footer>
      </main>
    </div>
  )
}

function decimalToUnits(value: string, decimals: number): bigint {
  const input = value.trim()
  const parts = input.split('.')
  if (parts.length > 2 || !/^[0-9]+$/.test(parts[0] || '') || (parts[1] && !/^[0-9]+$/.test(parts[1]))) {
    throw new Error('数量格式无效。')
  }
  const fraction = parts[1] || ''
  if (fraction.length > decimals) throw new Error('小数位不能超过 ' + decimals + ' 位。')
  return BigInt(parts[0] || '0') * (10n ** BigInt(decimals))
    + BigInt((fraction + '0'.repeat(decimals)).slice(0, decimals) || '0')
}

export default App
