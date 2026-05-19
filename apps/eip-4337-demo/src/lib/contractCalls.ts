import {
  encodeFunctionData,
  isAddress,
  type Abi,
  type AbiFunction,
  type AbiParameter,
  type Address,
  type Hex,
} from 'viem'

const CONFLUXSCAN_TESTNET_API = 'https://evmapi-testnet.confluxscan.org/api'

type ConfluxScanAbiResponse = {
  status?: string
  message?: string
  result?: unknown
}

export type WritableAbiFunction = AbiFunction & {
  stateMutability: 'nonpayable' | 'payable'
}

export const FOO_DAPP_ABI = [
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
] as const satisfies Abi

export async function fetchContractAbi(address: Address): Promise<Abi> {
  const url = new URL(CONFLUXSCAN_TESTNET_API)
  url.searchParams.set('module', 'contract')
  url.searchParams.set('action', 'getabi')
  url.searchParams.set('address', address)

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`ABI 查询失败：HTTP ${response.status}`)
  }

  const payload = (await response.json()) as ConfluxScanAbiResponse
  if (payload.status && payload.status !== '1') {
    throw new Error(
      typeof payload.result === 'string'
        ? payload.result
        : payload.message || 'ConfluxScan 未返回可用 ABI。',
    )
  }

  if (typeof payload.result !== 'string') {
    throw new Error('ConfluxScan 返回的 ABI 格式不可用。')
  }

  const parsed = JSON.parse(payload.result) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error('ABI 不是有效的 JSON 数组。')
  }

  return parsed as Abi
}

export function getWritableFunctions(abi: Abi): WritableAbiFunction[] {
  return abi.filter(
    (item): item is WritableAbiFunction =>
      item.type === 'function' &&
      (item.stateMutability === 'nonpayable' ||
        item.stateMutability === 'payable'),
  )
}

export function getFunctionKey(fn: WritableAbiFunction, index: number) {
  const inputs = fn.inputs.map((item) => item.type).join(',')
  return `${fn.name}(${inputs})#${index}`
}

export function formatFunctionSignature(fn: WritableAbiFunction) {
  const inputs = fn.inputs
    .map((item) => `${item.type}${item.name ? ` ${item.name}` : ''}`)
    .join(', ')
  return `${fn.name}(${inputs})`
}

export function encodeWritableFunctionCall(
  fn: WritableAbiFunction,
  values: string[],
): Hex {
  return encodeFunctionData({
    abi: [fn],
    functionName: fn.name,
    args: fn.inputs.map((input, index) => parseAbiValue(input, values[index])),
  } as never)
}

function parseAbiValue(input: AbiParameter, rawValue: string | undefined): unknown {
  const value = rawValue?.trim() ?? ''
  if (input.type.endsWith('[]')) {
    const itemType = input.type.slice(0, -2)
    const items = parseArrayInput(value)
    return items.map((item) => parseAbiValue({ ...input, type: itemType }, item))
  }

  if (input.type === 'tuple' || input.type.startsWith('tuple[')) {
    if (!value) throw new Error(`${getInputLabel(input)} 需要填写 JSON 值。`)
    return JSON.parse(value) as unknown
  }

  if (input.type === 'address') {
    if (!isAddress(value)) {
      throw new Error(`${getInputLabel(input)} 需要是有效地址。`)
    }
    return value
  }

  if (input.type === 'bool') {
    if (value === 'true') return true
    if (value === 'false') return false
    throw new Error(`${getInputLabel(input)} 需要填写 true 或 false。`)
  }

  if (input.type.startsWith('uint') || input.type.startsWith('int')) {
    if (!value) throw new Error(`${getInputLabel(input)} 不能为空。`)
    return BigInt(value)
  }

  if (input.type === 'string') {
    return value
  }

  if (input.type === 'bytes' || /^bytes\d+$/.test(input.type)) {
    if (!value) return '0x'
    return (value.startsWith('0x') ? value : `0x${value}`) as Hex
  }

  if (!value) throw new Error(`${getInputLabel(input)} 不能为空。`)
  return value
}

function parseArrayInput(value: string) {
  if (!value) return []
  if (value.startsWith('[')) {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) {
      throw new Error('数组参数需要填写 JSON 数组。')
    }
    return parsed.map((item) =>
      typeof item === 'string' ? item : JSON.stringify(item),
    )
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function getInputLabel(input: AbiParameter) {
  return input.name ? `${input.name} (${input.type})` : input.type
}
