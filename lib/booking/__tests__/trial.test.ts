import { describe, expect, it } from 'vitest'
import { defaultTrialChoice, kstToday, trialBadge, trialPackage, trialStatus, validateUse } from '../trial'

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

describe('trialBadge', () => {
  it('남은 횟수 표시', () => {
    expect(trialBadge({ basic_total: 1, special_total: 3, basic_used: 0, special_used: 1, expires_on: '2026-12-01' }, '2026-10-06')).toEqual({ label: '첫체험 B1·S2', expired: false })
  })
  it('만료 표시', () => {
    expect(trialBadge({ basic_total: 1, special_total: 1, basic_used: 1, special_used: 0, expires_on: '2026-10-01' }, '2026-10-06')).toEqual({ label: '첫체험 B0·S1', expired: true })
  })
  it('남은 횟수 없으면 null', () => {
    expect(trialBadge({ basic_total: 1, special_total: 1, basic_used: 1, special_used: 1, expires_on: '2026-12-01' }, '2026-10-06')).toBeNull()
  })
})

describe('defaultTrialChoice', () => {
  it('시술명으로 추정', () => {
    expect(defaultTrialChoice('베이직 피부관리')).toEqual({ kind: 'basic' })
    expect(defaultTrialChoice('플라즈마 관리')).toEqual({ kind: 'special', care: '플라즈마' })
    expect(defaultTrialChoice('로즈 해독 케어')).toEqual({ kind: 'special', care: '로즈 해독' })
    expect(defaultTrialChoice('상체관리')).toEqual({ kind: 'special', care: '상체' })
    expect(defaultTrialChoice('하체관리')).toEqual({ kind: 'special', care: '하체' })
    expect(defaultTrialChoice('전신관리')).toBeNull()
    expect(defaultTrialChoice(null)).toBeNull()
  })
})
