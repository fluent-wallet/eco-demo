import assert from 'node:assert/strict'

import {
  needsSmartAccountAuthorization,
  shouldAttachSmartAccountAuthorization,
} from '../src/lib/smartAccountAuthorization.ts'

const implementation = '0x8F5d8d7f3467Dd2e34186E232D8b5a5f35462949'

assert.equal(needsSmartAccountAuthorization(undefined, implementation), true)
assert.equal(
  needsSmartAccountAuthorization(
    '0x8f5d8d7f3467dd2e34186e232d8b5a5f35462949',
    implementation,
  ),
  false,
)
assert.equal(
  needsSmartAccountAuthorization(
    '0x0000000000000000000000000000000000000001',
    implementation,
  ),
  true,
)

assert.equal(
  shouldAttachSmartAccountAuthorization(undefined, implementation, false),
  true,
)
assert.equal(
  shouldAttachSmartAccountAuthorization(
    '0x0000000000000000000000000000000000000001',
    implementation,
    false,
  ),
  false,
)
assert.equal(
  shouldAttachSmartAccountAuthorization(
    '0x0000000000000000000000000000000000000001',
    implementation,
    true,
  ),
  true,
)
assert.equal(
  shouldAttachSmartAccountAuthorization(
    implementation,
    implementation,
    true,
  ),
  false,
)

console.log('smartAccountAuthorization fixtures passed')
