import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { name, service_group, price, member_price, duration_min, stock, description, is_active } = body

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (name !== undefined) updates.name = name.trim()
  if (price !== undefined) updates.price = price
  if (member_price !== undefined) updates.member_price = member_price
  if (service_group !== undefined) updates.service_group = service_group || null
  if (duration_min !== undefined) updates.duration_min = duration_min
  if (stock !== undefined) updates.stock = stock
  if (description !== undefined) updates.description = description || null
  if (is_active !== undefined) updates.is_active = is_active

  const { data, error } = await supabase
    .from('sh_shop_products')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: '수정 실패' }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await supabase.from('sh_shop_products').delete().eq('id', id)
  if (error) return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
