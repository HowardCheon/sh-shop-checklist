import { describe, it, expect } from 'vitest'
import { businessHours, candidateTimes, startError, isEditable } from '../rules'

// 기준 시각: 2026-10-05(월) 08:00 KST
const NOW = new Date('2026-10-04T23:00:00Z')

describe('rules', () => {
  it('일요일은 휴무', () => {
    expect(businessHours('2026-10-04')).toBeNull()
  })
  it('평일 마지막 시작 19:30, 토요일 16:30', () => {
    expect(candidateTimes('2026-10-05').at(0)).toBe('10:00')
    expect(candidateTimes('2026-10-05').at(-1)).toBe('19:30')
    expect(candidateTimes('2026-10-10').at(-1)).toBe('16:30')
    expect(candidateTimes('2026-10-05')).toHaveLength(20)
  })
  it('허용되는 시작 시각은 null', () => {
    expect(startError('2026-10-06', '19:30', NOW)).toBeNull()
    expect(startError('2026-10-10', '16:30', NOW)).toBeNull()
  })
  it('일요일은 CLOSED_DAY', () => {
    expect(startError('2026-10-11', '10:00', NOW)?.code).toBe('CLOSED_DAY')
  })
  it('마지막 시작 이후, 30분 단위 아님, 개점 전은 OUT_OF_HOURS', () => {
    expect(startError('2026-10-06', '20:00', NOW)?.code).toBe('OUT_OF_HOURS')
    expect(startError('2026-10-10', '17:00', NOW)?.code).toBe('OUT_OF_HOURS')
    expect(startError('2026-10-06', '10:15', NOW)?.code).toBe('OUT_OF_HOURS')
    expect(startError('2026-10-06', '09:30', NOW)?.code).toBe('OUT_OF_HOURS')
  })
  it('현재+2시간 이전은 TOO_SOON', () => {
    expect(startError('2026-10-05', '10:00', NOW)).toBeNull()
    expect(startError('2026-10-05', '10:00', new Date('2026-10-04T23:30:00Z'))?.code).toBe('TOO_SOON')
    expect(startError('2026-10-02', '10:00', NOW)?.code).toBe('TOO_SOON')
  })
  it('60일 초과는 TOO_FAR', () => {
    expect(startError('2026-12-04', '10:00', NOW)).toBeNull()
    expect(startError('2026-12-05', '10:00', NOW)?.code).toBe('TOO_FAR')
  })
  it('잘못된 형식은 INVALID_INPUT', () => {
    expect(startError('2026-13-01', '10:00', NOW)?.code).toBe('INVALID_INPUT')
    expect(startError('2026-10-06', '1000', NOW)?.code).toBe('INVALID_INPUT')
  })
  it('수정/취소는 예약일이 오늘보다 뒤일 때만 가능', () => {
    expect(isEditable('2026-10-06', NOW)).toBe(true)
    expect(isEditable('2026-10-05', NOW)).toBe(false)
  })
})
