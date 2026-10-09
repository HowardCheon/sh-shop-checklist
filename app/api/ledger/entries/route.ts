import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { listCategories } from '@/lib/ledger/repo'
import { validateEntry } from '@/lib/ledger/summary'

/* 가계부 직접 입력 추가 (지출·기타 수입) */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: '요청 형식 오류' }, { status: 400 })
  let row
  try {
    row = validateEntry(body, await listCategories())
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '입력 오류' }, { status: 400 })
  }
  const { data, error } = await supabase.from('sh_shop_ledger_entries').insert(row).select().single()
  if (error) return NextResponse.json({ error: '저장 실패' }, { status: 500 })
  return NextResponse.json(data)
}
