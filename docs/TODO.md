# TODO

## Next

- Verify the new demo home links work under GitHub Pages subpath deployment; current code uses absolute `/`
- Confirm 4337 guide modal copy, first-open behavior, and whether a visible reset entry is needed
- Decide whether 4337 ABI cache needs visible cache management, such as clear cache or cached-contract selector
- Validate 4337 ABI-driven call builder against contracts with arrays, tuples, payable methods, overloaded methods, and unverified contracts
- Decide root README language policy: Chinese, English, or bilingual

## Engineering

- Add post-build smoke checks for `/`, `/eip-4337/`, `/eip-7702/`
- Add focused tests or a small encode fixture for `apps/eip-4337-demo/src/lib/contractCalls.ts` if the ABI parser grows
- If more demos are added, extract shared header/panel/button primitives instead of repeating styles per app
- Revisit 4337 bundle size only if the warning starts affecting local iteration or Pages load time

## Constraints

- Private-key demos stay test-account only
- 4337 contract method calls require cached/queryable ABI; raw calldata mode was removed from the primary UI
- 4337 Simple7702 wallet flow depends on wallet support for EIP-7702 authorization signing
- Bundler packing behavior for multiple UserOps is RPC-implementation dependent
