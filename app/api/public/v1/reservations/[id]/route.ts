import { NextRequest } from 'next/server'
import { publicApi, readJson } from '@/lib/public-api'
import { updateReservation } from '@/lib/booking/service'

type Ctx = { params: Promise<{ id: string }> }

/* 예약 수정 — { phone, program_id?, date?, time?, message? } */
export const PATCH = publicApi(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params
  return updateReservation(id, await readJson(req))
})
