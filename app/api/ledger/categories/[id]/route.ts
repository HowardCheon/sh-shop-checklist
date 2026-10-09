import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/* 항목 수정 — { name?, hidden?, sort? } (기존 내역은 그대로 유지) */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: '요청 형식 오류' }, { status: 400 })
  const updates: Record<string, unknown> = {}
  if (body.name !== undefined) {
    const name = typeof body.name === 'string' ? body.name.trim().slice(0, 30) : ''
    if (!name) return NextResponse.json({ error: '이름을 입력하세요' }, { status: 400 })
    updates.name = name
  }
  if (body.hidden !== undefined) updates.hidden = body.hidden === true
  if (body.sort !== undefined && Number.isInteger(body.sort)) updates.sort = body.sort
  if (Object.keys(updates).length === 0) return NextResponse.json({ error: '바꿀 내용이 없습니다' }, { status: 400 })
  const { data, error } = await supabase.from('sh_shop_ledger_categories').update(updates).eq('id', id).select().maybeSingle()
  if (error?.code === '23505') return NextResponse.json({ error: '같은 이름의 항목이 있습니다' }, { status: 409 })
  if (error) return NextResponse.json({ error: '저장 실패' }, { status: 500 })
  if (!data) return NextResponse.json({ error: '항목 없음' }, { status: 404 })
  return NextResponse.json(data)
}
