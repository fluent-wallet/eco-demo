# TODO

## Near Term

- Confirm the 4337 guide modal copy and first-open behavior with product expectations.
- Consider adding a visible “reset guide prompt” action only if users need to re-enable first-open behavior during testing.
- Decide whether root README should be Chinese, English, or bilingual.

## Maintenance

- When adding a demo, update both local dev routing and GitHub Pages build routing.
- Keep app ports stable or update `scripts/dev.mjs`, root iframes, and README together.
- Run `pnpm lint` and `pnpm build` before pushing.

## Potential Improvements

- Add shared UI primitives if a third demo repeats panel/modal/button patterns.
- Add automated smoke checks for Pages routes after `pnpm build`.
- Reduce large chunk warnings in the 4337 build if bundle size becomes a practical issue.

## Known Constraints

- Private-key demos must remain test-account only.
- 4337 Simple7702 wallet flow depends on wallet support for EIP-7702 authorization signing.
- Bundler behavior for packing multiple UserOps into one bundle transaction is implementation-dependent.

