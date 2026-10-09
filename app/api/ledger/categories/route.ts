import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { listCategories } from '@/lib/ledger/repo'

/* 가계부 항목 목록 (숨김 포함, 사용 횟수) */
export async function GET() {
  try {
    return NextResponse.json({ categories: await listCategories() })
  } catch {
    return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  }
}

/* 항목 추가 — { io, name } */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const io = body?.io
  const name = typeof body?.name === 'string' ? body.name.trim().slice(0, 30) : ''
  if ((io !== 'in' && io !== 'out') || !name) return NextResponse.json({ error: '구분과 이름을 입력하세요' }, { status: 400 })
  const { data, error } = await supabase.from('sh_shop_ledger_categories').insert({ io, name, sort: 500 }).select().single()
  if (error?.code === '23505') return NextResponse.json({ error: '같은 이름의 항목이 있습니다' }, { status: 409 })
  if (error) return NextResponse.json({ error: '저장 실패' }, { status: 500 })
  return NextResponse.json(data)
}
