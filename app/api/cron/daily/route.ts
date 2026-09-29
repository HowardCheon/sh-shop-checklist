import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getBalance } from '@/lib/solapi'
import { balanceMessage } from '@/lib/alerts'
import { sendTelegramToAdmin } from '@/lib/telegram'

/* 매일 09:00(KST) Vercel Cron
 * 1) 무료 Supabase 프로젝트 일시정지(7일 무요청) 방지
 * 2) 솔라피 잔액을 관리자(홍석) 텔레그램으로 보고 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { count, error } = await supabase.from('sh_shop_products').select('id', { count: 'exact', head: true })

  const bal = await getBalance()
  const reported = await sendTelegramToAdmin(balanceMessage({ ...bal, at: new Date() }))

  return NextResponse.json({ ok: !error, products: count, balance: bal, reported })
}
