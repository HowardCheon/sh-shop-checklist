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

/** 발송 대상 — 1순위(TELEGRAM_PRIMARY_*) 먼저, 2순위(TELEGRAM_*) 다음. 설정된 곳만 */
function targets() {
  return [
    { label: '1순위', token: process.env.TELEGRAM_PRIMARY_BOT_TOKEN, chatId: process.env.TELEGRAM_PRIMARY_CHAT_ID },
    { label: '2순위', token: process.env.TELEGRAM_BOT_TOKEN, chatId: process.env.TELEGRAM_CHAT_ID },
  ].filter((t): t is { label: string; token: string; chatId: string } => !!t.token && !!t.chatId)
}

async function sendOne(t: { label: string; token: string; chatId: string }, text: string) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${t.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: t.chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) console.error(`텔레그램(${t.label}) 발송 실패`, res.status, await res.text())
    return res.ok
  } catch (e) {
    console.error(`텔레그램(${t.label}) 발송 오류`, e)
    return false
  }
}

/** 모든 대상에 순위대로 발송 — 한 곳이 실패해도 나머지는 계속, 예약 처리에는 영향 없음 */
export async function sendTelegram(text: string) {
  const results: boolean[] = []
  for (const t of targets()) results.push(await sendOne(t, text))
  return results.length > 0 && results.every(Boolean)
}
