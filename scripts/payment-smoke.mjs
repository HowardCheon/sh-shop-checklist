// 2단계 점검: 결제·선불 차감/환불·관리자 인증 — 사용법: node scripts/payment-smoke.mjs [baseUrl]
import { adminClient, check, cleanupTestData, env, finish, sql } from './smoke-lib.mjs'

const BASE = process.argv[2] || 'http://localhost:3210'
const day = new Date(Date.now() + 9 * 3600e3 + 12 * 86400e3).toISOString().slice(0, 10)

// ── 인증
let r = await fetch(BASE + '/api/customers')
check('쿠키 없는 관리자 API → 401', r.status === 401, r.status)
r = await fetch(BASE + '/customers', { redirect: 'manual' })
check('쿠키 없는 페이지 → /login 리다이렉트', r.status === 307 && r.headers.get('location')?.includes('/login'), [r.status, r.headers.get('location')])
r = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: '0000' }) })
check('잘못된 PIN → 401', r.status === 401, r.status)
r = await fetch(BASE + '/api/public/v1/programs', { headers: { Authorization: `Bearer ${env.BOOKING_API_KEY}` } })
check('공개 API 는 관리자 쿠키 없이 동작', r.status === 200, r.status)
r = await fetch(BASE + '/api/customers', { headers: { Cookie: 'sh_admin=9999999999999.forged' } })
check('위조 쿠키 → 401', r.status === 401, r.status)

// anon 키로 DB 직접 접근 차단
const anon = (path, init = {}) => fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
  ...init, headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
})
r = await anon('rpc/sh_shop_prepaid_charge', { method: 'POST', body: JSON.stringify({ p_customer_id: 1, p_amount: 1, p_bonus: 0, p_memo: 'x' }) })
check('anon 키 RPC 실행 차단', r.status === 401 || r.status === 403 || r.status === 404, r.status)
r = await anon('sh_shop_prepaid_ledger?select=*')
const rows = await r.json().catch(() => null)
check('anon 키 원장 조회 결과 없음', Array.isArray(rows) ? rows.length === 0 : r.status >= 400, rows)

const call = await adminClient(BASE)
await cleanupTestData()
try {
  // ── 고객 + 충전
  r = await call('POST', '/api/reservations', { customer_name: '결제테스트', customer_phone: '010-9999-0031', product_id: 2, product_name: '베이직 관리', duration_min: 60, start_at: `${day}T10:00:00+09:00`, price: 300000 })
  const resv1 = r.body
  const cid = resv1.customer_id
  r = await call('POST', `/api/customers/${cid}/charge`, { amount: 1000000 })
  check('100만 충전 → 실제 100만/보너스 10만', r.body?.customer?.prepaid_cash === 1000000 && r.body.customer.prepaid_bonus === 100000, r)

  // ── 시술 완료 + 비율 차감
  r = await call('POST', `/api/reservations/${resv1.id}/complete`, { amount: 300000, use_prepaid: true })
  check('완료 결제: 실제 272,728 / 보너스 27,272 차감', r.status === 200 && r.body.status === 'completed' && r.body.payment.prepaid_cash_used === 272728 && r.body.payment.prepaid_bonus_used === 27272, r)
  let bal = (await call('GET', `/api/customers/${cid}/ledger`)).body.balance
  check('잔액 727,272 / 72,728', bal.prepaid_cash === 727272 && bal.prepaid_bonus === 72728, bal)

  r = await call('POST', `/api/reservations/${resv1.id}/complete`, { amount: 300000, use_prepaid: true })
  check('이미 완료된 예약 재결제 → 409', r.status === 409, r)

  // ── 완료 → 취소 시 복원
  r = await call('PUT', `/api/reservations/${resv1.id}`, { status: 'cancelled' })
  bal = (await call('GET', `/api/customers/${cid}/ledger`)).body.balance
  check('완료 예약 취소 → 선불 복원', r.status === 200 && bal.prepaid_cash === 1000000 && bal.prepaid_bonus === 100000, [r, bal])

  // ── 복합결제 (잔액 부족)
  r = await call('POST', '/api/reservations', { customer_name: '결제테스트', customer_phone: '010-9999-0031', product_id: 13, product_name: '전신관리', duration_min: 120, start_at: `${day}T13:00:00+09:00`, price: 1500000 })
  const resv2 = r.body
  r = await call('POST', `/api/reservations/${resv2.id}/complete`, { amount: 1500000, use_prepaid: true })
  check('잔액 부족 + 결제수단 없음 → 400', r.status === 400, r)
  r = await call('POST', `/api/reservations/${resv2.id}/complete`, { amount: 1500000, use_prepaid: true, other_method: 'card' })
  check('복합결제: 선불 110만 전액 + 카드 40만', r.status === 200 && r.body.payment.prepaid_cash_used === 1000000 && r.body.payment.prepaid_bonus_used === 100000 && r.body.payment.other_amount === 400000 && r.body.payment.other_method === 'card', r)
  const payId = r.body.payment?.id

  // ── 결제 개별 취소
  r = await call('POST', `/api/payments/${payId}/void`)
  bal = (await call('GET', `/api/customers/${cid}/ledger`)).body.balance
  check('결제 취소 → 잔액 복원', r.status === 200 && bal.prepaid_cash === 1000000 && bal.prepaid_bonus === 100000, [r, bal])
  r = await call('POST', `/api/payments/${payId}/void`)
  check('이중 취소 → 409', r.status === 409, r)

  // ── 직접 차감 + 동시 차감 경쟁
  r = await call('POST', `/api/customers/${cid}/use`, { amount: 2000000, memo: '초과' })
  check('잔액 초과 직접 차감 → 400', r.status === 400, r)
  const both = await Promise.all([1, 2].map(() => call('POST', `/api/customers/${cid}/use`, { amount: 700000, memo: '동시' })))
  bal = (await call('GET', `/api/customers/${cid}/ledger`)).body.balance
  check('동시 차감 70만×2 중 1건만 성공, 잔액 음수 없음', both.filter(x => x.status === 200).length === 1 && bal.prepaid_cash >= 0 && bal.prepaid_bonus >= 0 && bal.prepaid_cash + bal.prepaid_bonus === 400000, [both.map(x => x.status), bal])

  // ── 환불
  const before = bal
  r = await call('POST', `/api/customers/${cid}/refund`, { memo: '테스트 환불' })
  bal = (await call('GET', `/api/customers/${cid}/ledger`)).body.balance
  check('환불: 실제 잔액 환불 + 보너스 소멸 + 잔액 0', r.status === 200 && r.body.refund_amount === before.prepaid_cash && r.body.bonus_forfeited === before.prepaid_bonus && bal.prepaid_cash === 0 && bal.prepaid_bonus === 0, [r, bal])
  r = await call('POST', `/api/customers/${cid}/refund`, {})
  check('잔액 없음 환불 → 409', r.status === 409, r)

  const ledger = await sql(`select type from sh_shop_prepaid_ledger where customer_id = ${cid}`)
  check('원장 유형 기록(charge/use/use_cancel/refund)', ['charge', 'use', 'use_cancel', 'refund'].every(t => ledger.some(l => l.type === t)), ledger)
  const sum = await sql(`select sum(cash_amount) c, sum(bonus_amount) b from sh_shop_prepaid_ledger where customer_id = ${cid}`)
  check('원장 합계 = 현재 잔액(0)', Number(sum[0].c) === 0 && Number(sum[0].b) === 0, sum)
} finally {
  await cleanupTestData()
}
finish()
