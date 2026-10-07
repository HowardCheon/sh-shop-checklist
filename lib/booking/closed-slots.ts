/* 관리자 휴무시간 — 날짜별 30분 칸(시작 시각 목록). 고객 화면에는 '마감'으로만 보임 */
import type { Block } from './availability'
import { SLOT_MIN } from './rules'
import { kstToIso, minutesOf, timeOf } from './time'

/** 연속된 칸을 [시작, 끝) 구간으로 병합 — 'HH:MM' */
export function mergeRanges(times: string[]): { start: string; end: string }[] {
  const mins = [...new Set(times)].map(minutesOf).sort((a, b) => a - b)
  const out: { start: number; end: number }[] = []
  for (const m of mins) {
    const last = out[out.length - 1]
    if (last && last.end === m) last.end = m + SLOT_MIN
    else out.push({ start: m, end: m + SLOT_MIN })
  }
  return out.map(r => ({ start: timeOf(r.start), end: timeOf(r.end) }))
}

/** 가능 시간 계산용 블록 — 예약 블록과 구분되도록 음수 id */
export function closedBlocks(date: string, times: string[]): Block[] {
  return mergeRanges(times).map((r, i) => ({ id: -(i + 1), start: kstToIso(date, r.start), blockEnd: kstToIso(date, r.end) }))
}

/** 예약 구간 [startIso, blockEndIso) 과 겹치는 첫 휴무 구간 (없으면 null) */
export function overlapsClosed(date: string, times: string[], startIso: string, blockEndIso: string) {
  const s = Date.parse(startIso)
  const e = Date.parse(blockEndIso)
  return mergeRanges(times).find(r => Date.parse(kstToIso(date, r.start)) < e && s < Date.parse(kstToIso(date, r.end))) ?? null
}

/** 예약 블록과 겹치는 30분 칸 (휴무시간 선택 화면에서 '예약'으로 표시) */
export function reservedTimes(date: string, slots: string[], reservations: Block[]) {
  return slots.filter(t => {
    const s = Date.parse(kstToIso(date, t))
    const e = s + SLOT_MIN * 60 * 1000
    return reservations.some(b => Date.parse(b.start) < e && s < Date.parse(b.blockEnd))
  })
}
