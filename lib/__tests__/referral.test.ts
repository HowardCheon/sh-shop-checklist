import { describe, expect, it } from 'vitest'
import { referralReward, referralWindow, inReferralWindow } from '../referral'

describe('referralReward', () => {
  it('결제 총액의 10%, 원 미만 버림', () => {
    expect(referralReward(100000)).toBe(10000)
    expect(referralReward(85555)).toBe(8555)
    expect(referralReward(9)).toBe(0)
    expect(referralReward(0)).toBe(0)
  })
})

describe('referralWindow', () => {
  it('첫 관리일 + 1년 전날까지', () => {
    expect(referralWindow('2026-10-10')).toEqual({ start: '2026-10-10', end: '2027-10-09' })
  })
  it('윤일 시작은 다음 해 2월 28일까지 (DB interval 과 동일)', () => {
    expect(referralWindow('2028-02-29')).toEqual({ start: '2028-02-29', end: '2029-02-27' })
  })
  it('기간 판정 — 종료일 포함, 1년 되는 날 제외', () => {
    expect(inReferralWindow('2026-10-10', '2027-10-09')).toBe(true)
    expect(inReferralWindow('2026-10-10', '2027-10-10')).toBe(false)
    expect(inReferralWindow(null, '2026-10-10')).toBe(true) // 첫 관리 전 → 이번이 첫 관리
  })
})
