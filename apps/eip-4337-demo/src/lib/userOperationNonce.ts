export function applyUserOperationNonceOffset(
  entryPointNonce: bigint,
  nonceOffset: number,
) {
  if (!Number.isInteger(nonceOffset) || nonceOffset < 0) {
    throw new Error('Nonce offset 需要是非负整数。')
  }

  return entryPointNonce + BigInt(nonceOffset)
}
