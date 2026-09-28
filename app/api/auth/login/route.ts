import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { SESSION_COOKIE, SESSION_MAX_AGE_SEC, createSessionToken, verifyPin } from '@/lib/auth'

/* 로그인 시도 제한 — DB 공유(인스턴스 무관). 10분 기준 IP별 5회, 전체 20회 */
const WINDOW_MS = 10 * 60 * 1000
const MAX_PER_IP = 5
const MAX_TOTAL = 20

function clientIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local'
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req)
  const since = new Date(Date.now() - WINDOW_MS).toISOString()

  // 시도를 먼저 기록한 뒤 집계 → 동시 요청도 모두 횟수에 포함
  const { error: insertError } = await supabase.from('sh_shop_login_attempts').insert({ ip })
  if (insertError) return NextResponse.json({ error: '잠시 후 다시 시도하세요' }, { status: 503 })

  const [byIp, total] = await Promise.all([
    supabase.from('sh_shop_login_attempts').select('id', { count: 'exact', head: true }).eq('ip', ip).gte('created_at', since),
    supabase.from('sh_shop_login_attempts').select('id', { count: 'exact', head: true }).gte('created_at', since),
  ])
  if ((byIp.count ?? 0) > MAX_PER_IP || (total.count ?? 0) > MAX_TOTAL) {
    return NextResponse.json({ error: '시도 횟수를 초과했습니다. 10분 후 다시 시도하세요' }, { status: 429 })
  }

  const { pin } = await req.json().catch(() => ({}))
  if (!verifyPin(pin)) return NextResponse.json({ error: 'PIN 번호가 올바르지 않습니다' }, { status: 401 })

  // 성공: 이 IP 의 시도 기록 삭제, 오래된 기록 정리
  await Promise.all([
    supabase.from('sh_shop_login_attempts').delete().eq('ip', ip),
    supabase.from('sh_shop_login_attempts').delete().lt('created_at', since),
  ])

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, createSessionToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_SEC,
  })
  return res
}
