import { NextRequest, after } from 'next/server'
import { publicApi, readJson } from '@/lib/public-api'
import { createReservation, listReservations } from '@/lib/booking/service'
import { normalizePhone } from '@/lib/booking/phone'
import { newReservationMessage, sendTelegram } from '@/lib/telegram'

/* 예정된 예약 목록 — ?name=&phone= (둘 다 일치해야 조회) */
export const GET = publicApi(async (req: NextRequest) => ({
  reservations: await listReservations({ phone: req.nextUrl.searchParams.get('phone'), name: req.nextUrl.searchParams.get('name') }),
}))

/* 예약 생성 — { name, phone, program_id, date, time, message? } */
export const POST = publicApi(async (req: NextRequest) => {
  const body = await readJson(req)
  const r = await createReservation(body)
  // 예약 성공 시에만, 응답을 보낸 뒤 원장님 텔레그램으로 알림
  after(() => sendTelegram(newReservationMessage({
    name: r.customer_name,
    phone: normalizePhone(body.phone),
    date: r.date,
    startTime: r.start_time,
    endTime: r.end_time,
    program: r.program.name ?? '',
    durationMin: r.program.duration_min ?? 0,
    price: r.price,
    isMember: r.is_member,
    newCustomer: r.new_customer,
    message: r.message,
  })))
  return r
}, 201)
