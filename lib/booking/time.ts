/* KST(UTC+9, 서머타임 없음) 날짜/시각 유틸 — 서버 시간대와 무관하게 동작 */

const KST_MS = 9 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export type KstDateTime = { date: string; time: string }

function split(ms: number): KstDateTime {
  const iso = new Date(ms + KST_MS).toISOString()
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) }
}

export function kstNow(now: Date = new Date()): KstDateTime {
  return split(now.getTime())
}

export function isoToKst(iso: string): KstDateTime {
  return split(new Date(iso).getTime())
}

export function kstToIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00+09:00`).toISOString()
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/** 0=일 ~ 6=토 */
export function dayOfWeek(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export function timeOf(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function isValidDate(date: unknown): date is string {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const d = new Date(`${date}T00:00:00Z`)
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date
}

export function isValidTime(time: unknown): time is string {
  return typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
}
