/* 관리자 예약의 '다른 시간'(영업시간 외 등) 입력 — 오전/오후·시·분(10분 단위) */
import { businessHours } from './rules'
import { minutesOf } from './time'

export type AmPm = 'am' | 'pm'
export const MINUTES = [0, 10, 20, 30, 40, 50]

/** 오전/오후·시(1~12)·분 → 'HH:MM' */
export function fromParts(ampm: AmPm, hour: number, minute: number) {
  const h = (hour % 12) + (ampm === 'pm' ? 12 : 0)
  return `${String(h).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

/** 'HH:MM' → 오전/오후·시·분(10분 단위 내림). 비어 있으면 오후 8시 */
export function toParts(time: string): { ampm: AmPm; hour: number; minute: number } {
  if (!/^\d{2}:\d{2}$/.test(time)) return { ampm: 'pm', hour: 8, minute: 0 }
  const [h, m] = time.split(':').map(Number)
  return { ampm: h < 12 ? 'am' : 'pm', hour: h % 12 === 0 ? 12 : h % 12, minute: Math.floor(m / 10) * 10 }
}

/** 영업시간(시작 가능 시각 범위) 밖이거나 휴무일이면 true */
export function outsideHours(date: string, time: string) {
  const hours = businessHours(date)
  if (!hours) return true
  const t = minutesOf(time)
  return t < minutesOf(hours.open) || t > minutesOf(hours.lastStart)
}
