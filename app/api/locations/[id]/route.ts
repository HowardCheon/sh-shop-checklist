import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// PUT /api/locations/[id]
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const { name, deposit, monthly_rent, maintenance_fee, pros, cons, memo } = body

  if (!name?.trim()) return NextResponse.json({ error: '장소명을 입력하세요' }, { status: 400 })

  const { data, error } = await supabase
    .from('sh_shop_locations')
    .update({ name: name.trim(), deposit, monthly_rent, maintenance_fee, pros, cons, memo, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: '수정 실패' }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/locations/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { error } = await supabase
    .from('sh_shop_locations')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
