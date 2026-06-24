import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const SESSION_ID = process.env.CHECKLIST_SESSION_ID ?? 'sh-shop-main-v1'

// GET /api/checklist → 체크된 item_id 목록 반환
export async function GET() {
  const { data, error } = await supabase
    .from('sh_shop_checklist')
    .select('item_id')
    .eq('session_id', SESSION_ID)

  if (error) return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  return NextResponse.json(data.map((r) => r.item_id))
}

// POST /api/checklist  body: { checkedIds: string[] }
// 전체 상태를 한 번에 덮어쓰기
export async function POST(req: NextRequest) {
  const { checkedIds } = await req.json() as { checkedIds: string[] }

  const { error: delErr } = await supabase
    .from('sh_shop_checklist')
    .delete()
    .eq('session_id', SESSION_ID)

  if (delErr) return NextResponse.json({ error: '저장 실패' }, { status: 500 })

  if (checkedIds.length > 0) {
    const rows = checkedIds.map((id) => ({ session_id: SESSION_ID, item_id: id }))
    const { error: insErr } = await supabase.from('sh_shop_checklist').insert(rows)
    if (insErr) return NextResponse.json({ error: '저장 실패' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
