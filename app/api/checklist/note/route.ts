import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const SESSION_ID = process.env.CHECKLIST_SESSION_ID ?? 'sh-shop-main-v1'

// PATCH /api/checklist/note → { itemId: string, note: string }
export async function PATCH(req: NextRequest) {
  const { itemId, note } = await req.json() as { itemId: string; note: string }
  const trimmed = note.trim()

  const { error } = await supabase
    .from('sh_shop_checklist')
    .upsert(
      { session_id: SESSION_ID, item_id: itemId, note: trimmed, updated_at: new Date().toISOString() },
      { onConflict: 'session_id,item_id' }
    )

  if (error) return NextResponse.json({ error: '저장 실패' }, { status: 500 })

  await supabase.from('sh_shop_checklist_history').insert({
    session_id: SESSION_ID,
    item_id: itemId,
    action: 'note_updated',
    note: trimmed,
  })

  return NextResponse.json({ ok: true })
}
