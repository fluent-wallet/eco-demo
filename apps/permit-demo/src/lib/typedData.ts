import {
  bytesToHex,
  getTypesForEIP712Domain,
  hashStruct,
  serializeTypedData,
  type Address,
  type Hex,
  type TypedDataDomain,
} from 'viem'

export type TypedDataField = { readonly name: string; readonly type: string }

export type BuiltTypedData = {
  domain: Record<string, unknown>
  types: Record<string, readonly TypedDataField[]>
  primaryType: string
  message: Record<string, unknown>
}

export const MAX_UINT256 = (1n << 256n) - 1n
export const MAX_UINT160 = (1n << 160n) - 1n
export const MAX_UINT48 = (1n << 48n) - 1n

function assertUint(value: bigint, bits: number, label: string) {
  const maximum = (1n << BigInt(bits)) - 1n
  if (value < 0n || value > maximum) {
    throw new Error(`${label} 必须在 uint${bits} 范围内。`)
  }
}

export const ERC2612_TYPES = {
  Permit: [
    { name: 'owner', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'value', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const

export const DAI_PERMIT_TYPES = {
  Permit: [
    { name: 'holder', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expiry', type: 'uint256' },
    { name: 'allowed', type: 'bool' },
  ],
} as const

export type DaiAllowedValue = boolean | 'true' | 'false'

export const PERMIT2_ALLOWANCE_TYPES = {
  PermitSingle: [
    { name: 'details', type: 'PermitDetails' },
    { name: 'spender', type: 'address' },
    { name: 'sigDeadline', type: 'uint256' },
  ],
  PermitDetails: [
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint160' },
    { name: 'expiration', type: 'uint48' },
    { name: 'nonce', type: 'uint48' },
  ],
} as const

export const PERMIT2_BATCH_ALLOWANCE_TYPES = {
  PermitBatch: [
    { name: 'details', type: 'PermitDetails[]' },
    { name: 'spender', type: 'address' },
    { name: 'sigDeadline', type: 'uint256' },
  ],
  PermitDetails: [
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint160' },
    { name: 'expiration', type: 'uint48' },
    { name: 'nonce', type: 'uint48' },
  ],
} as const

export const PERMIT2_SIGNATURE_TYPES = {
  PermitTransferFrom: [
    { name: 'permitted', type: 'TokenPermissions' },
    { name: 'spender', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  TokenPermissions: [
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
} as const

export const PERMIT2_BATCH_SIGNATURE_TYPES = {
  PermitBatchTransferFrom: [
    { name: 'permitted', type: 'TokenPermissions[]' },
    { name: 'spender', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
  TokenPermissions: [
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
} as const

export const PERMIT2_WITNESS_TYPE_STRING =
  'PermitWitness witness)PermitWitness(address recipient,string purpose)TokenPermissions(address token,uint256 amount)'

export const PERMIT2_WITNESS_TYPES = {
  PermitWitnessTransferFrom: [
    { name: 'permitted', type: 'TokenPermissions' },
    { name: 'spender', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
    { name: 'witness', type: 'PermitWitness' },
  ],
  PermitWitness: [
    { name: 'recipient', type: 'address' },
    { name: 'purpose', type: 'string' },
  ],
  TokenPermissions: [
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
  ],
} as const

export function buildErc2612TypedData({
  tokenName,
  version,
  chainId,
  token,
  owner,
  spender,
  value,
  nonce,
  deadline,
}: {
  tokenName: string
  version: string
  chainId: number
  token: Address
  owner: Address
  spender: Address
  value: bigint
  nonce: bigint
  deadline: bigint
}): BuiltTypedData {
  assertUint(value, 256, 'Permit value')
  assertUint(nonce, 256, 'Permit nonce')
  assertUint(deadline, 256, 'Permit deadline')
  return {
    domain: {
      name: tokenName,
      version,
      chainId,
      verifyingContract: token,
    },
    types: ERC2612_TYPES,
    primaryType: 'Permit',
    message: { owner, spender, value, nonce, deadline },
  }
}

export function buildDaiPermitTypedData({
  name,
  chainId,
  verifyingContract,
  holder,
  spender,
  nonce,
  expiry,
  allowed,
}: {
  name: string
  chainId: number
  verifyingContract: Address
  holder: Address
  spender: Address
  nonce: bigint
  expiry: bigint
  allowed: DaiAllowedValue
}): BuiltTypedData {
  assertUint(nonce, 256, 'Dai Permit nonce')
  assertUint(expiry, 256, 'Dai Permit expiry')
  if (
    allowed !== true &&
    allowed !== false &&
    allowed !== 'true' &&
    allowed !== 'false'
  ) {
    throw new Error('Dai Permit allowed 只能是布尔值或字符串 true/false。')
  }
  return {
    domain: {
      name,
      chainId,
      verifyingContract,
    },
    types: DAI_PERMIT_TYPES,
    primaryType: 'Permit',
    message: { holder, spender, nonce, expiry, allowed },
  }
}

export function buildPermit2AllowanceTypedData({
  chainId,
  permit2,
  token,
  spender,
  amount,
  expiration,
  nonce,
  sigDeadline,
}: {
  chainId: number
  permit2: Address
  token: Address
  spender: Address
  amount: bigint
  expiration: bigint
  nonce: bigint
  sigDeadline: bigint
}): BuiltTypedData {
  assertUint(amount, 160, 'Permit2 amount')
  assertUint(expiration, 48, 'Permit2 expiration')
  assertUint(nonce, 48, 'Permit2 nonce')
  assertUint(sigDeadline, 256, 'Permit2 sigDeadline')
  return {
    domain: { name: 'Permit2', chainId, verifyingContract: permit2 },
    types: PERMIT2_ALLOWANCE_TYPES,
    primaryType: 'PermitSingle',
    message: {
      details: { token, amount, expiration, nonce },
      spender,
      sigDeadline,
    },
  }
}

export function buildPermit2BatchAllowanceTypedData({
  chainId,
  permit2,
  details,
  spender,
  sigDeadline,
}: {
  chainId: number
  permit2: Address
  details: readonly {
    token: Address
    amount: bigint
    expiration: bigint
    nonce: bigint
  }[]
  spender: Address
  sigDeadline: bigint
}): BuiltTypedData {
  details.forEach((detail, index) => {
    assertUint(detail.amount, 160, `Permit2 batch details[${index}] amount`)
    assertUint(detail.expiration, 48, `Permit2 batch details[${index}] expiration`)
    assertUint(detail.nonce, 48, `Permit2 batch details[${index}] nonce`)
  })
  assertUint(sigDeadline, 256, 'Permit2 batch sigDeadline')
  return {
    domain: { name: 'Permit2', chainId, verifyingContract: permit2 },
    types: PERMIT2_BATCH_ALLOWANCE_TYPES,
    primaryType: 'PermitBatch',
    message: { details, spender, sigDeadline },
  }
}

export function buildPermit2SignatureTypedData({
  chainId,
  permit2,
  token,
  spender,
  amount,
  nonce,
  deadline,
}: {
  chainId: number
  permit2: Address
  token: Address
  spender: Address
  amount: bigint
  nonce: bigint
  deadline: bigint
}): BuiltTypedData {
  assertUint(amount, 256, 'SignatureTransfer amount')
  assertUint(nonce, 256, 'SignatureTransfer nonce')
  assertUint(deadline, 256, 'SignatureTransfer deadline')
  return {
    domain: { name: 'Permit2', chainId, verifyingContract: permit2 },
    types: PERMIT2_SIGNATURE_TYPES,
    primaryType: 'PermitTransferFrom',
    message: {
      permitted: { token, amount },
      spender,
      nonce,
      deadline,
    },
  }
}

export function buildPermit2BatchSignatureTypedData({
  chainId,
  permit2,
  permitted,
  spender,
  nonce,
  deadline,
}: {
  chainId: number
  permit2: Address
  permitted: readonly { token: Address; amount: bigint }[]
  spender: Address
  nonce: bigint
  deadline: bigint
}): BuiltTypedData {
  permitted.forEach((permission, index) => {
    assertUint(permission.amount, 256, `Permit2 batch permitted[${index}] amount`)
  })
  assertUint(nonce, 256, 'Permit2 batch nonce')
  assertUint(deadline, 256, 'Permit2 batch deadline')
  return {
    domain: { name: 'Permit2', chainId, verifyingContract: permit2 },
    types: PERMIT2_BATCH_SIGNATURE_TYPES,
    primaryType: 'PermitBatchTransferFrom',
    message: { permitted, spender, nonce, deadline },
  }
}

export function buildPermit2WitnessTypedData({
  chainId,
  permit2,
  token,
  spender,
  amount,
  nonce,
  deadline,
  witness,
}: {
  chainId: number
  permit2: Address
  token: Address
  spender: Address
  amount: bigint
  nonce: bigint
  deadline: bigint
  witness: {
    recipient: Address
    purpose: string
  }
}): BuiltTypedData {
  assertUint(amount, 256, 'Permit2 witness amount')
  assertUint(nonce, 256, 'Permit2 witness nonce')
  assertUint(deadline, 256, 'Permit2 witness deadline')
  return {
    domain: { name: 'Permit2', chainId, verifyingContract: permit2 },
    types: PERMIT2_WITNESS_TYPES,
    primaryType: 'PermitWitnessTransferFrom',
    message: {
      permitted: { token, amount },
      spender,
      nonce,
      deadline,
      witness,
    },
  }
}

export function rpcTypedData(typedData: BuiltTypedData) {
  return {
    ...typedData,
    types: {
      EIP712Domain: getTypesForEIP712Domain({
        domain: typedData.domain as TypedDataDomain,
      }),
      ...typedData.types,
    },
  }
}

export function stringifyJson(value: unknown) {
  return JSON.stringify(
    value,
    (_, item) => (typeof item === 'bigint' ? item.toString() : item),
    2,
  )
}

export function stringifyRpcTypedData(typedData: BuiltTypedData) {
  return serializeTypedData(rpcTypedData(typedData) as never)
}

export function hashPermit2Witness(witness: {
  recipient: Address
  purpose: string
}): Hex {
  return hashStruct({
    types: { PermitWitness: PERMIT2_WITNESS_TYPES.PermitWitness },
    primaryType: 'PermitWitness',
    data: witness,
  } as never)
}

export function randomUint256(): bigint {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return BigInt(bytesToHex(bytes))
}

export function splitSignature(signature: string): {
  v: number
  r: Hex
  s: Hex
} {
  const normalized = signature.trim()
  const body = normalized.startsWith('0x') ? normalized.slice(2) : normalized
  if (!/^[0-9a-fA-F]{130}$/.test(body)) {
    throw new Error('signature 必须是 65 字节十六进制签名。')
  }

  return {
    r: `0x${body.slice(0, 64)}` as Hex,
    s: `0x${body.slice(64, 128)}` as Hex,
    v: Number.parseInt(body.slice(128), 16),
  }
}
