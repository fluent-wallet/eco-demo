import type { Address } from 'viem'
import {
  DEFAULT_BUNDLER_URL,
  DEFAULT_PAYMASTER_ADDRESS,
  ENTRY_POINT_V08_ADDRESS,
  FOO_DAPP_ADDRESS,
  MAINNET_BUNDLER_URL,
  MAINNET_SMART_ACCOUNT_IMPLEMENTATION,
  SIMPLE_ACCOUNT_FACTORY_V08_ADDRESS,
  SMART_ACCOUNT_IMPLEMENTATION,
} from '../constants/contracts'
import { confluxESpaceMainnet, confluxESpaceTestnet } from './chains'

export type Eip4337NetworkId =
  | typeof confluxESpaceTestnet.id
  | typeof confluxESpaceMainnet.id

export type Eip4337Network = {
  id: Eip4337NetworkId
  chain: typeof confluxESpaceTestnet | typeof confluxESpaceMainnet
  bundlerUrl: string
  entryPointAddress: Address
  simpleAccountFactoryAddress: Address
  smartAccountImplementation: Address
  defaultPaymasterAddress?: Address
  defaultFooDappAddress?: Address
  confluxScanApi: string
}

export const EIP_4337_NETWORKS: Record<Eip4337NetworkId, Eip4337Network> = {
  [confluxESpaceTestnet.id]: {
    id: confluxESpaceTestnet.id,
    chain: confluxESpaceTestnet,
    bundlerUrl: DEFAULT_BUNDLER_URL,
    entryPointAddress: ENTRY_POINT_V08_ADDRESS,
    simpleAccountFactoryAddress: SIMPLE_ACCOUNT_FACTORY_V08_ADDRESS,
    smartAccountImplementation: SMART_ACCOUNT_IMPLEMENTATION,
    defaultPaymasterAddress: DEFAULT_PAYMASTER_ADDRESS,
    defaultFooDappAddress: FOO_DAPP_ADDRESS,
    confluxScanApi: 'https://evmapi-testnet.confluxscan.org/api',
  },
  [confluxESpaceMainnet.id]: {
    id: confluxESpaceMainnet.id,
    chain: confluxESpaceMainnet,
    bundlerUrl: MAINNET_BUNDLER_URL,
    entryPointAddress: ENTRY_POINT_V08_ADDRESS,
    simpleAccountFactoryAddress: SIMPLE_ACCOUNT_FACTORY_V08_ADDRESS,
    smartAccountImplementation: MAINNET_SMART_ACCOUNT_IMPLEMENTATION,
    defaultPaymasterAddress: '0xc341DFf0A3A0d05A33dE5a2df898664F0DB3472b',
    confluxScanApi: 'https://evmapi.confluxscan.org/api',
  },
}

export function getEip4337Network(networkId: Eip4337NetworkId) {
  return EIP_4337_NETWORKS[networkId]
}
