import assert from 'node:assert/strict'
import { decodeFunctionData } from 'viem'
import {
  encodeWritableFunctionCall,
  formatFunctionSignature,
  getFunctionKey,
  getWritableFunctions,
} from '../src/lib/contractCalls.ts'

const TARGET_ADDRESS = '0x000000000000000000000000000000000000dEaD'
const OWNER_ADDRESS = '0x0000000000000000000000000000000000000001'
const BYTES32_VALUE =
  '0x1111111111111111111111111111111111111111111111111111111111111111'

function writableFunction(abi, name, signature) {
  const functions = getWritableFunctions(abi)
  const match = functions.find((item) => {
    if (item.name !== name) return false
    return signature ? formatFunctionSignature(item) === signature : true
  })

  assert.ok(match, `missing writable function ${name}`)
  return match
}

function assertThrowsMessage(action, fragment) {
  assert.throws(
    action,
    (caught) => caught instanceof Error && caught.message.includes(fragment),
  )
}

const sampleAbi = [
  {
    type: 'function',
    name: 'configure',
    stateMutability: 'payable',
    inputs: [
      { name: 'target', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'enabled', type: 'bool' },
      { name: 'salt', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setProfile',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'profile',
        type: 'tuple',
        components: [
          { name: 'owner', type: 'address' },
          { name: 'score', type: 'uint256' },
          { name: 'enabled', type: 'bool' },
          { name: 'label', type: 'string' },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setRules',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'rules',
        type: 'tuple[]',
        components: [
          { name: 'account', type: 'address' },
          { name: 'limits', type: 'uint256[]' },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setPair',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'pair', type: 'uint8[2]' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setSelector',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'selector', type: 'bytes4' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setSigned',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'delta', type: 'int256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setPayload',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'payload', type: 'bytes' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setUnnamedTuple',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'item',
        type: 'tuple',
        components: [{ type: 'address' }, { type: 'uint256' }],
      },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setNumbers',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'numbers', type: 'uint256[]' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'overloaded',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'value', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'overloaded',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'value', type: 'string' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'readOnly',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
]

const configure = writableFunction(sampleAbi, 'configure')
assert.equal(
  encodeWritableFunctionCall(configure, [
    TARGET_ADDRESS,
    '42',
    'true',
    BYTES32_VALUE,
  ]),
  '0x1fe852e4000000000000000000000000000000000000000000000000000000000000dead000000000000000000000000000000000000000000000000000000000000002a00000000000000000000000000000000000000000000000000000000000000011111111111111111111111111111111111111111111111111111111111111111',
)

const setProfile = writableFunction(sampleAbi, 'setProfile')
assert.equal(
  encodeWritableFunctionCall(setProfile, [
    JSON.stringify({
      owner: OWNER_ADDRESS,
      score: '7',
      enabled: false,
      label: 'Conflux',
    }),
  ]),
  '0x259ecd64000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000000000000010000000000000000000000000000000000000000000000000000000000000007000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000800000000000000000000000000000000000000000000000000000000000000007436f6e666c757800000000000000000000000000000000000000000000000000',
)

const setRules = writableFunction(sampleAbi, 'setRules')
const decodedRules = decodeFunctionData({
  abi: [setRules],
  data: encodeWritableFunctionCall(setRules, [
    JSON.stringify([
      { account: TARGET_ADDRESS, limits: ['1', '2'] },
      { account: OWNER_ADDRESS, limits: [] },
    ]),
  ]),
})
assert.deepEqual(decodedRules.args, [
  [
    { account: TARGET_ADDRESS, limits: [1n, 2n] },
    { account: OWNER_ADDRESS, limits: [] },
  ],
])

const setSigned = writableFunction(sampleAbi, 'setSigned')
const decodedSigned = decodeFunctionData({
  abi: [setSigned],
  data: encodeWritableFunctionCall(setSigned, ['-42']),
})
assert.deepEqual(decodedSigned.args, [-42n])

const setPayload = writableFunction(sampleAbi, 'setPayload')
const decodedPayload = decodeFunctionData({
  abi: [setPayload],
  data: encodeWritableFunctionCall(setPayload, ['1234abcd']),
})
assert.deepEqual(decodedPayload.args, ['0x1234abcd'])

const setUnnamedTuple = writableFunction(sampleAbi, 'setUnnamedTuple')
const decodedUnnamedTuple = decodeFunctionData({
  abi: [setUnnamedTuple],
  data: encodeWritableFunctionCall(setUnnamedTuple, [
    JSON.stringify({ 0: TARGET_ADDRESS, 1: '9' }),
  ]),
})
assert.deepEqual(decodedUnnamedTuple.args, [[TARGET_ADDRESS, 9n]])

const overloadedFunctions = getWritableFunctions(sampleAbi).filter(
  (item) => item.name === 'overloaded',
)
assert.deepEqual(
  overloadedFunctions.map((item, index) => getFunctionKey(item, index)),
  ['overloaded(uint256)#0', 'overloaded(string)#1'],
)
assert.equal(
  formatFunctionSignature(overloadedFunctions[0]),
  'overloaded(uint256 value)',
)
assert.equal(
  getWritableFunctions(sampleAbi).some((item) => item.name === 'readOnly'),
  false,
)
assert.deepEqual(
  getWritableFunctions([
    {
      type: 'function',
      name: 'onlyRead',
      stateMutability: 'view',
      inputs: [],
      outputs: [{ type: 'uint256' }],
    },
    {
      type: 'event',
      name: 'Updated',
      anonymous: false,
      inputs: [],
    },
  ]),
  [],
)

assertThrowsMessage(
  () =>
    encodeWritableFunctionCall(writableFunction(sampleAbi, 'setPair'), ['[1]']),
  'pair (uint8[2]) 需要 2 个元素',
)
assertThrowsMessage(
  () =>
    encodeWritableFunctionCall(writableFunction(sampleAbi, 'setSelector'), [
      '0x1234567890',
    ]),
  'selector (bytes4) 需要 4 字节',
)
assertThrowsMessage(
  () =>
    encodeWritableFunctionCall(setProfile, [
      '{"owner":"0x0000000000000000000000000000000000000001"}',
    ]),
  'profile (tuple) 缺少 tuple 字段 score',
)
assertThrowsMessage(
  () =>
    encodeWritableFunctionCall(configure, [
      TARGET_ADDRESS,
      '-1',
      'true',
      BYTES32_VALUE,
    ]),
  'amount (uint256) 不能为负数',
)
assertThrowsMessage(
  () =>
    encodeWritableFunctionCall(configure, [
      TARGET_ADDRESS,
      'abc',
      'true',
      BYTES32_VALUE,
    ]),
  'amount (uint256) 需要是整数',
)
assertThrowsMessage(
  () =>
    encodeWritableFunctionCall(writableFunction(sampleAbi, 'setNumbers'), [
      '[1,',
    ]),
  'numbers (uint256[]) 不是有效 JSON',
)
assertThrowsMessage(
  () =>
    encodeWritableFunctionCall(setUnnamedTuple, [
      JSON.stringify({ 0: TARGET_ADDRESS }),
    ]),
  'item (tuple) 缺少 tuple 字段 1',
)

console.log('contractCalls fixtures passed')
