'use client'

import { useState } from 'react'
import Link from 'next/link'
import BrandHeader, { PageTitle } from '@/components/BrandHeader'
import { isoToKst } from '@/lib/booking/time'
import type { SmsLog } from '@/lib/sms-log'

const KIND_LABEL = { confirm: '확정', remind: '전일 안내' } as const

const fmtAt = (iso: string) => {
  const { date, time } = isoToKst(iso)
  const [, m, d] = date.split('-').map(Number)
  return `${m}/${d} ${time}`
}
const fmtPhone = (p: string) => (p.length === 11 ? `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}` : p)

/* ── 관리자: 보낸 문자 이력 (최근 100건, 인증번호 제외) ── */
export default function AdminClient({ logs }: { logs: SmsLog[] }) {
  const [open, setOpen] = useState<number | null>(null)
  const failed = logs.filter(l => l.status === 'failed').length

  return (
    <div className="min-h-screen">
      <BrandHeader>
        <PageTitle title="관리자" />
      </BrandHeader>

      <div className="px-4 py-4 max-w-2xl mx-auto">
        <div className="flex items-baseline justify-between mb-2">
          <h2 className="font-serif text-base font-extrabold text-brand-700">보낸 문자</h2>
          <p className="text-[11px] text-gray-400">최근 {logs.length}건 · 인증번호 제외{failed ? ` · 실패 ${failed}건` : ''}</p>
        </div>

        {logs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-10">보낸 문자가 없습니다</p>
        ) : (
          <ul className="space-y-1.5">
            {logs.map(l => {
              const expanded = open === l.id
              return (
                <li key={l.id} className={`rounded-xl border px-3 py-2 ${l.status === 'failed' ? 'border-red-200 bg-red-50/50' : 'border-brand-100 bg-white/85'}`}>
                  <button type="button" onClick={() => setOpen(expanded ? null : l.id)} className="w-full text-left">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-gray-400 shrink-0">{fmtAt(l.created_at)}</span>
                      <span className={`text-[10px] font-700 px-2 py-0.5 rounded-full shrink-0 ${l.kind === 'confirm' ? 'bg-brand-50 text-brand-600' : 'bg-amber-50 text-amber-700'}`}>{KIND_LABEL[l.kind]}</span>
                      <span className="text-sm font-600 text-gray-800">{l.customer_name ?? '-'}</span>
                      <span className="text-[11px] text-gray-400">{fmtPhone(l.phone)}</span>
                      <span className={`ml-auto text-[11px] font-700 shrink-0 ${l.status === 'sent' ? 'text-emerald-600' : 'text-red-500'}`}>
                        {l.status === 'sent' ? '✅ 성공' : '❌ 실패'}
                      </span>
                    </div>
                    {l.status === 'failed' && l.reason && <p className="text-[11px] text-red-500 mt-0.5">사유: {l.reason}</p>}
                    {/* 접힌 상태는 줄바꿈을 공백으로 이어 한 줄 미리보기, 펼치면 원문 그대로 */}
                    <p className={`text-xs text-gray-500 mt-1 ${expanded ? 'whitespace-pre-line' : 'truncate'}`}>{expanded ? l.text : l.text.replace(/\n/g, ' ')}</p>
                  </button>
                  {expanded && l.reservation_id && l.reservation && (
                    <Link href={`/?date=${isoToKst(l.reservation.start_at).date}&open=${l.reservation_id}`} className="inline-block mt-1.5 text-[11px] font-600 text-brand-500 underline">
                      예약 보기 ›
                    </Link>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
