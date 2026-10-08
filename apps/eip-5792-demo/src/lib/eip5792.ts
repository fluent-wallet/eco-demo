export type JsonRecord = Record<string, unknown>

export type CallDraft = {
  to: string
  data: string
  value: string
  capabilities: string
}

export type RpcErrorShape = {
  code?: number
  message?: string
  shortMessage?: string
  data?: unknown
}

export const CALL_STATUS_INFO: Record<number, { label: string; tone: string; detail: string }> = {
  100: { label: '处理中', tone: 'pending', detail: '钱包已接收请求，batch 尚未完成链上执行。' },
  200: { label: '已确认', tone: 'success', detail: 'Batch 已上链且未发生回滚。' },
  400: { label: '链下失败', tone: 'error', detail: 'Batch 未上链，钱包不会重试。' },
  500: { label: '整批回滚', tone: 'error', detail: 'Batch 已回滚，链上可能只保留 gas 费用影响。' },
  600: { label: '部分失败', tone: 'warning', detail: 'Batch 部分回滚，部分调用效果可能已经上链。' },
}

const ERROR_LABELS: Record<number, string> = {
  '-32602': '参数无效',
  4001: '用户拒绝',
  4100: '账户未授权',
  5700: '不支持必需的 capability',
  5710: '不支持的 chain ID',
  5720: 'Batch ID 重复',
  5730: '未知 Batch ID',
  5740: 'Batch 太大',
  5750: '用户拒绝 atomic 升级',
  5760: '不支持原子执行',
}

export function newCall(): CallDraft {
  return { to: '', data: '', value: '0', capabilities: '' }
}

export function makeBatchId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return '0x' + crypto.randomUUID().replaceAll('-', '')
  }
  return '0x' + Math.random().toString(16).slice(2) + Date.now().toString(16)
}

export function normalizeChainId(value: string): string {
  const input = value.trim()
  if (!input) throw new Error('请填写 chain ID。')
  let chainId: bigint
  try {
    if (/^0x[0-9a-f]+$/i.test(input)) chainId = BigInt(input)
    else if (/^[0-9]+$/.test(input)) chainId = BigInt(input)
    else throw new Error()
  } catch {
    throw new Error('chain ID 请使用十进制数字或 0x 十六进制数量。')
  }
  if (chainId < 0n) throw new Error('chain ID 不能为负数。')
  if (chainId >= (1n << 256n)) throw new Error('chain ID 超出 256-bit 范围。')
  return '0x' + chainId.toString(16)
}

export function normalizeValue(value: string): string | undefined {
  const input = value.trim()
  if (!input) return undefined
  let amount: bigint
  try {
    if (/^0x[0-9a-f]+$/i.test(input)) amount = BigInt(input)
    else if (/^[0-9]+$/.test(input)) amount = BigInt(input)
    else throw new Error()
  } catch {
    throw new Error('value 请使用十进制 wei 或 0x 十六进制数量。')
  }
  if (amount < 0n) throw new Error('value 不能为负数。')
  if (amount >= (1n << 256n)) throw new Error('value 超出 uint256 范围。')
  return '0x' + amount.toString(16)
}

export function parseJsonRecord(value: string, label: string): JsonRecord | undefined {
  if (!value.trim()) return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error(label + ' 不是有效 JSON。')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(label + ' 必须是 JSON object。')
  }
  return parsed as JsonRecord
}

export function parseChainIds(value: string): string[] | undefined {
  if (!value.trim()) return undefined
  return value
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((chainId) => normalizeChainId(chainId))
}

export function makeSendCallsParams(input: {
  version: string
  id?: string
  from?: string
  chainId: string
  atomicRequired: boolean
  calls: CallDraft[]
  capabilities: string
}): JsonRecord[] {
  const version = input.version.trim()
  if (!version) throw new Error('请填写 version。')
  const chainId = normalizeChainId(input.chainId)
  const calls = input.calls.map((call, index) => {
    const next: JsonRecord = {}
    const to = call.to.trim()
    const data = call.data.trim()
    if (to) {
      if (!/^0x[0-9a-f]{40}$/i.test(to)) throw new Error('第 ' + (index + 1) + ' 条 call 的 to 不是有效地址。')
      next.to = '0x' + to.slice(2)
    }
    if (data) {
      if (!/^0x([0-9a-f]{2})*$/i.test(data)) throw new Error('第 ' + (index + 1) + ' 条 call 的 data 必须是偶数长度十六进制字节。')
      next.data = '0x' + data.slice(2).toLowerCase()
    }
    const value = normalizeValue(call.value)
    if (value !== undefined) next.value = value
    const capabilities = parseJsonRecord(call.capabilities, '第 ' + (index + 1) + ' 条 call capabilities')
    if (capabilities) next.capabilities = capabilities
    return next
  })
  const request: JsonRecord = {
    version,
    chainId,
    atomicRequired: input.atomicRequired,
    calls,
  }
  if (input.id?.trim()) request.id = input.id.trim()
  if (input.from?.trim()) {
    if (!/^0x[0-9a-f]{40}$/i.test(input.from.trim())) throw new Error('from 不是有效地址。')
    request.from = '0x' + input.from.trim().slice(2)
  }
  const capabilities = parseJsonRecord(input.capabilities, '全局 capabilities')
  if (capabilities) request.capabilities = capabilities
  return [request]
}

export function encodeErc20Transfer(recipient: string, amount: string, decimals: string): string {
  const enteredAddress = recipient.trim()
  if (!/^0x[0-9a-f]{40}$/i.test(enteredAddress)) throw new Error('接收地址不是有效地址。')
  const address = '0x' + enteredAddress.slice(2).toLowerCase()
  const decimalPlaces = Number(decimals)
  if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 255) {
    throw new Error('Token decimals 必须是 0 到 255 的整数。')
  }
  const amountParts = amount.trim().split('.')
  if (amountParts.length > 2 || !/^[0-9]+$/.test(amountParts[0] ?? '') || (amountParts[1] && !/^[0-9]+$/.test(amountParts[1]))) {
    throw new Error('Token 数量格式无效。')
  }
  const fraction = amountParts[1] ?? ''
  if (fraction.length > decimalPlaces) throw new Error('Token 小数位不能超过 decimals。')
  const units = BigInt(amountParts[0] ?? '0') * (10n ** BigInt(decimalPlaces))
    + BigInt((fraction + '0'.repeat(decimalPlaces)).slice(0, decimalPlaces) || '0')
  if (units >= (1n << 256n)) throw new Error('Token 数量超出 uint256 范围。')
  const encodedAddress = address.slice(2).toLowerCase().padStart(64, '0')
  const encodedAmount = units.toString(16).padStart(64, '0')
  return '0xa9059cbb' + encodedAddress + encodedAmount
}

export function errorDetails(error: unknown): { code?: number; message: string; label?: string; raw?: unknown } {
  const candidate = error && typeof error === 'object' ? error as RpcErrorShape : undefined
  const code = typeof candidate?.code === 'number' ? candidate.code : undefined
  const message =
    (typeof candidate?.shortMessage === 'string' && candidate.shortMessage) ||
    (typeof candidate?.message === 'string' && candidate.message) ||
    (error instanceof Error ? error.message : typeof error === 'string' ? error : '未知错误')
  return {
    code,
    message,
    label: code === undefined ? undefined : ERROR_LABELS[code],
    raw: serializeError(error),
  }
}

export function formatJson(value: unknown): string {
  if (value === undefined) return 'undefined'
  try {
    return JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item, 2) ?? 'undefined'
  } catch {
    return String(value)
  }
}

function serializeError(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') return value
  if (depth >= 4) return '[error details truncated]'
  if (seen.has(value)) return '[circular]'
  seen.add(value)
  if (value instanceof Error) {
    const candidate = value as Error & { code?: unknown; data?: unknown; shortMessage?: unknown; cause?: unknown }
    return {
      name: value.name,
      message: value.message,
      code: candidate.code,
      shortMessage: candidate.shortMessage,
      data: serializeError(candidate.data, depth + 1, seen),
      cause: serializeError(candidate.cause, depth + 1, seen),
    }
  }
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => serializeError(item, depth + 1, seen))
  return Object.fromEntries(Object.entries(value).slice(0, 30).map(([key, item]) => [
    key,
    serializeError(item, depth + 1, seen),
  ]))
}
