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
    users: 12, views: 40, mobileShare: 83, internal: 7, guestsNew: 4, guestsReturning: 1,
    channels: [
      { label: '직접', count: 5, parts: [] },
      { label: '검색', count: 3, parts: [{ label: '네이버', count: 2 }, { label: '<구글>', count: 1 }] },
    ],
    cities: [{ label: '하남', count: 6 }, { label: '서울', count: 4 }],
    pages: [{ label: '홈', count: 20 }, { label: '예약', count: 9 }],
  }
  it('방문(내부/손님·신규/재방문)·유입 묶음·지역·페이지·예약 건수', () => {
    const text = accessReportMessage({ label: '10월 6일', ga, bookings: { created: 2, updated: 1, cancelled: 0 } })
    expect(text).toBe([
      '📊 <b>홈페이지 접속</b> (10월 6일)',
      '방문자 12명 (내부 7 · 손님 5) · 페이지뷰 40회 (모바일 83%)',
      '손님: 신규 4 · 재방문 1',
      '유입: 직접 5 · 검색 3(네이버 2·&lt;구글&gt; 1)',
      '지역: 하남 6 · 서울 4',
      '많이 본 페이지: 홈 20 · 예약 9',
      '온라인 예약: 신규 2건 · 변경 1건 · 취소 0건',
    ].join('\n'))
  })
  it('내부 방문이 없거나 구분 못 하면 방문자 줄에 내부/손님 생략, 신규/재방문은 전체 기준', () => {
    const t1 = accessReportMessage({ label: '10월 6일', ga: { ...ga, internal: 0 }, bookings: { created: 0, updated: 0, cancelled: 0 } })
    expect(t1).toContain('방문자 12명 · 페이지뷰 40회')
    expect(t1).toContain('방문: 신규 4 · 재방문 1')
    const t2 = accessReportMessage({ label: '10월 6일', ga: { ...ga, internal: null }, bookings: { created: 0, updated: 0, cancelled: 0 } })
    expect(t2).toContain('방문자 12명 · 페이지뷰 40회')
  })
  it('방문이 없으면 유입·지역·페이지 줄 생략', () => {
    const text = accessReportMessage({
      label: '10월 6일',
      ga: { users: 0, views: 0, mobileShare: 0, internal: 0, guestsNew: 0, guestsReturning: 0, channels: [], cities: [], pages: [] },
      bookings: { created: 0, updated: 0, cancelled: 0 },
    })
    expect(text).toContain('방문자 0명 · 페이지뷰 0회')
    for (const k of ['유입:', '지역:', '많이 본 페이지', '손님:', '방문:']) expect(text).not.toContain(k)
  })
  it('GA·DB 실패는 각 줄에 사유만 표시', () => {
    const text = accessReportMessage({ label: '10월 6일', ga: { error: 'HTTP 403' }, bookings: { error: 'timeout' } })
    expect(text).toContain('⚠ 방문 통계 조회 실패: HTTP 403')
    expect(text).toContain('⚠ 온라인 예약 집계 실패: timeout')
  })
})
