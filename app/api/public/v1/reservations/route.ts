import { NextRequest } from 'next/server'
import { publicApi, readJson } from '@/lib/public-api'
import { createReservation, listReservations } from '@/lib/booking/service'

/* 전화번호로 예정된 예약 목록 — ?phone= */
export const GET = publicApi(async (req: NextRequest) => ({
  reservations: await listReservations({ phone: req.nextUrl.searchParams.get('phone') }),
}))

/* 예약 생성 — { name, phone, program_id, date, time, message? } */
export const POST = publicApi(async (req: NextRequest) => createReservation(await readJson(req)), 201)
