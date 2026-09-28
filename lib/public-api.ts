/* 외부 사이트(서버 대 서버) 공개 API 공통 처리 — API Key 인증 + 오류 응답 */
import { timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { BookingError } from '@/lib/booking/errors'

function authorized(req: NextRequest): boolean {
  const expected = process.env.BOOKING_API_KEY
  const header = req.headers.get('authorization') ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!expected || !token) return false
  const a = Buffer.from(token)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function errorResponse(e: unknown) {
  const err = e instanceof BookingError ? e : new BookingError('INTERNAL', '일시적인 오류가 발생했습니다.')
  if (!(e instanceof BookingError)) console.error('공개 API 오류', e)
  return NextResponse.json({ error: { code: err.code, message: err.message } }, { status: err.status })
}

/** JSON body 파싱 (형식 오류 → INVALID_INPUT) */
export async function readJson(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body = await req.json()
    if (body && typeof body === 'object' && !Array.isArray(body)) return body
  } catch {}
  throw new BookingError('INVALID_INPUT', '요청 본문은 JSON 객체여야 합니다.')
}

export function publicApi<C>(handler: (req: NextRequest, ctx: C) => Promise<unknown>, successStatus = 200) {
  return async (req: NextRequest, ctx: C) => {
    if (!authorized(req)) return errorResponse(new BookingError('UNAUTHORIZED', '인증에 실패했습니다.'))
    try {
      return NextResponse.json(await handler(req, ctx), { status: successStatus })
    } catch (e) {
      return errorResponse(e)
    }
  }
}
