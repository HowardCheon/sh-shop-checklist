import { NextResponse } from 'next/server'
import { listSmsLogs } from '@/lib/sms-log'

/* 관리자 — 최근 문자 발송 기록 100건 (인증번호 문자 제외) */
export async function GET() {
  try {
    return NextResponse.json({ logs: await listSmsLogs(100) })
  } catch (e) {
    console.error('문자 기록 조회 실패', e)
    return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  }
}
