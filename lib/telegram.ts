/* 텔레그램 알림 — 예약 전용 봇 (TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID) */

const WEEK = ['일', '월', '화', '수', '목', '금', '토']

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function formatPhone(p: string) {
  const d = p.replace(/\D/g, '')
  return d.length === 11 ? `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}` : d
}

function dateLabel(date: string) {
  const [, m, d] = date.split('-').map(Number)
  return `${m}월 ${d}일 (${WEEK[new Date(`${date}T00:00:00Z`).getUTCDay()]})`
}

export type NewReservationInfo = {
  name: string
  phone: string
  date: string
  startTime: string
  endTime: string
  program: string
  durationMin: number
  price: number | null
  isMember: boolean
  newCustomer: boolean
  message: string | null
}

export function newReservationMessage(r: NewReservationInfo) {
  const lines = [
    '📅 <b>새 온라인 예약</b>',
    `${escape(r.name)} · ${formatPhone(r.phone)} (${r.isMember ? '🌸 회원' : '비회원'} · ${r.newCustomer ? '신규' : '기존'} 고객)`,
    `${dateLabel(r.date)} ${r.startTime} ~ ${r.endTime}`,
    `${escape(r.program)} (${r.durationMin}분) · ${(r.price ?? 0).toLocaleString('ko-KR')}원 (${r.isMember ? '회원가' : '비회원가'})`,
  ]
  if (r.message) lines.push(`요청사항: ${escape(r.message)}`)
  return lines.join('\n')
}

/** 발송 실패는 로그만 남김 (예약 처리에 영향 없음) */
export async function sendTelegram(text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return false
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) console.error('텔레그램 발송 실패', res.status, await res.text())
    return res.ok
  } catch (e) {
    console.error('텔레그램 발송 오류', e)
    return false
  }
}
