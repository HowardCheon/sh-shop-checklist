/* 솔라피 SMS 발송 (SOLAPI_API_KEY, SOLAPI_API_SECRET, SOLAPI_SENDER) */
import { createHmac, randomBytes } from 'node:crypto'

const BASE = 'https://api.solapi.com'

export function authHeader(apiKey: string, apiSecret: string, date: string, salt: string) {
  const signature = createHmac('sha256', apiSecret).update(date + salt).digest('hex')
  return `HMAC-SHA256 apiKey=${apiKey}, date=${date}, salt=${salt}, signature=${signature}`
}

export function verificationText(code: string) {
  return `[온:플로우] 인증번호 ${code} (3분 이내 입력)`
}

export function smsConfigured() {
  return !!(process.env.SOLAPI_API_KEY && process.env.SOLAPI_API_SECRET && process.env.SOLAPI_SENDER)
}

/** 계정 잔액 조회 — 충전금(balance)·포인트(point) */
export async function getBalance(): Promise<{ balance: number; point: number } | { error: string }> {
  const key = process.env.SOLAPI_API_KEY
  const secret = process.env.SOLAPI_API_SECRET
  if (!key || !secret) return { error: '솔라피 설정(SOLAPI_*) 없음' }
  try {
    const res = await fetch(`${BASE}/cash/v1/balance`, {
      headers: { Authorization: authHeader(key, secret, new Date().toISOString(), randomBytes(16).toString('hex')) },
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || typeof data?.balance !== 'number') return { error: failReason(res.status, data) }
    return { balance: data.balance, point: data.point ?? 0 }
  } catch (e) {
    return { error: e instanceof Error ? e.message : '네트워크 오류' }
  }
}

export type SmsResult = { ok: true } | { ok: false; reason: string }

/** 솔라피 응답에서 사람이 읽을 실패 사유 추출 */
function failReason(status: number, data: unknown) {
  const d = data as { errorCode?: string; errorMessage?: string; failedMessageList?: { statusCode?: string; statusMessage?: string }[] } | null
  const f = d?.failedMessageList?.[0]
  if (f) return `${f.statusCode ?? ''} ${f.statusMessage ?? ''}`.trim()
  if (d?.errorCode || d?.errorMessage) return `${d.errorCode ?? ''} ${d.errorMessage ?? ''}`.trim()
  return `HTTP ${status}`
}

/** 단건 발송 — 접수 결과와 실패 사유 반환 */
export async function sendSms(to: string, text: string): Promise<SmsResult> {
  // 개발용: 실제 발송 없이 성공 처리 (운영에서는 무시)
  if (process.env.SMS_DRY_RUN === 'true' && process.env.NODE_ENV !== 'production') {
    console.log('[SMS_DRY_RUN]', to, JSON.stringify(text))
    return { ok: true }
  }
  const key = process.env.SOLAPI_API_KEY
  const secret = process.env.SOLAPI_API_SECRET
  const from = process.env.SOLAPI_SENDER?.replace(/\D/g, '')
  if (!key || !secret || !from) return { ok: false, reason: '솔라피 설정(SOLAPI_*) 없음' }

  const salt = randomBytes(16).toString('hex') // 32자
  const date = new Date().toISOString()
  try {
    const res = await fetch(`${BASE}/messages/v4/send-many/detail`, {
      method: 'POST',
      headers: { Authorization: authHeader(key, secret, date, salt), 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ to, from, text }] }),
      signal: AbortSignal.timeout(10000),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data || (data.failedMessageList?.length ?? 0) > 0) {
      console.error('SMS 발송 실패', res.status, JSON.stringify(data)?.slice(0, 500))
      return { ok: false, reason: failReason(res.status, data) }
    }
    return { ok: true }
  } catch (e) {
    console.error('SMS 발송 오류', e)
    return { ok: false, reason: e instanceof Error ? `${e.name}: ${e.message}` : '네트워크 오류' }
  }
}
