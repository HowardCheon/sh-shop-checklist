// 관리자 API 점검 — 사용법: node scripts/admin-smoke.mjs [baseUrl]
// 테스트 전화번호 010-9999-00xx 데이터를 만들고, 마지막에 정리한다.
import { adminClient, check, cleanupTestData, finish, sql } from './smoke-lib.mjs'

const BASE = process.argv[2] || 'http://localhost:3210'
const call = await adminClient(BASE)
const cleanup = cleanupTestData

// SMOKE_DAY_OFFSET: 실제 예약과 겹치면 다른 날로 (기본 10일 뒤)
const day = new Date(Date.now() + 9 * 3600e3 + Number(process.env.SMOKE_DAY_OFFSET || 10) * 86400e3).toISOString().slice(0, 10)
await cleanup()
try {
  let r = await call('POST', '/api/reservations', { customer_name: '매장고객', customer_phone: '010-9999-0021', product_id: 2, product_name: '베이직 관리', duration_min: 60, start_at: `${day}T10:00:00+09:00`, price: 80000 })
  check('관리자 예약 생성 + 고객 연결', r.status === 200 && r.body.customer_id && r.body.customer_phone === '01099990021' && r.body.block_end_at, r)
  const id = r.body.id
  const customerId = r.body.customer_id

  r = await call('POST', '/api/reservations', { customer_name: '다른고객', start_at: `${day}T11:10:00+09:00`, duration_min: 60 })
  check('정리시간(11:20까지) 안에 들어오면 409', r.status === 409 && r.body.conflict, r)
  r = await call('POST', '/api/reservations', { customer_name: '다른고객', customer_phone: '010-9999-0022', start_at: `${day}T11:20:00+09:00`, duration_min: 60 })
  check('정리시간 끝난 직후는 허용', r.status === 200, r)

  r = await call('PUT', `/api/reservations/${id}`, { status: 'cancelled' })
  check('관리자 취소', r.status === 200 && r.body.status === 'cancelled', r)

  r = await call('POST', `/api/customers/${customerId}/charge`, { amount: 1000000 })
  check('100만 충전 → 보너스 10만', r.status === 200 && r.body.customer.prepaid_cash === 1000000 && r.body.customer.prepaid_bonus === 100000, r)
  r = await call('POST', `/api/customers/${customerId}/charge`, { amount: 300000 })
  check('허용되지 않은 금액 400', r.status === 400, r)

  const hist = await sql(`select action from sh_shop_customer_history where customer_id = ${customerId}`)
  check('고객 이력(생성/취소/충전)', ['reservation_created', 'reservation_cancelled', 'prepaid_charged'].every(a => hist.some(h => h.action === a)), hist)
  const ledger = await sql(`select cash_amount, bonus_amount from sh_shop_prepaid_ledger where customer_id = ${customerId}`)
  check('충전 원장 1건', ledger.length === 1 && ledger[0].bonus_amount === 100000, ledger)

  r = await call('POST', '/api/customers', { name: '중복', phone: '010 9999 0021' })
  check('중복 전화번호 고객 등록 409', r.status === 409, r)

  r = await call('POST', '/api/closed-dates', { date: day, reason: '테스트' })
  const list = await call('GET', `/api/closed-dates?from=${day}&to=${day}`)
  await call('DELETE', `/api/closed-dates?date=${day}`)
  check('휴무일 지정/조회/해제', r.status === 200 && list.body.length === 1, list)
} finally {
  await cleanup()
}
finish()
