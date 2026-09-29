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

/** 단건 발송 — 접수 성공 여부 반환 (실패 사유는 로그) */
export async function sendSms(to: string, text: string): Promise<boolean> {
  const key = process.env.SOLAPI_API_KEY
  const secret = process.env.SOLAPI_API_SECRET
  const from = process.env.SOLAPI_SENDER?.replace(/\D/g, '')
  if (!key || !secret || !from) return false

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
      return false
    }
    return true
  } catch (e) {
    console.error('SMS 발송 오류', e)
    return false
  }
}
