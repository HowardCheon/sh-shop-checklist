import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { sendSms } from '@/lib/solapi'
import { alertSmsFailure } from '@/lib/alerts'
import { confirmText, locationText, remindText, smsAllowed, smsBytes } from '@/lib/booking/sms-templates'
import { isoToKst } from '@/lib/booking/time'
import { recordSmsLog } from '@/lib/sms-log'

const TYPES: Record<'confirm' | 'remind' | 'location', { label: string; build: (name: string, startIso: string) => string; at: string; startAt: string | null }> = {
  confirm: { label: '확정', build: confirmText, at: 'confirm_sms_at', startAt: 'confirm_sms_start_at' },
  remind: { label: '전일 안내', build: remindText, at: 'remind_sms_at', startAt: 'remind_sms_start_at' },
  location: { label: '위치 안내', build: () => locationText(), at: 'location_sms_at', startAt: null }, // 예약 시간과 무관
}

/* 예약 확정·전일 안내·위치 안내 문자 발송 — { type: 'confirm' | 'remind' | 'location' }. 시간 변경 후 재발송 가능 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { type } = await req.json().catch(() => ({}))
  const t = TYPES[type as keyof typeof TYPES]
  if (!Object.hasOwn(TYPES, type ?? '') || !t) return NextResponse.json({ error: '문자 종류 오류' }, { status: 400 })

  const { data: resv } = await supabase.from('sh_shop_reservations').select('*').eq('id', id).maybeSingle()
  if (!resv) return NextResponse.json({ error: '예약 없음' }, { status: 404 })
  if (resv.status !== 'scheduled') return NextResponse.json({ error: '예약 상태인 건만 문자를 보낼 수 있습니다' }, { status: 409 })
  if (!smsAllowed(resv.start_at)) return NextResponse.json({ error: '관리 시작 시간이 지나 문자를 보낼 수 없습니다' }, { status: 409 })
  const phone = (resv.customer_phone ?? '').replace(/\D/g, '')
  if (!/^01\d{8,9}$/.test(phone)) return NextResponse.json({ error: '휴대폰 번호가 없는 예약입니다' }, { status: 400 })

  const text = t.build(resv.customer_name.trim(), resv.start_at)
  const sent = await sendSms(phone, text)
  await recordSmsLog({
    kind: type, reservationId: resv.id, customerName: resv.customer_name, phone, text,
    ok: sent.ok, reason: sent.ok ? null : sent.reason,
  })
  if (!sent.ok) {
    await alertSmsFailure(phone, sent.reason).catch(e => console.error('SMS 실패 알림 오류', e))
    return NextResponse.json({ error: `문자 발송 실패: ${sent.reason}` }, { status: 502 })
  }

  const now = new Date().toISOString()
  const { data } = await supabase.from('sh_shop_reservations')
    .update(t.startAt ? { [t.at]: now, [t.startAt]: resv.start_at } : { [t.at]: now })
    .eq('id', id).select().single()
  const start = isoToKst(resv.start_at)
  await supabase.from('sh_shop_reservation_history').insert({
    reservation_id: resv.id,
    action: 'sms',
    description: `${t.label} 문자 발송 (${start.date} ${start.time} 기준)`,
  })
  return NextResponse.json({ reservation: data, text, bytes: smsBytes(text) })
}
