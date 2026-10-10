// 소개 보너스 · 보너스 수동 추가 점검 — 사용법: node scripts/referral-smoke.mjs [baseUrl]
import { adminClient, check, cleanupTestData, finish, sql } from './smoke-lib.mjs'

const BASE = process.argv[2] || 'http://localhost:3210'
const call = await adminClient(BASE)
const day = new Date(Date.now() + 9 * 3600e3 + 19 * 86400e3).toISOString().slice(0, 10)
const BASIC = { id: 2, name: '베이직 피부관리', price: 80000 }
const newResv = (cid, phone, time) => call('POST', '/api/reservations', {
  customer_name: '소개테스트', customer_phone: phone, customer_id: cid, product_id: BASIC.id, product_name: BASIC.name,
  duration_min: 60, start_at: `${day}T${time}:00+09:00`, price: BASIC.price,
})
const bonusOf = async id => (await sql(`select prepaid_bonus from sh_shop_customers where id = ${id}`))[0]?.prepaid_bonus
const newCustomer = async (name, phone, extra = {}) => (await call('POST', '/api/customers', { name, phone, ...extra })).body

await cleanupTestData()
try {
  const A = await newCustomer('소개자A', '010-9999-0061')
  const B = await newCustomer('피소개B', '010-9999-0062')
  const C = await newCustomer('다른C', '010-9999-0063')

  // 1. 소개자 지정 검증
  let r = await call('PUT', `/api/customers/${B.id}/referral`, { referrer_id: B.id })
  check('자기 자신 소개자 → 400', r.status === 400, r)
  r = await call('PUT', `/api/customers/${B.id}/referral`, { referrer_id: 999999999 })
  check('없는 소개자 → 404', r.status === 404, r)
  r = await call('PUT', `/api/customers/${B.id}/referral`, { referrer_id: A.id })
  check('B 소개자 = A', r.status === 200 && r.body.referrer?.id === A.id && r.body.window === null && !r.body.locked, r)

  // 2. 완료 → 결제 총액 10% 적립 (결제수단 무관)
  r = await newResv(B.id, '010-9999-0062', '10:00')
  const resv = r.body
  r = await call('POST', `/api/reservations/${resv.id}/complete`, { amount: 100000, use_prepaid: false, other_method: 'card' })
  check('B 완료 100,000 → A 보너스 10,000', r.status === 200 && await bonusOf(A.id) === 10000, r)
  const led = await sql(`select type, cash_amount, bonus_amount, memo from sh_shop_prepaid_ledger where customer_id = ${A.id} order by id`)
  check('A 원장: referral, 실제 0 / 보너스 +10,000, 메모에 B 이름', led.length === 1 && led[0].type === 'referral' && led[0].cash_amount === 0 && led[0].bonus_amount === 10000 && led[0].memo.includes('피소개B'), led)

  // 3. 금액 수정 → 차액만
  r = await call('PUT', `/api/reservations/${resv.id}`, { price: 150000, payment_method: 'card' })
  check('금액 150,000 으로 수정 → A 15,000 (차액 +5,000)', r.status === 200 && await bonusOf(A.id) === 15000, r)
  r = await call('PUT', `/api/reservations/${resv.id}`, { price: 120000, payment_method: 'card' })
  check('금액 120,000 으로 수정 → A 12,000 (차액 −3,000 회수)', r.status === 200 && await bonusOf(A.id) === 12000, r)

  // 4. 소개자 잠금
  r = await call('PUT', `/api/customers/${B.id}/referral`, { referrer_id: C.id })
  check('보너스 지급 후 소개자 변경 → 409', r.status === 409 && (await sql(`select referred_by from sh_shop_customers where id = ${B.id}`))[0].referred_by === A.id, r)
  r = await call('GET', `/api/customers/${B.id}/referral`)
  check('B 소개 정보: 잠금 + 적용 기간 + 적립 12,000', r.body.locked && r.body.window?.start === day && r.body.rewarded === 12000, r.body)

  // 5. A 가 보너스 사용 후 B 완료 취소 → 남은 만큼만 회수
  r = await call('POST', `/api/customers/${A.id}/use`, { amount: 10000, memo: '소개테스트 사용' })
  check('A 보너스 10,000 사용 → 잔액 2,000', r.status === 200 && await bonusOf(A.id) === 2000, r)
  const payId = (await sql(`select id from sh_shop_payments where reservation_id = ${resv.id} and status = 'paid'`))[0].id
  r = await call('POST', `/api/payments/${payId}/void`)
  check('B 결제 취소 → A 보너스 0 (2,000만 회수)', r.status === 200 && await bonusOf(A.id) === 0, r)
  const revoke = (await sql(`select bonus_amount, memo from sh_shop_prepaid_ledger where customer_id = ${A.id} and type = 'referral_revoke' order by id desc limit 1`))[0]
  check('회수 원장에 미회수 10,000 기록', revoke?.bonus_amount === -2000 && revoke.memo.includes('10000원 미회수'), revoke)

  // 6. 다시 완료 → 새 목표만큼 적립, 재완료 시 이중 지급 없음
  r = await call('POST', `/api/reservations/${resv.id}/complete`, { amount: 80000, use_prepaid: false, other_method: 'cash' })
  check('다시 완료 80,000 → A 8,000', r.status === 200 && await bonusOf(A.id) === 8000, r)
  r = await call('POST', `/api/reservations/${resv.id}/complete`, { amount: 80000, use_prepaid: false, other_method: 'cash' })
  check('재완료 → 409, A 그대로 8,000', r.status === 409 && await bonusOf(A.id) === 8000, r)
  r = await call('PUT', `/api/reservations/${resv.id}`, { price: 80000, payment_method: 'cash' })
  check('같은 금액 저장 → 변화 없음', await bonusOf(A.id) === 8000, r)

  // 7. 소급 없음 — 소개자 등록 전 결제는 이후 금액을 고쳐도 제외
  r = await newResv(C.id, '010-9999-0063', '13:00')
  const resvC = r.body
  await call('POST', `/api/reservations/${resvC.id}/complete`, { amount: 50000, use_prepaid: false, other_method: 'card' })
  r = await call('PUT', `/api/customers/${C.id}/referral`, { referrer_id: A.id })
  check('C 소개자 = A (보너스 지급 전이라 지정 가능)', r.status === 200, r)
  await call('PUT', `/api/reservations/${resvC.id}`, { price: 70000, payment_method: 'card' })
  check('등록 전 결제 금액 수정 → 적립 없음', await bonusOf(A.id) === 8000)

  // 8. 예약 없는 직접 차감은 제외, 첫체험권 결제는 포함 (등록 시 소개자 지정)
  const E = await newCustomer('피소개E', '010-9999-0064', { referred_by: A.id })
  check('고객 등록 시 소개자 지정', E.referred_by === A.id, E)
  await call('POST', `/api/customers/${E.id}/charge`, { amount: 500000 })
  await call('POST', `/api/customers/${E.id}/use`, { amount: 30000, memo: '홈케어 제품' })
  check('E 선불 충전·직접 차감 → 적립 없음', await bonusOf(A.id) === 8000)
  r = await call('POST', `/api/customers/${E.id}/trial`, { code: 'trial2', price: 100000, other_method: 'card' })
  check('E 첫체험권 100,000 → A +10,000', r.status === 200 && await bonusOf(A.id) === 18000, r)
  r = await call('POST', `/api/trial/${r.body.package.id}/cancel`)
  check('E 첫체험 등록 취소 → A 회수 (8,000)', await bonusOf(A.id) === 8000, r)

  // 9. 소개한 고객 목록
  r = await call('GET', `/api/customers/${A.id}/referral`)
  const listed = Object.fromEntries((r.body.referred ?? []).map(x => [x.name, x.rewarded]))
  check('A 소개 목록: B 8,000 · C 0 · E 0', listed['피소개B'] === 8000 && listed['다른C'] === 0 && listed['피소개E'] === 0, r.body)

  // 10. 보너스 수동 추가
  r = await call('POST', `/api/customers/${C.id}/bonus`, { amount: 5000, memo: '' })
  check('사유 없이 → 400', r.status === 400, r)
  r = await call('POST', `/api/customers/${C.id}/bonus`, { amount: 1.5, memo: '이벤트' })
  check('소수 금액 → 400', r.status === 400, r)
  r = await call('POST', `/api/customers/${C.id}/bonus`, { amount: 5000, memo: '리뷰 이벤트' })
  const g = (await sql(`select type, cash_amount, bonus_amount, memo from sh_shop_prepaid_ledger where customer_id = ${C.id} order by id desc limit 1`))[0]
  check('수동 추가 5,000 → 보너스만, 원장 bonus_grant', r.status === 200 && r.body.customer.prepaid_bonus === 5000 && r.body.customer.prepaid_cash === 0 && g?.type === 'bonus_grant' && g.cash_amount === 0 && g.memo === '리뷰 이벤트', [r, g])
  const hist = await sql(`select description from sh_shop_customer_history where customer_id = ${C.id} and action = 'bonus_granted'`)
  check('고객 이력에 보너스 추가 기록', hist.length === 1 && hist[0].description.includes('5,000원'), hist)
} finally {
  await cleanupTestData()
}
finish()
