/* 예약 문자(확정·전일 안내) 발송 기록 — 성공·실패 모두. 인증번호 문자는 기록하지 않음 */
import { supabase } from '@/lib/supabase'

export type SmsLog = {
  id: number
  kind: 'confirm' | 'remind'
  reservation_id: number | null
  customer_name: string | null
  phone: string
  text: string
  status: 'sent' | 'failed'
  reason: string | null
  created_at: string
}

/** 기록 실패가 발송 결과에 영향을 주지 않도록 오류는 로그만 */
export async function recordSmsLog(r: { kind: 'confirm' | 'remind'; reservationId: number | null; customerName: string | null; phone: string; text: string; ok: boolean; reason: string | null }) {
  const { error } = await supabase.from('sh_shop_sms_logs').insert({
    kind: r.kind, reservation_id: r.reservationId, customer_name: r.customerName, phone: r.phone, text: r.text,
    status: r.ok ? 'sent' : 'failed', reason: r.ok ? null : r.reason,
  })
  if (error) console.error('문자 발송 기록 실패', error)
}

/** 최근 발송 기록 (최신순, created_at 역순 인덱스 사용) */
export async function listSmsLogs(limit = 100): Promise<SmsLog[]> {
  const { data, error } = await supabase.from('sh_shop_sms_logs').select('*').order('created_at', { ascending: false }).limit(limit)
  if (error) throw error
  return (data ?? []) as SmsLog[]
}
