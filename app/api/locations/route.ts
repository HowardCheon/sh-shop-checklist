import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

// GET /api/locations
export async function GET() {
  const { data, error } = await supabase
    .from('sh_shop_locations')
    .select('*')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  return NextResponse.json(data ?? [])
}

// POST /api/locations
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { name, deposit, monthly_rent, maintenance_fee, pros, cons, memo } = body

  if (!name?.trim()) return NextResponse.json({ error: '장소명을 입력하세요' }, { status: 400 })

  const { data, error } = await supabase
    .from('sh_shop_locations')
    .insert({ name: name.trim(), deposit, monthly_rent, maintenance_fee, pros, cons, memo })
    .select()
    .single()

  if (error) return NextResponse.json({ error: '저장 실패' }, { status: 500 })
  return NextResponse.json(data)
}
