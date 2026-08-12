import {
  toPackedUserOperation,
  type UserOperation,
} from 'viem/account-abstraction'
import type { Address } from 'viem'

const PAYMASTER_SPONSOR_ABI = [
  {
    type: 'function',
    name: 'canSponsor',
    stateMutability: 'view',
    inputs: [
      {
        name: 'userOp',
        type: 'tuple',
        components: [
          { name: 'sender', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'initCode', type: 'bytes' },
          { name: 'callData', type: 'bytes' },
          { name: 'accountGasLimits', type: 'bytes32' },
          { name: 'preVerificationGas', type: 'uint256' },
          { name: 'gasFees', type: 'bytes32' },
          { name: 'paymasterAndData', type: 'bytes' },
          { name: 'signature', type: 'bytes' },
        ],
      },
    ],
    outputs: [
      { name: 'sponsorable', type: 'bool' },
      { name: 'reason', type: 'string' },
    ],
  },
] as const

type SponsorshipClient = {
  readContract: (...args: never[]) => Promise<unknown>
}

export async function assertPaymasterSponsorship({
  publicClient,
  paymasterAddress,
  userOperation,
}: {
  publicClient: SponsorshipClient
  paymasterAddress: Address
  userOperation: UserOperation
}) {
  const packedUserOperation = toPackedUserOperation(userOperation)
  let result: readonly [boolean, string]

  try {
    result = (await publicClient.readContract({
      abi: PAYMASTER_SPONSOR_ABI,
      address: paymasterAddress,
      functionName: 'canSponsor',
      args: [packedUserOperation],
    } as never)) as readonly [boolean, string]
  } catch {
    // Treat a failed optional-interface probe as a legacy Paymaster.
    return
  }

  const [sponsorable, reason] = result
  if (!sponsorable) {
    const explanation = reason.trim() || 'Paymaster 拒绝了当前 UserOperation。'
    throw new Error(`Paymaster 不支持为当前 UserOperation 代付：${explanation}`)
  }
}
