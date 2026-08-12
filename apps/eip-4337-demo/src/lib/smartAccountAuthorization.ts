import { isAddressEqual, type Address } from 'viem'

export function needsSmartAccountAuthorization(
  currentDelegation: Address | undefined,
  intendedImplementation: Address,
) {
  return (
    currentDelegation === undefined ||
    !isAddressEqual(currentDelegation, intendedImplementation)
  )
}
