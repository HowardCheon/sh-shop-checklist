import { describe, expect, it } from 'vitest'
import { verificationRequired } from '../verification-policy'

describe('휴대폰 인증 필요 여부', () => {
  it('운영에서는 SMS 설정이 없어도 인증 필수 (자동으로 꺼지지 않음)', () => {
    expect(verificationRequired({ production: true, smsConfigured: false, dryRun: false })).toBe(true)
    expect(verificationRequired({ production: true, smsConfigured: true, dryRun: false })).toBe(true)
  })
  it('개발 환경은 SMS 설정 또는 dry-run 일 때만 인증', () => {
    expect(verificationRequired({ production: false, smsConfigured: false, dryRun: false })).toBe(false)
    expect(verificationRequired({ production: false, smsConfigured: true, dryRun: false })).toBe(true)
    expect(verificationRequired({ production: false, smsConfigured: false, dryRun: true })).toBe(true)
  })
})
