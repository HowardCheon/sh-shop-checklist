import { publicApi } from '@/lib/public-api'
import { getAvailability } from '@/lib/booking/service'

/* 날짜별 예약 가능 시간 — ?date=YYYY-MM-DD */
export const GET = publicApi(async req => getAvailability(req.nextUrl.searchParams.get('date')))
