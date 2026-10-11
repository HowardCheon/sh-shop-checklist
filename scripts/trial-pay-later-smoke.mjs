// 첫체험권 나중에 결제 점검 — 사용법: node scripts/trial-pay-later-smoke.mjs [baseUrl]
import { adminClient, check, cleanupTestData, finish, sql } from './smoke-lib.mjs'

const BASE = process.argv[2] || 'http://localhost:3210'
const call = await adminClient(BASE)
const day = new Date(Date.now() + 9 * 3600e3 + 23 * 86400e3).toISOString().slice(0, 10)
const PLASMA = { id: 6, name: '플라즈마 관리', price: 120000 }
const newResv = (cid, phone, time) => call('POST', '/api/reservations', {
  customer_name: '후결제테스트', customer_phone: phone, customer_id: cid, product_id: PLASMA.id, product_name: PLASMA.name,
  duration_min: 60, start_at: `${day}T${time}:00+09:00`, price: PLASMA.price,
})
const newCustomer = async (name, phone, extra = {}) => (await call('POST', '/api/customers', { name, phone, ...extra })).body
const pkgOf = async id => (await sql(`select * from sh_shop_trial_packages where id = ${id}`))[0]
const paidOf = async cid => sql(`select id, reservation_id, total_amount, prepaid_cash_used, other_method, other_amount from sh_shop_payments where customer_id = ${cid} and status = 'paid' order by id`)
const bonusOf = async id => (await sql(`select prepaid_bonus from sh_shop_customers where id = ${id}`))[0]?.prepaid_bonus

await cleanupTestData()
try {
  const A = await newCustomer('후결제소개자', '010-9999-0081')
  const B = await newCustomer('후결제고객', '010-9999-0082', { referred_by: A.id })

  // 1. 미결제 등록 — 결제·매출 없음
  let r = await call('POST', `/api/customers/${B.id}/trial`, { code: 'trial4', price: 200000, pay_later: true })
  const pkgId = r.body?.package?.id
  check('미결제 등록 → 결제 없음', r.status === 200 && r.body.payment === null && r.body.package.payment_id === null, r)
  check('B 결제 0건, 소개자 보너스 0', (await paidOf(B.id)).length === 0 && await bonusOf(A.id) === 0)

  // 2. 예약 목록 배지에 미결제
  const resv = (await newResv(B.id, '010-9999-0082', '10:00')).body
  r = await call('GET', `/api/reservations?from=${encodeURIComponent(`${day}T00:00:00+09:00`)}&to=${encodeURIComponent(`${day}T23:59:59+09:00`)}`)
  const row = Array.isArray(r.body) ? r.body.find(x => x.id === resv.id) : null
  check('예약 배지 미결제 표시', row?.trial?.unpaid === true, row?.trial ?? r)

  // 3. 완료 결제창에서 첫체험 사용 + 함께 결제 → 결제 2건 (첫체험 결제는 예약 미연결)
  r = await call('POST', `/api/reservations/${resv.id}/complete`, {
    amount: 0, use_prepaid: false, other_method: 'card',
    trial: { package_id: pkgId, kind: 'special', care_name: '플라즈마' }, trial_payment: { package_id: pkgId },
  })
  let pays = await paidOf(B.id)
  let pkg = await pkgOf(pkgId)
  const trialPay = pays.find(p => p.id === pkg.payment_id)
  check('완료 + 첫체험 함께 결제 200', r.status === 200 && r.body.trial_payment?.total_amount === 200000, r)
  check('결제 2건: 시술 0원(예약 연결) + 첫체험 200,000(예약 미연결, 카드)', pays.length === 2 && trialPay?.reservation_id === null && trialPay.total_amount === 200000 && trialPay.other_method === 'card' && pays.some(p => p.reservation_id === resv.id), pays)
  check('첫체험 결제 시 소개 보너스 20,000', await bonusOf(A.id) === 20000)

  // 4. 이중 결제 거절
  r = await call('POST', `/api/trial/${pkgId}/pay`, { other_method: 'card' })
  check('이미 결제됨 → 409', r.status === 409, r)

  // 5. 결제 취소 → 미결제로, 소개 보너스 회수
  r = await call('POST', `/api/trial/${pkgId}/unpay`)
  pkg = await pkgOf(pkgId)
  check('결제 취소 → 미결제, 결제 voided', r.status === 200 && pkg.payment_id === null && r.body.payment.status === 'voided', r)
  check('소개 보너스 회수 → 0', await bonusOf(A.id) === 0)
  check('사용 내역은 유지 (스페셜 1회)', pkg.special_used === 1, pkg)
  r = await call('POST', `/api/trial/${pkgId}/unpay`)
  check('미결제 상태에서 결제 취소 → 409', r.status === 409, r)

  // 6. 카드에서 결제 (선불 사용)
  await call('POST', `/api/customers/${B.id}/charge`, { amount: 500000 })
  r = await call('POST', `/api/trial/${pkgId}/pay`, { use_prepaid: true })
  check('첫체험 카드에서 선불 결제', r.status === 200 && r.body.payment.prepaid_cash_used === 200000 && r.body.payment.reservation_id === null, r)
  check('소개 보너스 다시 20,000', await bonusOf(A.id) === 20000)
  r = await call('POST', `/api/payments/${r.body.payment.id}/void`)
  check('결제 내역에서 직접 취소 → 409 (첫체험 카드 안내)', r.status === 409 && r.body.error.includes('첫체험 카드'), r)
  await call('POST', `/api/trial/${pkgId}/unpay`)
  check('결제 취소 → 선불 복원 500,000', (await sql(`select prepaid_cash from sh_shop_customers where id = ${B.id}`))[0].prepaid_cash === 500000)

  // 7. 미결제 상태 금액 수정 → 금액만
  r = await call('PATCH', `/api/trial/${pkgId}`, { price: 150000 })
  check('미결제 금액 수정 → 150,000, 결제 없음', r.status === 200 && r.body.package.price === 150000 && r.body.payment === null, r)

  // 8. 완료 중 실패 → 첫체험 결제 롤백 (베이직 소진 후 다시 베이직)
  const resv2 = (await newResv(B.id, '010-9999-0082', '13:00')).body
  r = await call('POST', `/api/reservations/${resv2.id}/complete`, { amount: 0, trial: { package_id: pkgId, kind: 'basic' } })
  check('미결제 상태로 베이직 사용', r.status === 200, r)
  const resv3 = (await newResv(B.id, '010-9999-0082', '16:00')).body
  const before = (await paidOf(B.id)).length
  r = await call('POST', `/api/reservations/${resv3.id}/complete`, { amount: 30000, other_method: 'cash', trial: { package_id: pkgId, kind: 'basic' }, trial_payment: { package_id: pkgId } })
  pkg = await pkgOf(pkgId)
  const st3 = (await sql(`select status from sh_shop_reservations where id = ${resv3.id}`))[0].status
  check('베이직 남은 횟수 없음 → 409, 첫체험 결제·시술 결제 모두 롤백', r.status === 409 && pkg.payment_id === null && (await paidOf(B.id)).length === before && st3 === 'scheduled', [r, pkg.payment_id, st3])
  check('롤백 후 소개 보너스 0', await bonusOf(A.id) === 0)

  // 9. 함께 결제 해제(체크 해제) → 첫체험은 미결제 유지
  r = await call('POST', `/api/reservations/${resv3.id}/complete`, { amount: 30000, other_method: 'cash' })
  check('함께 결제 없이 완료 → 미결제 유지', r.status === 200 && (await pkgOf(pkgId)).payment_id === null, r)

  // 10. 다른 고객 첫체험권으로 함께 결제 → 400
  const C = await newCustomer('후결제고객C', '010-9999-0083')
  r = await call('POST', `/api/customers/${C.id}/trial`, { code: 'trial2', pay_later: true })
  const pkgC = r.body.package.id
  const resvC = (await newResv(C.id, '010-9999-0083', '18:00')).body
  r = await call('POST', `/api/reservations/${resvC.id}/complete`, { amount: 10000, other_method: 'card', trial_payment: { package_id: pkgId } })
  check('다른 고객 첫체험권 결제 → 400', r.status === 400, r)

  // 11. 미결제 등록 취소 → 결제 없이 취소
  r = await call('POST', `/api/trial/${pkgC}/cancel`)
  check('미결제 등록 취소', r.status === 200 && r.body.payment === null && r.body.package.status === 'cancelled', r)

  // 12. pay_later 없으면 기존처럼 즉시 결제
  const D = await newCustomer('후결제고객D', '010-9999-0084')
  r = await call('POST', `/api/customers/${D.id}/trial`, { code: 'trial2', other_method: 'card' })
  check('pay_later 미지정 → 즉시 결제', r.status === 200 && r.body.payment?.total_amount === r.body.package.price && r.body.package.payment_id === r.body.payment.id, r)
} finally {
  await cleanupTestData()
}
finish()
