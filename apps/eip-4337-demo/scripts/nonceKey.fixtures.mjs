import assert from 'node:assert/strict'
import { parseNonceKey } from '../src/lib/nonceKey.ts'

const MAX_NONCE_KEY = 2n ** 192n - 1n
const TOO_LARGE_NONCE_KEY = 2n ** 192n

function assertNonceKey(rawValue, expected) {
  assert.equal(parseNonceKey(rawValue), expected)
}

function assertThrowsMessage(action, fragment) {
  assert.throws(
    action,
    (caught) => caught instanceof Error && caught.message.includes(fragment),
  )
}

assertNonceKey('', 0n)
assertNonceKey('   ', 0n)
assertNonceKey('0', 0n)
assertNonceKey(' 42 ', 42n)
assertNonceKey(MAX_NONCE_KEY.toString(), MAX_NONCE_KEY)

assertThrowsMessage(
  () => parseNonceKey('-1'),
  'Nonce key 需要填写非负整数。',
)
assertThrowsMessage(
  () => parseNonceKey('1.5'),
  'Nonce key 需要填写非负整数。',
)
assertThrowsMessage(
  () => parseNonceKey('abc'),
  'Nonce key 需要填写非负整数。',
)
assertThrowsMessage(
  () => parseNonceKey(TOO_LARGE_NONCE_KEY.toString()),
  'Nonce key 必须小于 2^192。',
)

console.log('nonceKey fixtures passed')
