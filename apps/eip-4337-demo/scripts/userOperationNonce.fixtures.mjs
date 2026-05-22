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
assert.equal(applyUserOperationNonceOffset(2n ** 192n - 10n, 9), 2n ** 192n - 1n)

assertThrowsMessage(
  () => applyUserOperationNonceOffset(15n, -1),
  'Nonce offset 需要是非负整数。',
)
assertThrowsMessage(
  () => applyUserOperationNonceOffset(15n, 1.5),
  'Nonce offset 需要是非负整数。',
)

console.log('userOperationNonce fixtures passed')
