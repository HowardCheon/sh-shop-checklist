import { publicApi } from '@/lib/public-api'
import { getProgramsAt } from '@/lib/booking/service'

/* 선택한 시각에 예약 가능한 프로그램 — ?date=&time=&phone=(선택, 회원가 적용) */
export const GET = publicApi(async req => {
  const q = req.nextUrl.searchParams
  return getProgramsAt({ date: q.get('date'), time: q.get('time'), phone: q.get('phone') || undefined })
})
