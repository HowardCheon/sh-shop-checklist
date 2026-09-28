import { describe, it, expect } from 'vitest'
import { effectivePrice } from '../pricing'

const product = { price: 120000, member_price: 80000 }
const member = { prepaid_cash: 100000, prepaid_bonus: 0 }
const none = { prepaid_cash: 0, prepaid_bonus: 0 }

describe('effectivePrice (예약 후 회원 여부 변경 반영)', () => {
  it('비회원 예약 후 충전 → 회원가로 변경 표시', () => {
    expect(effectivePrice({ status: 'scheduled', price: 120000, price_type: 'regular', product, customer: member }))
      .toEqual({ price: 80000, changed: 'to_member', bookedPrice: 120000 })
  })
  it('회원 예약 후 잔액 소진/환불 → 비회원가로 변경 표시', () => {
    expect(effectivePrice({ status: 'scheduled', price: 80000, price_type: 'member', product, customer: none }))
      .toEqual({ price: 120000, changed: 'to_regular', bookedPrice: 80000 })
  })
  it('회원 여부가 그대로면 변경 없음', () => {
    expect(effectivePrice({ status: 'scheduled', price: 80000, price_type: 'member', product, customer: member }))
      .toEqual({ price: 80000, changed: null, bookedPrice: 80000 })
  })
  it('price_type 이 없으면(관리자 등록) 금액으로 당시 구분 추정', () => {
    expect(effectivePrice({ status: 'scheduled', price: 120000, price_type: null, product, customer: member }).changed).toBe('to_member')
    expect(effectivePrice({ status: 'scheduled', price: 80000, price_type: null, product, customer: none }).changed).toBe('to_regular')
  })
  it('직접 입력한 금액·완료/취소 건·시술 정보 없음은 그대로', () => {
    expect(effectivePrice({ status: 'scheduled', price: 99000, price_type: null, product, customer: member }).changed).toBeNull()
    expect(effectivePrice({ status: 'completed', price: 120000, price_type: 'regular', product, customer: member }).changed).toBeNull()
    expect(effectivePrice({ status: 'scheduled', price: 120000, price_type: 'regular', product: null, customer: member }).changed).toBeNull()
  })
  it('회원가가 비어 있는 시술은 회원도 정가', () => {
    expect(effectivePrice({ status: 'scheduled', price: 120000, price_type: 'regular', product: { price: 120000, member_price: null }, customer: member }).changed).toBeNull()
  })
})
