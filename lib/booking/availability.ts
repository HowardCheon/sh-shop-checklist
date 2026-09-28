/* 예약 가능 시간/프로그램 계산 — 1인 운영이라 모든 블록은 서로 겹칠 수 없음 */
import { BUFFER_MIN, candidateTimes, startError } from './rules'
import { kstToIso } from './time'

/** 기존 예약이 차지하는 구간 [start, blockEnd) — ISO 문자열 */
export type Block = { id: number; start: string; blockEnd: string }

export function fits(date: string, time: string, durationMin: number, blocks: Block[], excludeId?: number): boolean {
  const start = Date.parse(kstToIso(date, time))
  const end = start + (durationMin + BUFFER_MIN) * 60 * 1000
  return blocks.every(b =>
    b.id === excludeId || end <= Date.parse(b.start) || Date.parse(b.blockEnd) <= start,
  )
}

export function programsAt<T extends { duration_min: number }>(
  date: string, time: string, programs: T[], blocks: Block[], excludeId?: number,
): T[] {
  return programs.filter(p => fits(date, time, p.duration_min, blocks, excludeId))
}

export function slotsFor(
  date: string, programs: { duration_min: number }[], blocks: Block[], now: Date = new Date(), excludeId?: number,
): { time: string; program_count: number }[] {
  return candidateTimes(date)
    .filter(time => !startError(date, time, now))
    .map(time => ({ time, program_count: programsAt(date, time, programs, blocks, excludeId).length }))
    .filter(s => s.program_count > 0)
}
