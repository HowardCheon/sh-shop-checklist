import { describe, it, expect } from 'vitest'
import { kstNow, kstToIso, isoToKst, addDays, dayOfWeek, minutesOf, timeOf } from '../time'

describe('time', () => {
  it('UTC 새벽(KST 오전)에도 KST 날짜를 반환한다', () => {
    // 2026-10-04 23:30 UTC = 2026-10-05 08:30 KST
    expect(kstNow(new Date('2026-10-04T23:30:00Z'))).toEqual({ date: '2026-10-05', time: '08:30' })
  })
  it('KST 문자열을 ISO(UTC)로 변환한다', () => {
    expect(kstToIso('2026-10-05', '10:00')).toBe('2026-10-05T01:00:00.000Z')
  })
  it('ISO 를 KST 날짜/시각으로 변환한다', () => {
    expect(isoToKst('2026-10-05T15:30:00Z')).toEqual({ date: '2026-10-06', time: '00:30' })
    expect(isoToKst('2026-10-05T10:00:00+09:00')).toEqual({ date: '2026-10-05', time: '10:00' })
  })
  it('날짜 더하기는 월/연 경계를 넘는다', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-10-05', 60)).toBe('2026-12-04')
  })
  it('요일(0=일)을 계산한다', () => {
    expect(dayOfWeek('2026-10-04')).toBe(0)
    expect(dayOfWeek('2026-10-10')).toBe(6)
  })
  it('분과 HH:mm 을 상호 변환한다', () => {
    expect(minutesOf('19:30')).toBe(1170)
    expect(timeOf(1170)).toBe('19:30')
    expect(timeOf(1290)).toBe('21:30')
  })
})
