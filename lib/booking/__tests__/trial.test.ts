import { describe, expect, it } from 'vitest'
import { kstToday, trialPackage, trialStatus, validateUse } from '../trial'

const pkg = { basic_total: 1, special_total: 3, basic_used: 0, special_used: 1, expires_on: '2026-11-06' }

describe('trialPackage', () => {
  it('코드별 구성·가격', () => {
    expect(trialPackage('trial2')).toMatchObject({ code: 'trial2', price: 99000, basic: 1, special: 1, months: 1 })
    expect(trialPackage('trial4')).toMatchObject({ code: 'trial4', price: 219000, basic: 1, special: 3, months: 3 })
  })
  it('잘못된 코드는 INVALID_INPUT', () => {
    for (const c of ['trial3', 'toString', '', null, 4]) expect(() => trialPackage(c)).toThrow(/패키지/)
  })
})

describe('validateUse', () => {
  it('베이직은 시술명 무시', () => {
    expect(validateUse('basic', '플라즈마')).toEqual({ kind: 'basic', careName: null })
  })
  it('스페셜은 4종 중 하나 필수', () => {
    expect(validateUse('special', '로즈 해독')).toEqual({ kind: 'special', careName: '로즈 해독' })
    expect(() => validateUse('special', null)).toThrow()
    expect(() => validateUse('special', '전신관리')).toThrow()
  })
  it('알 수 없는 종류', () => {
    expect(() => validateUse('premium', null)).toThrow()
  })
})

describe('trialStatus', () => {
  it('남은 횟수·D-day', () => {
    expect(trialStatus(pkg, '2026-10-06')).toEqual({ basicLeft: 1, specialLeft: 2, daysLeft: 31, expired: false, done: false })
  })
  it('만료일 당일은 유효, 다음날 만료', () => {
    expect(trialStatus(pkg, '2026-11-06')).toMatchObject({ daysLeft: 0, expired: false })
    expect(trialStatus(pkg, '2026-11-07')).toMatchObject({ daysLeft: -1, expired: true })
  })
  it('모두 사용하면 done', () => {
    expect(trialStatus({ ...pkg, basic_used: 1, special_used: 3 }, '2026-10-06').done).toBe(true)
  })
})

describe('kstToday', () => {
  it('UTC 15시 이후는 KST 다음날', () => {
    expect(kstToday(Date.parse('2026-10-06T15:30:00Z'))).toBe('2026-10-07')
    expect(kstToday(Date.parse('2026-10-06T14:59:00Z'))).toBe('2026-10-06')
  })
})
