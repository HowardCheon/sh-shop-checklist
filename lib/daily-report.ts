/* 매일 아침 접속 리포트 — 어제(한국시간) 홈페이지 방문(GA) + 온라인 예약 건수(DB) */
import type { DailyReport } from './ga'

const KST_MS = 9 * 3600 * 1000
const DAY_MS = 24 * 3600 * 1000

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** 어제 한국 날짜와 그 하루의 UTC 범위 */
export function kstYesterday(now: Date) {
  const date = new Date(now.getTime() + KST_MS - DAY_MS).toISOString().slice(0, 10)
  const from = new Date(`${date}T00:00:00+09:00`)
  const [, m, d] = date.split('-').map(Number)
  return { date, label: `${m}월 ${d}일`, fromIso: from.toISOString(), toIso: new Date(from.getTime() + DAY_MS).toISOString() }
}

export type BookingCounts = { created: number; updated: number; cancelled: number }

const joinRanked = (items: { label: string; count: number }[]) => items.map(i => `${escape(i.label)} ${i.count}`).join(' · ')

export function accessReportMessage(r: { label: string; ga: DailyReport | { error: string }; bookings: BookingCounts | { error: string } }) {
  const lines = [`📊 <b>홈페이지 접속</b> (${r.label})`]
  if ('error' in r.ga) {
    lines.push(`⚠ 방문 통계 조회 실패: ${escape(r.ga.error)}`)
  } else {
    const g = r.ga
    const split = g.internal ? ` (내부 ${g.internal} · 손님 ${g.users - g.internal})` : ''
    lines.push(`방문자 ${g.users.toLocaleString('ko-KR')}명${split} · 페이지뷰 ${g.views.toLocaleString('ko-KR')}회${g.users ? ` (모바일 ${g.mobileShare}%)` : ''}`)
    if (g.guestsNew + g.guestsReturning > 0) lines.push(`${g.internal ? '손님' : '방문'}: 신규 ${g.guestsNew} · 재방문 ${g.guestsReturning}`)
    if (g.channels.length) {
      const parts = (c: DailyReport['channels'][number]) => (c.parts.length ? `(${c.parts.map(p => `${escape(p.label)} ${p.count}`).join('·')})` : '')
      lines.push(`유입: ${g.channels.map(c => `${escape(c.label)} ${c.count}${parts(c)}`).join(' · ')}`)
    }
    if (g.cities.length) lines.push(`지역: ${joinRanked(g.cities)}`)
    if (g.pages.length) lines.push(`많이 본 페이지: ${joinRanked(g.pages)}`)
  }
  if ('error' in r.bookings) lines.push(`⚠ 온라인 예약 집계 실패: ${escape(r.bookings.error)}`)
  else lines.push(`온라인 예약: 신규 ${r.bookings.created}건 · 변경 ${r.bookings.updated}건 · 취소 ${r.bookings.cancelled}건`)
  return lines.join('\n')
}
