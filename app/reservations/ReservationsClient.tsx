'use client'

import { useState, useCallback, useEffect } from 'react'
import BrandHeader from '@/components/BrandHeader'
import { isoToKst, kstNow, addDays } from '@/lib/booking/time'
import PaymentSheet from './PaymentSheet'
import ReservationForm, { EMPTY_FORM, saveReservation, type Product, type PaymentMethod } from './ReservationForm'
import { effectivePrice } from '@/lib/booking/pricing'
import { confirmText, remindText, smsBytes, smsStatus, SMS_MAX_BYTES } from '@/lib/booking/sms-templates'

interface Reservation {
  id: number
  customer_name: string
  customer_phone: string | null
  customer_id: number | null
  product_id: number | null
  product_name: string | null
  duration_min: number | null
  start_at: string
  end_at: string
  price: number | null
  status: 'scheduled' | 'completed' | 'cancelled'
  source?: 'admin' | 'external'
  price_type?: 'member' | 'regular' | null
  customer?: { prepaid_cash: number; prepaid_bonus: number } | null
  product?: { price: number; member_price: number | null } | null
  memo: string | null
  customer_message?: string | null
  trial?: { package_id: number; label: string; expired: boolean } | null
  confirm_sms_at?: string | null
  confirm_sms_start_at?: string | null
  remind_sms_at?: string | null
  remind_sms_start_at?: string | null
  history?: HistoryItem[]
}

interface HistoryItem {
  id: number
  action: string
  description: string
  changed_at: string
}


interface ClosedDate {
  date: string
  reason: string | null
}

// 날짜/시간은 기기 시간대와 무관하게 KST 기준으로 표시
const kstDate = (iso: string) => isoToKst(iso).date
const fmtTime = (iso: string) => isoToKst(iso).time
const kstRange = (from: string, to: string) =>
  `from=${encodeURIComponent(`${from}T00:00:00+09:00`)}&to=${encodeURIComponent(`${to}T23:59:59+09:00`)}`
const fmtPrice = (n: number) => n.toLocaleString() + '원'

/* 회원 = 선불충전금(실제+보너스) 잔액 보유 */
const prepaidOf = (r: Reservation) => (r.customer?.prepaid_cash ?? 0) + (r.customer?.prepaid_bonus ?? 0)
const isMember = (r: Reservation) => prepaidOf(r) > 0

const CHANGED_LABEL = { to_member: '비회원 예약 → 회원가', to_regular: '회원 예약 → 비회원가' } as const
const CHANGED_DETAIL = { to_member: '비회원으로 예약 후 회원가로 변경됨', to_regular: '회원으로 예약 후 비회원가로 변경됨' } as const

/* 예약 후 회원 여부가 바뀌면 현재 기준 가격 + 변경 표시 */
function PriceChange({ r, detail, hideLabel }: { r: Reservation; detail?: boolean; hideLabel?: boolean }) {
  const p = effectivePrice(r)
  if (p.price == null) return null
  if (!p.changed) return <span>{fmtPrice(p.price)}</span>
  return (
    <span className={`inline-flex flex-col ${detail ? 'items-start' : 'items-end'}`}>
      <span className="font-700 text-brand-600">{fmtPrice(p.price)}</span>
      {p.bookedPrice != null && <span className="text-[10px] text-gray-400 line-through">{fmtPrice(p.bookedPrice)}</span>}
      {!hideLabel && <ChangeLabel changed={p.changed} detail={detail} />}
    </span>
  )
}

function ChangeLabel({ changed, detail }: { changed: 'to_member' | 'to_regular'; detail?: boolean }) {
  return (
    <span className={`inline-block text-[10px] font-700 px-1.5 rounded whitespace-nowrap ${changed === 'to_member' ? 'bg-brand-50 text-brand-600' : 'bg-gray-100 text-gray-500'}`}>
      {(detail ? CHANGED_DETAIL : CHANGED_LABEL)[changed]}
    </span>
  )
}

function MemberBadge({ r }: { r: Reservation }) {
  return isMember(r)
    ? <span className="text-[10px] font-700 px-2 py-0.5 rounded-full bg-brand-50 text-brand-600 border border-brand-100 whitespace-nowrap">🌸 회원</span>
    : <span className="text-[10px] font-600 px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 whitespace-nowrap">비회원</span>
}

/* 첫체험 남은 횟수 배지 — 만료면 빨강 */
function TrialBadge({ r }: { r: Reservation }) {
  if (!r.trial) return null
  return (
    <span className={`text-[10px] font-700 px-2 py-0.5 rounded-full whitespace-nowrap ${r.trial.expired ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-700'}`}>
      🎁 {r.trial.label}{r.trial.expired ? ' 만료' : ''}
    </span>
  )
}

/* 문자 발송 상태 — 확정·전일 안내, 보낸 뒤 시간이 바뀌면 재발송 필요 */
const SMS_KINDS = [
  { type: 'confirm', short: '확정', label: '확정 문자', at: 'confirm_sms_at', startAt: 'confirm_sms_start_at', build: confirmText },
  { type: 'remind', short: '안내', label: '전일 안내 문자', at: 'remind_sms_at', startAt: 'remind_sms_start_at', build: remindText },
] as const

function SmsBadges({ r }: { r: Reservation }) {
  if (r.status === 'cancelled') return null
  return (
    <>
      {SMS_KINDS.map(k => {
        const st = smsStatus(r[k.at] ?? null, r[k.startAt] ?? null, r.start_at)
        if (st === 'none') return null
        return st === 'sent'
          ? <span key={k.type} className="text-[10px] font-700 px-2 py-0.5 rounded-full whitespace-nowrap bg-emerald-50 text-emerald-600">{k.short}✓</span>
          : <span key={k.type} className="text-[10px] font-700 px-2 py-0.5 rounded-full whitespace-nowrap bg-orange-50 text-orange-600">{k.short} 재발송 필요</span>
      })}
    </>
  )
}

/* 예약 상세 — 확정·전일 안내 문자 보내기 */
function SmsPanel({ res, onSent }: { res: Reservation; onSent: (updated: Partial<Reservation>) => void }) {
  const [sending, setSending] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const hasPhone = /^01\d{8,9}$/.test((res.customer_phone ?? '').replace(/\D/g, ''))

  const send = async (k: typeof SMS_KINDS[number]) => {
    const text = k.build(res.customer_name.trim(), res.start_at)
    const bytes = smsBytes(text)
    const st = smsStatus(res[k.at] ?? null, res[k.startAt] ?? null, res.start_at)
    const head = st === 'sent' ? '이미 같은 예약 시간으로 보냈어요. 다시 보낼까요?\n\n' : ''
    const warn = bytes > SMS_MAX_BYTES ? ` — ${SMS_MAX_BYTES}바이트 초과, 장문으로 발송될 수 있어요` : ''
    if (!confirm(`${head}${k.label}를 보낼까요? (${bytes}바이트${warn})\n\n${text}`)) return
    setSending(k.type); setErr('')
    try {
      const r = await fetch(`/api/reservations/${res.id}/sms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: k.type }) })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(data.error ?? '발송 실패'); return }
      onSent(data.reservation)
    } catch {
      setErr('네트워크 오류입니다. 다시 시도하세요')
    } finally {
      setSending(null)
    }
  }

  return (
    <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-3 mb-4 space-y-2">
      <p className="text-xs font-700 text-gray-500">문자 보내기</p>
      {err && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
      {!hasPhone && <p className="text-[11px] text-gray-400">휴대폰 번호가 없어 보낼 수 없어요</p>}
      {SMS_KINDS.map(k => {
        const at = res[k.at] ?? null
        const st = smsStatus(at, res[k.startAt] ?? null, res.start_at)
        const tone = st === 'none'
          ? 'text-white border-transparent'
          : st === 'stale' ? 'bg-orange-50 border-orange-300 text-orange-700' : 'bg-white border-emerald-200 text-gray-700'
        return (
          // 문자 이름·발송 상태·보내기를 하나의 버튼으로
          <button key={k.type} type="button" onClick={() => send(k)} disabled={!hasPhone || sending !== null}
            className={`block w-full sm:w-80 text-left rounded-xl border px-3 py-2 transition-colors disabled:opacity-40 active:scale-[0.99] ${tone}`}
            style={st === 'none' ? { background: '#bc7659' } : undefined}>
            <span className="block text-sm font-700">
              ✉ {sending === k.type ? `${k.label} 보내는 중...` : `${k.label} ${st === 'none' ? '보내기' : '다시 보내기'}`}
            </span>
            <span className={`block text-[11px] mt-0.5 ${st === 'none' ? 'text-white/80' : st === 'stale' ? 'text-orange-600' : 'text-emerald-600'}`}>
              {st === 'none' ? '보내지 않음' : `${kstDate(at!)} ${fmtTime(at!)} 발송${st === 'stale' ? ' · 이후 예약 시간 변경됨, 다시 보내 주세요' : ' ✓'}`}
            </span>
          </button>
        )
      })}
    </div>
  )
}

const STATUS_LABEL = { scheduled: '예약', completed: '완료', cancelled: '취소' } as const
const STATUS_COLOR = { scheduled: '#bc7659', completed: '#7c9a7e', cancelled: '#9ca3af' } as const
const STATUS_BG    = { scheduled: '#faf4f0', completed: '#f0f4ef', cancelled: '#f9fafb' } as const

/* ── 예약 상세 ── */
function ReservationDetail({ res, onClose, onStatusChange, onEdit, onComplete, onSmsSent }: {
  res: Reservation; onClose: () => void
  onStatusChange: (id: number, status: string) => Promise<void>
  onEdit: (r: Reservation) => void
  onComplete: (r: Reservation) => void
  onSmsSent: (updated: Partial<Reservation>) => void
}) {
  const [changing, setChanging] = useState<string | null>(null)

  const change = async (status: string) => {
    if (res.status === 'completed' && !confirm('완료된 예약입니다. 결제가 취소되고 선불·첫체험 차감분이 복원됩니다. 계속할까요?')) return
    setChanging(status)
    await onStatusChange(res.id, status)
    setChanging(null)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-t-3xl px-4 pt-5 pb-8 max-h-[85vh] overflow-y-auto">
        <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-3" />
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-serif text-xl font-extrabold text-brand-700">{res.customer_name}</h2>
            {res.customer_phone && <p className="text-xs text-gray-400">{res.customer_phone}</p>}
          </div>
          <span className="text-xs font-700 px-3 py-1 rounded-full" style={{ background: STATUS_BG[res.status], color: STATUS_COLOR[res.status] }}>
            {STATUS_LABEL[res.status]}
          </span>
        </div>
        <div className="space-y-2 mb-4">
          <Row label="날짜/시간" value={`${kstDate(res.start_at)} ${fmtTime(res.start_at)} ~ ${fmtTime(res.end_at)}`} />
          <Row label="접수" value={res.source === 'external' ? '외부 예약' : '매장 등록'} />
          <Row label="회원" value={isMember(res) ? `🌸 회원 (선불 잔액 ${fmtPrice(prepaidOf(res))})` : res.customer_id ? '비회원' : '비회원 (고객 미연결)'} />
          {res.trial && <Row label="첫체험" value={`🎁 ${res.trial.label}${res.trial.expired ? ' (기간 만료)' : ''}`} />}
          {res.price_type && <Row label="예약 시" value={res.price_type === 'member' ? '회원가로 예약' : '비회원가로 예약'} />}
          {res.product_name && <Row label="시술" value={`${res.product_name}${res.duration_min ? ` (${res.duration_min}분)` : ''}`} />}
          {res.price != null && (
            <div className="flex gap-2">
              <span className="text-xs text-gray-400 w-16 shrink-0">금액</span>
              <span className="text-xs text-gray-700"><PriceChange r={res} detail /></span>
            </div>
          )}
          {res.customer_message && <Row label="고객 요청" value={res.customer_message} />}
          {res.memo && <Row label="내부 메모" value={res.memo} />}
        </div>
        {res.status === 'scheduled' && <SmsPanel res={res} onSent={onSmsSent} />}
        {res.status === 'scheduled' && (
          <div className="flex gap-2 mb-4">
            <button onClick={() => { onClose(); onComplete(res) }} disabled={!!changing} className="flex-1 py-2.5 rounded-xl text-sm font-700 text-white" style={{ background: '#7c9a7e' }}>
              ✓ 시술 완료 · 결제
            </button>
            <button onClick={() => change('cancelled')} disabled={!!changing} className="flex-1 py-2.5 rounded-xl text-sm font-700 text-white bg-gray-400">
              {changing === 'cancelled' ? '처리 중...' : '✕ 예약 취소'}
            </button>
          </div>
        )}
        {res.status !== 'scheduled' && (
          <button onClick={() => change('scheduled')} disabled={!!changing} className="w-full py-2.5 rounded-xl text-sm font-700 text-brand-500 border border-brand-200 mb-4">
            예약 복원
          </button>
        )}
        {res.status === 'scheduled' && (
          <button onClick={() => { onClose(); onEdit(res) }} className="w-full py-2 rounded-xl text-xs font-600 text-gray-500 bg-gray-50 mb-4">
            ✏️ 예약 수정
          </button>
        )}
        {res.history && res.history.length > 0 && (
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-700 text-gray-400 mb-2">변경 이력</p>
            <div className="space-y-1.5">
              {res.history.map(h => (
                <div key={h.id} className="flex gap-2 text-xs text-gray-500">
                  <span className="text-gray-300 shrink-0">{kstDate(h.changed_at).slice(5)} {fmtTime(h.changed_at)}</span>
                  <span>{h.description}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-xs text-gray-400 w-16 shrink-0">{label}</span>
      <span className="text-xs text-gray-700">{value}</span>
    </div>
  )
}

/* ── 월 달력 ── */
function MonthCalendar({ year, month, reservations, closedDates, onDayClick }: {
  year: number; month: number; reservations: Reservation[]; closedDates: ClosedDate[]; onDayClick: (date: string) => void
}) {
  const today = kstNow().date
  const closedSet = new Set(closedDates.map(c => c.date))
  const startOffset = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: Array<{ date: string; day: number } | null> = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`, day: d })
  }
  while (cells.length % 7 !== 0) cells.push(null)

  const byDate: Record<string, Reservation[]> = {}
  reservations.forEach(r => { const d = kstDate(r.start_at); if (!byDate[d]) byDate[d]=[]; byDate[d].push(r) })

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {['일','월','화','수','목','금','토'].map((d,i) => (
          <div key={d} className={`text-center text-[10px] font-600 py-1 ${i===0?'text-red-400':i===6?'text-blue-400':'text-gray-400'}`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-brand-100 rounded-2xl overflow-hidden">
        {cells.map((cell, i) => {
          if (!cell) return <div key={`e-${i}`} className="bg-white min-h-[60px]" />
          const isToday = cell.date === today
          const rsvs = byDate[cell.date] ?? []
          const col = i % 7
          return (
            <button key={cell.date} onClick={() => onDayClick(cell.date)} className="bg-white min-h-[60px] p-1 text-left hover:bg-brand-50 transition-colors">
              <span className={`text-xs font-600 inline-flex w-5 h-5 items-center justify-center rounded-full ${isToday?'bg-brand-500 text-white':col===0?'text-red-400':col===6?'text-blue-400':'text-gray-700'}`}>
                {cell.day}
              </span>
              {closedSet.has(cell.date) && <span className="text-[9px] font-700 text-red-400 ml-0.5">휴무</span>}
              <div className="mt-0.5 space-y-0.5">
                {rsvs.slice(0,2).map(r => (
                  <div key={r.id} className="text-[9px] leading-tight px-1 rounded truncate" style={{ background: STATUS_BG[r.status], color: STATUS_COLOR[r.status] }}>
                    {fmtTime(r.start_at)} {isMember(r) && '🌸'}{r.customer_name}
                  </div>
                ))}
                {rsvs.length > 2 && <div className="text-[9px] text-gray-400 px-1">+{rsvs.length-2}건</div>}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/* ── 메인 클라이언트 ── */
export default function ReservationsClient({ initialReservations, initialDate, openId, products }: {
  initialReservations: Reservation[]
  initialDate: string
  openId?: number
  products: Product[]
}) {
  const [view, setView] = useState<'day' | 'month'>('day')
  const [currentDate, setCurrentDate] = useState(initialDate)
  const [currentYear, setCurrentYear] = useState(() => Number(initialDate.slice(0, 4)))
  const [currentMonth, setCurrentMonth] = useState(() => Number(initialDate.slice(5, 7)) - 1)

  // 일단위: 초기 데이터로 시작 (서버에서 받음). 날짜 변경 시 fetch
  const [reservations, setReservations] = useState<Reservation[]>(initialReservations)
  const [monthReservations, setMonthReservations] = useState<Reservation[]>([])
  const [loadingDay, setLoadingDay] = useState(false)
  const [loadingMonth, setLoadingMonth] = useState(false)

  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<Reservation | null>(null)
  const [detailTarget, setDetailTarget] = useState<Reservation | null>(null)
  const [closedDates, setClosedDates] = useState<ClosedDate[]>([])
  const [payTarget, setPayTarget] = useState<Reservation | null>(null)

  const loadClosed = useCallback(async (from: string, to: string) => {
    const data = await fetch(`/api/closed-dates?from=${from}&to=${to}`).then(r => r.json())
    if (Array.isArray(data)) setClosedDates(data)
  }, [])

  const loadDay = useCallback(async (date: string) => {
    setLoadingDay(true)
    const [data] = await Promise.all([
      fetch(`/api/reservations?${kstRange(date, date)}`).then(r => r.json()),
      loadClosed(date, date),
    ])
    setReservations(Array.isArray(data) ? data : [])
    setLoadingDay(false)
  }, [loadClosed])

  const loadMonth = useCallback(async (year: number, month: number) => {
    setLoadingMonth(true)
    const last = new Date(year, month + 1, 0).getDate()
    const from = `${year}-${String(month+1).padStart(2,'0')}-01`
    const to   = `${year}-${String(month+1).padStart(2,'0')}-${String(last).padStart(2,'0')}`
    const [data] = await Promise.all([
      fetch(`/api/reservations?${kstRange(from, to)}`).then(r => r.json()),
      loadClosed(from, to),
    ])
    setMonthReservations(Array.isArray(data) ? data : [])
    setLoadingMonth(false)
  }, [loadClosed])

  const moveDay = (d: number) => {
    const next = addDays(currentDate, d)
    setCurrentDate(next)
    loadDay(next)
  }

  const closedToday = closedDates.find(c => c.date === currentDate)
  const toggleClosed = async () => {
    if (closedToday) {
      if (!confirm(`${currentDate} 휴무를 해제할까요?`)) return
      await fetch(`/api/closed-dates?date=${currentDate}`, { method: 'DELETE' })
    } else {
      const reason = prompt(`${currentDate}을 휴무일로 지정합니다. 사유를 입력하세요 (예: 추석 연휴)`)
      if (reason === null) return
      await fetch('/api/closed-dates', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ date: currentDate, reason }) })
    }
    loadClosed(currentDate, currentDate)
  }

  const moveMonth = (d: number) => {
    let m = currentMonth + d, y = currentYear
    if (m < 0)  { m = 11; y-- }
    if (m > 11) { m = 0;  y++ }
    setCurrentMonth(m); setCurrentYear(y)
    loadMonth(y, m)
  }

  const switchToMonth = () => {
    setView('month')
    loadMonth(currentYear, currentMonth)
  }

  /* 낙관적 업데이트: 상태 변경 즉시 반영 */
  const handleStatusChange = async (id: number, status: string) => {
    const prev = reservations
    setReservations(list => list.map(r => r.id === id ? { ...r, status: status as Reservation['status'] } : r))
    const res = await fetch(`/api/reservations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) setReservations(prev)
    else loadDay(currentDate) // 결제·첫체험 복원 결과(배지 등) 반영
    if (view === 'month') loadMonth(currentYear, currentMonth)
  }

  /* 예약 저장 (겹침 확인 필요 → API 후 반영) */
  const handleSave = async (form: typeof EMPTY_FORM, paymentMethod: PaymentMethod | null) => {
    const e = await saveReservation({ form, products: formProducts, editId: editTarget?.id, paymentMethod })
    if (e) return e
    setShowForm(false); setEditTarget(null)
    loadDay(currentDate)
    if (view === 'month') loadMonth(currentYear, currentMonth)
    return null
  }

  /* 상세 열기: 이력 포함 */
  const openDetail = async (r: Pick<Reservation, 'id'>) => {
    const res = await fetch(`/api/reservations/${r.id}`)
    if (res.ok) setDetailTarget(await res.json())
  }

  // 알림 링크(?open=id)로 들어오면 예약 상세를 바로 열고, 주소는 깔끔하게 정리
  useEffect(() => {
    if (!openId) return
    openDetail({ id: openId })
    window.history.replaceState(null, '', `/?date=${initialDate}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId])

  const today = kstNow().date
  const dateLabel = currentDate === today ? '오늘' :
    currentDate === addDays(today, -1) ? '어제' :
    currentDate === addDays(today, 1) ? '내일' :
    currentDate

  const editInitial = editTarget ? {
    customer_name: editTarget.customer_name,
    customer_phone: editTarget.customer_phone ?? '',
    customer_id: editTarget.customer_id?.toString() ?? '',
    product_id: editTarget.product_id?.toString() ?? '',
    date: kstDate(editTarget.start_at),
    time: fmtTime(editTarget.start_at),
    price: editTarget.price?.toString() ?? '',
    memo: editTarget.memo ?? '',
  } : undefined

  // 수정 대상의 시술이 비활성(목록에 없음)이어도 기존 시술명/시간을 유지
  const formProducts: Product[] = editTarget?.product_id && !products.some(p => p.id === editTarget.product_id)
    ? [...products, { id: editTarget.product_id, name: editTarget.product_name ?? '(비활성 시술)', price: editTarget.price ?? 0, duration_min: editTarget.duration_min }]
    : products

  const MONTH_NAMES = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월']

  return (
    <div className="min-h-screen">
      <BrandHeader right={
        <div className="flex bg-brand-50 border border-brand-100 rounded-full p-0.5">
          <button onClick={() => setView('day')} className="px-3.5 py-1 rounded-full text-xs font-600 transition-colors" style={view==='day'?{background:'#bc7659',color:'#fff'}:{color:'#a5624a'}}>일</button>
          <button onClick={switchToMonth}        className="px-3.5 py-1 rounded-full text-xs font-600 transition-colors" style={view==='month'?{background:'#bc7659',color:'#fff'}:{color:'#a5624a'}}>월</button>
        </div>
      }>
        {view === 'day' ? (
          <div className="flex items-center gap-3">
            <button onClick={() => moveDay(-1)} aria-label="이전 날" className="w-9 h-9 rounded-full border-2 border-brand-500 bg-white flex items-center justify-center text-brand-700 text-xl font-extrabold shadow-sm active:bg-brand-50">‹</button>
            <div className="flex-1 text-center">
              <span className="font-serif text-base font-bold text-brand-700">{currentDate}</span>
              <span className="text-xs text-brand-400 ml-1">({dateLabel})</span>
            </div>
            <button onClick={() => moveDay(1)} aria-label="다음 날" className="w-9 h-9 rounded-full border-2 border-brand-500 bg-white flex items-center justify-center text-brand-700 text-xl font-extrabold shadow-sm active:bg-brand-50">›</button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button onClick={() => moveMonth(-1)} className="w-8 h-8 rounded-full border border-brand-200 flex items-center justify-center text-brand-500">‹</button>
            <div className="flex-1 text-center">
              <span className="font-serif text-base font-bold text-brand-700">{currentYear}년 {MONTH_NAMES[currentMonth]}</span>
            </div>
            <button onClick={() => moveMonth(1)} className="w-8 h-8 rounded-full border border-brand-200 flex items-center justify-center text-brand-500">›</button>
          </div>
        )}
        <p className="font-serif text-[10px] text-brand-400 text-center tracking-wider mt-2">
          MON–FRI 10:00–20:00 · SAT 10:00–17:00 · SUN off
        </p>
      </BrandHeader>

      <div className="px-4 py-4">
        {view === 'day' && (
          <div className="flex items-center justify-between mb-3 min-h-7">
            {closedToday
              ? <p className="text-xs font-700 text-red-400">휴무일{closedToday.reason ? ` · ${closedToday.reason}` : ''} (외부 예약 차단)</p>
              : <span />}
            <button onClick={toggleClosed} className="text-[11px] font-600 px-3 py-1 rounded-full border border-brand-200 text-brand-500">
              {closedToday ? '휴무 해제' : '휴무 지정'}
            </button>
          </div>
        )}
        {view === 'day' ? (
          loadingDay ? (
            <p className="text-sm text-gray-400 text-center py-10">불러오는 중...</p>
          ) : reservations.length === 0 ? (
            <div className="text-center py-14">
              <img src="/onflow-logo.png" alt="" className="w-20 h-20 object-contain mx-auto mb-4 opacity-40" />
              <p className="font-serif text-base font-bold text-brand-600">예약이 없습니다</p>
              <p className="text-xs text-brand-400 mt-1">+ 버튼으로 추가해 보세요</p>
            </div>
          ) : (
            <div className="space-y-3">
              {reservations.map(r => (
                <button key={r.id} onClick={() => openDetail(r)} className="w-full text-left bg-white/85 rounded-2xl border border-l-4 p-4 shadow-sm" style={{ borderColor: STATUS_COLOR[r.status] + '40', borderLeftColor: STATUS_COLOR[r.status] }}>
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                        <span className="text-sm font-700 text-gray-800 whitespace-nowrap">{r.customer_name}</span>
                        <span className="text-[10px] font-700 px-2 py-0.5 rounded-full whitespace-nowrap" style={{ background: STATUS_BG[r.status], color: STATUS_COLOR[r.status] }}>{STATUS_LABEL[r.status]}</span>
                        <MemberBadge r={r} />
                        <TrialBadge r={r} />
                        <SmsBadges r={r} />
                        {r.source === 'external' && <span className="text-[10px] font-700 px-2 py-0.5 rounded-full bg-sky-50 text-sky-600 whitespace-nowrap">외부예약</span>}
                      </div>
                      {r.product_name && <p className="text-xs text-gray-500 mt-0.5">{r.product_name}</p>}
                      {(() => { const c = effectivePrice(r).changed; return c && <p className="mt-1"><ChangeLabel changed={c} /></p> })()}
                      {r.customer_message && <p className="text-xs text-sky-500 mt-0.5 truncate">💬 {r.customer_message}</p>}
                      {r.memo && <p className="text-xs text-gray-400 mt-0.5 truncate">{r.memo}</p>}
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="font-serif text-base font-extrabold" style={{ color: STATUS_COLOR[r.status] }}>{fmtTime(r.start_at)}</p>
                      <p className="text-xs text-gray-400">~ {fmtTime(r.end_at)}</p>
                      {r.price != null && <p className="text-xs text-gray-500 mt-0.5"><PriceChange r={r} hideLabel /></p>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )
        ) : loadingMonth ? (
          <p className="text-sm text-gray-400 text-center py-10">불러오는 중...</p>
        ) : (
          <MonthCalendar year={currentYear} month={currentMonth} reservations={monthReservations} closedDates={closedDates} onDayClick={(date) => { setCurrentDate(date); setView('day'); loadDay(date) }} />
        )}
      </div>

      {!showForm && !detailTarget && !payTarget && (
        <button onClick={() => { setEditTarget(null); setShowForm(true) }} className="fixed right-5 bottom-14 w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white text-2xl transition-transform active:scale-90 z-30" style={{ background: 'linear-gradient(135deg, #bc7659, #cb9175)' }}>+</button>
      )}

      {showForm && (
        <ReservationForm initial={editInitial} products={formProducts} date={currentDate} onSave={handleSave} onCancel={() => { setShowForm(false); setEditTarget(null) }} editId={editTarget?.id} completed={editTarget?.status === 'completed'} />
      )}

      {payTarget && (
        <PaymentSheet reservation={{ ...payTarget, price: effectivePrice(payTarget).price }} onCancel={() => setPayTarget(null)} onDone={() => {
          setPayTarget(null)
          loadDay(currentDate)
          if (view === 'month') loadMonth(currentYear, currentMonth)
        }} />
      )}

      {detailTarget && (
        <ReservationDetail res={detailTarget} onClose={() => setDetailTarget(null)} onStatusChange={handleStatusChange} onEdit={(r) => { setDetailTarget(null); setEditTarget(r); setShowForm(true) }} onComplete={setPayTarget} onSmsSent={updated => {
          setDetailTarget(d => d ? { ...d, ...updated } : d)
          setReservations(list => list.map(r => r.id === updated.id ? { ...r, ...updated } : r))
        }} />
      )}
    </div>
  )
}
