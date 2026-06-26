import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/* 시작/종료 기준으로 날짜 범위 조회 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') // ISO string
  const to = searchParams.get('to')     // ISO string

  let query = supabase
    .from('sh_shop_reservations')
    .select('*')
    .order('start_at', { ascending: true })

  if (from) query = query.gte('start_at', from)
  if (to)   query = query.lte('start_at', to)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  return NextResponse.json(data ?? [])
}

/* 겹침 확인: 버퍼 포함 블록이 겹치는 기존 예약 있으면 거부 */
async function checkConflict(startAt: Date, endAt: Date, excludeId?: number) {
  const bufMs = 10 * 60 * 1000
  const blockStart = new Date(startAt.getTime() - bufMs).toISOString()
  const blockEnd   = new Date(endAt.getTime()   + bufMs).toISOString()

  let query = supabase
    .from('sh_shop_reservations')
    .select('id, customer_name, start_at, end_at, product_name')
    .neq('status', 'cancelled')
    // 겹치는 조건: 기존 end_at > 새 blockStart AND 기존 start_at < 새 blockEnd
    .gt('end_at', blockStart)
    .lt('start_at', blockEnd)

  if (excludeId) query = query.neq('id', excludeId)

  const { data } = await query
  return data ?? []
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { customer_name, customer_phone, customer_id, product_id, product_name, duration_min, start_at, price, memo } = body

  if (!customer_name?.trim()) return NextResponse.json({ error: '고객명 필수' }, { status: 400 })
  if (!start_at)              return NextResponse.json({ error: '예약 시간 필수' }, { status: 400 })

  const startDate = new Date(start_at)
  const mins = duration_min ?? 60
  const endDate = new Date(startDate.getTime() + mins * 60 * 1000)

  // 겹침 확인
  const conflicts = await checkConflict(startDate, endDate)
  if (conflicts.length > 0) {
    const c = conflicts[0]
    return NextResponse.json({
      error: `예약 시간 충돌`,
      conflict: c,
    }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('sh_shop_reservations')
    .insert({
      customer_name: customer_name.trim(),
      customer_phone: customer_phone || null,
      customer_id: customer_id || null,
      product_id: product_id || null,
      product_name: product_name || null,
      duration_min: mins,
      start_at: startDate.toISOString(),
      end_at: endDate.toISOString(),
      price: price ?? null,
      status: 'scheduled',
      memo: memo || null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: '저장 실패' }, { status: 500 })

  // 이력 기록
  await supabase.from('sh_shop_reservation_history').insert({
    reservation_id: data.id,
    action: 'created',
    description: `예약 생성`,
    new_value: data,
  })

  return NextResponse.json(data)
}
