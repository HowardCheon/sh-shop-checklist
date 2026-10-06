import { describe, it, expect } from 'vitest'
import { createSmsFailureAlerter, smsFailureMessage, balanceMessage, loginFailureMessage, createLoginFailureAlerter } from '../alerts'

describe('솔라피 잔액 보고', () => {
  const at = new Date('2026-09-30T00:00:00Z') // 09:00 KST
  it('충전금·포인트·예상 건수, 부족 시 경고', () => {
    const text = balanceMessage({ balance: 0, point: 282, at })
    expect(text).toContain('💰 <b>솔라피 잔액</b> (9월 30일)')
    expect(text).toContain('충전금 0원 · 포인트 282')
    expect(text).toContain('인증 문자 약 15건')
    expect(text).toContain('⚠ 충전이 필요해요')
  })
  it('충분하면 경고 없음', () => {
    const text = balanceMessage({ balance: 50000, point: 0, at })
    expect(text).toContain('인증 문자 약 2,777건')
    expect(text).not.toContain('⚠')
  })
  it('조회 실패 메시지', () => {
    expect(balanceMessage({ error: 'HTTP 401', at })).toContain('잔액 조회 실패: HTTP 401')
  })
})

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

describe('관리자 로그인 실패 알림', () => {
  const at = new Date('2026-10-06T05:05:00Z') // 14:05 KST
  it('메시지: IP·최근 실패 횟수·시각, IP 이스케이프', () => {
    const text = loginFailureMessage({ ip: '1.2.3.4<x>', byIp: 3, total: 4, blocked: false, at, suppressed: 0 })
    expect(text).toContain('🔐 <b>관리자 로그인 실패</b>')
    expect(text).toContain('IP: 1.2.3.4&lt;x&gt;')
    expect(text).toContain('최근 10분 실패: 이 IP 3회 · 전체 4회')
    expect(text).toContain('시각: 10월 6일 14:05')
    expect(text).not.toContain('차단')
  })
  it('시도 제한에 걸리면 차단 문구, 묶인 건수 표시', () => {
    const text = loginFailureMessage({ ip: '1.2.3.4', byIp: 6, total: 6, blocked: true, at, suppressed: 2 })
    expect(text).toContain('시도 횟수 초과로 10분간 차단됨')
    expect(text).toContain('직전 5분간 추가 실패 2건')
  })
  it('5분에 1번만 보내고, 그사이 실패는 다음 알림에 합산', async () => {
    let now = 0
    const sent: string[] = []
    const alert = createLoginFailureAlerter({ send: async t => { sent.push(t); return true }, now: () => now })
    const f = { ip: '9.9.9.9', byIp: 1, total: 1, blocked: false }
    await alert(f)
    await alert({ ...f, byIp: 2, total: 2 })
    expect(sent).toHaveLength(1)
    now = 5 * 60 * 1000
    await alert({ ...f, byIp: 3, total: 3 })
    expect(sent).toHaveLength(2)
    expect(sent[1]).toContain('이 IP 3회')
    expect(sent[1]).toContain('추가 실패 1건')
  })
})
