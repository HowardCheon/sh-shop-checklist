// 시술 완료 첫체험 차감 · 결제 금액 수정 · 직접 충전 점검 — 사용법: node scripts/completion-smoke.mjs [baseUrl]
import { adminClient, check, cleanupTestData, finish, sql } from './smoke-lib.mjs'

const BASE = process.argv[2] || 'http://localhost:3210'
const call = await adminClient(BASE)
const day = new Date(Date.now() + 9 * 3600e3 + 13 * 86400e3).toISOString().slice(0, 10)
const trialOf = async cid => (await call('GET', `/api/customers/${cid}/trial`)).body
const newResv = (cid, phone, time, product) => call('POST', '/api/reservations', {
  customer_name: '완료테스트', customer_phone: phone, customer_id: cid, product_id: product.id, product_name: product.name,
  duration_min: 60, start_at: `${day}T${time}:00+09:00`, price: product.price,
})
const PLASMA = { id: 6, name: '플라즈마 관리', price: 120000 }
const BASIC = { id: 2, name: '베이직 피부관리', price: 80000 }

await cleanupTestData()
try {
  // 1. 첫체험 등록 (가격 지정)
  let r = await call('POST', '/api/customers', { name: '완료테스트', phone: '010-9999-0051' })
  const cid = r.body.id
  r = await call('POST', `/api/customers/${cid}/trial`, { code: 'trial4', price: 200000, other_method: 'card' })
  const pkg = r.body?.package
  check('첫체험 등록 시 가격 지정 → 결제 200,000', r.status === 200 && pkg.price === 200000 && r.body.payment.total_amount === 200000, r)
  r = await call('POST', `/api/customers/${cid}/trial`, { code: 'trial2', price: 0.5, other_method: 'card' })
  check('잘못된 지정 가격 → 400', r.status === 400, r)

  // 2. 시술 완료 + 첫체험 스페셜 차감
  r = await newResv(cid, '010-9999-0051', '10:00', PLASMA)
  const resv = r.body
  r = await call('POST', `/api/reservations/${resv.id}/complete`, { amount: 0, use_prepaid: false, trial: { package_id: pkg.id, kind: 'special', care_name: '플라즈마' } })
  check('완료 + 첫체험 스페셜 차감, 결제 0원', r.status === 200 && r.body.status === 'completed' && r.body.payment.total_amount === 0, r)
  const payId = r.body.payment?.id
  let t = await trialOf(cid)
  const use = t.uses.find(u => u.status === 'used')
  check('스페셜 1회 차감 + 사용에 예약 연결', t.package.special_used === 1 && use?.reservation_id === resv.id && use.care_name === '플라즈마', t)

  r = await call('POST', `/api/reservations/${resv.id}/complete`, { amount: 0, trial: { package_id: pkg.id, kind: 'basic' } })
  check('이미 완료된 예약 재완료 → 409 (이중 차감 없음)', r.status === 409 && (await trialOf(cid)).package.basic_used === 0, r)

  // 3. 완료 → 예약 상태로 되돌리면 첫체험 복원, 다시 완료
  r = await call('PUT', `/api/reservations/${resv.id}`, { status: 'scheduled' })
  t = await trialOf(cid)
  check('완료 → 예약 되돌리면 첫체험 복원', r.status === 200 && t.package.special_used === 0, [r, t.package])
  r = await call('POST', `/api/reservations/${resv.id}/complete`, { amount: 0, trial: { package_id: pkg.id, kind: 'special', care_name: '플라즈마' } })
  t = await trialOf(cid)
  check('다시 완료 → 스페셜 1회만 차감', r.status === 200 && t.package.special_used === 1, [r, t.package])
  const payId2 = r.body.payment?.id

  // 4. 결제 내역에서 결제 취소 → 예약 복원 + 첫체험 복원
  r = await call('POST', `/api/payments/${payId2}/void`)
  t = await trialOf(cid)
  const resvRow = await sql(`select status from sh_shop_reservations where id = ${resv.id}`)
  check('결제 취소 → 예약 복원 + 첫체험 복원', r.status === 200 && resvRow[0]?.status === 'scheduled' && t.package.special_used === 0, [r, resvRow, t.package])
  check('첫 결제는 앞서 취소됨', (await sql(`select status from sh_shop_payments where id = ${payId}`))[0]?.status === 'voided')

  // 5. 첫체험 베이직 + 추가 금액(카드)
  r = await call('POST', `/api/reservations/${resv.id}/complete`, { amount: 30000, use_prepaid: false, other_method: 'card', trial: { package_id: pkg.id, kind: 'basic' } })
  t = await trialOf(cid)
  check('첫체험 베이직 + 추가 30,000 카드', r.status === 200 && r.body.payment.other_amount === 30000 && t.package.basic_used === 1, [r, t.package])
  r = await newResv(cid, '010-9999-0051', '13:00', BASIC)
  const resv2 = r.body
  r = await call('POST', `/api/reservations/${resv2.id}/complete`, { amount: 0, trial: { package_id: pkg.id, kind: 'basic' } })
  check('베이직 남은 횟수 없으면 409, 결제도 남지 않음', r.status === 409 && (await sql(`select count(*)::int n from sh_shop_payments where reservation_id = ${resv2.id} and status = 'paid'`))[0].n === 0, r)
  r = await call('POST', `/api/reservations/${resv2.id}/complete`, { amount: 0, trial: { package_id: pkg.id + 999999, kind: 'special', care_name: '상체' } })
  check('다른 패키지 id → 400', r.status === 400, r)

  // 6. 완료 예약 금액 수정 → 결제 동기화
  r = await call('PUT', `/api/reservations/${resv.id}`, { price: 50000, payment_method: 'card' })
  const pay5 = await sql(`select total_amount, other_amount from sh_shop_payments where reservation_id = ${resv.id} and status = 'paid'`)
  check('완료 예약 금액 수정 → 결제 50,000 동기화', r.status === 200 && r.body.price === 50000 && pay5[0]?.total_amount === 50000 && pay5[0]?.other_amount === 50000, [r, pay5])

  // 7. 직접 충전
  r = await call('POST', `/api/customers/${cid}/charge`, { custom: true, amount: 300000, bonus: 30000 })
  check('직접 충전 300,000 + 보너스 30,000', r.status === 200 && r.body.customer.prepaid_cash === 300000 && r.body.customer.prepaid_bonus === 30000, r)
  r = await call('POST', `/api/customers/${cid}/charge`, { custom: true, amount: -5 })
  check('직접 충전 음수 → 400', r.status === 400, r)
  r = await call('POST', `/api/customers/${cid}/charge`, { custom: true, amount: 1000, bonus: 1.5 })
  check('직접 충전 보너스 소수 → 400', r.status === 400, r)
  r = await call('POST', `/api/customers/${cid}/charge`, { amount: 123 })
  check('정해진 금액 외 일반 충전 → 400', r.status === 400, r)

  // 8. 첫체험 금액 수정
  r = await call('PATCH', `/api/trial/${pkg.id}`, { price: 180000 })
  check('첫체험 금액 200,000 → 180,000, 결제 동기화', r.status === 200 && r.body.package.price === 180000 && r.body.payment.total_amount === 180000 && r.body.payment.other_amount === 180000, r)

  r = await call('POST', '/api/customers', { name: '완료테스트2', phone: '010-9999-0052' })
  const cid2 = r.body.id
  await call('POST', `/api/customers/${cid2}/charge`, { custom: true, amount: 100000 })
  r = await call('POST', `/api/customers/${cid2}/trial`, { code: 'trial4', use_prepaid: true, other_method: 'card' })
  const pkg2 = r.body?.package
  check('선불 100,000 + 카드 119,000 등록', r.status === 200 && r.body.payment.prepaid_cash_used === 100000 && r.body.payment.other_amount === 119000, r)
  r = await call('PATCH', `/api/trial/${pkg2.id}`, { price: 90000 })
  check('선불 결제액보다 낮추기 → 409', r.status === 409, r)

  r = await call('POST', '/api/customers', { name: '완료테스트3', phone: '010-9999-0053' })
  const cid3 = r.body.id
  await call('POST', `/api/customers/${cid3}/charge`, { amount: 500000 })
  r = await call('POST', `/api/customers/${cid3}/trial`, { code: 'trial2', use_prepaid: true })
  const pkg3 = r.body?.package
  check('선불 전액 등록', r.status === 200 && r.body.payment.other_amount === 0, r)
  r = await call('PATCH', `/api/trial/${pkg3.id}`, { price: 120000 })
  check('선불 전액 건 금액 올림 + 결제수단 없음 → 400', r.status === 400, r)
  r = await call('PATCH', `/api/trial/${pkg3.id}`, { price: 120000, other_method: 'cash' })
  check('결제수단 지정하면 올림 → 기타 21,000 현금', r.status === 200 && r.body.payment.other_amount === 21000 && r.body.payment.other_method === 'cash', r)

  // 10. 정리 항목 (리뷰 보류분)
  // 결제가 이미 취소됐는데 예약·첫체험 복원이 안 된 상태 → 결제 취소 재시도로 복구
  r = await newResv(cid, '010-9999-0051', '15:00', PLASMA)
  const resv3 = r.body
  r = await call('POST', `/api/reservations/${resv3.id}/complete`, { amount: 0, trial: { package_id: pkg.id, kind: 'special', care_name: '상체' } })
  const pay3 = r.body.payment
  await sql(`update sh_shop_payments set status = 'voided', voided_at = now() where id = ${pay3.id}`) // 반쯤 처리된 상태 재현
  r = await call('POST', `/api/payments/${pay3.id}/void`)
  const r3 = await sql(`select status from sh_shop_reservations where id = ${resv3.id}`)
  const u3 = await sql(`select status from sh_shop_trial_uses where reservation_id = ${resv3.id}`)
  check('이미 취소된 결제 재취소 → 예약·첫체험 복원 마무리', r.status === 409 && r3[0]?.status === 'scheduled' && u3.every(x => x.status === 'cancelled'), [r, r3, u3])

  // 완료 → 예약 동시 2번 → 둘 다 성공
  r = await call('POST', `/api/reservations/${resv3.id}/complete`, { amount: 0, trial: { package_id: pkg.id, kind: 'special', care_name: '상체' } })
  const both = await Promise.all([1, 2].map(() => call('PUT', `/api/reservations/${resv3.id}`, { status: 'scheduled' })))
  check('완료→예약 동시 2번 모두 200', both.every(x => x.status === 200), both.map(x => [x.status, x.body?.error]))

  // 완료 예약 삭제는 막고 취소 먼저 안내
  r = await call('POST', `/api/reservations/${resv3.id}/complete`, { amount: 0, trial: { package_id: pkg.id, kind: 'special', care_name: '상체' } })
  r = await call('DELETE', `/api/reservations/${resv3.id}`)
  check('완료 예약 삭제 → 409', r.status === 409, r)

  // 직접 충전 타입 엄격
  for (const [label, body] of [['custom:"false"', { custom: 'false', amount: 300000 }], ['amount:true', { custom: true, amount: true }], ['amount:"0x10"', { custom: true, amount: '0x10' }], ['amount:[5]', { custom: true, amount: [5] }]]) {
    r = await call('POST', `/api/customers/${cid}/charge`, body)
    check(`직접 충전 ${label} → 400`, r.status === 400, r)
  }

  // 첫체험 0원(무료 증정) 등록·수정 허용
  r = await call('POST', '/api/customers', { name: '완료테스트4', phone: '010-9999-0054' })
  r = await call('POST', `/api/customers/${r.body.id}/trial`, { code: 'trial2', price: 0 })
  check('첫체험 0원 등록 허용', r.status === 200 && r.body.package.price === 0, r)

  r = await call('GET', `/api/reservations?from=${encodeURIComponent(`${day}T00:00:00+09:00`)}&to=${encodeURIComponent(`${day}T23:59:59+09:00`)}`)
  const row = Array.isArray(r.body) ? r.body.find(x => x.id === resv2.id) : null
  check('예약 목록 행에 첫체험 배지 정보', row?.trial?.label === '첫체험 B0·S2', row?.trial ?? r)
} finally {
  await cleanupTestData()
}
finish()
