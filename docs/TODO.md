# TODO

## Next

- Verify the new demo home links work under GitHub Pages subpath deployment; current code uses absolute `/`
- Confirm 4337 guide modal copy, first-open behavior, and whether a visible reset entry is needed
- Decide root README language policy: Chinese, English, or bilingual

## Engineering

- Add post-build smoke checks for `/`, `/eip-4337/`, `/eip-7702/`
- If more demos are added, extract shared header/panel/button primitives instead of repeating styles per app
- Revisit 4337 bundle size only if the warning starts affecting local iteration or Pages load time

## Constraints

- Private-key demos stay test-account only
- 4337 Simple7702 wallet flow depends on wallet support for EIP-7702 authorization signing
- Bundler packing behavior for multiple UserOps is RPC-implementation dependent

