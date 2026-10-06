/* 운영 알림 — SMS 발송 실패·관리자 로그인 실패를 관리자(홍석, 2순위 봇) 텔레그램으로 */
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

export const SMS_UNIT_COST = 18 // 단문 1건 (원/포인트)
export const LOW_BALANCE = 3000

/** 매일 잔액 보고 메시지 (충전금+포인트 합계가 기준 미만이면 경고) */
export function balanceMessage(r: { balance?: number; point?: number; error?: string; at: Date }) {
  const day = kstLabel(r.at).split(' ').slice(0, 2).join(' ')
  if (r.error !== undefined) return `💰 <b>솔라피 잔액</b> (${day})\n⚠ 잔액 조회 실패: ${escape(r.error)}`
  const total = (r.balance ?? 0) + (r.point ?? 0)
  const lines = [
    `💰 <b>솔라피 잔액</b> (${day})`,
    `충전금 ${(r.balance ?? 0).toLocaleString('ko-KR')}원 · 포인트 ${(r.point ?? 0).toLocaleString('ko-KR')}`,
    `예상 발송 가능: 인증 문자 약 ${Math.floor(total / SMS_UNIT_COST).toLocaleString('ko-KR')}건`,
  ]
  if (total < LOW_BALANCE) lines.push(`⚠ 충전이 필요해요 (기준 ${LOW_BALANCE.toLocaleString('ko-KR')}원 미만). 잔액이 없으면 고객 인증번호가 발송되지 않아요.`)
  return lines.join('\n')
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

/** 5분에 1번만 발송, 그사이 건은 개수를 모아 다음 알림에 표시 (인스턴스 메모리 기준) */
function createThrottledAlerter<T>(deps: { send: (text: string) => Promise<boolean>; now?: () => number }, build: (arg: T, at: Date, suppressed: number) => string) {
  const now = deps.now ?? Date.now
  let lastSent = -Infinity
  let suppressed = 0
  return async (arg: T) => {
    const t = now()
    if (t - lastSent < THROTTLE_MS) {
      suppressed++
      return
    }
    lastSent = t
    const text = build(arg, new Date(t), suppressed)
    suppressed = 0
    await deps.send(text)
  }
}

export function createSmsFailureAlerter(deps: { send: (text: string) => Promise<boolean>; now?: () => number }) {
  const alert = createThrottledAlerter<{ phone: string; reason: string }>(deps, (r, at, suppressed) => smsFailureMessage({ ...r, at, suppressed }))
  return (phone: string, reason: string) => alert({ phone, reason })
}

export const alertSmsFailure = createSmsFailureAlerter({ send: sendTelegramToAdmin })

type LoginFailure = { ip: string; byIp: number; total: number; blocked: boolean }

export function loginFailureMessage(r: LoginFailure & { at: Date; suppressed: number }) {
  return [
    '🔐 <b>관리자 로그인 실패</b>',
    `IP: ${escape(r.ip)}`,
    `최근 10분 실패: 이 IP ${r.byIp}회 · 전체 ${r.total}회`,
    ...(r.blocked ? ['시도 횟수 초과로 10분간 차단됨'] : []),
    `시각: ${kstLabel(r.at)}`,
    ...(r.suppressed > 0 ? [`(직전 5분간 추가 실패 ${r.suppressed}건)`] : []),
    '본인이 아니라면 PIN 변경을 검토해 주세요.',
  ].join('\n')
}

export function createLoginFailureAlerter(deps: { send: (text: string) => Promise<boolean>; now?: () => number }) {
  return createThrottledAlerter<LoginFailure>(deps, (r, at, suppressed) => loginFailureMessage({ ...r, at, suppressed }))
}

export const alertLoginFailure = createLoginFailureAlerter({ send: sendTelegramToAdmin })
