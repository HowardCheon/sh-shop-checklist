import { publicApi } from '@/lib/public-api'
import { getAvailability } from '@/lib/booking/service'

/* 날짜별 예약 가능 시간 — ?date=YYYY-MM-DD (&exclude=예약id&phone= : 변경 시 본인 예약 제외) */
export const GET = publicApi(async req => {
  const q = req.nextUrl.searchParams
  return getAvailability(q.get('date'), new Date(), { exclude: q.get('exclude') || undefined, phone: q.get('phone') || undefined, verification_token: q.get('verification_token') || undefined })
})
