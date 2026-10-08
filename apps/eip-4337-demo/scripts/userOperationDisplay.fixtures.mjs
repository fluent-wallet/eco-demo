import assert from 'node:assert/strict'
import { stringifyPackedUserOperations } from '../src/lib/userOperationDisplay.ts'

const address = `0x${'12'.repeat(20)}`
const request = {
  sender: address, nonce: 2n ** 200n, callData: '0xabcd',
  verificationGasLimit: 1n, callGasLimit: 2n,
  maxPriorityFeePerGas: 3n, maxFeePerGas: 4n,
  preVerificationGas: 5n,
}
const [tuple] = JSON.parse(stringifyPackedUserOperations([request]))
assert.deepEqual(tuple, [address, (2n ** 200n).toString(), '0x', '0xabcd',
  `0x${'0'.repeat(31)}1${'0'.repeat(31)}2`, '5',
  `0x${'0'.repeat(31)}3${'0'.repeat(31)}4`, '0x', '0x'])
const signed = { ...request, factory: address, factoryData: '0x1234',
  paymaster: address, paymasterVerificationGasLimit: 6n,
  paymasterPostOpGasLimit: 7n, paymasterData: '0xab', signature: '0xcdef' }
const tuples = JSON.parse(stringifyPackedUserOperations([request, signed]))
assert.equal(tuples.length, 2)
assert.equal(tuples[1][2], `${address}1234`)
assert.equal(tuples[1][7], `${address}${'0'.repeat(31)}6${'0'.repeat(31)}7ab`)
assert.equal(tuples[1][8], '0xcdef')
assert.equal(JSON.parse(stringifyPackedUserOperations([{ ...request, factory: '0x7702' }]))[0][2], '0x7702')
assert.equal(stringifyPackedUserOperations([]), '[]')
console.log('userOperationDisplay fixtures passed')
