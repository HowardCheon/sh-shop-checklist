/* 예약 안내 문자 문구 — 단문(SMS) 80바이트 이내 기준, 시간은 KST */
import { isoToKst } from './time'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function parts(startIso: string) {
  const { date, time } = isoToKst(startIso)
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const ampm = hh < 12 ? '오전' : '오후'
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return { m, d, mm, ampm, h12, weekday: WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] }
}

/** 예약 확정: [온:플로우]\n곽지현님, 10/7(수) 오전10:30 예약확정되었습니다. 감사합니다. */
export function confirmText(name: string, startIso: string) {
  const p = parts(startIso)
  return `[온:플로우]\n${name}님, ${p.m}/${p.d}(${p.weekday}) ${p.ampm}${p.h12}:${String(p.mm).padStart(2, '0')} 예약확정되었습니다. 감사합니다.`
}

/** 전일 안내: [온:플로우]\n곽지현 고객님 안녕하세요 ^^ 내일 오전10시에 뵙겠습니다 ♡ */
export function remindText(name: string, startIso: string) {
  const p = parts(startIso)
  return `[온:플로우]\n${name} 고객님 안녕하세요 ^^ 내일 ${p.ampm}${p.h12}시${p.mm ? `${p.mm}분` : ''}에 뵙겠습니다 ♡`
}

/** 단문 바이트 수 (EUC-KR 기준 — 한글·기호 2, 영문·숫자 1) */
export function smsBytes(text: string) {
  return [...text].reduce((n, c) => n + (c.charCodeAt(0) < 128 ? 1 : 2), 0)
}

export const SMS_MAX_BYTES = 80

/** 발송 상태 — 보낸 뒤 예약 시간이 바뀌면 재발송 필요(stale) */
export function smsStatus(sentAt: string | null, sentForStart: string | null, startAt: string): 'none' | 'sent' | 'stale' {
  if (!sentAt) return 'none'
  return sentForStart && Date.parse(sentForStart) === Date.parse(startAt) ? 'sent' : 'stale'
}
