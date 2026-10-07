import { describe, expect, it } from 'vitest'
import { fromParts, toParts, outsideHours } from '../manual-time'

describe('오전/오후·시·분 ↔ HH:MM', () => {
  it('변환', () => {
    expect(fromParts('pm', 9, 30)).toBe('21:30')
    expect(fromParts('am', 12, 0)).toBe('00:00')
    expect(fromParts('pm', 12, 10)).toBe('12:10')
    expect(fromParts('am', 8, 50)).toBe('08:50')
  })
  it('역변환 (분은 10분 단위로 내림)', () => {
    expect(toParts('21:30')).toEqual({ ampm: 'pm', hour: 9, minute: 30 })
    expect(toParts('00:05')).toEqual({ ampm: 'am', hour: 12, minute: 0 })
    expect(toParts('12:40')).toEqual({ ampm: 'pm', hour: 12, minute: 40 })
    expect(toParts('')).toEqual({ ampm: 'pm', hour: 8, minute: 0 })
  })
})

describe('영업시간 외 판정', () => {
  it('평일 10:00~19:30 시작 가능, 밖이면 영업시간 외', () => {
    expect(outsideHours('2026-10-27', '09:30')).toBe(true)
    expect(outsideHours('2026-10-27', '21:00')).toBe(true)
    expect(outsideHours('2026-10-27', '10:10')).toBe(false) // 영업시간 안의 30분 단위가 아닌 시각
    expect(outsideHours('2026-10-25', '11:00')).toBe(true)  // 일요일 휴무
  })
})
