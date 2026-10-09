import { NextRequest, NextResponse } from 'next/server'
import { loadMonth } from '@/lib/ledger/repo'
import { summarizeMonth } from '@/lib/ledger/summary'

/* 샵 가계부 월 조회 — ?month=YYYY-MM → 집계 + 내역 + 항목 + 선불 보유 고객 */
export async function GET(req: NextRequest) {
  const month = new URL(req.url).searchParams.get('month') ?? ''
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({ error: 'month 는 YYYY-MM' }, { status: 400 })
  try {
    const data = await loadMonth(month)
    return NextResponse.json({ month, summary: summarizeMonth({ month, ...data }), categories: data.categories, balances: data.balances, autoFrom: data.autoFrom })
  } catch (e) {
    console.error('가계부 조회 실패', e)
    return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  }
}
