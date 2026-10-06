import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { getBalance } from '@/lib/solapi'
import { balanceMessage } from '@/lib/alerts'
import { sendTelegramToAdmin } from '@/lib/telegram'
import { fetchDailyReport } from '@/lib/ga'
import { countOnlineBookings } from '@/lib/booking/repo'
import { kstYesterday, accessReportMessage } from '@/lib/daily-report'

/* 매일 09:00(KST) Vercel Cron
 * 1) 무료 Supabase 프로젝트 일시정지(7일 무요청) 방지
 * 2) 솔라피 잔액 + 어제 홈페이지 접속 리포트를 관리자(홍석) 텔레그램으로 보고 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  const { count, error } = await supabase.from('sh_shop_products').select('id', { count: 'exact', head: true })

  const now = new Date()
  const y = kstYesterday(now)
  // 리포트 조회가 실패해도 잔액 보고는 그대로 보낸다
  const [bal, ga, bookings] = await Promise.all([
    getBalance(),
    fetchDailyReport(y.date),
    countOnlineBookings(y.fromIso, y.toIso).catch((e: unknown) => ({ error: e instanceof Error ? e.message : '조회 오류' })),
  ])
  const text = [balanceMessage({ ...bal, at: now }), accessReportMessage({ label: y.label, ga, bookings })].join('\n\n')
  const reported = await sendTelegramToAdmin(text)

  return NextResponse.json({ ok: !error, products: count, balance: bal, report: { ga, bookings }, reported })
}
