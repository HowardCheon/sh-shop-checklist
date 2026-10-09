/* 샵 가계부 월 집계 — 자동 매출(관리자 앱 결제·선불·첫체험) + 직접 입력(지출·기타 수입) + 선불 충전 현황 */
import { isoToKst } from '@/lib/booking/time'

export type Io = 'in' | 'out'
export type Method = 'card' | 'cash' | 'transfer'
export type Ranked = { label: string; count: number }
type Money = { cash: number; bonus: number }

/** 자동 매출 한 줄 (조회 시 계산) — amount 는 받은 실제 금액(환불은 음수) */
export type AutoRow = { at: string; kind: 'charge' | 'trial' | 'payment' | 'refund'; amount: number; method: Method | null; label: string; link?: string }
export type EntryRow = {
  id: number
  entry_date: string
  io: Io
  amount: number
  category: { id: number; name: string }
  method: Method | null
  memo: string | null
  excluded: boolean
  exclude_reason: string | null
}
export type PrepaidRow = { at: string; type: 'charge' | 'use' | 'use_cancel' | 'refund'; cash: number; bonus: number }
export type DayItem = { type: 'auto'; row: AutoRow } | { type: 'entry'; row: EntryRow }
export type Day = { date: string; total: number; items: DayItem[] }

export const METHOD_LABEL: Record<Method, string> = { card: '카드', cash: '현금', transfer: '계좌이체' }
const KIND_LABEL: Record<AutoRow['kind'], string> = { charge: '선불 충전', trial: '첫체험', payment: '시술·결제', refund: '환불' }

export const kstDateOf = (iso: string) => isoToKst(iso).date

/** 같은 이름 합계, 금액 큰 순 (음수는 뒤로) */
function rank(pairs: [string, number][]): Ranked[] {
  const sum = new Map<string, number>()
  for (const [k, v] of pairs) sum.set(k, (sum.get(k) ?? 0) + v)
  return [...sum].map(([label, count]) => ({ label, count })).filter(r => r.count !== 0).sort((a, b) => b.count - a.count)
}

/** prepaidOpen: 그 달 이전 선불 합계(DB 집계) — 주면 prepaid 에는 그 달 기록만 넘겨도 됨 */
export function summarizeMonth({ month, entries, auto, prepaid, prepaidOpen }: { month: string; entries: EntryRow[]; auto: AutoRow[]; prepaid: PrepaidRow[]; prepaidOpen?: Money }) {
  const inMonth = (date: string) => date.slice(0, 7) === month
  const monthAuto = auto.filter(a => inMonth(kstDateOf(a.at)))
  const monthEntries = entries.filter(e => inMonth(e.entry_date))
  const counted = monthEntries.filter(e => !e.excluded)

  // 선불 충전 현황 (실제/보너스)
  const zero = (): Money => ({ cash: 0, bonus: 0 })
  const open = prepaidOpen ? { ...prepaidOpen } : zero(), charge = zero(), use = zero(), refund = zero()
  for (const p of prepaid) {
    const d = kstDateOf(p.at)
    if (d.slice(0, 7) < month) { open.cash += p.cash; open.bonus += p.bonus; continue }
    if (!inMonth(d)) continue
    if (p.type === 'charge') { charge.cash += p.cash; charge.bonus += p.bonus }
    else if (p.type === 'refund') { refund.cash -= p.cash; refund.bonus -= p.bonus }
    else { use.cash -= p.cash; use.bonus -= p.bonus } // use(음수) + use_cancel(양수) 순사용
  }
  const close = { cash: open.cash + charge.cash - use.cash - refund.cash, bonus: open.bonus + charge.bonus - use.bonus - refund.bonus }

  // 손익
  const revenueAuto = monthAuto.reduce((s, a) => s + a.amount, 0)
  const manualIn = counted.filter(e => e.io === 'in')
  const out = counted.filter(e => e.io === 'out')
  const revenueManual = manualIn.reduce((s, e) => s + e.amount, 0)
  const expense = out.reduce((s, e) => s + e.amount, 0)
  const autoKinds = (['charge', 'trial', 'payment', 'refund'] as const)
    .map(k => ({ label: KIND_LABEL[k], count: monthAuto.filter(a => a.kind === k).reduce((s, a) => s + a.amount, 0) }))
    .filter(r => r.count !== 0)
  const byKind = [...autoKinds, ...rank(manualIn.map(e => [e.category.name, e.amount]))]

  // 결제수단별 매출 — 충전은 결제수단 기록이 없어 별도
  const byMethod = rank([
    ...monthAuto.map(a => [a.kind === 'charge' ? '선불 충전' : a.kind === 'refund' ? '환불' : a.method ? METHOD_LABEL[a.method] : '기타', a.amount] as [string, number]),
    ...manualIn.map(e => [e.method ? METHOD_LABEL[e.method] : '기타', e.amount] as [string, number]),
  ])

  // 날짜별 내역 (최신 날짜 먼저)
  const days = new Map<string, Day>()
  const day = (date: string) => days.get(date) ?? days.set(date, { date, total: 0, items: [] }).get(date)!
  for (const a of monthAuto) {
    const d = day(kstDateOf(a.at))
    d.items.push({ type: 'auto', row: a })
    d.total += a.amount
  }
  for (const e of monthEntries) {
    const d = day(e.entry_date)
    d.items.push({ type: 'entry', row: e })
    if (!e.excluded) d.total += e.io === 'in' ? e.amount : -e.amount
  }

  return {
    prepaid: { open, charge, use, refund, close },
    pnl: { revenue: revenueAuto + revenueManual, revenueAuto, revenueManual, byKind, expense, net: revenueAuto + revenueManual - expense },
    byCategory: rank(out.map(e => [e.category.name, e.amount])),
    byMethod,
    days: [...days.values()].sort((a, b) => b.date.localeCompare(a.date)),
  }
}

export type MonthSummary = ReturnType<typeof summarizeMonth>

const METHODS: Method[] = ['card', 'cash', 'transfer']

/** 직접 입력 검증 — 오류 메시지로 throw */
export function validateEntry(input: Record<string, unknown>, categories: { id: number; io: Io; name: string }[]) {
  const date = String(input.entry_date ?? '')
  const parsed = new Date(`${date}T00:00:00Z`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error('날짜 형식이 올바르지 않습니다')
  const io = input.io
  if (io !== 'in' && io !== 'out') throw new Error('구분(수입/지출)이 올바르지 않습니다')
  const amount = input.amount
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount < 1) throw new Error('금액은 1원 이상 정수로 입력하세요')
  const category = categories.find(c => c.id === Number(input.category_id))
  if (!category || category.io !== io) throw new Error('항목을 다시 선택하세요')
  const method = input.method ?? null
  if (method !== null && !METHODS.includes(method as Method)) throw new Error('결제수단이 올바르지 않습니다')
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 200) : null)
  const excluded = input.excluded === true
  return {
    entry_date: date, io, amount, category_id: category.id, method: method as Method | null,
    memo: text(input.memo), excluded, exclude_reason: excluded ? text(input.exclude_reason) : null,
  }
}
