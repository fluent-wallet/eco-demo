import assert from 'node:assert/strict'
import { privateKeyToAccount } from 'viem/accounts'
import { getUserOperationHash } from 'viem/account-abstraction'
import { verifyMessage } from 'viem'
import { stringifyPackedUserOperations } from '../src/lib/userOperationDisplay.ts'

const address = `0x${'12'.repeat(20)}`
const request = {
  sender: address, nonce: 2n ** 200n, callData: '0xabcd',
  verificationGasLimit: 1n, callGasLimit: 2n,
  maxPriorityFeePerGas: 3n, maxFeePerGas: 4n,
  preVerificationGas: 5n,
}
assert.throws(() => stringifyPackedUserOperations([request]), /真实签名/)
assert.throws(() => stringifyPackedUserOperations([{ ...request, signature: '0x' }]), /真实签名/)
assert.throws(() => stringifyPackedUserOperations([{ ...request, signature: '0xabc' }]), /真实签名/)
const account = privateKeyToAccount('0x' + '01'.repeat(32))
const userOpHash = getUserOperationHash({
  userOperation: request, chainId: 71, entryPointVersion: '0.8',
  entryPointAddress: '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108',
})
const signature = await account.signMessage({ message: { raw: userOpHash } })
request.signature = signature
assert.throws(() => stringifyPackedUserOperations([{ ...request, nonce: undefined }]), /缺少 nonce/)
const [tuple] = JSON.parse(stringifyPackedUserOperations([request]))
assert.deepEqual(tuple, [address, (2n ** 200n).toString(), '0x', '0xabcd',
  `0x${'0'.repeat(31)}1${'0'.repeat(31)}2`, '5',
  `0x${'0'.repeat(31)}3${'0'.repeat(31)}4`, '0x', signature])
const signed = { ...request, factory: address, factoryData: '0x1234',
  paymaster: address, paymasterVerificationGasLimit: 6n,
  paymasterPostOpGasLimit: 7n, paymasterData: '0xab', signature: '0xcdef' }
const tuples = JSON.parse(stringifyPackedUserOperations([request, signed]))
assert.equal(tuples.length, 2)
assert.equal(tuples[1][2], `${address}1234`)
assert.equal(tuples[1][7], `${address}${'0'.repeat(31)}6${'0'.repeat(31)}7ab`)
assert.equal(tuples[1][8], '0xcdef')
assert.equal(JSON.parse(stringifyPackedUserOperations([{ ...request, factory: '0x7702' }]))[0][2], '0x7702')
assert.equal(await verifyMessage({ address: account.address, message: { raw: userOpHash }, signature: tuple[8] }), true)
assert.equal(await verifyMessage({ address: account.address, message: { raw: getUserOperationHash({ userOperation: { ...request, nonce: request.nonce + 1n }, chainId: 71, entryPointVersion: '0.8', entryPointAddress: '0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108' }) }, signature: tuple[8] }), false)
assert.equal(stringifyPackedUserOperations([]), '[]')
console.log('userOperationDisplay fixtures passed')
