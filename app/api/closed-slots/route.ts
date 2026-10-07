import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { candidateTimes } from '@/lib/booking/rules'
import { isValidDate } from '@/lib/booking/time'

/* 관리자 휴무시간 — 날짜별 30분 칸. GET ?date= → { date, times } */
export async function GET(req: NextRequest) {
  const date = new URL(req.url).searchParams.get('date')
  if (!isValidDate(date)) return NextResponse.json({ error: '날짜 형식 오류' }, { status: 400 })
  const { data, error } = await supabase.from('sh_shop_closed_slots').select('time').eq('date', date).order('time')
  if (error) return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  return NextResponse.json({ date, times: (data ?? []).map(r => r.time) })
}

/* PUT { date, times: ['14:00', ...] } — 그날 휴무시간을 통째로 교체 */
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const date = body?.date
  const times: unknown = body?.times
  if (!isValidDate(date) || !Array.isArray(times)) return NextResponse.json({ error: '요청 형식 오류' }, { status: 400 })
  const allowed = new Set(candidateTimes(date))
  const picked = [...new Set(times)]
  if (!picked.every(t => typeof t === 'string' && allowed.has(t))) {
    return NextResponse.json({ error: '영업시간 안의 30분 단위 시각만 지정할 수 있습니다' }, { status: 400 })
  }

  const { error: delErr } = await supabase.from('sh_shop_closed_slots').delete().eq('date', date)
  if (delErr) return NextResponse.json({ error: '저장 실패' }, { status: 500 })
  if (picked.length > 0) {
    const { error } = await supabase.from('sh_shop_closed_slots').insert(picked.map(time => ({ date, time })))
    if (error) return NextResponse.json({ error: '저장 실패' }, { status: 500 })
  }
  return NextResponse.json({ date, times: (picked as string[]).sort() })
}
