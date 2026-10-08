// 예약 상세 '고객 등록' 점검 — 사용법: node scripts/register-customer-smoke.mjs [baseUrl]
import { adminClient, check, finish, sql } from './smoke-lib.mjs'

const BASE = process.argv[2] || 'http://localhost:4310'
const call = await adminClient(BASE)
const day = new Date(Date.now() + 9 * 3600e3 + 60 * 86400e3).toISOString().slice(0, 10)
const NAME = '스모크동명' + Date.now().toString().slice(-4)
const cleanup = () => sql(`delete from sh_shop_customer_history where customer_id in (select id from sh_shop_customers where name like '스모크동명%');
  delete from sh_shop_reservation_history where reservation_id in (select id from sh_shop_reservations where customer_name like '스모크동명%');
  delete from sh_shop_reservations where customer_name like '스모크동명%';
  delete from sh_shop_customers where name like '스모크동명%';`)
const newResv = time => call('POST', '/api/reservations', { customer_name: NAME, start_at: `${day}T${time}:00+09:00`, duration_min: 60 })

await cleanup()
try {
  // 1) 같은 이름 없음 → 바로 등록·연결
  let r = await newResv('10:00')
  const r1 = r.body.id
  check('전화번호 없는 예약은 고객 미연결', r.status === 200 && r.body.customer_id === null, r)
  r = await call('POST', `/api/reservations/${r1}/register-customer`, {})
  const c1 = r.body?.customer?.id
  check('고객 등록 → 새 고객 생성 + 예약 연결', r.status === 200 && c1 && r.body.reservation.customer_id === c1 && r.body.created === true, r)
  r = await call('POST', `/api/reservations/${r1}/register-customer`, {})
  check('이미 연결된 예약 → 409', r.status === 409, r)

  // 2) 같은 이름 있음 → 목록 반환(등록 안 함)
  r = await newResv('13:00')
  const r2 = r.body.id
  r = await call('POST', `/api/reservations/${r2}/register-customer`, {})
  check('같은 이름 고객 있으면 409 + 후보 목록', r.status === 409 && r.body.same_name?.some(c => c.id === c1), r)
  check('묻는 동안 예약은 그대로 미연결', (await sql(`select customer_id from sh_shop_reservations where id = ${r2}`))[0].customer_id === null)

  // 3) 기존 고객과 연결 (그 고객 번호를 예약에 채움)
  await sql(`update sh_shop_customers set phone = '01099990141' where id = ${c1}`)
  r = await call('POST', `/api/reservations/${r2}/register-customer`, { link_customer_id: c1 })
  check('기존 고객과 연결 + 예약 연락처 채움', r.status === 200 && r.body.reservation.customer_id === c1 && r.body.reservation.customer_phone === '01099990141' && r.body.created === false, r)

  // 4) 새 고객으로 등록(같은 이름이어도)
  r = await newResv('16:00')
  const r3 = r.body.id
  r = await call('POST', `/api/reservations/${r3}/register-customer`, { force_new: true })
  check('새 고객으로 등록 → 다른 고객 생성', r.status === 200 && r.body.customer.id !== c1 && r.body.created === true, r)

  r = await call('POST', `/api/reservations/${r3}/register-customer`, { link_customer_id: 99999999 })
  check('없는 고객 id → 409(이미 연결) 또는 404', r.status === 409 || r.status === 404, r)
  const hist = await sql(`select count(*)::int n from sh_shop_customer_history where customer_id = ${c1} and action = 'customer_linked'`)
  check('고객 이력에 연결 기록', hist[0].n >= 2, hist)
} finally {
  await cleanup()
}
finish()
