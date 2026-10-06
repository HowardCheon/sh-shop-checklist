import { describe, it, expect } from 'vitest'
import { kstYesterday, accessReportMessage } from '../daily-report'

describe('어제(한국시간) 범위', () => {
  it('09:00 KST 크론 → 전날 0시~24시', () => {
    const y = kstYesterday(new Date('2026-10-07T00:00:00Z'))
    expect(y).toEqual({
      date: '2026-10-06',
      label: '10월 6일',
      fromIso: '2026-10-05T15:00:00.000Z',
      toIso: '2026-10-06T15:00:00.000Z',
    })
  })
  it('월 경계', () => {
    expect(kstYesterday(new Date('2026-11-01T00:00:00Z')).date).toBe('2026-10-31')
  })
})

describe('접속 리포트 메시지', () => {
  const ga = {
    users: 23, views: 61, mobileShare: 87,
    sources: [{ label: '네이버', count: 12 }, { label: '<직접>', count: 5 }],
    pages: [{ label: '홈', count: 23 }, { label: '예약', count: 9 }],
  }
  it('방문·유입·페이지·예약 건수', () => {
    const text = accessReportMessage({ label: '10월 6일', ga, bookings: { created: 2, updated: 1, cancelled: 0 } })
    expect(text).toBe([
      '📊 <b>홈페이지 접속</b> (10월 6일)',
      '방문자 23명 · 페이지뷰 61회 (모바일 87%)',
      '유입: 네이버 12 · &lt;직접&gt; 5',
      '많이 본 페이지: 홈 23 · 예약 9',
      '온라인 예약: 신규 2건 · 변경 1건 · 취소 0건',
    ].join('\n'))
  })
  it('방문이 없으면 유입·페이지 줄 생략', () => {
    const text = accessReportMessage({
      label: '10월 6일', ga: { users: 0, views: 0, mobileShare: 0, sources: [], pages: [] }, bookings: { created: 0, updated: 0, cancelled: 0 },
    })
    expect(text).toContain('방문자 0명 · 페이지뷰 0회')
    expect(text).not.toContain('유입:')
    expect(text).not.toContain('많이 본 페이지')
  })
  it('GA·DB 실패는 각 줄에 사유만 표시', () => {
    const text = accessReportMessage({ label: '10월 6일', ga: { error: 'HTTP 403' }, bookings: { error: 'timeout' } })
    expect(text).toContain('⚠ 방문 통계 조회 실패: HTTP 403')
    expect(text).toContain('⚠ 온라인 예약 집계 실패: timeout')
  })
})
