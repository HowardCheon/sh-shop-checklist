'use client'

import Link from 'next/link'
import BrandHeader, { PageTitle } from '@/components/BrandHeader'
import type { SmsLog } from '@/lib/sms-log'
import LedgerView from './LedgerView'
import SmsLogList from './SmsLogList'

const TABS = [
  { key: 'ledger', label: '가계부' },
  { key: 'sms', label: '보낸 문자' },
] as const

/* ── 관리자 탭: [가계부] / [보낸 문자] ── */
export default function AdminClient({ tab, logs }: { tab: 'ledger' | 'sms'; logs: SmsLog[] }) {
  return (
    <div className="min-h-screen">
      <BrandHeader>
        <PageTitle title="관리자" />
        <div className="flex gap-1.5 justify-center mt-3">
          {TABS.map(t => (
            <Link key={t.key} href={t.key === 'ledger' ? '/admin' : `/admin?tab=${t.key}`} replace
              className="px-4 py-1 rounded-full text-xs font-600 border transition-colors"
              style={tab === t.key ? { background: '#bc7659', borderColor: '#bc7659', color: '#fff' } : { background: '#faf4f0', borderColor: '#f3e6de', color: '#a5624a' }}>
              {t.label}
            </Link>
          ))}
        </div>
      </BrandHeader>
      <div className="px-4 py-4 max-w-2xl mx-auto">
        {tab === 'sms' ? <SmsLogList logs={logs} /> : <LedgerView />}
      </div>
    </div>
  )
}
