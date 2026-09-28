import { BookingError } from './errors'

/** 휴대폰 번호를 숫자만 남긴 01012345678 형태로 정규화 */
export function normalizePhone(raw: unknown): string {
  let digits = typeof raw === 'string' ? raw.replace(/\D/g, '') : ''
  if (digits.startsWith('82')) digits = '0' + digits.slice(2)
  if (!/^01[016789]\d{7,8}$/.test(digits)) {
    throw new BookingError('INVALID_INPUT', '휴대폰 번호 형식이 올바르지 않습니다.')
  }
  return digits
}

/** 홍길동 → 홍*동, 홍길 → 홍* */
export function maskName(name: string): string {
  const chars = Array.from(name.trim())
  if (chars.length <= 1) return '*'
  if (chars.length === 2) return chars[0] + '*'
  return chars[0] + '*'.repeat(chars.length - 2) + chars[chars.length - 1]
}

/**
 * 요청자가 해당 전화번호의 소유자인지 확인.
 * 현재는 전화번호 형식만 검증 — SMS 인증 도입 시 verification_token 검증으로 교체한다.
 */
export function verifyPhoneOwnership(input: { phone?: unknown }): string {
  return normalizePhone(input.phone)
}
