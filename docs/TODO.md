# TODO

## Next

- Confirm 4337 guide modal copy, first-open behavior, and whether a visible reset entry is needed.
- Decide whether 4337 ABI cache needs visible cache management, such as clear cache or cached-contract selector.
- Add focused encode tests or fixtures for `apps/eip-4337-demo/src/lib/contractCalls.ts`.
- Validate ABI-driven call builder with real verified contracts that include nested tuples/arrays and overloaded methods.
- Check ConfluxScan edge cases: unverified contracts, malformed ABI payloads, and contracts with no writable methods.
- Add focused coverage or fixtures for UserOperation nonce key parsing and bulk nonce offset behavior.
- Decide root README language policy: Chinese, English, or bilingual.

## Engineering

- Add post-build smoke checks for `/`, `/eip-4337/`, `/eip-7702/`.
- If more demos are added, extract shared header/panel/button primitives instead of repeating styles per app.
- Revisit 4337 bundle size only if the warning starts affecting local iteration or Pages load time.

## Constraints

- Private-key demos stay test-account only.
- 4337 contract method calls require cached/queryable ABI; raw calldata mode was removed from the primary UI.
- 4337 Simple7702 wallet flow depends on wallet support for EIP-7702 authorization signing.
- Bundler packing behavior for multiple UserOps is RPC-implementation dependent.
- Demo home links are already path-aware; preserve local-shell and GitHub Pages subpath behavior.
