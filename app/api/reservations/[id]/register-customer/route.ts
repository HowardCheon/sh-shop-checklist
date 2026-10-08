import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { normalizePhone } from '@/lib/booking/phone'
import { findOrCreateCustomer } from '@/lib/booking/repo'
import { recordCustomerHistory } from '@/lib/booking/admin'

/* 예약자 고객 등록 — 고객과 연결되지 않은 예약을 고객으로 등록·연결
 * {}                     : 예약자명으로 등록 (같은 이름 고객이 있으면 409 + same_name 후보 목록)
 * { link_customer_id }   : 기존 고객과 연결 (고객 연락처를 예약에 채움)
 * { force_new: true }    : 같은 이름이 있어도 새 고객으로 등록 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const { data: resv } = await supabase.from('sh_shop_reservations').select('*').eq('id', id).maybeSingle()
  if (!resv) return NextResponse.json({ error: '예약 없음' }, { status: 404 })
  if (resv.customer_id) return NextResponse.json({ error: '이미 고객과 연결된 예약입니다' }, { status: 409 })
  const name = String(resv.customer_name ?? '').trim()
  if (!name) return NextResponse.json({ error: '예약자명이 없습니다' }, { status: 400 })

  let customer: { id: number; name: string; phone: string | null }
  let created = false

  if (body.link_customer_id) {
    const { data } = await supabase.from('sh_shop_customers').select('id, name, phone').eq('id', Number(body.link_customer_id)).maybeSingle()
    if (!data) return NextResponse.json({ error: '고객을 찾을 수 없습니다' }, { status: 404 })
    customer = data
  } else {
    // 예약에 올바른 휴대폰 번호가 있으면 번호 기준으로 찾거나 생성
    let phone: string | null = null
    try { phone = normalizePhone(resv.customer_phone) } catch { /* 번호 없음 */ }
    if (phone) {
      const r = await findOrCreateCustomer(name, phone)
      customer = r.customer
      created = r.created
    } else {
      if (!body.force_new) {
        const { data: same } = await supabase.from('sh_shop_customers').select('id, name, phone, reservations:sh_shop_reservations(id, status)').eq('name', name).limit(10)
        if (same && same.length > 0) {
          return NextResponse.json({
            error: '같은 이름의 고객이 있습니다',
            same_name: same.map(c => ({
              id: c.id, name: c.name, phone: c.phone,
              visits: (c.reservations as { status: string }[] | null ?? []).filter(x => x.status === 'completed').length,
            })),
          }, { status: 409 })
        }
      }
      const { data, error } = await supabase.from('sh_shop_customers').insert({ name, phone: null }).select('id, name, phone').single()
      if (error || !data) return NextResponse.json({ error: '고객 등록 실패' }, { status: 500 })
      customer = data
      created = true
    }
  }

  const { data: updated, error } = await supabase.from('sh_shop_reservations')
    .update({ customer_id: customer.id, customer_phone: resv.customer_phone ?? customer.phone, updated_at: new Date().toISOString() })
    .eq('id', resv.id).is('customer_id', null)
    .select().maybeSingle()
  if (error) return NextResponse.json({ error: '연결 실패' }, { status: 500 })
  if (!updated) return NextResponse.json({ error: '이미 고객과 연결된 예약입니다' }, { status: 409 })

  const desc = `${created ? '고객 등록' : '기존 고객 연결'}: 예약 ${resv.start_at.slice(0, 10)} ${resv.product_name ?? ''}`.trim()
  await supabase.from('sh_shop_reservation_history').insert({ reservation_id: resv.id, action: 'updated', description: created ? '예약자 고객 등록' : `기존 고객(${customer.name}) 연결` })
  await recordCustomerHistory(customer.id, { reservation_id: resv.id, action: 'customer_linked', description: desc })

  return NextResponse.json({ customer, created, reservation: updated })
}
