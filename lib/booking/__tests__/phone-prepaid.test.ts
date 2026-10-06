import { describe, it, expect } from 'vitest'
import { normalizePhone, maskName } from '../phone'
import { bonusFor, isMember, validateCustomCharge } from '../prepaid'

describe('phone', () => {
  it('하이픈/공백/+82 를 정규화한다', () => {
    expect(normalizePhone('010-1234-5678')).toBe('01012345678')
    expect(normalizePhone(' 010 1234 5678 ')).toBe('01012345678')
    expect(normalizePhone('+82 10-1234-5678')).toBe('01012345678')
  })
  it('휴대폰 번호가 아니면 INVALID_INPUT', () => {
    expect(() => normalizePhone('02-123-4567')).toThrow(expect.objectContaining({ code: 'INVALID_INPUT' }))
    expect(() => normalizePhone('')).toThrow()
    expect(() => normalizePhone(undefined)).toThrow()
  })
  it('이름을 마스킹한다', () => {
    expect(maskName('홍길동')).toBe('홍*동')
    expect(maskName('홍길')).toBe('홍*')
    expect(maskName('남궁민수')).toBe('남**수')
  })
})

describe('prepaid', () => {
  it('충전 금액별 보너스', () => {
    expect(bonusFor(500000)).toBe(0)
    expect(bonusFor(1000000)).toBe(100000)
    expect(bonusFor(2000000)).toBe(250000)
    expect(() => bonusFor(300000)).toThrow()
  })
  it('실제+보너스 잔액이 있으면 회원', () => {
    expect(isMember({ prepaid_cash: 0, prepaid_bonus: 0 })).toBe(false)
    expect(isMember({ prepaid_cash: 0, prepaid_bonus: 1000 })).toBe(true)
    expect(isMember(null)).toBe(false)
  })
})

describe('validateCustomCharge', () => {
  it('정수 금액·보너스', () => {
    expect(validateCustomCharge(300000, 30000)).toEqual({ amount: 300000, bonus: 30000 })
    expect(validateCustomCharge('150000', undefined)).toEqual({ amount: 150000, bonus: 0 })
  })
  it('잘못된 값 거부', () => {
    for (const [a, b] of [[0, 0], [-1, 0], [1.5, 0], ['abc', 0], [100, -1], [100, 0.5], [true, 0], ['0x10', 0], [[5], 0], [100, true], ['1e3', 0], [' 100', 0]] as [unknown, unknown][]) expect(() => validateCustomCharge(a, b)).toThrow()
  })
})
