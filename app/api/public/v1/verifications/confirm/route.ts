import { NextRequest } from 'next/server'
import { publicApi, readJson } from '@/lib/public-api'
import { confirmCode } from '@/lib/booking/verification'

/* 인증번호 확인 — { phone, code } → { verification_token } (30분 유효) */
export const POST = publicApi(async (req: NextRequest) => {
  const body = await readJson(req)
  return confirmCode(body.phone, body.code)
})
