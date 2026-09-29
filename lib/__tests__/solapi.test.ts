import { describe, it, expect } from 'vitest'
import { createHmac } from 'node:crypto'
import { authHeader, verificationText } from '../solapi'

describe('solapi', () => {
  it('인증 헤더: HMAC-SHA256(secret, date+salt) hex', () => {
    const date = '2026-09-30T10:00:00+09:00'
    const salt = 'abcdefghijklmnopqrstuvwxyz123456'
    const expected = createHmac('sha256', 'SECRET').update(date + salt).digest('hex')
    expect(authHeader('KEY', 'SECRET', date, salt))
      .toBe(`HMAC-SHA256 apiKey=KEY, date=${date}, salt=${salt}, signature=${expected}`)
  })
  it('인증 문자 내용', () => {
    expect(verificationText('1234')).toBe('[온:플로우] 인증번호 1234 (3분 이내 입력)')
  })
})
