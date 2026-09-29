import { describe, it, expect } from 'vitest'
import { createSmsFailureAlerter, smsFailureMessage } from '../alerts'

describe('SMS 실패 알림', () => {
  it('메시지: 번호 가림, 사유 이스케이프, 추가 실패 건수', () => {
    const text = smsFailureMessage({ phone: '01050359994', reason: '3059 <발신번호> 미등록', at: new Date('2026-09-30T05:05:00Z'), suppressed: 3 })
    expect(text).toContain('⚠️ <b>SMS 발송 실패</b>')
    expect(text).toContain('수신: 010-****-9994')
    expect(text).toContain('사유: 3059 &lt;발신번호&gt; 미등록')
    expect(text).toContain('시각: 9월 30일 14:05')
    expect(text).toContain('직전 5분간 추가 실패 3건')
  })
  it('5분에 1번만 보내고, 그사이 실패는 다음 알림에 합산', async () => {
    let now = 0
    const sent: string[] = []
    const alert = createSmsFailureAlerter({ send: async t => { sent.push(t); return true }, now: () => now })
    await alert('01011112222', 'A')
    await alert('01011112222', 'B')
    await alert('01011112222', 'C')
    expect(sent).toHaveLength(1)
    now = 5 * 60 * 1000
    await alert('01011112222', 'D')
    expect(sent).toHaveLength(2)
    expect(sent[1]).toContain('추가 실패 2건')
    expect(sent[1]).toContain('사유: D')
  })
})
