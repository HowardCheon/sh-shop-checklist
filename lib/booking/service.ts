/* 외부 예약 유스케이스 */
import { fits, programsAt, timesFor as dayTimes } from './availability'
import { BookingError } from './errors'
import { maskName, verifyPhoneOwnership } from './phone'
import { isMember } from './prepaid'
import * as repo from './repo'
import type { ProgramRow, ReservationRow } from './repo'
import { BUFFER_MIN, MAX_UPCOMING, businessHours, isEditable, startError } from './rules'
import { isValidDate, isoToKst, kstToIso } from './time'

const MAX_NAME = 30
const SHOP_TEL = '010-2475-9859'

/** 고객의 온라인 변경·취소 허용 여부 — SMS 본인인증 도입 전까지는 꺼 둠(전화로만 처리) */
function onlineChangeEnabled() {
  return process.env.BOOKING_ONLINE_CHANGE === 'true'
}
const MAX_MESSAGE = 500

/* ── DTO ─────────────────────────────────────────── */

function programDto(p: ProgramRow) {
  return {
    id: p.id,
    group: p.service_group,
    slug: p.slug,
    name: p.name,
    description: p.description,
    duration_min: p.duration_min,
    member_price: p.member_price ?? p.price,
    regular_price: p.price,
  }
}

function priceFor(p: ProgramRow, member: boolean) {
  return member ? p.member_price ?? p.price : p.price
}

function reservationDto(r: ReservationRow, now: Date) {
  const start = isoToKst(r.start_at)
  return {
    id: r.id,
    program: { id: r.product_id, name: r.product_name, duration_min: r.duration_min },
    customer_name: r.customer_name,
    date: start.date,
    start_time: start.time,
    end_time: isoToKst(r.end_at).time,
    price: r.price,
    price_type: r.price_type,
    message: r.memo,
    status: r.status,
    editable: onlineChangeEnabled() && r.status === 'scheduled' && isEditable(start.date, now),
  }
}

/* ── 공통 검증 ───────────────────────────────────── */

function requireDate(date: unknown): string {
  if (!isValidDate(date)) throw new BookingError('INVALID_INPUT', 'date 는 YYYY-MM-DD 형식이어야 합니다.')
  return date
}

function cleanName(name: unknown): string {
  const v = typeof name === 'string' ? name.trim() : ''
  if (!v || v.length > MAX_NAME) throw new BookingError('INVALID_INPUT', `고객명은 1~${MAX_NAME}자로 입력해 주세요.`)
  return v
}

function cleanMessage(message: unknown): string | null {
  if (message === undefined || message === null || message === '') return null
  if (typeof message !== 'string' || message.length > MAX_MESSAGE) {
    throw new BookingError('INVALID_INPUT', `메시지는 ${MAX_MESSAGE}자 이내로 입력해 주세요.`)
  }
  return message.trim() || null
}

function toId(value: unknown, label: string): number {
  const n = Number(value)
  if (!Number.isInteger(n) || n <= 0) throw new BookingError('INVALID_INPUT', `${label} 가 올바르지 않습니다.`)
  return n
}

/** 규칙 + 휴무일 검사 */
async function assertStartAllowed(date: string, time: string, now: Date) {
  const err = startError(date, time, now)
  if (err) throw err
  const closed = await repo.getClosedDate(date)
  if (closed) throw new BookingError('CLOSED_DAY', closed.reason ? `휴무일입니다. (${closed.reason})` : '휴무일입니다.')
}

async function findProgram(programId: unknown): Promise<ProgramRow> {
  const id = toId(programId, 'program_id')
  const program = (await repo.listPrograms()).find(p => p.id === id)
  if (!program) throw new BookingError('PROGRAM_NOT_FOUND', '예약할 수 없는 프로그램입니다.')
  return program
}

function timesFor(date: string, time: string, durationMin: number) {
  const start = Date.parse(kstToIso(date, time))
  return {
    start_at: new Date(start).toISOString(),
    end_at: new Date(start + durationMin * 60000).toISOString(),
    block_end_at: new Date(start + (durationMin + BUFFER_MIN) * 60000).toISOString(),
  }
}

/** 전화번호 소유 확인 후 해당 고객의 예약인지 검사 (불일치 시 존재 여부 비노출) */
async function loadOwnReservation(id: unknown, input: { phone?: unknown }) {
  const phone = verifyPhoneOwnership(input)
  const reservation = await repo.getReservation(toId(id, '예약 id'))
  const customer = await repo.findCustomerByPhone(phone)
  const owned = reservation && (
    (customer && reservation.customer_id === customer.id) ||
    (reservation.customer_phone ?? '').replace(/\D/g, '') === phone
  )
  if (!reservation || !owned) throw new BookingError('NOT_FOUND', '예약을 찾을 수 없습니다.')
  return { reservation, customer, phone }
}

function assertEditable(r: ReservationRow, now: Date) {
  if (r.status !== 'scheduled') throw new BookingError('NOT_FOUND', '변경할 수 있는 예약이 아닙니다.')
  if (!isEditable(isoToKst(r.start_at).date, now)) {
    throw new BookingError('SAME_DAY_LOCKED', '당일 예약 변경/취소는 매장으로 전화 부탁드립니다.')
  }
}

/* ── 조회 ────────────────────────────────────────── */

export async function getPrograms() {
  return (await repo.listPrograms()).map(programDto)
}

/** 예약 변경 화면용 — 본인 예약(전화번호 일치)만 가용시간 계산에서 제외 */
async function excludedId(input: { exclude?: unknown; phone?: unknown }): Promise<number | undefined> {
  if (!onlineChangeEnabled()) return undefined
  if (input.exclude === undefined || input.exclude === null || input.exclude === '') return undefined
  const { reservation } = await loadOwnReservation(input.exclude, input)
  return reservation.id
}

export async function getAvailability(dateInput: unknown, now = new Date(), opts: { exclude?: unknown; phone?: unknown } = {}) {
  const date = requireDate(dateInput)
  const hours = businessHours(date)
  const closed = hours ? await repo.getClosedDate(date) : null
  if (!hours || closed) {
    return { date, closed: true, closed_reason: closed?.reason ?? '정기 휴무', business_hours: hours, slots: [], times: [] }
  }
  const [programs, blocks, exclude] = await Promise.all([repo.listPrograms(), repo.listBlocks(date), excludedId(opts)])
  const times = dayTimes(date, programs, blocks, now, exclude)
  return {
    date,
    closed: false,
    closed_reason: null,
    business_hours: hours,
    slots: times.filter(t => t.available).map(({ time, program_count }) => ({ time, program_count })),
    times,
  }
}

export async function getProgramsAt(input: { date?: unknown; time?: unknown; phone?: unknown; exclude?: unknown }, now = new Date()) {
  const date = requireDate(input.date)
  const time = String(input.time ?? '')
  await assertStartAllowed(date, time, now)

  const member = input.phone ? isMember(await repo.findCustomerByPhone(verifyPhoneOwnership(input))) : null
  const [programs, blocks, exclude] = await Promise.all([repo.listPrograms(), repo.listBlocks(date), excludedId(input)])
  return {
    date,
    time,
    is_member: member,
    programs: programsAt(date, time, programs, blocks, exclude).map(p => ({
      ...programDto(p),
      end_time: isoToKst(timesFor(date, time, p.duration_min).end_at).time,
      applied_price: member === null ? null : priceFor(p, member),
    })),
  }
}

export async function lookupCustomer(input: { phone?: unknown }) {
  const customer = await repo.findCustomerByPhone(verifyPhoneOwnership(input))
  return {
    exists: !!customer,
    is_member: isMember(customer),
    name_masked: customer ? maskName(customer.name) : null,
  }
}

/** 예약 조회 — 이름과 휴대폰 번호가 모두 일치하는 예약만 (불일치 시 빈 목록으로 존재 여부 비노출) */
export async function listReservations(input: { phone?: unknown; name?: unknown }, now = new Date()) {
  const phone = verifyPhoneOwnership(input)
  const name = cleanName(input.name)
  const sameName = (v: string | null | undefined) => !!v && v.replace(/\s/g, '') === name.replace(/\s/g, '')
  const customer = await repo.findCustomerByPhone(phone)
  const rows = await repo.listUpcomingReservations(customer?.id ?? null, phone, now.toISOString())
  return rows.filter(r => sameName(r.customer_name) || sameName(customer?.name)).map(r => reservationDto(r, now))
}

function assertOnlineChange() {
  if (!onlineChangeEnabled()) {
    throw new BookingError('CHANGE_BY_PHONE', `예약 변경·취소는 전화(${SHOP_TEL})로 연락 주세요.`)
  }
}

/* ── 생성 ────────────────────────────────────────── */

export async function createReservation(input: Record<string, unknown>, now = new Date()) {
  const name = cleanName(input.name)
  const phone = verifyPhoneOwnership(input)
  const message = cleanMessage(input.message)
  const date = requireDate(input.date)
  const time = String(input.time ?? '')
  const program = await findProgram(input.program_id)
  await assertStartAllowed(date, time, now)

  // 사전 확인 (최종 보증은 DB 배타 제약)
  if (!fits(date, time, program.duration_min, await repo.listBlocks(date))) {
    throw new BookingError('SLOT_TAKEN', '선택한 시간에는 해당 프로그램을 예약할 수 없습니다.')
  }

  const { customer, created } = await repo.findOrCreateCustomer(name, phone)
  const upcoming = await repo.listUpcomingReservations(customer.id, phone, now.toISOString())
  if (upcoming.length >= MAX_UPCOMING) {
    throw new BookingError('LIMIT_EXCEEDED', `예정된 예약은 최대 ${MAX_UPCOMING}건까지 가능합니다.`)
  }

  const member = isMember(customer)
  const row = await repo.insertReservation({
    customer_id: customer.id,
    customer_name: name,
    customer_phone: phone,
    product_id: program.id,
    product_name: program.name,
    duration_min: program.duration_min,
    ...timesFor(date, time, program.duration_min),
    price: priceFor(program, member),
    price_type: member ? 'member' : 'regular',
    status: 'scheduled',
    source: 'external',
    memo: message,
  })

  const notes = [`외부 예약: ${date} ${time} ${program.name}`]
  if (created) notes.push('신규 고객 등록')
  else if (customer.name !== name) notes.push(`예약자명 '${name}' (등록명 '${customer.name}')`)
  await repo.recordHistory({
    reservationId: row.id,
    customerId: customer.id,
    action: 'created',
    actor: 'external',
    description: notes.join(' · '),
    newValue: row,
  })

  return { ...reservationDto(row, now), is_member: member, new_customer: created }
}

/* ── 수정 / 취소 ─────────────────────────────────── */

export async function updateReservation(id: unknown, input: Record<string, unknown>, now = new Date()) {
  assertOnlineChange()
  const { reservation: old, customer } = await loadOwnReservation(id, input)
  assertEditable(old, now)

  const oldStart = isoToKst(old.start_at)
  const date = input.date === undefined ? oldStart.date : requireDate(input.date)
  const time = input.time === undefined ? oldStart.time : String(input.time)
  const programChanged = input.program_id !== undefined && Number(input.program_id) !== old.product_id
  const timeChanged = date !== oldStart.date || time !== oldStart.time
  const patch: Partial<ReservationRow> = {}
  const changes: string[] = []

  if (programChanged || timeChanged) {
    const program = programChanged
      ? await findProgram(input.program_id)
      : (await repo.listPrograms()).find(p => p.id === old.product_id)
    const duration = program?.duration_min ?? old.duration_min ?? 60
    if (timeChanged) await assertStartAllowed(date, time, now)
    if (!fits(date, time, duration, await repo.listBlocks(date), old.id)) {
      throw new BookingError('SLOT_TAKEN', '선택한 시간에는 해당 프로그램을 예약할 수 없습니다.')
    }
    Object.assign(patch, timesFor(date, time, duration), { duration_min: duration })
    if (timeChanged) changes.push(`시간 ${oldStart.date} ${oldStart.time} → ${date} ${time}`)
    if (programChanged && program) {
      const member = isMember(customer)
      Object.assign(patch, {
        product_id: program.id,
        product_name: program.name,
        price: priceFor(program, member),
        price_type: member ? 'member' : 'regular',
      })
      changes.push(`프로그램 ${old.product_name} → ${program.name}`)
    }
  }

  if (input.message !== undefined) {
    const message = cleanMessage(input.message)
    if (message !== old.memo) {
      patch.memo = message
      changes.push('메시지 변경')
    }
  }

  if (changes.length === 0) return reservationDto(old, now)

  const row = await repo.updateReservationRow(old.id, patch)
  await repo.recordHistory({
    reservationId: old.id,
    customerId: old.customer_id ?? customer?.id ?? null,
    action: 'updated',
    actor: 'external',
    description: `외부 예약 수정: ${changes.join(', ')}`,
    oldValue: old,
    newValue: row,
  })
  return reservationDto(row, now)
}

export async function cancelReservation(id: unknown, input: Record<string, unknown>, now = new Date()) {
  assertOnlineChange()
  const { reservation: old, customer } = await loadOwnReservation(id, input)
  assertEditable(old, now)
  const reason = cleanMessage(input.reason)

  const row = await repo.updateReservationRow(old.id, { status: 'cancelled' })
  const start = isoToKst(old.start_at)
  await repo.recordHistory({
    reservationId: old.id,
    customerId: old.customer_id ?? customer?.id ?? null,
    action: 'cancelled',
    actor: 'external',
    description: `외부 예약 취소: ${start.date} ${start.time} ${old.product_name ?? ''}${reason ? ` (사유: ${reason})` : ''}`,
    oldValue: old,
    newValue: row,
  })
  return reservationDto(row, now)
}
