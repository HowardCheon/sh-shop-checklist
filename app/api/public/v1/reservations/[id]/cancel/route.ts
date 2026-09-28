import { NextRequest } from 'next/server'
import { publicApi, readJson } from '@/lib/public-api'
import { cancelReservation } from '@/lib/booking/service'

type Ctx = { params: Promise<{ id: string }> }

/* 예약 취소 — { phone, reason? } */
export const POST = publicApi(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params
  return cancelReservation(id, await readJson(req))
})
