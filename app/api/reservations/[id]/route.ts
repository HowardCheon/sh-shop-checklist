import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { blockTimes, findConflict, linkCustomer, recordCustomerHistory } from '@/lib/booking/admin'
import { voidReservationPayments } from '@/lib/payments'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [resRes, histRes] = await Promise.all([
    supabase.from('sh_shop_reservations').select('*').eq('id', id).single(),
    supabase.from('sh_shop_reservation_history').select('*').eq('reservation_id', id).order('changed_at', { ascending: true }),
  ])
  if (resRes.error) return NextResponse.json({ error: '조회 실패' }, { status: 404 })
  return NextResponse.json({ ...resRes.data, history: histRes.data ?? [] })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { customer_name, customer_phone, product_id, product_name, duration_min, start_at, price, memo, status } = body

  // 기존 데이터 조회
  const { data: existing } = await supabase.from('sh_shop_reservations').select('*').eq('id', id).single()
  if (!existing) return NextResponse.json({ error: '예약 없음' }, { status: 404 })

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const changes: string[] = []

  // 시간/시술시간 변경 또는 취소 건 복원 시 겹침 재확인
  const nextStart = start_at ?? existing.start_at
  const nextMins = duration_min ?? existing.duration_min ?? 60
  const timeChanged = (start_at && Date.parse(start_at) !== Date.parse(existing.start_at)) ||
    (duration_min != null && duration_min !== existing.duration_min)
  const restoring = status === 'scheduled' && existing.status === 'cancelled'
  if (timeChanged || restoring) {
    const times = blockTimes(nextStart, nextMins)
    const conflict = await findConflict(times.start_at, times.block_end_at, Number(id))
    if (conflict) return NextResponse.json({ error: '예약 시간 충돌', conflict }, { status: 409 })
    if (timeChanged) {
      Object.assign(updates, times, { duration_min: nextMins })
      changes.push(`시간 변경: ${existing.start_at} → ${times.start_at}`)
    }
  }

  if (customer_name !== undefined) { updates.customer_name = customer_name.trim(); if (customer_name !== existing.customer_name) changes.push(`고객명 변경`) }
  if (customer_phone !== undefined) {
    const { phone, customerId } = await linkCustomer((customer_name ?? existing.customer_name).trim(), customer_phone)
    updates.customer_phone = phone
    updates.customer_id = customerId
  }
  if (product_id !== undefined && product_id !== existing.product_id) { updates.product_id = product_id; changes.push(`시술 변경: ${existing.product_name} → ${product_name}`) }
  if (product_name !== undefined)   updates.product_name = product_name
  if (price !== undefined)          updates.price = price
  if (memo !== undefined)           updates.memo = memo || null

  // 상태 변경
  if (status !== undefined && status !== existing.status) {
    updates.status = status
    changes.push(status === 'completed' ? '시술 완료' : status === 'cancelled' ? '예약 취소' : `상태 변경 → ${status}`)
  }

  const { data, error } = await supabase.from('sh_shop_reservations').update(updates).eq('id', id).select().single()
  if (!error && existing.status === 'completed' && data.status !== 'completed') {
    // 완료 → 취소/복원: 결제 취소 및 선불 차감분 복원
    const voided = await voidReservationPayments(Number(id))
    if (voided > 0) changes.push(`결제 ${voided}건 취소(선불 복원)`)
  }
  if (error?.code === '23P01') return NextResponse.json({ error: '예약 시간 충돌' }, { status: 409 })
  if (error) return NextResponse.json({ error: '수정 실패' }, { status: 500 })

  if (changes.length > 0) {
    const action = status === 'completed' ? 'completed' : status === 'cancelled' ? 'cancelled' : 'updated'
    await supabase.from('sh_shop_reservation_history').insert({
      reservation_id: Number(id),
      action,
      description: changes.join(', '),
      old_value: existing,
      new_value: data,
    })
    await recordCustomerHistory(data.customer_id, {
      reservation_id: Number(id),
      action: `reservation_${action}`,
      description: `매장 처리: ${changes.join(', ')}`,
      old_value: existing,
      new_value: data,
    })
  }

  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data: existing } = await supabase.from('sh_shop_reservations').select('*').eq('id', id).single()
  const { error } = await supabase.from('sh_shop_reservations').delete().eq('id', id)
  if (error) return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
  if (existing) {
    await recordCustomerHistory(existing.customer_id, {
      action: 'reservation_deleted',
      description: `매장 삭제: ${existing.product_name ?? ''} ${existing.start_at}`,
      old_value: existing,
    })
  }
  return NextResponse.json({ ok: true })
}
