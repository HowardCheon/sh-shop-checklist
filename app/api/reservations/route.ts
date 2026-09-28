import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { blockTimes, findConflict, linkCustomer, recordCustomerHistory } from '@/lib/booking/admin'

/* 시작/종료 기준으로 날짜 범위 조회 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const from = searchParams.get('from') // ISO string
  const to = searchParams.get('to')     // ISO string

  let query = supabase
    .from('sh_shop_reservations')
    .select('*, customer:sh_shop_customers(prepaid_cash, prepaid_bonus), product:sh_shop_products(price, member_price)')
    .order('start_at', { ascending: true })

  if (from) query = query.gte('start_at', from)
  if (to)   query = query.lte('start_at', to)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { customer_name, customer_phone, product_id, product_name, duration_min, start_at, price, memo } = body

  if (!customer_name?.trim()) return NextResponse.json({ error: '고객명 필수' }, { status: 400 })
  if (!start_at || isNaN(Date.parse(start_at))) return NextResponse.json({ error: '예약 시간 필수' }, { status: 400 })

  const mins = duration_min ?? 60
  const times = blockTimes(start_at, mins)

  // 겹침 확인 (시술 + 정리시간 20분 블록)
  const conflict = await findConflict(times.start_at, times.block_end_at)
  if (conflict) return NextResponse.json({ error: '예약 시간 충돌', conflict }, { status: 409 })

  const name = customer_name.trim()
  const { phone, customerId } = await linkCustomer(name, customer_phone)

  const { data, error } = await supabase
    .from('sh_shop_reservations')
    .insert({
      customer_name: name,
      customer_phone: phone,
      customer_id: customerId,
      product_id: product_id || null,
      product_name: product_name || null,
      duration_min: mins,
      ...times,
      price: price ?? null,
      status: 'scheduled',
      source: 'admin',
      memo: memo || null,
    })
    .select()
    .single()

  if (error?.code === '23P01') return NextResponse.json({ error: '예약 시간 충돌' }, { status: 409 })
  if (error) return NextResponse.json({ error: '저장 실패' }, { status: 500 })

  // 이력 기록
  await supabase.from('sh_shop_reservation_history').insert({
    reservation_id: data.id,
    action: 'created',
    description: `예약 생성`,
    new_value: data,
  })
  await recordCustomerHistory(customerId, {
    reservation_id: data.id,
    action: 'reservation_created',
    description: `매장 예약: ${product_name ?? '시술 미지정'}`,
    new_value: data,
  })

  return NextResponse.json(data)
}
