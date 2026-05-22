const USER_OPERATION_NONCE_KEY_LIMIT = 2n ** 192n

export function parseNonceKey(value: string) {
  const normalized = value.trim() || '0'
  if (!/^\d+$/.test(normalized)) {
    throw new Error('Nonce key 需要填写非负整数。')
  }

  const parsed = BigInt(normalized)
  if (parsed >= USER_OPERATION_NONCE_KEY_LIMIT) {
    throw new Error('Nonce key 必须小于 2^192。')
  }

  return parsed
}
