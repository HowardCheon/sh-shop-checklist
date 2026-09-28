import { describe, it, expect } from 'vitest'
import { fits, programsAt, slotsFor, timesFor, type Block } from '../availability'
import { kstToIso } from '../time'

const NOW = new Date('2026-10-04T23:00:00Z') // 2026-10-05 08:00 KST
const D = '2026-10-06' // 화요일
const P = [
  { id: 1, duration_min: 50 },
  { id: 2, duration_min: 60 },
  { id: 3, duration_min: 80 },
  { id: 4, duration_min: 120 },
]
const block = (id: number, from: string, to: string): Block => ({ id, start: kstToIso(D, from), blockEnd: kstToIso(D, to) })

describe('availability', () => {
  it('블록 끝과 다음 예약 시작이 같으면 허용', () => {
    // 11:30 예약 → 10:00 시작은 소요 70분 이하(블록 90분)만 가능
    const blocks = [block(9, '11:30', '12:50')]
    expect(fits(D, '10:00', 70, blocks)).toBe(true)
    expect(fits(D, '10:00', 71, blocks)).toBe(false)
  })
  it('앞뒤로 빈 시간에는 들어가는 프로그램만 보여준다', () => {
    // 10:00~11:20 블록, 13:00 예약 → 11:30 시작 가능 블록 90분
    const blocks = [block(1, '10:00', '11:20'), block(2, '13:00', '14:20')]
    expect(programsAt(D, '11:30', P, blocks).map(p => p.id)).toEqual([1, 2])
    expect(programsAt(D, '11:00', P, blocks)).toEqual([]) // 기존 블록 안
  })
  it('슬롯은 가능한 프로그램이 1개 이상인 시각만', () => {
    const blocks = [block(1, '10:00', '11:20'), block(2, '12:00', '13:20')]
    const slots = slotsFor(D, P, blocks, NOW)
    const times = slots.map(s => s.time)
    expect(times).not.toContain('10:00')
    expect(times).not.toContain('11:00')
    expect(times).not.toContain('11:30') // 30분 공백 → 최소 블록 70분 불가
    expect(times).toContain('13:30')
    expect(slots.find(s => s.time === '19:30')?.program_count).toBe(4)
  })
  it('마지막 시작 19:30 에 120분 프로그램 허용 (21:30 종료)', () => {
    expect(fits(D, '19:30', 120, [])).toBe(true)
  })
  it('수정 시 자기 자신 블록은 제외한다', () => {
    const blocks = [block(5, '14:00', '15:20')]
    expect(fits(D, '14:00', 60, blocks)).toBe(false)
    expect(fits(D, '14:00', 80, blocks, 5)).toBe(true)
  })
  it('전체 시간표: 예약으로 막힌 시간과 지난 시간도 포함하고 사유를 표시', () => {
    const blocks = [block(1, '10:00', '11:20')]
    const times = timesFor(D, P, blocks, NOW)
    expect(times).toHaveLength(20)
    expect(times.find(t => t.time === '10:30')).toEqual({ time: '10:30', available: false, reason: 'booked', program_count: 0 })
    expect(times.find(t => t.time === '11:30')).toMatchObject({ available: true, reason: null, program_count: 4 })
    // 당일 08:00 기준 10:00 이전 여유 2시간 → 10:00 은 가능, 09:30 은 영업 전이라 목록에 없음
    const todayTimes = timesFor('2026-10-05', P, [], new Date('2026-10-05T01:30:00Z')) // 10:30 KST
    expect(todayTimes.find(t => t.time === '12:00')).toMatchObject({ available: false, reason: 'too_soon' })
    expect(todayTimes.find(t => t.time === '12:30')).toMatchObject({ available: true })
  })
  it('일요일은 슬롯이 없다', () => {
    expect(slotsFor('2026-10-11', P, [], NOW)).toEqual([])
  })
})
