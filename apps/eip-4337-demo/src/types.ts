import type { Address, Hex } from 'viem'

export type PaymasterBalance = {
  label: string
  address: Address
  balance: bigint | null
}

export type PreparedUserOperation = {
  sender?: Address
  nonce?: bigint
  factory?: Address
  factoryData?: Hex
  callData?: Hex
  callGasLimit?: bigint
  verificationGasLimit?: bigint
  preVerificationGas?: bigint
  maxFeePerGas?: bigint
  maxPriorityFeePerGas?: bigint
  paymaster?: Address
  paymasterData?: Hex
  paymasterVerificationGasLimit?: bigint
  paymasterPostOpGasLimit?: bigint
  signature?: Hex
  authorization?: {
    address: Address
    chainId: number
    nonce: number
    yParity?: number
    r?: Hex
    s?: Hex
  }
}

export type UserOperationResult = {
  userOpHash: Hex
  txHash?: Hex
  success?: boolean
  blockNumber?: bigint
  reason?: string
}

export type AccountMode = 'simpleAccount' | 'simple7702'

export type OwnerMode = 'wallet' | 'privateKey'
