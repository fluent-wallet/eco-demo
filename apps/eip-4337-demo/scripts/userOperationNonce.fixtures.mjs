import assert from 'node:assert/strict'
import { applyUserOperationNonceOffset } from '../src/lib/userOperationNonce.ts'

function assertThrowsMessage(action, fragment) {
  assert.throws(
    action,
    (caught) => caught instanceof Error && caught.message.includes(fragment),
  )
}

assert.equal(applyUserOperationNonceOffset(0n, 0), 0n)
assert.equal(applyUserOperationNonceOffset(15n, 0), 15n)
assert.equal(applyUserOperationNonceOffset(15n, 3), 18n)

const packedNonce = (23n << 64n) | 15n
assert.equal(applyUserOperationNonceOffset(packedNonce, 3), (23n << 64n) | 18n)

assertThrowsMessage(
  () => applyUserOperationNonceOffset(15n, -1),
  'Nonce offset 需要是非负整数。',
)
assertThrowsMessage(
  () => applyUserOperationNonceOffset(15n, 1.5),
  'Nonce offset 需要是非负整数。',
)
assertThrowsMessage(
  () => applyUserOperationNonceOffset((1n << 64n) - 1n, 1),
  'Nonce offset 超出了当前 Nonce key 的 sequence 范围。',
)

console.log('userOperationNonce fixtures passed')
