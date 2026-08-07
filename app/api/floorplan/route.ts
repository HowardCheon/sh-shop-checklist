import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/floorplan?slug=shop|hanam508b → { data: object | null }
export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug')
  if (!slug) return NextResponse.json({ error: 'slug가 필요합니다' }, { status: 400 })

  const { data, error } = await supabase
    .from('sh_shop_floorplans')
    .select('data')
    .eq('slug', slug)
    .maybeSingle()

  if (error) return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  return NextResponse.json({ data: data?.data ?? null })
}

// POST /api/floorplan → { slug: string, data: object }
export async function POST(req: NextRequest) {
  const { slug, data } = await req.json() as { slug: string; data: object }
  if (!slug || !data) return NextResponse.json({ error: 'slug, data가 필요합니다' }, { status: 400 })

  const { error } = await supabase
    .from('sh_shop_floorplans')
    .upsert(
      { slug, data, updated_at: new Date().toISOString() },
      { onConflict: 'slug' }
    )

  if (error) return NextResponse.json({ error: '저장 실패' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
