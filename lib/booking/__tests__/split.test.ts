import { describe, it, expect } from 'vitest'
import { splitDeduction } from '../prepaid'

describe('splitDeduction (잔액 비율 차감)', () => {
  it('잔액 비율로 나누고 보너스 몫은 내림', () => {
    // 실제 100만 : 보너스 10만, 30만 사용
    expect(splitDeduction(300000, 1000000, 100000)).toEqual({ cash: 272728, bonus: 27272, other: 0 })
  })
  it('보너스가 없으면 전부 실제금액', () => {
    expect(splitDeduction(80000, 500000, 0)).toEqual({ cash: 80000, bonus: 0, other: 0 })
  })
  it('잔액보다 크면 잔액 전부 소진 후 부족분', () => {
    expect(splitDeduction(150000, 90000, 10000)).toEqual({ cash: 90000, bonus: 10000, other: 50000 })
  })
  it('사용액이 잔액과 같으면 보너스까지 정확히 소진', () => {
    expect(splitDeduction(100001, 90000, 10001)).toEqual({ cash: 90000, bonus: 10001, other: 0 })
  })
  it('잔액이 없으면 전액 부족분', () => {
    expect(splitDeduction(50000, 0, 0)).toEqual({ cash: 0, bonus: 0, other: 50000 })
  })
})
