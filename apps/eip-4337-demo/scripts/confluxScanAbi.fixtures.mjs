import assert from 'node:assert/strict'
import {
  getWritableFunctions,
  parseConfluxScanAbiResponse,
} from '../src/lib/contractCalls.ts'

function assertThrowsMessage(action, fragment) {
  assert.throws(
    action,
    (caught) => caught instanceof Error && caught.message.includes(fragment),
  )
}

const writableAbi = [
  {
    type: 'function',
    name: 'write',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
]
const viewOnlyAbi = [
  {
    type: 'function',
    name: 'read',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint256' }],
  },
]

assert.deepEqual(
  parseConfluxScanAbiResponse({
    status: '1',
    message: 'OK',
    result: JSON.stringify(writableAbi),
  }),
  writableAbi,
)
assert.deepEqual(getWritableFunctions(parseConfluxScanAbiResponse({
  status: '1',
  result: JSON.stringify(viewOnlyAbi),
})), [])
assert.deepEqual(parseConfluxScanAbiResponse({ status: '1', result: '[]' }), [])

assertThrowsMessage(
  () =>
    parseConfluxScanAbiResponse({
      status: '0',
      message: 'NOTOK',
      result: 'Contract source code not verified',
    }),
  'Contract source code not verified',
)
assertThrowsMessage(
  () =>
    parseConfluxScanAbiResponse({
      status: '0',
      message: 'NOTOK',
      result: undefined,
    }),
  'NOTOK',
)
assertThrowsMessage(
  () => parseConfluxScanAbiResponse({ status: '1', result: undefined }),
  'ConfluxScan 返回的 ABI 格式不可用。',
)
assertThrowsMessage(
  () => parseConfluxScanAbiResponse({ status: '1', result: '{' }),
  'ConfluxScan 返回的 ABI 不是有效 JSON。',
)
assertThrowsMessage(
  () => parseConfluxScanAbiResponse({ status: '1', result: '{}' }),
  'ABI 不是有效的 JSON 数组。',
)

console.log('confluxScanAbi fixtures passed')
