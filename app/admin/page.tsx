import { connection } from 'next/server'
import { listSmsLogs } from '@/lib/sms-log'
import AdminClient from './AdminClient'

// ?tab=sms → 보낸 문자, 기본은 가계부(화면에서 월별로 불러옴)
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await connection()
  const tab = (await searchParams).tab === 'sms' ? 'sms' : 'ledger'
  const logs = tab === 'sms' ? await listSmsLogs(100).catch(() => []) : []
  return <AdminClient tab={tab} logs={logs} />
}
