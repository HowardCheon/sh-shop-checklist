import { NextRequest } from 'next/server'
import { publicApi, readJson } from '@/lib/public-api'
import { requestCode } from '@/lib/booking/verification'

/* 인증번호 요청 — { phone } → SMS 4자리 발송 */
export const POST = publicApi(async (req: NextRequest) => requestCode((await readJson(req)).phone))
