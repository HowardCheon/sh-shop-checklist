import { describe, it, expect } from 'vitest'
import { newReservationMessage } from '../telegram'

const base = {
  name: '홍길동',
  phone: '01012345678',
  date: '2026-10-06',
  startTime: '14:00',
  endTime: '15:00',
  program: '베이직 피부관리',
  durationMin: 60,
  price: 50000,
  isMember: true,
  newCustomer: false,
  message: '첫 방문입니다',
}

describe('newReservationMessage', () => {
  it('예약 내용을 한눈에 보이게 구성', () => {
    const text = newReservationMessage(base)
    expect(text).toContain('📅 <b>새 온라인 예약</b>')
    expect(text).toContain('홍길동 · 010-1234-5678 (🌸 회원 · 기존 고객)')
    expect(text).toContain('10월 6일 (화) 14:00 ~ 15:00')
    expect(text).toContain('베이직 피부관리 (60분) · 50,000원 (회원가)')
    expect(text).toContain('요청사항: 첫 방문입니다')
  })
  it('비회원·신규, 요청사항 없음', () => {
    const text = newReservationMessage({ ...base, isMember: false, newCustomer: true, price: 80000, message: null })
    expect(text).toContain('(비회원 · 신규 고객)')
    expect(text).toContain('80,000원 (비회원가)')
    expect(text).not.toContain('요청사항')
  })
  it('고객 입력값의 HTML 은 이스케이프', () => {
    const text = newReservationMessage({ ...base, name: '<b>해커</b>', message: 'a & <script>' })
    expect(text).toContain('&lt;b&gt;해커&lt;/b&gt;')
    expect(text).toContain('a &amp; &lt;script&gt;')
  })
})
