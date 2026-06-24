import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const SESSION_ID = process.env.CHECKLIST_SESSION_ID ?? 'sh-shop-main-v1'

// GET /api/checklist → { item_id, is_checked, note }[]
export async function GET() {
  const { data, error } = await supabase
    .from('sh_shop_checklist')
    .select('item_id, is_checked, note')
    .eq('session_id', SESSION_ID)

  if (error) return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// DELETE /api/checklist → 세션 전체 체크 초기화
export async function DELETE() {
  const { error } = await supabase
    .from('sh_shop_checklist')
    .update({ is_checked: false, updated_at: new Date().toISOString() })
    .eq('session_id', SESSION_ID)

  if (error) return NextResponse.json({ error: '초기화 실패' }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// POST /api/checklist → { itemId: string, checked: boolean }
// 단건 체크 토글 + 이력 기록
export async function POST(req: NextRequest) {
  const { itemId, checked } = await req.json() as { itemId: string; checked: boolean }

  const { error } = await supabase
    .from('sh_shop_checklist')
    .upsert(
      { session_id: SESSION_ID, item_id: itemId, is_checked: checked, updated_at: new Date().toISOString() },
      { onConflict: 'session_id,item_id' }
    )

  if (error) return NextResponse.json({ error: '저장 실패' }, { status: 500 })

  await supabase.from('sh_shop_checklist_history').insert({
    session_id: SESSION_ID,
    item_id: itemId,
    action: checked ? 'checked' : 'unchecked',
  })

  return NextResponse.json({ ok: true })
}
