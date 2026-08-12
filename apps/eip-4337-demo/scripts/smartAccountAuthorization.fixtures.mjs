import assert from 'node:assert/strict'

import { needsSmartAccountAuthorization } from '../src/lib/smartAccountAuthorization.ts'

const implementation = '0xD165320665C36b2F8F2BB2EfA5621db7eA012028'

assert.equal(needsSmartAccountAuthorization(undefined, implementation), true)
assert.equal(
  needsSmartAccountAuthorization(
    '0xd165320665c36b2f8f2bb2efa5621db7ea012028',
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

console.log('smartAccountAuthorization fixtures passed')
