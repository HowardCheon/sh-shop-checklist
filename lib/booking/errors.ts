export type BookingErrorCode =
  | 'UNAUTHORIZED'
  | 'INVALID_INPUT'
  | 'CLOSED_DAY'
  | 'OUT_OF_HOURS'
  | 'TOO_SOON'
  | 'TOO_FAR'
  | 'PROGRAM_NOT_FOUND'
  | 'SLOT_TAKEN'
  | 'LIMIT_EXCEEDED'
  | 'NOT_FOUND'
  | 'SAME_DAY_LOCKED'
  | 'CHANGE_BY_PHONE'
  | 'VERIFICATION_REQUIRED'
  | 'CODE_MISMATCH'
  | 'CODE_EXPIRED'
  | 'TOO_MANY_REQUESTS'
  | 'SMS_FAILED'
  | 'INTERNAL'

const STATUS: Record<BookingErrorCode, number> = {
  UNAUTHORIZED: 401,
  INVALID_INPUT: 400,
  CLOSED_DAY: 422,
  OUT_OF_HOURS: 422,
  TOO_SOON: 422,
  TOO_FAR: 422,
  PROGRAM_NOT_FOUND: 404,
  SLOT_TAKEN: 409,
  LIMIT_EXCEEDED: 409,
  NOT_FOUND: 404,
  SAME_DAY_LOCKED: 403,
  CHANGE_BY_PHONE: 403,
  VERIFICATION_REQUIRED: 401,
  CODE_MISMATCH: 400,
  CODE_EXPIRED: 400,
  TOO_MANY_REQUESTS: 429,
  SMS_FAILED: 502,
  INTERNAL: 500,
}

export class BookingError extends Error {
  readonly code: BookingErrorCode
  readonly status: number

  constructor(code: BookingErrorCode, message: string) {
    super(message)
    this.code = code
    this.status = STATUS[code]
  }
}
