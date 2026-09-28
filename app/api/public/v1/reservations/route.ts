import { NextRequest } from 'next/server'
import { publicApi, readJson } from '@/lib/public-api'
import { createReservation, listReservations } from '@/lib/booking/service'

/* 예정된 예약 목록 — ?name=&phone= (둘 다 일치해야 조회) */
export const GET = publicApi(async (req: NextRequest) => ({
  reservations: await listReservations({ phone: req.nextUrl.searchParams.get('phone'), name: req.nextUrl.searchParams.get('name') }),
}))

/* 예약 생성 — { name, phone, program_id, date, time, message? } */
export const POST = publicApi(async (req: NextRequest) => createReservation(await readJson(req)), 201)
