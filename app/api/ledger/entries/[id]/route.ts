import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { listCategories } from '@/lib/ledger/repo'
import { validateEntry } from '@/lib/ledger/summary'

/* 가계부 직접 입력 수정 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: '요청 형식 오류' }, { status: 400 })
  let row
  try {
    row = validateEntry(body, await listCategories())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '입력 오류' }, { status: 400 })
  }
  const { data, error } = await supabase.from('sh_shop_ledger_entries').update({ ...row, updated_at: new Date().toISOString() }).eq('id', id).select().maybeSingle()
  if (error) return NextResponse.json({ error: '저장 실패' }, { status: 500 })
  if (!data) return NextResponse.json({ error: '내역 없음' }, { status: 404 })
  return NextResponse.json(data)
}

/* 가계부 직접 입력 삭제 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data, error } = await supabase.from('sh_shop_ledger_entries').delete().eq('id', id).select('id').maybeSingle()
  if (error) return NextResponse.json({ error: '삭제 실패' }, { status: 500 })
  if (!data) return NextResponse.json({ error: '내역 없음' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
