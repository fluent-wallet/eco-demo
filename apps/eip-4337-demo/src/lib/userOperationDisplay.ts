import { toPackedUserOperation, type UserOperation } from 'viem/account-abstraction'
import type { SignedUserOperation } from '../types.ts'

export const PACKED_USER_OPERATION_FORMAT = '[address,uint256,bytes,bytes,bytes32,uint256,bytes32,bytes,bytes][]'
export const PACKED_USER_OPERATION_FIELDS = 'sender, nonce, initCode, callData, accountGasLimits, preVerificationGas, gasFees, paymasterAndData, signature'

export function stringifyPackedUserOperations(requests: SignedUserOperation[]) {
  const tuples = requests.map((request) => {
    if (!request.signature || !/^0x(?:[0-9a-f]{2})+$/i.test(request.signature)) {
      throw new Error('只能导出已完成真实签名的 UserOperation。')
    }
    for (const field of ['sender', 'nonce', 'callData', 'callGasLimit', 'verificationGasLimit', 'preVerificationGas', 'maxFeePerGas', 'maxPriorityFeePerGas'] as const) {
      if (request[field] === undefined) throw new Error(`UserOperation 缺少 ${field}，无法导出。`)
    }
    const packed = toPackedUserOperation(request as UserOperation)
    return [
      packed.sender,
      packed.nonce,
      packed.initCode,
      packed.callData,
      packed.accountGasLimits,
      packed.preVerificationGas,
      packed.gasFees,
      packed.paymasterAndData,
      packed.signature,
    ]
  })
  return JSON.stringify(tuples, (_, value) => typeof value === 'bigint' ? value.toString() : value, 2)
}
