import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

async function checkConflict(startAt: Date, endAt: Date, excludeId: number) {
  const bufMs = 10 * 60 * 1000
  const blockStart = new Date(startAt.getTime() - bufMs).toISOString()
  const blockEnd   = new Date(endAt.getTime()   + bufMs).toISOString()

  const { data } = await supabase
    .from('sh_shop_reservations')
    .select('id, customer_name, start_at, end_at, product_name')
    .neq('status', 'cancelled')
    .neq('id', excludeId)
    .gt('end_at', blockStart)
    .lt('start_at', blockEnd)

  return data ?? []
}

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

  // 시간 변경 시 겹침 재확인
  if (start_at && start_at !== existing.start_at) {
    const startDate = new Date(start_at)
    const mins = duration_min ?? existing.duration_min ?? 60
    const endDate = new Date(startDate.getTime() + mins * 60 * 1000)

    const conflicts = await checkConflict(startDate, endDate, Number(id))
    if (conflicts.length > 0) {
      return NextResponse.json({ error: '예약 시간 충돌', conflict: conflicts[0] }, { status: 409 })
    }

    updates.start_at = startDate.toISOString()
    updates.end_at = endDate.toISOString()
    updates.duration_min = mins
    changes.push(`시간 변경: ${existing.start_at} → ${start_at}`)
  }

  if (customer_name !== undefined) { updates.customer_name = customer_name.trim(); if (customer_name !== existing.customer_name) changes.push(`고객명 변경`) }
  if (customer_phone !== undefined) updates.customer_phone = customer_phone || null
  if (product_id !== undefined)     { updates.product_id = product_id; changes.push(`시술 변경: ${existing.product_name} → ${product_name}`) }
  if (product_name !== undefined)   updates.product_name = product_name
  if (price !== undefined)          updates.price = price
  if (memo !== undefined)           updates.memo = memo || null

  // 상태 변경
  if (status !== undefined && status !== existing.status) {
    updates.status = status
    changes.push(status === 'completed' ? '시술 완료' : status === 'cancelled' ? '예약 취소' : `상태 변경 → ${status}`)
  }

  const { data, error } = await supabase.from('sh_shop_reservations').update(updates).eq('id', id).select().single()
  if (error) return NextResponse.json({ error: '수정 실패' }, { status: 500 })

  // 당일 이력 기록
  const today = new Date().toISOString().slice(0, 10)
  const resDate = existing.start_at.slice(0, 10)
  if (resDate === today && changes.length > 0) {
    await supabase.from('sh_shop_reservation_history').insert({
      reservation_id: Number(id),
      action: status === 'completed' ? 'completed' : status === 'cancelled' ? 'cancelled' : 'updated',
      description: changes.join(', '),
      old_value: existing,
      new_value: data,
    })
  }

  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await supabase.from('sh_shop_reservations').delete().eq('id', id)
  if (error) return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
