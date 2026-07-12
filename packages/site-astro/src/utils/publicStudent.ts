type InternalAccountFields = 'accountStatus' | 'accountLastLoginAt'

export function toPublicStudent<T extends Record<string, unknown>>(
  student: T,
): Omit<T, InternalAccountFields> {
  const {
    accountStatus: _accountStatus,
    accountLastLoginAt: _accountLastLoginAt,
    ...publicStudent
  } = student
  return publicStudent
}
