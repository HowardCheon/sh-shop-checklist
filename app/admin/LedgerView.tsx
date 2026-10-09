'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { EVIDENCE_LABEL, METHOD_LABEL, type EntryRow, type MonthSummary, type Ranked } from '@/lib/ledger/summary'
import type { Category } from '@/lib/ledger/repo'
import { isoToKst } from '@/lib/booking/time'
import EntrySheet from './EntrySheet'
import CategorySheet from './CategorySheet'

type LedgerData = { month: string; summary: MonthSummary; categories: Category[]; balances: { id: number; name: string; cash: number; bonus: number }[]; autoFrom: string }

const WEEK = ['일', '월', '화', '수', '목', '금', '토']
const won = (n: number) => n.toLocaleString('ko-KR')
const signed = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + won(Math.abs(n))
const kstMonth = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7)
const shiftMonth = (month: string, d: number) => {
  const [y, m] = month.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + d, 1))
  return t.toISOString().slice(0, 7)
}
const dayLabel = (date: string) => {
  const [y, m, d] = date.split('-').map(Number)
  return `${m}/${d} (${WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`
}

function RankCard({ title, rows, empty }: { title: string; rows: Ranked[]; empty: string }) {
  return (
    <div className="bg-white/85 rounded-2xl border border-brand-100 p-3">
      <p className="text-xs font-700 text-gray-400 mb-1.5">{title}</p>
      {rows.length === 0 ? <p className="text-[11px] text-gray-300">{empty}</p> : (
        <ul className="space-y-1">
          {rows.map(r => (
            <li key={r.label} className="flex justify-between text-xs">
              <span className="text-gray-600">{r.label}</span>
              <span className={`font-600 ${r.count < 0 ? 'text-red-500' : 'text-gray-800'}`}>{signed(r.count).replace('+', '')}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ── 관리자 > 가계부: 선불 충전 현황 · 손익 · 항목/증빙/결제수단별 · 날짜별 내역 ── */
export default function LedgerView() {
  const [month, setMonth] = useState(kstMonth)
  const [data, setData] = useState<LedgerData | null>(null)
  const [err, setErr] = useState('')
  const [editing, setEditing] = useState<EntryRow | 'new' | null>(null)
  const [showCats, setShowCats] = useState(false)
  const [showBalances, setShowBalances] = useState(false)

  const load = useCallback(async (m: string) => {
    setErr('')
    try {
      const res = await fetch(`/api/ledger?month=${m}`)
      const d = await res.json()
      if (!res.ok) { setErr(d.error ?? '불러오기 실패'); return }
      setData(d)
    } catch {
      setErr('네트워크 오류입니다')
    }
  }, [])
  useEffect(() => { load(month) }, [month, load])

  const s = data?.summary
  const [y, m] = month.split('-').map(Number)
  const autoNote = data && month < data.autoFrom.slice(0, 7) ? '이 달은 관리자 앱 결제 기록 전이라 수기 매출만 있어요' : null
  const prepaidRows = s ? [
    { label: '월초 잔액', v: s.prepaid.open, sign: '' },
    { label: '충전', v: s.prepaid.charge, sign: '+' },
    { label: '사용', v: s.prepaid.use, sign: '−' },
    { label: '환불·소멸', v: s.prepaid.refund, sign: '−' },
    { label: '월말 잔액', v: s.prepaid.close, sign: '' },
  ] : []

  return (
    <div className="space-y-3 pb-16">
      <div className="flex items-center justify-between">
        <button onClick={() => setMonth(shiftMonth(month, -1))} aria-label="이전 달" className="w-9 h-9 rounded-full border-2 border-brand-500 bg-white text-brand-700 text-xl font-extrabold">‹</button>
        <p className="font-serif text-lg font-extrabold text-brand-700">{y}년 {m}월</p>
        <button onClick={() => setMonth(shiftMonth(month, 1))} aria-label="다음 달" className="w-9 h-9 rounded-full border-2 border-brand-500 bg-white text-brand-700 text-xl font-extrabold">›</button>
      </div>
      {err && <p className="text-xs text-red-500 bg-red-50 rounded-lg px-3 py-2">{err}</p>}
      {!s ? <p className="text-sm text-gray-400 text-center py-10">불러오는 중...</p> : (
        <>
          {/* 선불 충전 현황 */}
          <div className="bg-white/85 rounded-2xl border border-brand-100 p-3">
            <p className="text-xs font-700 text-gray-400 mb-2">선불 충전 현황</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-400">
                  <th className="text-left font-600 pb-1"></th>
                  <th className="text-right font-600 pb-1">실제 금액</th>
                  <th className="text-right font-600 pb-1">보너스</th>
                  <th className="text-right font-600 pb-1">합계</th>
                </tr>
              </thead>
              <tbody>
                {prepaidRows.map(r => {
                  const strong = r.sign === ''
                  return (
                    <tr key={r.label} className={strong ? 'font-700 text-brand-700 border-t border-brand-50' : 'text-gray-600'}>
                      <td className="py-1">{r.sign && <span className="text-gray-400 mr-0.5">{r.sign}</span>}{r.label}</td>
                      <td className="py-1 text-right">{won(r.v.cash)}</td>
                      <td className="py-1 text-right">{won(r.v.bonus)}</td>
                      <td className="py-1 text-right">{won(r.v.cash + r.v.bonus)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <button onClick={() => setShowBalances(v => !v)} className="w-full text-[11px] text-brand-500 mt-1.5">
              선불 보유 고객 {data.balances.length}명 (현재) {showBalances ? '▲' : '▼'}
            </button>
            {showBalances && (
              <ul className="mt-1.5 space-y-1">
                {data.balances.map(b => (
                  <li key={b.id}>
                    <Link href={`/customers/${b.id}`} className="flex justify-between text-xs text-gray-600 hover:text-brand-600">
                      <span>{b.name}</span>
                      <span>{won(b.cash + b.bonus)} <span className="text-gray-400">(실제 {won(b.cash)} · 보너스 {won(b.bonus)})</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 손익 */}
          <div className="bg-white/85 rounded-2xl border border-brand-100 p-3 space-y-1.5">
            <p className="text-xs font-700 text-gray-400">이번 달 손익</p>
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-gray-700">매출</span>
              <span className="text-base font-700 text-gray-800">{won(s.pnl.revenue)}</span>
            </div>
            <p className="text-[11px] text-gray-400 text-right">자동 {won(s.pnl.revenueAuto)} · 수기 {won(s.pnl.revenueManual)}</p>
            {s.pnl.byKind.length > 0 && (
              <div className="flex flex-wrap gap-1 justify-end">
                {s.pnl.byKind.map(k => <span key={k.label} className="text-[10px] px-2 py-0.5 rounded-full bg-brand-50 text-brand-600">{k.label} {signed(k.count).replace('+', '')}</span>)}
              </div>
            )}
            <div className="flex justify-between items-baseline">
              <span className="text-sm text-gray-700">지출</span>
              <span className="text-base font-700 text-gray-800">{won(s.pnl.expense)}</span>
            </div>
            <div className="flex justify-between items-baseline border-t border-brand-50 pt-1.5">
              <span className="text-sm font-700 text-brand-700">순이익</span>
              <span className={`font-serif text-xl font-extrabold ${s.pnl.net < 0 ? 'text-red-500' : 'text-brand-700'}`}>{signed(s.pnl.net).replace('+', '')}</span>
            </div>
            {autoNote && <p className="text-[11px] text-gray-400">{autoNote}</p>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <RankCard title="지출 항목별" rows={s.byCategory} empty="지출 없음" />
            <RankCard title="증빙별 지출 (신고용)" rows={s.byEvidence} empty="지출 없음" />
          </div>
          <RankCard title="결제수단별 매출" rows={s.byMethod} empty="매출 없음" />

          {/* 날짜별 내역 */}
          <div className="space-y-2">
            <p className="text-xs font-700 text-gray-400">내역</p>
            {s.days.length === 0 && <p className="text-sm text-gray-400 text-center py-6">이 달 내역이 없습니다</p>}
            {s.days.map(d => (
              <div key={d.date} className="bg-white/85 rounded-2xl border border-brand-100 px-3 py-2">
                <div className="flex justify-between text-xs font-700 text-gray-500 mb-1">
                  <span>{dayLabel(d.date)}</span>
                  <span className={d.total < 0 ? 'text-red-500' : 'text-emerald-600'}>{signed(d.total)}</span>
                </div>
                <ul className="divide-y divide-brand-50">
                  {d.items.map(item => item.type === 'auto' ? (
                    <li key={`a-${item.row.at}-${item.row.label}`} className="py-1.5 flex items-center gap-2">
                      <span className="text-sm">{item.row.kind === 'refund' ? '↩️' : '💳'}</span>
                      <div className="flex-1 min-w-0">
                        {item.row.link
                          ? <Link href={item.row.link} className="text-xs text-gray-700 hover:text-brand-600 truncate block">{item.row.label}</Link>
                          : <p className="text-xs text-gray-700 truncate">{item.row.label}</p>}
                        <p className="text-[10px] text-gray-400">{isoToKst(item.row.at).time} · {item.row.method ? METHOD_LABEL[item.row.method] : item.row.kind === 'charge' ? '선불 충전' : '환불'} · 자동</p>
                      </div>
                      <span className={`text-xs font-700 ${item.row.amount < 0 ? 'text-red-500' : 'text-emerald-600'}`}>{signed(item.row.amount)}</span>
                    </li>
                  ) : (
                    <li key={`e-${item.row.id}`}>
                      <button type="button" onClick={() => setEditing(item.row)} className={`w-full text-left py-1.5 flex items-center gap-2 ${item.row.excluded ? 'opacity-50' : ''}`}>
                        <span className="text-sm">{item.row.io === 'in' ? '💰' : '🧾'}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs text-gray-700 truncate ${item.row.excluded ? 'line-through' : ''}`}>
                            {item.row.category.name}{item.row.vendor ? ` · ${item.row.vendor}` : ''}{item.row.memo ? ` · ${item.row.memo}` : ''}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            {item.row.method ? METHOD_LABEL[item.row.method] : '수단 없음'}{item.row.io === 'out' ? ` · ${EVIDENCE_LABEL[item.row.evidence]}` : ''}
                            {item.row.excluded ? ` · 제외(${item.row.exclude_reason ?? '사유 없음'})` : ''}
                          </p>
                        </div>
                        <span className={`text-xs font-700 ${item.row.excluded ? 'text-gray-400 line-through' : item.row.io === 'out' ? 'text-red-500' : 'text-emerald-600'}`}>
                          {item.row.io === 'out' ? '−' : '+'}{won(item.row.amount)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          <button onClick={() => setShowCats(true)} className="w-full py-2 rounded-xl text-xs font-600 text-gray-500 bg-gray-50 border border-gray-200">항목 관리</button>
        </>
      )}

      <button onClick={() => setEditing('new')} className="fixed right-5 bottom-14 px-4 h-12 rounded-full shadow-lg text-white text-sm font-700 z-30" style={{ background: 'linear-gradient(135deg, #bc7659, #cb9175)' }}>
        ＋ 지출/수입
      </button>

      {editing && data && (
        <EntrySheet categories={data.categories} initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(month) }} />
      )}
      {showCats && data && <CategorySheet categories={data.categories} onClose={() => setShowCats(false)} onChanged={() => load(month)} />}
    </div>
  )
}
