import assert from 'node:assert/strict'
import { decodeFunctionData } from 'viem'
import {
  encodeWritableFunctionCall,
  formatFunctionSignature,
  getFunctionKey,
  getWritableFunctions,
} from '../src/lib/contractCalls.ts'

const FIRST_OWNER = '0x0000000000000000000000000000000000000001'
const SECOND_OWNER = '0x0000000000000000000000000000000000000002'
const RECIPIENT = '0x0000000000000000000000000000000000000003'

// ConfluxScan Mainnet verified ABI excerpt captured on 2026-08-13.
// CFXsContract: 0xC6e865c213C89Ca42A622c5572D19f00d84d7a16
const CFXS_CONTRACT_ABI = [
  {
    inputs: [
      {
        components: [
          {
            internalType: 'uint256[]',
            name: 'inputs',
            type: 'uint256[]',
          },
          {
            components: [
              { internalType: 'address', name: 'owner', type: 'address' },
              { internalType: 'uint256', name: 'amount', type: 'uint256' },
              { internalType: 'string', name: 'data', type: 'string' },
            ],
            internalType: 'struct CFXsContract.OutputCFXsData[]',
            name: 'outputs',
            type: 'tuple[]',
          },
        ],
        internalType: 'struct CFXsContract.Transaction',
        name: '_tx',
        type: 'tuple',
      },
    ],
    name: 'processTransaction',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
]

// ConfluxScan Mainnet verified ABI excerpts captured on 2026-08-13.
// CFXsContractMain: 0xD3a4d837e0a7b40De0B4024FA0f93127dD47b8b8
const CFXS_CONTRACT_MAIN_ABI = [
  {
    inputs: [
      { internalType: 'uint256[]', name: 'CFXsIds', type: 'uint256[]' },
      { internalType: 'address', name: '_to', type: 'address' },
    ],
    name: 'transfer',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { internalType: 'uint256', name: 'CFXsId', type: 'uint256' },
      { internalType: 'address', name: '_to', type: 'address' },
    ],
    name: 'transfer',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
]

const [processTransaction] = getWritableFunctions(CFXS_CONTRACT_ABI)
assert.ok(processTransaction, 'missing processTransaction fixture ABI')

const transaction = {
  inputs: ['11', '22'],
  outputs: [
    { owner: FIRST_OWNER, amount: '1000', data: 'first output' },
    { owner: SECOND_OWNER, amount: '2500', data: 'second output' },
  ],
}
const processTransactionData = encodeWritableFunctionCall(
  processTransaction,
  [JSON.stringify(transaction)],
)
const decodedTransaction = decodeFunctionData({
  abi: CFXS_CONTRACT_ABI,
  data: processTransactionData,
})

assert.equal(decodedTransaction.functionName, 'processTransaction')
assert.deepEqual(decodedTransaction.args, [
  {
    inputs: [11n, 22n],
    outputs: [
      { owner: FIRST_OWNER, amount: 1000n, data: 'first output' },
      { owner: SECOND_OWNER, amount: 2500n, data: 'second output' },
    ],
  },
])

const transferFunctions = getWritableFunctions(CFXS_CONTRACT_MAIN_ABI)
assert.equal(transferFunctions.length, 2)

const [batchTransfer, singleTransfer] = transferFunctions
const batchTransferData = encodeWritableFunctionCall(batchTransfer, [
  JSON.stringify(['7', '8']),
  RECIPIENT,
])
const singleTransferData = encodeWritableFunctionCall(singleTransfer, [
  '9',
  RECIPIENT,
])

assert.notEqual(batchTransferData, singleTransferData)
assert.notEqual(batchTransferData.slice(0, 10), singleTransferData.slice(0, 10))

const decodedBatchTransfer = decodeFunctionData({
  abi: CFXS_CONTRACT_MAIN_ABI,
  data: batchTransferData,
})
assert.equal(decodedBatchTransfer.functionName, 'transfer')
assert.deepEqual(decodedBatchTransfer.args, [[7n, 8n], RECIPIENT])

const decodedSingleTransfer = decodeFunctionData({
  abi: CFXS_CONTRACT_MAIN_ABI,
  data: singleTransferData,
})
assert.equal(decodedSingleTransfer.functionName, 'transfer')
assert.deepEqual(decodedSingleTransfer.args, [9n, RECIPIENT])

assert.deepEqual(
  transferFunctions.map((fn, index) => getFunctionKey(fn, index)),
  ['transfer(uint256[],address)#0', 'transfer(uint256,address)#1'],
)
assert.deepEqual(transferFunctions.map(formatFunctionSignature), [
  'transfer(uint256[] CFXsIds, address _to)',
  'transfer(uint256 CFXsId, address _to)',
])

console.log('real-world contractCalls fixtures passed')
