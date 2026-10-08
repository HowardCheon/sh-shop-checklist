import { connection } from 'next/server'
import { listSmsLogs } from '@/lib/sms-log'
import AdminClient from './AdminClient'

export default async function AdminPage() {
  await connection()
  const logs = await listSmsLogs(100).catch(() => [])
  return <AdminClient logs={logs} />
}
