import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

const SESSION_ID = process.env.CHECKLIST_SESSION_ID ?? 'sh-shop-main-v1'

// GET /api/checklist/history?itemId=xxx
export async function GET(req: NextRequest) {
  const itemId = new URL(req.url).searchParams.get('itemId')
  if (!itemId) return NextResponse.json([])

  const { data, error } = await supabase
    .from('sh_shop_checklist_history')
    .select('id, action, note, created_at')
    .eq('session_id', SESSION_ID)
    .eq('item_id', itemId)
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  return NextResponse.json(data ?? [])
}
