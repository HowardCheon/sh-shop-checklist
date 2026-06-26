import { supabase } from '@/lib/supabase'
import ReservationsClient from './ReservationsClient'

export default async function ReservationsPage() {
  // KST(UTC+9) 기준 오늘 날짜
  const kstToday = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
  const from = `${kstToday}T00:00:00+09:00`
  const to   = `${kstToday}T23:59:59+09:00`

  const [resResult, prodResult] = await Promise.all([
    supabase.from('sh_shop_reservations').select('*').gte('start_at', from).lte('start_at', to).order('start_at'),
    supabase.from('sh_shop_products').select('*').eq('category', 'service').order('sort_order').order('created_at'),
  ])

  return (
    <ReservationsClient
      initialReservations={resResult.data ?? []}
      initialDate={kstToday}
      products={prodResult.data ?? []}
    />
  )
}
