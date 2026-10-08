import { describe, expect, it } from 'vitest'
import { confirmText, locationText, remindText, smsBytes, smsStatus } from '../sms-templates'

describe('예약 확정 문자', () => {
  it('날짜·요일·오전/오후 시간', () => {
    expect(confirmText('곽지현', '2026-10-07T01:30:00Z')).toBe('[온:플로우]\n곽지현님, 10/7(수) 오전10:30 예약확정되었습니다. 감사합니다.')
    expect(confirmText('김가', '2026-10-17T03:00:00Z')).toBe('[온:플로우]\n김가님, 10/17(토) 오후12:00 예약확정되었습니다. 감사합니다.')
    expect(confirmText('이민', '2026-10-08T05:05:00Z')).toBe('[온:플로우]\n이민님, 10/8(목) 오후2:05 예약확정되었습니다. 감사합니다.')
  })
})

describe('전일 안내 문자', () => {
  it('정시는 시, 분 있으면 시분', () => {
    expect(remindText('곽지현', '2026-10-07T01:00:00Z')).toBe('[온:플로우]\n곽지현 고객님 안녕하세요 ^^ 내일 오전10시에 뵙겠습니다 ♡')
    expect(remindText('곽지현', '2026-10-07T01:30:00Z')).toBe('[온:플로우]\n곽지현 고객님 안녕하세요 ^^ 내일 오전10시30분에 뵙겠습니다 ♡')
    expect(remindText('곽지현', '2026-10-07T03:00:00Z')).toBe('[온:플로우]\n곽지현 고객님 안녕하세요 ^^ 내일 오후12시에 뵙겠습니다 ♡')
    expect(remindText('곽지현', '2026-10-07T07:00:00Z')).toBe('[온:플로우]\n곽지현 고객님 안녕하세요 ^^ 내일 오후4시에 뵙겠습니다 ♡')
  })
})

describe('SMS 바이트', () => {
  it('한글·기호 2바이트, 영문·숫자 1바이트', () => {
    expect(smsBytes('[온:플로우]\n')).toBe(12)
    expect(smsBytes('♡')).toBe(2)
  })
  it('흔한 이름 길이는 80바이트 이하', () => {
    expect(smsBytes(confirmText('남궁지현', '2026-10-17T03:30:00Z'))).toBeLessThanOrEqual(80)
    expect(smsBytes(remindText('남궁지현', '2026-10-17T03:30:00Z'))).toBeLessThanOrEqual(80)
  })
})

describe('발송 상태', () => {
  const start = '2026-10-07T01:30:00+00:00'
  it('안 보냄 / 보냄 / 시간 바뀌어 재발송 필요', () => {
    expect(smsStatus(null, null, start)).toBe('none')
    expect(smsStatus('2026-10-06T10:00:00Z', '2026-10-07T01:30:00Z', start)).toBe('sent')
    expect(smsStatus('2026-10-06T10:00:00Z', '2026-10-07T02:00:00Z', start)).toBe('stale')
  })
})

describe('위치 안내 문자', () => {
  it('주소·지도 링크, 단문 80바이트 이하', () => {
    expect(locationText()).toBe('[온:플로우]\n하남시 미사대로520 한강미사2차 D동 1층\nhttps://naver.me/xAfCReWk')
    expect(smsBytes(locationText())).toBeLessThanOrEqual(80)
  })
  it('발송 상태는 예약 시간과 무관 (보냈으면 완료)', () => {
    expect(smsStatus('2026-10-06T10:00:00Z', null, '2026-10-07T01:30:00Z', { timeless: true })).toBe('sent')
    expect(smsStatus(null, null, '2026-10-07T01:30:00Z', { timeless: true })).toBe('none')
  })
})
