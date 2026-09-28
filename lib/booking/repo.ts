/* 예약 관련 Supabase 접근 */
import { supabase } from '@/lib/supabase'
import type { Block } from './availability'
import { BookingError } from './errors'
import { addDays, kstToIso } from './time'

export type ProgramRow = {
  id: number
  service_group: string | null
  slug: string | null
  name: string
  description: string | null
  duration_min: number
  price: number
  member_price: number | null
}

export type CustomerRow = {
  id: number
  name: string
  phone: string | null
  prepaid_cash: number
  prepaid_bonus: number
}

export type ReservationRow = {
  id: number
  customer_id: number | null
  customer_name: string
  customer_phone: string | null
  product_id: number | null
  product_name: string | null
  duration_min: number | null
  start_at: string
  end_at: string
  block_end_at: string
  price: number | null
  price_type: string | null
  status: 'scheduled' | 'completed' | 'cancelled'
  source: string
  memo: string | null
}

export type HistoryActor = 'external' | 'admin'

function fail(message: string, error: unknown): never {
  console.error(message, error)
  throw new BookingError('INTERNAL', '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.')
}

/** 배타 제약(겹침) 위반을 SLOT_TAKEN 으로 변환 */
function isOverlapError(error: { code?: string } | null) {
  return error?.code === '23P01'
}

export async function listPrograms(): Promise<ProgramRow[]> {
  const { data, error } = await supabase
    .from('sh_shop_products')
    .select('id, service_group, slug, name, description, duration_min, price, member_price')
    .eq('category', 'service')
    .eq('is_active', true)
    .not('duration_min', 'is', null)
    .order('sort_order', { ascending: true })
  if (error) fail('프로그램 조회 실패', error)
  return data ?? []
}

export async function getClosedDate(date: string): Promise<{ date: string; reason: string | null } | null> {
  const { data, error } = await supabase.from('sh_shop_closed_dates').select('date, reason').eq('date', date).maybeSingle()
  if (error) fail('휴무일 조회 실패', error)
  return data
}

/** 해당 KST 날짜와 겹치는 활성 예약 블록 */
export async function listBlocks(date: string): Promise<Block[]> {
  const { data, error } = await supabase
    .from('sh_shop_reservations')
    .select('id, start_at, block_end_at')
    .neq('status', 'cancelled')
    .lt('start_at', kstToIso(addDays(date, 1), '00:00'))
    .gt('block_end_at', kstToIso(date, '00:00'))
  if (error) fail('예약 블록 조회 실패', error)
  return (data ?? []).map(r => ({ id: r.id, start: r.start_at, blockEnd: r.block_end_at }))
}

export async function findCustomerByPhone(phone: string): Promise<CustomerRow | null> {
  const { data, error } = await supabase
    .from('sh_shop_customers')
    .select('id, name, phone, prepaid_cash, prepaid_bonus')
    .eq('phone', phone)
    .maybeSingle()
  if (error) fail('고객 조회 실패', error)
  return data
}

/** 전화번호로 고객을 찾고 없으면 생성 (동시 생성 시 유일 인덱스 충돌 → 재조회) */
export async function findOrCreateCustomer(name: string, phone: string): Promise<{ customer: CustomerRow; created: boolean }> {
  const existing = await findCustomerByPhone(phone)
  if (existing) return { customer: existing, created: false }

  const { data, error } = await supabase
    .from('sh_shop_customers')
    .insert({ name, phone })
    .select('id, name, phone, prepaid_cash, prepaid_bonus')
    .single()
  if (error?.code === '23505') {
    const again = await findCustomerByPhone(phone)
    if (again) return { customer: again, created: false }
  }
  if (error || !data) fail('고객 생성 실패', error)
  return { customer: data, created: true }
}

/** 고객의 앞으로 남은 예약 (고객 id 또는 전화번호로 연결된 것) */
export async function listUpcomingReservations(customerId: number | null, phone: string, nowIso: string): Promise<ReservationRow[]> {
  const owner = customerId ? `customer_id.eq.${customerId},customer_phone.eq.${phone}` : `customer_phone.eq.${phone}`
  const { data, error } = await supabase
    .from('sh_shop_reservations')
    .select('*')
    .eq('status', 'scheduled')
    .gte('start_at', nowIso)
    .or(owner)
    .order('start_at', { ascending: true })
  if (error) fail('예약 목록 조회 실패', error)
  return data ?? []
}

export async function getReservation(id: number): Promise<ReservationRow | null> {
  const { data, error } = await supabase.from('sh_shop_reservations').select('*').eq('id', id).maybeSingle()
  if (error) fail('예약 조회 실패', error)
  return data
}

export async function insertReservation(row: Omit<ReservationRow, 'id'>): Promise<ReservationRow> {
  const { data, error } = await supabase.from('sh_shop_reservations').insert(row).select().single()
  if (isOverlapError(error)) throw new BookingError('SLOT_TAKEN', '선택한 시간은 이미 예약되었습니다. 다른 시간을 선택해 주세요.')
  if (error || !data) fail('예약 저장 실패', error)
  return data
}

export async function updateReservationRow(id: number, patch: Partial<ReservationRow>): Promise<ReservationRow> {
  const { data, error } = await supabase
    .from('sh_shop_reservations')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (isOverlapError(error)) throw new BookingError('SLOT_TAKEN', '선택한 시간은 이미 예약되었습니다. 다른 시간을 선택해 주세요.')
  if (error || !data) fail('예약 수정 실패', error)
  return data
}

/** 예약 이력 + 고객 이력 기록 (실패해도 예약 처리 자체는 유지) */
export async function recordHistory(params: {
  reservationId: number
  customerId: number | null
  action: 'created' | 'updated' | 'cancelled'
  actor: HistoryActor
  description: string
  oldValue?: unknown
  newValue?: unknown
}) {
  const { reservationId, customerId, action, actor, description, oldValue, newValue } = params
  const tasks = [
    supabase.from('sh_shop_reservation_history').insert({
      reservation_id: reservationId,
      action,
      description,
      old_value: oldValue ?? null,
      new_value: newValue ?? null,
    }),
  ]
  if (customerId) {
    tasks.push(
      supabase.from('sh_shop_customer_history').insert({
        customer_id: customerId,
        reservation_id: reservationId,
        action: `reservation_${action}`,
        actor,
        description,
        old_value: oldValue ?? null,
        new_value: newValue ?? null,
      }),
    )
  }
  const results = await Promise.all(tasks)
  for (const r of results) if (r.error) console.error('이력 기록 실패', r.error)
}
