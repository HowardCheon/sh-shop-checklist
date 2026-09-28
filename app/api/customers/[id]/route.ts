import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { normalizePhone } from '@/lib/booking/phone'

function cleanPhone(phone: unknown): string | null {
  if (typeof phone !== 'string' || !phone.trim()) return null
  try { return normalizePhone(phone) } catch { return phone.trim() }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data, error } = await supabase
    .from('sh_shop_customers')
    .select(`
      *,
      reservations:sh_shop_reservations(id, customer_name, product_name, duration_min, start_at, end_at, price, status, memo)
    `)
    .eq('id', id)
    .single()

  if (error) return NextResponse.json({ error: '조회 실패' }, { status: 404 })
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { name, phone, memo } = body

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (name !== undefined) updates.name = name.trim()
  if (phone !== undefined) updates.phone = cleanPhone(phone)
  if (memo !== undefined) updates.memo = memo || null

  const { data, error } = await supabase
    .from('sh_shop_customers')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error?.code === '23505') return NextResponse.json({ error: '이미 등록된 전화번호입니다' }, { status: 409 })
  if (error) return NextResponse.json({ error: '수정 실패' }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await supabase.from('sh_shop_customers').delete().eq('id', id)
  if (error) return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
