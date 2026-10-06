import { connection } from 'next/server'
import { supabase } from '@/lib/supabase'
import { isValidDate } from '@/lib/booking/time'
import ReservationsClient from './reservations/ReservationsClient'
import { withTrial } from '@/lib/trial'

// ?date=YYYY-MM-DD&open=예약id — 텔레그램 알림의 '예약 확인하기' 링크로 해당 날짜·예약 상세를 바로 연다
export default async function HomePage({ searchParams }: { searchParams: Promise<{ date?: string; open?: string }> }) {
  // 요청 시점의 '오늘' 예약을 보여주도록 빌드 시 정적 생성 방지
  await connection()
  const params = await searchParams

  // KST(UTC+9) 기준 오늘 날짜
  const kstToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
  const day = isValidDate(params.date) ? params.date : kstToday
  const openId = /^\d{1,12}$/.test(params.open ?? '') ? Number(params.open) : undefined
  const from = `${day}T00:00:00+09:00`
  const to   = `${day}T23:59:59+09:00`

  const [resResult, prodResult] = await Promise.all([
    supabase.from('sh_shop_reservations').select('*, customer:sh_shop_customers(prepaid_cash, prepaid_bonus), product:sh_shop_products(price, member_price)').gte('start_at', from).lte('start_at', to).order('start_at'),
    supabase.from('sh_shop_products').select('*').eq('category', 'service').eq('is_active', true).order('sort_order').order('created_at'),
  ])

  return (
    <ReservationsClient
      initialReservations={await withTrial(resResult.data ?? [])}
      initialDate={day}
      openId={openId}
      products={prodResult.data ?? []}
    />
  )
}
