import { describe, it, expect, beforeEach } from 'vitest'
import { createSessionToken, verifySessionToken, verifyPin } from '../auth'

beforeEach(() => {
  process.env.ADMIN_SESSION_SECRET = 'x'.repeat(40)
  process.env.ADMIN_PIN = '1234'
})

describe('관리자 세션', () => {
  it('발급한 토큰은 유효', () => {
    expect(verifySessionToken(createSessionToken())).toBe(true)
  })
  it('만료된 토큰은 무효', () => {
    const old = createSessionToken(Date.now() - 31 * 24 * 3600e3)
    expect(verifySessionToken(old)).toBe(false)
  })
  it('서명을 바꾸거나 만료를 늘리면 무효', () => {
    const [exp, sig] = createSessionToken().split('.')
    expect(verifySessionToken(`${Number(exp) + 1000}.${sig}`)).toBe(false)
    expect(verifySessionToken(`${exp}.${sig.slice(0, -1)}A`)).toBe(false)
    expect(verifySessionToken(undefined)).toBe(false)
  })
  it('비밀키가 바뀌면 기존 토큰 무효', () => {
    const token = createSessionToken()
    process.env.ADMIN_SESSION_SECRET = 'y'.repeat(40)
    expect(verifySessionToken(token)).toBe(false)
  })
  it('PIN 이 바뀌면 기존 토큰 무효', () => {
    const token = createSessionToken()
    process.env.ADMIN_PIN = '5678'
    expect(verifySessionToken(token)).toBe(false)
  })
  it('PIN 비교', () => {
    expect(verifyPin('1234')).toBe(true)
    expect(verifyPin('0000')).toBe(false)
    expect(verifyPin(1234)).toBe(false)
  })
})
