import {
  encodeFunctionData,
  isAddress,
  isHex,
  type Abi,
  type AbiFunction,
  type AbiParameter,
  type Address,
  type Hex,
} from 'viem'

type ConfluxScanAbiResponse = {
  status?: string
  message?: string
  result?: unknown
}

export type WritableAbiFunction = AbiFunction & {
  stateMutability: 'nonpayable' | 'payable'
}

type TupleAbiParameter = AbiParameter & {
  components: readonly AbiParameter[]
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

export async function fetchContractAbi(
  address: Address,
  confluxScanApi: string,
): Promise<Abi> {
  const url = new URL(confluxScanApi)
  url.searchParams.set('module', 'contract')
  url.searchParams.set('action', 'getabi')
  url.searchParams.set('address', address)

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`ABI 查询失败：HTTP ${response.status}`)
  }

  const payload = (await response.json()) as ConfluxScanAbiResponse
  return parseConfluxScanAbiResponse(payload)
}

export function parseConfluxScanAbiResponse(
  payload: ConfluxScanAbiResponse,
): Abi {
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

  let parsed: unknown
  try {
    parsed = JSON.parse(payload.result) as unknown
  } catch {
    throw new Error('ConfluxScan 返回的 ABI 不是有效 JSON。')
  }

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
  const args = fn.inputs.map((input, index) =>
    parseAbiValue(input, values[index]),
  )

  try {
    return encodeFunctionData({
      abi: [fn],
      functionName: fn.name,
      args,
    } as never)
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message : '未知编码错误。'
    throw new Error(`ABI 参数编码失败：${message}`)
  }
}

function parseAbiValue(
  input: AbiParameter,
  rawValue: unknown,
  path = getInputLabel(input),
): unknown {
  const arrayType = parseArrayType(input.type)
  if (arrayType) {
    const value = getStringInput(rawValue)
    const items = parseArrayInput(value, path)
    if (arrayType.length !== null && items.length !== arrayType.length) {
      throw new Error(
        `${path} 需要 ${arrayType.length} 个元素，当前为 ${items.length} 个。`,
      )
    }

    return items.map((item, index) =>
      parseAbiValue(
        { ...input, type: arrayType.itemType },
        item,
        `${path}[${index}]`,
      ),
    )
  }

  if (input.type === 'tuple') {
    return parseTupleInput(asTupleInput(input), rawValue, path)
  }

  const value = getStringInput(rawValue)
  if (input.type === 'address') {
    if (!isAddress(value)) {
      throw new Error(`${path} 需要是有效地址。`)
    }
    return value
  }

  if (input.type === 'bool') {
    if (value === 'true') return true
    if (value === 'false') return false
    throw new Error(`${path} 需要填写 true 或 false。`)
  }

  if (input.type.startsWith('uint') || input.type.startsWith('int')) {
    if (!value) throw new Error(`${path} 不能为空。`)
    try {
      const parsed = BigInt(value)
      if (input.type.startsWith('uint') && parsed < 0n) {
        throw new Error(`${path} 不能为负数。`)
      }
      return parsed
    } catch {
      if (input.type.startsWith('uint') && value.startsWith('-')) {
        throw new Error(`${path} 不能为负数。`)
      }
      throw new Error(`${path} 需要是整数。`)
    }
  }

  if (input.type === 'string') {
    return value
  }

  if (input.type === 'bytes' || /^bytes\d+$/.test(input.type)) {
    if (!value) return '0x'
    const hex = (value.startsWith('0x') ? value : `0x${value}`) as Hex
    if (!isHex(hex)) {
      throw new Error(`${path} 需要是十六进制 bytes。`)
    }
    const fixedBytes = input.type.match(/^bytes(\d+)$/)
    if (fixedBytes) {
      const expectedBytes = Number.parseInt(fixedBytes[1], 10)
      const actualBytes = (hex.length - 2) / 2
      if (actualBytes !== expectedBytes) {
        throw new Error(
          `${path} 需要 ${expectedBytes} 字节，当前为 ${actualBytes} 字节。`,
        )
      }
    }
    return hex
  }

  if (!value) throw new Error(`${path} 不能为空。`)
  return value
}

function parseTupleInput(
  input: TupleAbiParameter,
  rawValue: unknown,
  path: string,
) {
  const parsed =
    typeof rawValue === 'string'
      ? parseJsonInput(rawValue, path, 'tuple')
      : rawValue

  if (input.components.length === 0) {
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      Array.isArray(parsed)
    ) {
      throw new Error(`${path} 需要填写 JSON 对象。`)
    }
    return parsed
  }

  if (Array.isArray(parsed)) {
    if (parsed.length !== input.components.length) {
      throw new Error(
        `${path} 需要 ${input.components.length} 个 tuple 字段，当前为 ${parsed.length} 个。`,
      )
    }

    return input.components.map((component, index) =>
      parseAbiValue(component, parsed[index], `${path}.${component.name || index}`),
    )
  }

  if (parsed === null || typeof parsed !== 'object') {
    throw new Error(`${path} 需要填写 JSON 对象或数组。`)
  }

  const record = parsed as Record<string, unknown>
  return input.components.map((component, index) => {
    const key = component.name
    if (key && Object.hasOwn(record, key)) {
      return parseAbiValue(component, record[key], `${path}.${key}`)
    }

    if (Object.hasOwn(record, String(index))) {
      return parseAbiValue(
        component,
        record[String(index)],
        `${path}.${key || index}`,
      )
    }

    throw new Error(`${path} 缺少 tuple 字段 ${key || index}。`)
  })
}

function asTupleInput(input: AbiParameter): TupleAbiParameter {
  const maybeTuple = input as AbiParameter & {
    components?: readonly AbiParameter[]
  }
  return {
    ...input,
    components: maybeTuple.components ?? [],
  }
}

function parseArrayInput(value: string, path: string) {
  if (!value) return []
  if (value.startsWith('[')) {
    const parsed = parseJsonInput(value, path, 'array')
    if (!Array.isArray(parsed)) {
      throw new Error(`${path} 需要填写 JSON 数组。`)
    }
    return parsed
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function parseJsonInput(value: string, path: string, kind: 'array' | 'tuple') {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error(`${path} 需要填写 JSON ${kind === 'array' ? '数组' : '值'}。`)
  }

  try {
    return JSON.parse(trimmed) as unknown
  } catch {
    throw new Error(`${path} 不是有效 JSON。`)
  }
}

function getStringInput(rawValue: unknown) {
  if (rawValue === undefined || rawValue === null) return ''
  if (typeof rawValue === 'string') return rawValue.trim()
  if (typeof rawValue === 'number' || typeof rawValue === 'bigint') {
    return rawValue.toString()
  }
  if (typeof rawValue === 'boolean') return rawValue ? 'true' : 'false'
  return JSON.stringify(rawValue)
}

function parseArrayType(type: string) {
  const match = type.match(/^(.*)\[(\d*)\]$/)
  if (!match) return null

  return {
    itemType: match[1],
    length: match[2] ? Number.parseInt(match[2], 10) : null,
  }
}

function getInputLabel(input: AbiParameter) {
  return input.name ? `${input.name} (${input.type})` : input.type
}
