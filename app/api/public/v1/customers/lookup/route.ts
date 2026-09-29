import { publicApi } from '@/lib/public-api'
import { lookupCustomer } from '@/lib/booking/service'

/* 전화번호로 기존 고객/회원 여부 확인 — ?phone= */
export const GET = publicApi(async req => lookupCustomer({ phone: req.nextUrl.searchParams.get('phone'), verification_token: req.nextUrl.searchParams.get('verification_token') }))
