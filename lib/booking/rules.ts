/* 영업 규칙 — 영업시간, 슬롯, 예약 가능 기간 */
import { BookingError } from './errors'
import { addDays, dayOfWeek, isValidDate, isValidTime, kstNow, kstToIso, minutesOf, timeOf } from './time'

export const BUFFER_MIN = 20       // 시술 후 정리시간
export const SLOT_MIN = 30         // 시작 시각 간격
export const LAST_START_BEFORE_CLOSE_MIN = 30
export const LEAD_MIN = 120        // 현재로부터 최소 여유
export const MAX_DAYS = 60         // 최대 예약 가능 일수
export const MAX_UPCOMING = 5      // 전화번호당 예정 예약 한도

export type BusinessHours = { open: string; close: string; lastStart: string }

/** 월–금 10:00–20:00, 토 10:00–17:00, 일 휴무 */
export function businessHours(date: string): BusinessHours | null {
  const dow = dayOfWeek(date)
  if (dow === 0) return null
  const close = dow === 6 ? '17:00' : '20:00'
  return { open: '10:00', close, lastStart: timeOf(minutesOf(close) - LAST_START_BEFORE_CLOSE_MIN) }
}

export function candidateTimes(date: string): string[] {
  const hours = businessHours(date)
  if (!hours) return []
  const times: string[] = []
  for (let m = minutesOf(hours.open); m <= minutesOf(hours.lastStart); m += SLOT_MIN) times.push(timeOf(m))
  return times
}

/** 시작 시각이 규칙상 불가능하면 오류를, 가능하면 null 을 반환 (휴무일 테이블은 호출측에서 확인) */
export function startError(date: string, time: string, now: Date = new Date()): BookingError | null {
  if (!isValidDate(date) || !isValidTime(time)) {
    return new BookingError('INVALID_INPUT', '날짜(YYYY-MM-DD)/시간(HH:mm) 형식이 올바르지 않습니다.')
  }
  if (!businessHours(date)) return new BookingError('CLOSED_DAY', '휴무일입니다.')
  if (!candidateTimes(date).includes(time)) {
    return new BookingError('OUT_OF_HOURS', '예약 가능한 시간이 아닙니다.')
  }
  if (Date.parse(kstToIso(date, time)) < now.getTime() + LEAD_MIN * 60 * 1000) {
    return new BookingError('TOO_SOON', `예약은 현재 시각으로부터 ${LEAD_MIN / 60}시간 이후부터 가능합니다.`)
  }
  if (date > addDays(kstNow(now).date, MAX_DAYS)) {
    return new BookingError('TOO_FAR', `예약은 ${MAX_DAYS}일 이내만 가능합니다.`)
  }
  return null
}

/** 고객 수정/취소 가능 여부 — 예약일 당일부터는 매장 전화로만 */
export function isEditable(date: string, now: Date = new Date()): boolean {
  return date > kstNow(now).date
}
