export function applyUserOperationNonceOffset(
  entryPointNonce: bigint,
  nonceOffset: number,
) {
  if (!Number.isInteger(nonceOffset) || nonceOffset < 0) {
    throw new Error('Nonce offset 需要是非负整数。')
  }

  const sequenceLimit = 2n ** 64n
  const sequenceMask = sequenceLimit - 1n
  const key = entryPointNonce >> 64n
  const sequence = entryPointNonce & sequenceMask
  const nextSequence = sequence + BigInt(nonceOffset)

  if (nextSequence >= sequenceLimit) {
    throw new Error('Nonce offset 超出了当前 Nonce key 的 sequence 范围。')
  }

  return (key << 64n) | nextSequence
}
