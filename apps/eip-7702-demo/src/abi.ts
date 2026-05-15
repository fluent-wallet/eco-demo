export const abi = [
  {
    inputs: [{ internalType: "uint256", name: "n", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: false, internalType: "uint256", name: "v", type: "uint256" },
    ],
    name: "V",
    type: "event",
  },
  {
    inputs: [{ internalType: "uint256", name: "v", type: "uint256" }],
    name: "f",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "num",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
];
