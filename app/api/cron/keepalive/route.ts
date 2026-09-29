import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

/* 무료 Supabase 프로젝트 일시정지(7일 무요청) 방지 — Vercel Cron 이 매일 호출 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { count, error } = await supabase.from('sh_shop_products').select('id', { count: 'exact', head: true })
  if (error) return NextResponse.json({ ok: false }, { status: 500 })
  return NextResponse.json({ ok: true, products: count, at: new Date().toISOString() })
}
