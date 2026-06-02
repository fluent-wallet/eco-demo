import type { Hex } from 'viem'

const PRIVATE_KEY_PATTERN = /^(0x)?[0-9a-fA-F]{64}$/
const SECP256K1_ORDER =
  0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n

export function normalizePrivateKey(value: string, label = '私钥'): Hex {
  const trimmed = value.trim()
  if (!PRIVATE_KEY_PATTERN.test(trimmed)) {
    throw new Error(`${label}必须是 32 字节十六进制私钥（64 个 hex 字符，可省略 0x）。`)
  }

  const normalized = (trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`) as Hex
  const numericValue = BigInt(normalized)
  if (numericValue <= 0n || numericValue >= SECP256K1_ORDER) {
    throw new Error(`${label}不在 secp256k1 有效私钥范围内。`)
  }

  return normalized
}
