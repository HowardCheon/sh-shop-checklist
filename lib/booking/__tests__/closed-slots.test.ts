import { describe, expect, it } from 'vitest'
import { closedBlocks, mergeRanges, overlapsClosed, reservedTimes } from '../closed-slots'
import { fits } from '../availability'

describe('휴무시간 구간 병합', () => {
  it('연속된 30분 칸은 하나의 구간으로', () => {
    expect(mergeRanges(['15:00', '14:00', '14:30', '17:00'])).toEqual([{ start: '14:00', end: '15:30' }, { start: '17:00', end: '17:30' }])
    expect(mergeRanges([])).toEqual([])
  })
  it('가능 시간 계산용 블록 (음수 id)', () => {
    const b = closedBlocks('2026-10-20', ['14:00', '14:30'])
    expect(b).toEqual([{ id: -1, start: '2026-10-20T05:00:00.000Z', blockEnd: '2026-10-20T06:00:00.000Z' }])
  })
})

describe('휴무시간이 예약 가능 시간에 반영', () => {
  const blocks = closedBlocks('2026-10-20', ['14:00', '14:30'])
  it('휴무 구간과 겹치는 시작 시각은 불가 (정리시간 포함)', () => {
    expect(fits('2026-10-20', '14:00', 60, blocks)).toBe(false)
    expect(fits('2026-10-20', '13:00', 60, blocks)).toBe(false) // 14:00 종료 + 정리 20분이 휴무와 겹침
    expect(fits('2026-10-20', '12:30', 60, blocks)).toBe(true)
    expect(fits('2026-10-20', '15:00', 60, blocks)).toBe(true)
  })
})

describe('관리자 예약과 휴무시간 겹침', () => {
  it('예약 구간 [시작, 정리 끝) 이 휴무 칸과 겹치면 그 구간 반환', () => {
    expect(overlapsClosed('2026-10-20', ['14:00', '14:30'], '2026-10-20T04:30:00Z', '2026-10-20T05:30:00Z')).toEqual({ start: '14:00', end: '15:00' })
    expect(overlapsClosed('2026-10-20', ['14:00'], '2026-10-20T03:00:00Z', '2026-10-20T05:00:00Z')).toBeNull()
  })
})

describe('휴무시간 선택 화면의 예약된 칸', () => {
  it('예약 블록과 겹치는 30분 칸', () => {
    const resv = [{ id: 1, start: '2026-10-20T01:00:00Z', blockEnd: '2026-10-20T02:20:00Z' }] // 10:00~11:20
    expect(reservedTimes('2026-10-20', ['09:30', '10:00', '10:30', '11:00', '11:30'], resv)).toEqual(['10:00', '10:30', '11:00'])
  })
})
