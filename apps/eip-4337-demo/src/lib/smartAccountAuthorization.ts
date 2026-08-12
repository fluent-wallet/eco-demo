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

export function shouldAttachSmartAccountAuthorization(
  currentDelegation: Address | undefined,
  intendedImplementation: Address,
  forceUpgrade: boolean,
) {
  if (currentDelegation === undefined) return true
  return forceUpgrade
    ? needsSmartAccountAuthorization(currentDelegation, intendedImplementation)
    : false
}
