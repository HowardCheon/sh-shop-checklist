/* 관리자 화면용 예약 보조 — 블록 계산, 겹침 조회, 고객 연결 */
import { supabase } from '@/lib/supabase'
import { BookingError } from './errors'
import { normalizePhone } from './phone'
import { findCustomerByPhone, findOrCreateCustomer, listClosedTimes } from './repo'
import { overlapsClosed } from './closed-slots'
import { isoToKst } from './time'
import { BUFFER_MIN } from './rules'

export function blockTimes(startAt: string, durationMin: number) {
  const start = Date.parse(startAt)
  return {
    start_at: new Date(start).toISOString(),
    end_at: new Date(start + durationMin * 60000).toISOString(),
    block_end_at: new Date(start + (durationMin + BUFFER_MIN) * 60000).toISOString(),
  }
}

/** 새 블록과 겹치는 관리자 휴무시간 구간 (없으면 null) */
export async function findClosedOverlap(startAt: string, blockEndAt: string) {
  const date = isoToKst(startAt).date
  return overlapsClosed(date, await listClosedTimes(date), startAt, blockEndAt)
}

/** 새 블록과 겹치는 기존 예약 (정리시간 포함) */
export async function findConflict(startAt: string, blockEndAt: string, excludeId?: number) {
  let query = supabase
    .from('sh_shop_reservations')
    .select('id, customer_name, start_at, end_at, product_name')
    .neq('status', 'cancelled')
    .lt('start_at', blockEndAt)
    .gt('block_end_at', startAt)
    .limit(1)
  if (excludeId) query = query.neq('id', excludeId)
  const { data } = await query
  return data?.[0] ?? null
}

/**
 * 예약을 고객과 연결 — 관리자가 고객을 직접 선택했으면(customerId) 그 고객으로,
 * 아니면 연락처가 휴대폰 번호일 때 정규화 후 고객을 찾거나 생성(그 외에는 연결하지 않음)
 * 새로 생성해야 하는데 같은 이름 고객이 있으면 생성하지 않고 sameName 후보 반환 (allowSameName 이면 그대로 생성)
 */
export async function linkCustomer(name: string, rawPhone: unknown, selectedId?: unknown, allowSameName = false) {
  const id = Number(selectedId)
  if (Number.isInteger(id) && id > 0) {
    const { data: picked } = await supabase.from('sh_shop_customers').select('id, phone').eq('id', id).maybeSingle()
    if (picked) {
      let phone = picked.phone as string | null
      try { phone = normalizePhone(rawPhone) } catch { /* 연락처가 비었거나 형식이 다르면 고객 번호 사용 */ }
      return { phone, customerId: picked.id as number }
    }
  }
  let phone: string
  try {
    phone = normalizePhone(rawPhone)
  } catch (e) {
    if (e instanceof BookingError) return { phone: typeof rawPhone === 'string' && rawPhone.trim() ? rawPhone.trim() : null, customerId: null }
    throw e
  }
  if (!allowSameName && !(await findCustomerByPhone(phone))) {
    const sameName = await findSameNameCustomers(name)
    if (sameName.length > 0) return { phone, customerId: null, sameName }
  }
  const { customer } = await findOrCreateCustomer(name, phone)
  return { phone, customerId: customer.id }
}

/** 같은 이름의 고객 (중복 등록 확인용) */
export async function findSameNameCustomers(name: string) {
  const { data, error } = await supabase.from('sh_shop_customers').select('id, name, phone').eq('name', name.trim()).limit(10)
  if (error) throw error
  return (data ?? []) as { id: number; name: string; phone: string | null }[]
}

export async function recordCustomerHistory(customerId: number | null, row: {
  reservation_id?: number | null
  action: string
  description: string
  old_value?: unknown
  new_value?: unknown
}) {
  if (!customerId) return
  const { error } = await supabase.from('sh_shop_customer_history').insert({
    customer_id: customerId,
    reservation_id: row.reservation_id ?? null,
    action: row.action,
    actor: 'admin',
    description: row.description,
    old_value: row.old_value ?? null,
    new_value: row.new_value ?? null,
  })
  if (error) console.error('고객 이력 기록 실패', error)
}
