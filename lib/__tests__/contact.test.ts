import { describe, it, expect } from 'vitest'
import { contactVCard, formatPhone, treatmentNote } from '../contact'

describe('contactVCard', () => {
  it('이름·휴대폰 번호', () => {
    const v = contactVCard('홍길동', '01012345678')
    expect(v).toContain('FN:홍길동\r\n')
    expect(v).toContain('TEL;TYPE=CELL:010-1234-5678\r\n')
    expect(v.startsWith('BEGIN:VCARD\r\nVERSION:3.0')).toBe(true)
  })
  it('특수문자 이스케이프', () => {
    expect(contactVCard('김,이;박', '010')).toContain('FN:김\\,이\\;박')
  })
})

describe('treatmentNote', () => {
  const r = (start_at: string, product_name: string | null, status = 'completed') => ({ start_at, product_name, status })
  const now = new Date('2026-10-16T05:00:00Z')
  it('완료된 시술만 최신순, KST 날짜', () => {
    const note = treatmentNote([
      r('2026-09-01T01:00:00Z', '베이직'),
      r('2026-10-01T16:00:00Z', '스페셜'), // KST 10/02 01:00
      r('2026-10-10T01:00:00Z', '베이직', 'cancelled'),
      r('2026-10-20T01:00:00Z', '베이직', 'scheduled'),
    ], now)
    expect(note).toBe('온:플로우 시술 내역 (2026.10.16 기준, 총 2회)\n2026.10.02 스페셜\n2026.09.01 베이직')
  })
  it('시술이 없으면 빈 메모', () => {
    expect(treatmentNote([r('2026-10-20T01:00:00Z', '베이직', 'scheduled')], now)).toBe('')
  })
  it('30건 넘으면 최근 30건 + 외 N건', () => {
    const many = Array.from({ length: 32 }, (_, i) => r(new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), '베이직'))
    const lines = treatmentNote(many, now).split('\n')
    expect(lines).toHaveLength(32)
    expect(lines[1]).toBe('2026.02.01 베이직')
    expect(lines[31]).toBe('외 2건')
  })
  it('메모는 vCard NOTE 에 들어간다', () => {
    const note = '내역\n2026.10.02 스페셜, 팩'
    expect(contactVCard('홍길동', '01012345678', note)).toContain('NOTE:내역\\n2026.10.02 스페셜\\, 팩\r\n')
  })
})

describe('formatPhone', () => {
  it('휴대폰 번호에 하이픈', () => {
    expect(formatPhone('01012345678')).toBe('010-1234-5678')
    expect(formatPhone('010-1234-5678')).toBe('010-1234-5678')
    expect(formatPhone('0111234567')).toBe('011-123-4567')
  })
  it('그 외 형식·빈 값은 그대로', () => {
    expect(formatPhone('02-123-4567')).toBe('02-123-4567')
    expect(formatPhone(null)).toBe('')
  })
})
