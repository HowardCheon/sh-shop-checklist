/* 운영 알림 — SMS 발송 실패를 관리자(홍석, 2순위 봇) 텔레그램으로 */
import { sendTelegramToAdmin } from './telegram'

const THROTTLE_MS = 5 * 60 * 1000

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const maskPhone = (p: string) => {
  const d = p.replace(/\D/g, '')
  return d.length >= 10 ? `${d.slice(0, 3)}-****-${d.slice(-4)}` : '****'
}
const kstLabel = (at: Date) => {
  const k = new Date(at.getTime() + 9 * 3600 * 1000)
  return `${k.getUTCMonth() + 1}월 ${k.getUTCDate()}일 ${String(k.getUTCHours()).padStart(2, '0')}:${String(k.getUTCMinutes()).padStart(2, '0')}`
}

export function smsFailureMessage(r: { phone: string; reason: string; at: Date; suppressed: number }) {
  return [
    '⚠️ <b>SMS 발송 실패</b>',
    `수신: ${maskPhone(r.phone)}`,
    `사유: ${escape(r.reason)}`,
    `시각: ${kstLabel(r.at)}`,
    ...(r.suppressed > 0 ? [`(직전 5분간 추가 실패 ${r.suppressed}건)`] : []),
    '고객이 인증번호를 받지 못해 예약·조회가 막혔을 수 있어요. 솔라피 잔액·발신번호를 확인해 주세요.',
  ].join('\n')
}

/** 5분에 1번만 발송, 그사이 실패는 건수를 모아 다음 알림에 표시 (인스턴스 메모리 기준) */
export function createSmsFailureAlerter(deps: { send: (text: string) => Promise<boolean>; now?: () => number }) {
  const now = deps.now ?? Date.now
  let lastSent = -Infinity
  let suppressed = 0
  return async (phone: string, reason: string) => {
    const t = now()
    if (t - lastSent < THROTTLE_MS) {
      suppressed++
      return
    }
    lastSent = t
    const text = smsFailureMessage({ phone, reason, at: new Date(t), suppressed })
    suppressed = 0
    await deps.send(text)
  }
}

export const alertSmsFailure = createSmsFailureAlerter({ send: sendTelegramToAdmin })
