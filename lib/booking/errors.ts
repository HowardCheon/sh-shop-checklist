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
