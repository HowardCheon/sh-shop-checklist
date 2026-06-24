import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/checklist?s=SESSION_ID → 체크된 항목 목록 반환 (읽기는 session_id만 필요)
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('s')
  if (!sessionId) return NextResponse.json([], { status: 200 })

  const { data, error } = await supabase
    .from('sh_shop_checklist')
    .select('item_id')
    .eq('session_id', sessionId)

  if (error) return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  return NextResponse.json(data.map((r) => r.item_id))
}

// POST /api/checklist → 세션 등록 또는 체크 상태 동기화
// 세션 등록: { action: 'init', sessionId, writeToken }
// 체크 저장: { action: 'save', sessionId, writeToken, checkedIds }
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { action, sessionId, writeToken } = body

  if (!sessionId || !writeToken) {
    return NextResponse.json({ error: 'sessionId, writeToken 필요' }, { status: 400 })
  }

  if (action === 'init') {
    // 세션 신규 등록
    const { error } = await supabase
      .from('sh_shop_checklist_sessions')
      .insert({ session_id: sessionId, write_token: writeToken })

    if (error) {
      // 이미 존재하면 무시 (중복 init 방어)
      if (error.code !== '23505') {
        return NextResponse.json({ error: '세션 등록 실패' }, { status: 500 })
      }
    }
    return NextResponse.json({ ok: true })
  }

  if (action === 'save') {
    // writeToken으로 소유권 검증
    const { data: session, error: sessErr } = await supabase
      .from('sh_shop_checklist_sessions')
      .select('write_token')
      .eq('session_id', sessionId)
      .single()

    if (sessErr || !session) {
      return NextResponse.json({ error: '세션을 찾을 수 없습니다' }, { status: 404 })
    }
    if (session.write_token !== writeToken) {
      return NextResponse.json({ error: '권한 없음' }, { status: 403 })
    }

    const checkedIds: string[] = body.checkedIds ?? []

    // 기존 항목 삭제 후 새로 삽입
    const { error: delError } = await supabase
      .from('sh_shop_checklist')
      .delete()
      .eq('session_id', sessionId)

    if (delError) return NextResponse.json({ error: '저장 실패' }, { status: 500 })

    if (checkedIds.length > 0) {
      const rows = checkedIds.map((itemId: string) => ({ session_id: sessionId, item_id: itemId }))
      const { error: insError } = await supabase.from('sh_shop_checklist').insert(rows)
      if (insError) return NextResponse.json({ error: '저장 실패' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 })
}
