type InternalAccountFields = 'accountStatus' | 'accountLastLoginAt'

export function toPublicStudent<T extends Record<string, unknown>>(
  student: T,
): Omit<T, InternalAccountFields> {
  const {
    accountStatus: _accountStatus,
    accountLastLoginAt: _accountLastLoginAt,
    ...publicStudent
  } = student
  const info = publicStudent.info
  if (!info || typeof info !== 'object') return publicStudent

  const { seatNo: _seatNo, dormNo: _dormNo, ...publicInfo } = info as Record<string, unknown>
  return { ...publicStudent, info: publicInfo }
}
