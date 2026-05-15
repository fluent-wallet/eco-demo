import {
  createWalletClient,
  custom,
  createPublicClient,
  decodeErrorResult,
  encodeFunctionData,
  formatEther,
  http,
  isAddressEqual,
  isAddress,
  createNonceManager,
  type Address,
  type Chain,
  type EIP1193Provider,
  type Hex,
  type WalletClient,
} from 'viem'
import {
  createBundlerClient,
  entryPoint08Abi,
  getUserOperationTypedData,
  toSmartAccount,
  toSimple7702SmartAccount,
} from 'viem/account-abstraction'
import { recoverAuthorizationAddress } from 'viem/utils'
import { privateKeyToAccount, toAccount, type PrivateKeyAccount } from 'viem/accounts'
import { confluxESpaceTestnet } from '../config/chains'
import {
  DEFAULT_PAYMASTER_ADDRESS,
  ENTRY_POINT_V08_ADDRESS,
  SIMPLE_ACCOUNT_FACTORY_V08_ADDRESS,
  SMART_ACCOUNT_IMPLEMENTATION,
} from '../constants/contracts'
import type {
  AccountMode,
  OwnerMode,
  PaymasterBalance,
  PreparedUserOperation,
  UserOperationResult,
} from '../types'

const ENTRY_POINT_BALANCE_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
] as const

const FOO_PRESET_ABI = [
  {
    type: 'event',
    name: 'Deposit',
    anonymous: false,
    inputs: [
      {
        name: 'operator',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
  },
  {
    type: 'event',
    name: 'Transferr',
    anonymous: false,
    inputs: [
      {
        name: 'operator',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
  },
  {
    type: 'event',
    name: 'Withdraw',
    anonymous: false,
    inputs: [
      {
        name: 'operator',
        type: 'address',
        indexed: true,
        internalType: 'address',
      },
    ],
  },
  {
    type: 'function',
    name: 'deposit',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'transfer',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'withdraw',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
] as const

const SIMPLE_ACCOUNT_ABI = [
  {
    type: 'error',
    name: 'ExecuteError',
    inputs: [
      { name: 'index', type: 'uint256' },
      { name: 'error', type: 'bytes' },
    ],
  },
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'dest', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'func', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'executeBatch',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'calls',
        type: 'tuple[]',
        components: [
          { name: 'target', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'data', type: 'bytes' },
        ],
      },
    ],
    outputs: [],
  },
] as const

const SIMPLE_ACCOUNT_FACTORY_ABI = [
  {
    type: 'function',
    name: 'createAccount',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'salt', type: 'uint256' },
    ],
    outputs: [{ name: 'ret', type: 'address' }],
  },
  {
    type: 'function',
    name: 'getAddress',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'salt', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'address' }],
  },
] as const

export type FooCallPreset = 'deposit' | 'transfer' | 'withdraw' | 'custom'

export type DemoConfig = {
  accountMode: AccountMode
  bundlerUrl: string
  entryPointAddress: Address
  paymasterAddress?: Address
  nonceKey?: number
  ownerMode: OwnerMode
  ownerPrivateKey?: Hex
  rpcUrl?: string
}

export type PrepareParams = DemoConfig & {
  walletClient?: WalletClient
  calls: {
    to: Address
    data: Hex
    value?: bigint
  }[]
}

export type SendParams = PrepareParams

function getRpcUrl(rpcUrl?: string) {
  return rpcUrl || confluxESpaceTestnet.rpcUrls.default.http[0]
}

export function normalizeAddress(value: string, fallback: Address): Address {
  return isAddress(value) ? value : fallback
}

export function normalizeHex(value: string): Hex {
  const trimmed = value.trim()
  if (!trimmed) return '0x'
  return (trimmed.startsWith('0x') ? trimmed : `0x${trimmed}`) as Hex
}

export function getFooCallData(preset: FooCallPreset, customData: string): Hex {
  if (preset === 'deposit') {
    return encodeFunctionData({
      abi: FOO_PRESET_ABI,
      functionName: 'deposit',
    })
  }

  if (preset === 'transfer') {
    return encodeFunctionData({
      abi: FOO_PRESET_ABI,
      functionName: 'transfer',
    })
  }

  if (preset === 'withdraw') {
    return encodeFunctionData({
      abi: FOO_PRESET_ABI,
      functionName: 'withdraw',
    })
  }

  return normalizeHex(customData)
}

export function formatCfx(value: bigint | null) {
  if (value === null) return 'unavailable'
  return `${formatEther(value)} CFX`
}

export function stringifyUserOperation(value: unknown) {
  return JSON.stringify(
    value,
    (_key, innerValue) =>
      typeof innerValue === 'bigint' ? innerValue.toString() : innerValue,
    2,
  )
}

function sleep(ms: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms))
}

function isPendingReceiptError(error: unknown) {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('receipt not found') ||
    message.includes('user operation receipt not found') ||
    message.includes('useroperationreceiptnotfound') ||
    message.includes('could not be found') ||
    message.includes('not found')
  )
}

function getWalletProvider(walletClient: WalletClient) {
  return {
    request: walletClient.request.bind(walletClient),
  } as EIP1193Provider
}

function createWalletOwner(walletClient: WalletClient, chain: Chain) {
  const address = walletClient.account?.address
  if (!address) {
    throw new Error('Connect a wallet first.')
  }

  const provider = getWalletProvider(walletClient)
  const signingClient = createWalletClient({
    account: address,
    chain,
    transport: custom(provider),
  })

  return toAccount({
    address,
    async sign() {
      throw new Error(
        'Connected wallet raw hash signing is not used by this demo. Use EIP-712 signing instead.',
      )
    },
    async signMessage({ message }) {
      return signingClient.signMessage({ account: address, message })
    },
    async signTransaction(transaction) {
      return signingClient.signTransaction({
        account: address,
        ...transaction,
      } as never)
    },
    async signTypedData(parameters) {
      return signingClient.signTypedData({
        account: address,
        ...parameters,
      } as never)
    },
    async signAuthorization(authorization) {
      const delegateAddress =
        'address' in authorization
          ? authorization.address
          : authorization.contractAddress
      const request = {
        address: delegateAddress,
        account: address,
        chainId: authorization.chainId,
        from: address,
        nonce: authorization.nonce,
      }
      const rpcAttempts = [
        {
          method: 'wallet_signAuthorization',
          params: [request],
        },
        {
          method: 'eth_sign7702Authorization',
          params: request,
        },
        {
          method: 'wallet_sign7702Authorization',
          params: [request],
        },
      ] as const

      let lastError: unknown
      for (const attempt of rpcAttempts) {
        try {
        const signed = await provider.request({
          method: attempt.method,
          params: attempt.params,
        } as never)

        if (typeof signed === 'object' && signed !== null) {
          await assertAuthorizationSigner(signed, address)
          return signed as never
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('was signed by')) {
          throw error
        }
          lastError = error
        }
      }

      if (lastError instanceof Error) {
        throw new Error(
          `Connected wallet does not support EIP-7702 authorization signing through wallet_signAuthorization, eth_sign7702Authorization, or wallet_sign7702Authorization. Use Owner signer = Private key (debug), SimpleAccount mode, or a wallet that exposes 7702 authorization signing. Last wallet error: ${lastError.message}`,
        )
      }

      throw new Error('Wallet returned an invalid EIP-7702 authorization.')
    },
  })
}

async function assertAuthorizationSigner(
  authorization: unknown,
  expectedAddress: Address,
) {
  const recover = recoverAuthorizationAddress as (parameters: {
    authorization: unknown
  }) => Promise<Address>
  const recovered = await recover({ authorization })
  if (!isAddressEqual(recovered, expectedAddress)) {
    throw new Error(
      `EIP-7702 authorization was signed by ${recovered}, but UserOperation sender is ${expectedAddress}. Make sure the connected wallet account matches the EOA used as sender.`,
    )
  }
}

export async function ensureConfluxTestnet(walletClient: WalletClient) {
  const chainId = await walletClient.getChainId()
  if (chainId === confluxESpaceTestnet.id) return

  try {
    await walletClient.switchChain({ id: confluxESpaceTestnet.id })
  } catch {
    await walletClient.addChain({ chain: confluxESpaceTestnet })
    await walletClient.switchChain({ id: confluxESpaceTestnet.id })
  }
}

async function createClients({
  accountMode,
  walletClient,
  bundlerUrl,
  entryPointAddress,
  nonceKey,
  ownerMode,
  ownerPrivateKey,
  rpcUrl,
}: Omit<PrepareParams, 'calls' | 'paymasterAddress'>, options?: {
  signAuthorization?: boolean
}) {
  if (!bundlerUrl.trim()) {
    throw new Error('Bundler RPC URL is required.')
  }

  if (walletClient) {
    await ensureConfluxTestnet(walletClient)
  }

  const publicClient = createPublicClient({
    chain: confluxESpaceTestnet,
    transport: http(getRpcUrl(rpcUrl)),
  })

  const owner =
    ownerMode === 'privateKey'
      ? ownerPrivateKey
        ? privateKeyToAccount(normalizeHex(ownerPrivateKey))
        : (() => {
            throw new Error('Owner private key is required in debug mode.')
          })()
      : walletClient
        ? createWalletOwner(walletClient, confluxESpaceTestnet)
        : (() => {
            throw new Error('Connect a wallet first.')
          })()

  const entryPoint = {
    abi: entryPoint08Abi,
    address: entryPointAddress,
    version: '0.8' as const,
  }
  const nonceKeyManager = createNonceManager({
    source: {
      get() {
        return nonceKey ?? Date.now()
      },
      set() {},
    },
  })

  const simpleAccountAddressPromise =
    accountMode === 'simpleAccount'
      ? publicClient.readContract({
          abi: SIMPLE_ACCOUNT_FACTORY_ABI,
          address: SIMPLE_ACCOUNT_FACTORY_V08_ADDRESS,
          functionName: 'getAddress',
          args: [owner.address, 0n],
        })
      : undefined

  const account =
    accountMode === 'simpleAccount'
      ? await toSmartAccount({
          client: publicClient,
          entryPoint,
          nonceKeyManager,
          abi: SIMPLE_ACCOUNT_ABI,
          async getAddress() {
            return simpleAccountAddressPromise!
          },
          async getFactoryArgs() {
            const accountAddress = await simpleAccountAddressPromise!
            const bytecode = await publicClient.getCode({ address: accountAddress })
            if (bytecode && bytecode !== '0x') {
              return {
                factory: undefined,
                factoryData: undefined,
              }
            }

            return {
              factory: SIMPLE_ACCOUNT_FACTORY_V08_ADDRESS,
              factoryData: encodeFunctionData({
                abi: SIMPLE_ACCOUNT_FACTORY_ABI,
                functionName: 'createAccount',
                args: [owner.address, 0n],
              }),
            }
          },
          async getStubSignature() {
            return '0xfffffffffffffffffffffffffffffff0000000000000000000000000000000007aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1c'
          },
          async encodeCalls(calls) {
            if (calls.length === 1) {
              return encodeFunctionData({
                abi: SIMPLE_ACCOUNT_ABI,
                functionName: 'execute',
                args: [
                  calls[0].to,
                  calls[0].value ?? 0n,
                  calls[0].data ?? '0x',
                ],
              })
            }

            return encodeFunctionData({
              abi: SIMPLE_ACCOUNT_ABI,
              functionName: 'executeBatch',
              args: [
                calls.map((call) => ({
                  target: call.to,
                  value: call.value ?? 0n,
                  data: call.data ?? '0x',
                })),
              ],
            })
          },
          async decodeCalls() {
            throw new Error('decodeCalls is not implemented in this demo.')
          },
          async signMessage(parameters) {
            return owner.signMessage(parameters)
          },
          async signTypedData(parameters) {
            return owner.signTypedData(parameters)
          },
          async signUserOperation(userOperation) {
            const typedData = getUserOperationTypedData({
              chainId: confluxESpaceTestnet.id,
              entryPointAddress,
              userOperation: {
                ...userOperation,
                sender: await simpleAccountAddressPromise!,
              },
            } as never)

            return owner.signTypedData(typedData)
          },
        })
      : await toSimple7702SmartAccount({
          client: publicClient,
          entryPoint,
          getNonce(parameters) {
            const key = BigInt(nonceKey ?? parameters?.key ?? Date.now())
            return publicClient.readContract({
              abi: entryPoint08Abi,
              address: entryPointAddress,
              functionName: 'getNonce',
              args: [owner.address, key],
            })
          },
          implementation: SMART_ACCOUNT_IMPLEMENTATION,
          owner: owner as PrivateKeyAccount,
        })

  const bundlerClient = createBundlerClient({
    chain: confluxESpaceTestnet,
    client: publicClient,
    transport: http(bundlerUrl.trim()),
  })

  const accountAddress = account.address
  const accountCode = await publicClient.getCode({ address: accountAddress })
  const isAccountDeployed = Boolean(accountCode && accountCode !== '0x')
  const authorization =
    options?.signAuthorization &&
    accountMode === 'simple7702' &&
    !isAccountDeployed
      ? await (async () => {
          const signedAuthorization = await owner.signAuthorization?.({
            address: SMART_ACCOUNT_IMPLEMENTATION,
            chainId: confluxESpaceTestnet.id,
            nonce: await publicClient.getTransactionCount({
              address: owner.address,
              blockTag: 'pending',
            }),
          })
          if (!signedAuthorization) {
            throw new Error('Owner cannot sign EIP-7702 authorization.')
          }
          await assertAuthorizationSigner(signedAuthorization, owner.address)
          return signedAuthorization
        })()
      : undefined

  return {
    account,
    authorization,
    bundlerClient,
    publicClient,
    isAccountDeployed,
    accountMode,
  }
}

function getPrepareParameters(
  accountMode: AccountMode,
  isAccountDeployed: boolean,
) {
  if (accountMode === 'simple7702') {
    const parameters = [
      'fees',
      'gas',
      'paymaster',
      'nonce',
      'signature',
    ] as const
    return isAccountDeployed
      ? parameters
      : (['factory', ...parameters, 'authorization'] as const)
  }

  const parameters = [
    'fees',
    'gas',
    'paymaster',
    'nonce',
    'signature',
  ] as const
  return isAccountDeployed ? parameters : (['factory', ...parameters] as const)
}

export async function prepareDemoUserOperation(
  params: PrepareParams,
): Promise<PreparedUserOperation> {
  const { account, accountMode, bundlerClient, isAccountDeployed } =
    await createClients(params)

  const request = await bundlerClient.prepareUserOperation({
    account,
    parameters: getPrepareParameters(accountMode, isAccountDeployed),
    calls: params.calls,
    ...(params.paymasterAddress ? { paymaster: params.paymasterAddress } : {}),
  } as never)

  return request as PreparedUserOperation
}

export async function sendDemoUserOperation(
  params: SendParams,
): Promise<UserOperationResult> {
  const { account, accountMode, authorization, bundlerClient, isAccountDeployed } =
    await createClients(params, { signAuthorization: true })

  const hash = await bundlerClient.sendUserOperation({
    account,
    parameters: getPrepareParameters(accountMode, isAccountDeployed),
    calls: params.calls,
    ...(authorization ? { authorization } : {}),
    ...(params.paymasterAddress ? { paymaster: params.paymasterAddress } : {}),
  } as never)

  let receipt: Awaited<
    ReturnType<typeof bundlerClient.getUserOperationReceipt>
  >
  for (;;) {
    try {
      receipt = await bundlerClient.getUserOperationReceipt({ hash })
      break
    } catch (error) {
      if (!isPendingReceiptError(error)) throw error
      await sleep(2_000)
    }
  }

  return {
    userOpHash: hash,
    txHash: receipt.receipt.transactionHash,
    success: receipt.success,
    blockNumber: receipt.receipt.blockNumber,
    reason: receipt.reason,
  }
}

export async function loadDiagnostics(
  walletClient?: WalletClient,
  rpcUrl?: string,
  accountMode: AccountMode = 'simpleAccount',
  ownerMode: OwnerMode = 'wallet',
  ownerPrivateKey?: Hex,
): Promise<{
  ownerCode: Hex | undefined
  smartAccountAddress?: Address
  smartAccountBalance: bigint | null
  balances: PaymasterBalance[]
}> {
  const publicClient = createPublicClient({
    chain: confluxESpaceTestnet,
    transport: http(getRpcUrl(rpcUrl)),
  })
  const owner =
    ownerMode === 'privateKey' && ownerPrivateKey
      ? privateKeyToAccount(normalizeHex(ownerPrivateKey)).address
      : walletClient?.account?.address
  const smartAccountAddress =
    owner && accountMode === 'simpleAccount'
      ? await publicClient
          .readContract({
            abi: SIMPLE_ACCOUNT_FACTORY_ABI,
            address: SIMPLE_ACCOUNT_FACTORY_V08_ADDRESS,
            functionName: 'getAddress',
            args: [owner, 0n],
          })
          .catch(() => undefined)
      : owner

  const [ownerCode, smartAccountBalance, paymasterBalance] =
    await Promise.all([
    owner
      ? publicClient.getCode({ address: owner })
      : Promise.resolve(undefined),
    smartAccountAddress
      ? publicClient.getBalance({ address: smartAccountAddress }).catch(() => null)
      : Promise.resolve(null),
    publicClient
      .readContract({
        abi: ENTRY_POINT_BALANCE_ABI,
        address: ENTRY_POINT_V08_ADDRESS,
        functionName: 'balanceOf',
        args: [DEFAULT_PAYMASTER_ADDRESS],
      })
      .catch(() => null),
    ])

  return {
    ownerCode: ownerCode ?? '0x',
    smartAccountAddress,
    smartAccountBalance,
    balances: [
      {
        label: 'Paymaster',
        address: DEFAULT_PAYMASTER_ADDRESS,
        balance: paymasterBalance,
      },
    ],
  }
}

export function explainUserOperationError(error: unknown) {
  if (!(error instanceof Error)) return undefined
  const match = error.message.match(/0x5a154675[0-9a-fA-F]*/)
  if (!match) return undefined

  try {
    const decoded = decodeErrorResult({
      abi: SIMPLE_ACCOUNT_ABI,
      data: match[0] as Hex,
    })
    if (decoded.errorName !== 'ExecuteError') return undefined
    const [index, innerError] = decoded.args
    return `Batch call #${Number(index) + 1} reverted${
      innerError && innerError !== '0x' ? ` with inner error ${innerError}` : ''
    }. For CFX transfers, make sure the smart account itself has enough CFX balance.`
  } catch {
    return undefined
  }
}
