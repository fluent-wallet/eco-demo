# TODO

## Next

- Confirm 4337 guide modal copy, first-open behavior, and whether a visible reset entry is needed.
- Validate ABI-driven call builder manually or with fixtures against real verified ConfluxScan contracts that include nested tuples/arrays and overloaded methods.
- Run funded-account end-to-end UserOperation checks for both 4337 account modes on Mainnet, including the configured Paymaster sponsorship path.
- Decide root README language policy: Chinese, English, or bilingual.
- Consider extracting 7702 private-key normalization/validation into a helper fixture if more input normalization is added.

## Engineering

- Consider a root-level test script that runs all current 4337 fixture scripts together.
- Add post-build smoke checks for `/`, `/eip-4337/`, `/eip-7702/`.
- If more demos are added, extract shared header/panel/button primitives instead of repeating styles per app.
- Revisit 4337 bundle size only if the warning starts affecting local iteration or Pages load time.

## Constraints

- Private-key demos stay test-account only.
- 4337 and 7702 private-key inputs are intentionally plain text for test workflow visibility.
- 4337 and 7702 private-key execution paths must reject values that are not 32-byte hex private keys in the secp256k1 range.
- 4337 bulk Owner private key is optional. Empty value must keep wallet-only bulk send working; non-empty value must be validated and add the private-key-owner batch.
- 7702 private-key inputs are intentionally plain text and auto-prefix `0x` for non-empty input.
- 4337 contract method calls require cached/queryable ABI; raw calldata mode was removed from the primary UI.
- 4337 Simple7702 wallet flow depends on wallet support for EIP-7702 authorization signing.
- 4337 supports only Conflux eSpace Testnet and Mainnet. Mainnet defaults to Paymaster `0xc341DFf0A3A0d05A33dE5a2df898664F0DB3472b`; users can still override or disable sponsorship at runtime.
- 4337 bulk UserOps avoid same-sequence nonce conflicts by using per-item nonce keys and broadcasting already signed requests in parallel. Bundler packing behavior for multiple UserOps is still RPC-implementation dependent.
- Demo home links are already path-aware; preserve local-shell and GitHub Pages subpath behavior.
