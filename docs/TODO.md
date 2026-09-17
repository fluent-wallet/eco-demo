# TODO

## Next

- Confirm 4337 guide modal copy, first-open behavior, and whether a visible reset entry is needed.
- Run funded-account end-to-end UserOperation checks for both 4337 account modes on Mainnet, including the configured Paymaster sponsorship path.
- Decide root README language policy: Chinese, English, or bilingual.
- Consider extracting 7702 private-key normalization/validation into a helper fixture if more input normalization is added.
- Run a funded Conflux eSpace Testnet acceptance pass for the deployed Permit flows, including success, replay, expiry, wrong spender/amount, missing Token approval, batch, witness, and unordered-nonce cases.
- Re-check Permit wallet-provider compatibility for all seven typed-data tabs after future contract redeployments or wallet/RPC upgrades.

## Engineering

- If more demos are added, extract shared header/panel/button primitives instead of repeating styles per app.
- Revisit 4337 bundle size only if the warning starts affecting local iteration or Pages load time.

## Recently Completed

- Added root `pnpm test:fixtures` aggregation for all current EIP-4337 fixture scripts.
- Added post-build Pages smoke checks for `/`, `/eip-4337/`, `/eip-7702/`, and their local HTML asset references.
- Added offline fixtures from real verified ConfluxScan contracts covering nested tuple/array encoding and overloaded methods, plus a manual browser check of their method labels.
- Hardened ABI parsing for canonical tuple signatures, malformed ConfluxScan/cache entries, integer bit ranges, and empty fixed-length bytes.
- Added the `/permit/` app and route with deployed PermitToken, NormalToken, DaiToken, Permit2, and PermitTestSpender defaults; address edits remain session-only.
- Added pure builders and Node fixtures for ERC-2612, DAI-style Permit, Permit2 AllowanceTransfer, SignatureTransfer, batch, and witness typed data, including signature splitting and range checks.
- Added the first-visit six-step React Joyride Tour, with separate signing-workflow and wallet-signature targets plus sticky-header-aware automatic scrolling.
- Moved `最近结果` to the top of the Permit Demo main column and reduced it to one in-memory latest transaction/error activity, with optional collapsed execution details and no history persistence.

## Constraints

- Private-key demos stay test-account only.
- 4337 and 7702 private-key inputs are intentionally plain text for test workflow visibility.
- 4337 and 7702 private-key execution paths must reject values that are not 32-byte hex private keys in the secp256k1 range.
- 4337 bulk Owner private key is optional. Empty value must keep wallet-only bulk send working; non-empty value must be validated and add the private-key-owner batch.
- 7702 private-key inputs are intentionally plain text and auto-prefix `0x` for non-empty input.
- 4337 contract method calls require cached/queryable ABI; raw calldata mode was removed from the primary UI.
- 4337 Simple7702 wallet flow depends on wallet support for EIP-7702 authorization signing.
- 4337 Simple7702 implementation can be customized at runtime; the testnet default is `0x8F5d8d7f3467Dd2e34186E232D8b5a5f35462949`.
- 4337 Simple7702 flows preserve an existing delegation by default. The optional forced-upgrade setting switches to private-key signing and attaches a new authorization when the EOA has no delegation or delegates to a different implementation.
- 4337 Paymaster sponsorship now performs the optional `canSponsor` pre-check after gas preparation and before signing.
- 4337 supports only Conflux eSpace Testnet and Mainnet. Mainnet defaults to Paymaster `0xc341DFf0A3A0d05A33dE5a2df898664F0DB3472b`; users can still override or disable sponsorship at runtime.
- 4337 bulk UserOps avoid same-sequence nonce conflicts by using per-item nonce keys and broadcasting already signed requests in parallel. Bundler packing behavior for multiple UserOps is still RPC-implementation dependent.
- Demo home links are already path-aware; preserve local-shell and GitHub Pages subpath behavior.
- Permit signing intentionally remains available on a mismatched wallet chain for negative/compatibility tests; mint, Token approval, and execution writes require Conflux eSpace Testnet chain `71`.
- Permit contract address edits are page-session state only and must reset to `src/config.ts` defaults after refresh.
- Keep Token→Permit2 approval as an explicit user action; do not silently approve during Permit2 execution.
- Raw Typed Data must remain an unchanged direct `eth_signTypedData_v4` request with no page-side parse, rewrite, or automatic broadcast.
- The Permit Tour is first-visit only via `eco-demo:permit-tour-seen`; preserve its six-step targets and the header-aware scroll behavior when changing layout.
