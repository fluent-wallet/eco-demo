import assert from 'node:assert/strict'

import { assertPaymasterSponsorship } from '../src/lib/paymasterSponsorship.ts'

const paymasterAddress = '0x0000000000000000000000000000000000000002'
const userOperation = {
  sender: '0x0000000000000000000000000000000000000001',
  nonce: 0n,
  callData: '0x',
  callGasLimit: 100n,
  verificationGasLimit: 100n,
  preVerificationGas: 100n,
  maxFeePerGas: 1n,
  maxPriorityFeePerGas: 1n,
  paymaster: paymasterAddress,
  paymasterVerificationGasLimit: 10n,
  paymasterPostOpGasLimit: 10n,
  paymasterData: '0x',
  signature: '0x',
}

let capturedUserOperation
await assertPaymasterSponsorship({
  publicClient: {
    readContract: async ({ args }) => {
      capturedUserOperation = args[0]
      return [true, '']
    },
  },
  paymasterAddress,
  userOperation,
})
assert.equal(capturedUserOperation.initCode, '0x')
assert.equal(capturedUserOperation.paymasterAndData.startsWith(paymasterAddress), true)

await assert.rejects(
  () =>
    assertPaymasterSponsorship({
      publicClient: {
        readContract: async () => [false, 'Target call not whitelisted'],
      },
      paymasterAddress,
      userOperation,
    }),
  /Paymaster 不支持为当前 UserOperation 代付：Target call not whitelisted/,
)

await assert.doesNotReject(() =>
  assertPaymasterSponsorship({
    publicClient: {
      readContract: async () => {
        throw new Error('function selector was not recognized')
      },
    },
    paymasterAddress,
    userOperation,
  }),
)

console.log('paymasterSponsorship fixtures passed')
