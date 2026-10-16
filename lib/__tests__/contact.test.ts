import { describe, it, expect } from 'vitest'
import { androidContactIntent, contactVCard } from '../contact'

describe('androidContactIntent', () => {
  it('새 연락처 화면에 이름·번호를 채운다', () => {
    expect(androidContactIntent('홍길동', '01012345678')).toBe(
      'intent:#Intent;action=android.intent.action.INSERT;type=vnd.android.cursor.dir/raw_contact;' +
      `S.name=${encodeURIComponent('홍길동')};S.phone=010-1234-5678;end`)
  })
  it('이름의 ; 등은 인코딩해 intent 를 깨지 않는다', () => {
    expect(androidContactIntent('a;b#c', '01012345678')).toContain('S.name=a%3Bb%23c;')
  })
})

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
