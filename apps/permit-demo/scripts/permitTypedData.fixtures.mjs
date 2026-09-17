import assert from 'node:assert/strict'
import { spenderAbi, tokenAbi } from '../src/abi.ts'
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
} from '../src/lib/typedData.ts'

const token = '0x0000000000000000000000000000000000000001'
const owner = '0x0000000000000000000000000000000000000002'
const spender = '0x0000000000000000000000000000000000000003'
const permit2 = '0x0000000000000000000000000000000000000004'

const daiBooleanFalse = buildDaiPermitTypedData({
  name: 'Dai Stablecoin',
  chainId: 71,
  verifyingContract: token,
  holder: owner,
  spender,
  nonce: 7n,
  expiry: 1000n,
  allowed: false,
})
assert.equal(daiBooleanFalse.primaryType, 'Permit')
assert.deepEqual(
  daiBooleanFalse.types.Permit.map(({ name, type }) => ({ name, type })),
  [
    { name: 'holder', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expiry', type: 'uint256' },
    { name: 'allowed', type: 'bool' },
  ],
)
assert.equal(daiBooleanFalse.message.allowed, false)
assert.equal(daiBooleanFalse.domain.version, undefined)

const daiStringFalse = buildDaiPermitTypedData({
  name: 'Dai Stablecoin',
  chainId: 71,
  verifyingContract: token,
  holder: owner,
  spender,
  nonce: 7n,
  expiry: 1000n,
  allowed: 'false',
})
assert.equal(daiStringFalse.message.allowed, 'false')
assert.match(stringifyJson(daiStringFalse), /"allowed": "false"/)
assert.match(stringifyRpcTypedData(daiStringFalse), /"allowed":"false"/)
assert.throws(
  () => buildDaiPermitTypedData({
    name: 'Dai Stablecoin',
    chainId: 71,
    verifyingContract: token,
    holder: owner,
    spender,
    nonce: 7n,
    expiry: 1000n,
    allowed: 'FALSE',
  }),
  /true\/false/,
)

const erc = buildErc2612TypedData({
  tokenName: 'Permit Test Token',
  version: '1',
  chainId: 71,
  token,
  owner,
  spender,
  value: 100n,
  nonce: 7n,
  deadline: 1000n,
})
assert.equal(erc.primaryType, 'Permit')
assert.equal(erc.domain.verifyingContract, token)
assert.deepEqual(Object.keys(erc.message), [
  'owner',
  'spender',
  'value',
  'nonce',
  'deadline',
])

const allowance = buildPermit2AllowanceTypedData({
  chainId: 71,
  permit2,
  token,
  spender,
  amount: 100n,
  expiration: 2000n,
  nonce: 3n,
  sigDeadline: 3000n,
})
assert.equal(allowance.primaryType, 'PermitSingle')
assert.equal(allowance.domain.version, undefined)
assert.equal(allowance.types.PermitDetails[1].type, 'uint160')

const batchAllowance = buildPermit2BatchAllowanceTypedData({
  chainId: 71,
  permit2,
  details: [
    { token, amount: 100n, expiration: 2000n, nonce: 3n },
    { token: owner, amount: 200n, expiration: 2001n, nonce: 4n },
  ],
  spender,
  sigDeadline: 3000n,
})
assert.equal(batchAllowance.primaryType, 'PermitBatch')
assert.equal(batchAllowance.types.PermitBatch[0].type, 'PermitDetails[]')
assert.equal(batchAllowance.message.details.length, 2)

const signatureTransfer = buildPermit2SignatureTypedData({
  chainId: 71,
  permit2,
  token,
  spender,
  amount: 100n,
  nonce: 123n,
  deadline: 3000n,
})
assert.equal(signatureTransfer.primaryType, 'PermitTransferFrom')
assert.equal(signatureTransfer.types.PermitTransferFrom[1].name, 'spender')
assert.equal(signatureTransfer.message.spender, spender)
assert.equal(signatureTransfer.message.permitted.amount, 100n)

const batchSignatureTransfer = buildPermit2BatchSignatureTypedData({
  chainId: 71,
  permit2,
  permitted: [
    { token, amount: 100n },
    { token: owner, amount: 200n },
  ],
  spender,
  nonce: 123n,
  deadline: 3000n,
})
assert.equal(batchSignatureTransfer.primaryType, 'PermitBatchTransferFrom')
assert.equal(batchSignatureTransfer.types.PermitBatchTransferFrom[0].type, 'TokenPermissions[]')
assert.equal(batchSignatureTransfer.message.spender, spender)
assert.equal(batchSignatureTransfer.message.permitted.length, 2)

const witnessTransfer = buildPermit2WitnessTypedData({
  chainId: 71,
  permit2,
  token,
  spender,
  amount: 100n,
  nonce: 123n,
  deadline: 3000n,
  witness: { recipient: owner, purpose: 'fixture' },
})
assert.equal(witnessTransfer.primaryType, 'PermitWitnessTransferFrom')
assert.equal(witnessTransfer.types.PermitWitnessTransferFrom[4].type, 'PermitWitness')
assert.deepEqual(witnessTransfer.message.witness, {
  recipient: owner,
  purpose: 'fixture',
})
assert.match(PERMIT2_WITNESS_TYPE_STRING, /PermitWitness witness\)/)
assert.match(PERMIT2_WITNESS_TYPE_STRING, /TokenPermissions\(address token,uint256 amount\)$/)
const witnessHash = hashPermit2Witness({ recipient: owner, purpose: 'fixture' })
assert.match(witnessHash, /^0x[0-9a-f]{64}$/)
assert.equal(
  witnessHash,
  hashPermit2Witness({ recipient: owner, purpose: 'fixture' }),
)

const signatureTransferAbi = spenderAbi.find(
  (item) => item.type === 'function' && item.name === 'permit2SignatureTransfer',
)
assert.ok(signatureTransferAbi)
const permitTuple = signatureTransferAbi.inputs[1]
assert.equal(permitTuple.type, 'tuple')
assert.deepEqual(
  permitTuple.components.map(({ name, type }) => ({ name, type })),
  [
    { name: 'permitted', type: 'tuple' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
)
assert.equal(permitTuple.components.some(({ name }) => name === 'spender'), false)

const daiExecutionAbi = spenderAbi.find(
  (item) => item.type === 'function' && item.name === 'daiPermitAndTransfer',
)
assert.ok(daiExecutionAbi)
assert.deepEqual(
  daiExecutionAbi.inputs.map(({ name, type }) => ({ name, type })),
  [
    { name: 'token', type: 'address' },
    { name: 'owner', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expiry', type: 'uint256' },
    { name: 'allowed', type: 'bool' },
    { name: 'v', type: 'uint8' },
    { name: 'r', type: 'bytes32' },
    { name: 's', type: 'bytes32' },
    { name: 'amount', type: 'uint256' },
  ],
)
const daiPermitAbi = tokenAbi.find(
  (item) => item.type === 'function' && item.name === 'permit',
)
assert.ok(daiPermitAbi)
assert.deepEqual(
  daiPermitAbi.inputs.map(({ name, type }) => ({ name, type })),
  [
    { name: 'holder', type: 'address' },
    { name: 'spender', type: 'address' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expiry', type: 'uint256' },
    { name: 'allowed', type: 'bool' },
    { name: 'v', type: 'uint8' },
    { name: 'r', type: 'bytes32' },
    { name: 's', type: 'bytes32' },
  ],
)

for (const functionName of [
  'permit2BatchAllowanceTransfer',
  'permit2BatchSignatureTransfer',
  'permit2WitnessTransfer',
]) {
  assert.ok(
    spenderAbi.some(
      (item) => item.type === 'function' && item.name === functionName,
    ),
  )
}

assert.throws(
  () => buildErc2612TypedData({
    tokenName: 'Permit Test Token',
    version: '1',
    chainId: 71,
    token,
    owner,
    spender,
    value: 1n << 256n,
    nonce: 0n,
    deadline: 1000n,
  }),
  /uint256/,
)
assert.throws(
  () => buildErc2612TypedData({
    tokenName: 'Permit Test Token',
    version: '1',
    chainId: 71,
    token,
    owner,
    spender,
    value: 100n,
    nonce: 0n,
    deadline: -1n,
  }),
  /deadline.*uint256/,
)
assert.throws(
  () => buildDaiPermitTypedData({
    name: 'Dai Stablecoin',
    chainId: 71,
    verifyingContract: token,
    holder: owner,
    spender,
    nonce: 1n << 256n,
    expiry: 1000n,
    allowed: true,
  }),
  /nonce.*uint256/,
)
assert.throws(
  () => buildPermit2AllowanceTypedData({
    chainId: 71,
    permit2,
    token,
    spender,
    amount: 1n << 160n,
    expiration: 2000n,
    nonce: 3n,
    sigDeadline: 3000n,
  }),
  /amount.*uint160/,
)
assert.throws(
  () => buildPermit2AllowanceTypedData({
    chainId: 71,
    permit2,
    token,
    spender,
    amount: 100n,
    expiration: 1n << 48n,
    nonce: 3n,
    sigDeadline: 3000n,
  }),
  /expiration.*uint48/,
)
assert.throws(
  () => buildPermit2SignatureTypedData({
    chainId: 71,
    permit2,
    token,
    spender,
    amount: 100n,
    nonce: 1n << 256n,
    deadline: 3000n,
  }),
  /nonce.*uint256/,
)
assert.throws(
  () => buildPermit2BatchAllowanceTypedData({
    chainId: 71,
    permit2,
    details: [{ token, amount: 1n << 160n, expiration: 2000n, nonce: 3n }],
    spender,
    sigDeadline: 3000n,
  }),
  /amount.*uint160/,
)
assert.throws(
  () => buildPermit2BatchSignatureTypedData({
    chainId: 71,
    permit2,
    permitted: [{ token, amount: 100n }],
    spender,
    nonce: 0n,
    deadline: 1n << 256n,
  }),
  /deadline.*uint256/,
)

const json = stringifyJson(erc)
assert.match(json, /"value": "100"/)
const rpcJson = stringifyRpcTypedData(signatureTransfer)
assert.match(rpcJson, /"EIP712Domain"/)
assert.match(rpcJson, /"spender":"0x0000000000000000000000000000000000000003"/)
assert.match(stringifyRpcTypedData(witnessTransfer), /"PermitWitness"/)

const parts = splitSignature(`0x${'11'.repeat(64)}1b`)
assert.equal(parts.v, 27)
assert.equal(parts.r, `0x${'11'.repeat(32)}`)
assert.equal(parts.s, `0x${'11'.repeat(32)}`)

const nonce = randomUint256()
assert.ok(nonce >= 0n && nonce < 2n ** 256n)

console.log('Permit typed-data fixtures passed.')
