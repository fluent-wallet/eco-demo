import { toPackedUserOperation, type UserOperation } from 'viem/account-abstraction'
import type { PreparedUserOperation } from '../types.ts'

export const PACKED_USER_OPERATION_FORMAT = '[address,uint256,bytes,bytes,bytes32,uint256,bytes32,bytes,bytes][]'
export const PACKED_USER_OPERATION_FIELDS = 'sender, nonce, initCode, callData, accountGasLimits, preVerificationGas, gasFees, paymasterAndData, signature'

export function stringifyPackedUserOperations(requests: PreparedUserOperation[]) {
  const tuples = requests.map((request) => {
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
