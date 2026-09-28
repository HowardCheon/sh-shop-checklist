import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { isValidDate } from '@/lib/booking/time'

/* 휴무일 조회 — ?from=YYYY-MM-DD&to=YYYY-MM-DD */
export async function GET(req: NextRequest) {
  const from = req.nextUrl.searchParams.get('from')
  const to = req.nextUrl.searchParams.get('to')
  let query = supabase.from('sh_shop_closed_dates').select('date, reason').order('date', { ascending: true })
  if (from) query = query.gte('date', from)
  if (to)   query = query.lte('date', to)
  const { data, error } = await query
  if (error) return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  return NextResponse.json(data ?? [])
}

/* 휴무일 지정 — { date, reason } */
export async function POST(req: NextRequest) {
  const { date, reason } = await req.json()
  if (!isValidDate(date)) return NextResponse.json({ error: '날짜 형식 오류' }, { status: 400 })
  const { data, error } = await supabase
    .from('sh_shop_closed_dates')
    .upsert({ date, reason: reason?.trim() || null })
    .select()
    .single()
  if (error) return NextResponse.json({ error: '저장 실패' }, { status: 500 })
  return NextResponse.json(data)
}

/* 휴무일 해제 — ?date=YYYY-MM-DD */
export async function DELETE(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date')
  if (!isValidDate(date)) return NextResponse.json({ error: '날짜 형식 오류' }, { status: 400 })
  const { error } = await supabase.from('sh_shop_closed_dates').delete().eq('date', date)
  if (error) return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
