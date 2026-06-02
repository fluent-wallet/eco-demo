import assert from 'node:assert/strict'

import { normalizePrivateKey } from '../src/lib/privateKey.ts'

const VALID_KEY =
  '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
const VALID_KEY_WITHOUT_PREFIX = VALID_KEY.slice(2)

assert.equal(normalizePrivateKey(VALID_KEY, 'Owner 私钥'), VALID_KEY)
assert.equal(normalizePrivateKey(VALID_KEY_WITHOUT_PREFIX, 'Owner 私钥'), VALID_KEY)

assert.throws(
  () => normalizePrivateKey('0x1234', 'Owner 私钥'),
  /32 字节十六进制私钥/,
)
assert.throws(
  () => normalizePrivateKey(`0x${'g'.repeat(64)}`, 'Owner 私钥'),
  /32 字节十六进制私钥/,
)
assert.throws(
  () => normalizePrivateKey(`0x${'0'.repeat(64)}`, 'Owner 私钥'),
  /secp256k1 有效私钥范围/,
)
assert.throws(
  () =>
    normalizePrivateKey(
      '0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141',
      'Owner 私钥',
    ),
  /secp256k1 有效私钥范围/,
)
