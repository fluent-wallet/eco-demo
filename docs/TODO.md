# TODO

## Next

- Confirm 4337 guide modal copy, first-open behavior, and whether a visible reset entry is needed.
- Validate ABI-driven call builder manually or with fixtures against real verified ConfluxScan contracts that include nested tuples/arrays and overloaded methods.
- Decide root README language policy: Chinese, English, or bilingual.
- Consider a small 7702 fixture or unit helper test for private-key `0x` normalization if more input normalization is added.

## Engineering

- Consider a root-level test script that runs all current 4337 fixture scripts together.
- Add post-build smoke checks for `/`, `/eip-4337/`, `/eip-7702/`.
- If more demos are added, extract shared header/panel/button primitives instead of repeating styles per app.
- Revisit 4337 bundle size only if the warning starts affecting local iteration or Pages load time.

## Constraints

- Private-key demos stay test-account only.
- 7702 private-key inputs are intentionally plain text and auto-prefix `0x` for non-empty input.
- 4337 contract method calls require cached/queryable ABI; raw calldata mode was removed from the primary UI.
- 4337 Simple7702 wallet flow depends on wallet support for EIP-7702 authorization signing.
- Bundler packing behavior for multiple UserOps is RPC-implementation dependent.
- Demo home links are already path-aware; preserve local-shell and GitHub Pages subpath behavior.
