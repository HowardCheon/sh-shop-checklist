// 결제 추가(제품 구매 등 예약 없는 결제)·첫체험권 결제 취소 점검 — 사용법: node scripts/payment-add-smoke.mjs [baseUrl]
// 예약을 만들지 않으므로 문자가 나가지 않음. 테스트 고객은 끝나면 삭제.
import { adminClient, check, cleanupTestData, finish, sql } from './smoke-lib.mjs'

const BASE = process.argv[2] || 'http://localhost:3210'
const call = await adminClient(BASE)
await cleanupTestData()
try {
  let r = await call('POST', '/api/customers', { name: '결제추가테스트', phone: '010-9999-0071' })
  const cid = r.body?.id
  check('테스트 고객 생성', !!cid, r)
  const path = `/api/customers/${cid}/payments`
  const ledger = async () => (await call('GET', `/api/customers/${cid}/ledger`)).body

  // ── 입력 검증
  r = await call('POST', path, { amount: 0, memo: '세럼', other_method: 'card' })
  check('0원 → 400', r.status === 400, r)
  r = await call('POST', path, { amount: 30000, memo: ' ', other_method: 'card' })
  check('품목 없음 → 400', r.status === 400, r)
  r = await call('POST', path, { amount: 30000, memo: '세럼', other_method: 'bitcoin' })
  check('잘못된 결제수단 → 400', r.status === 400, r)
  r = await call('POST', path, { amount: 30000, memo: '세럼' })
  check('결제수단도 선불도 없음 → 400', r.status === 400, r)

  // ── 비회원: 카드 결제
  r = await call('POST', path, { amount: 30000, memo: '세럼', other_method: 'card' })
  const cardPay = r.body?.payment
  check('카드 결제 추가', r.status === 200 && cardPay?.other_amount === 30000 && cardPay.other_method === 'card' && cardPay.reservation_id === null && cardPay.memo === '세럼', r)
  let d = await ledger()
  check('결제 내역·고객 이력에 기록', d.payments.some(p => p.id === cardPay.id) && d.history.some(h => h.description.startsWith('결제 추가')), d.history)
  const reward = await sql(`select count(*)::int n from sh_shop_referral_rewards where payment_id = ${cardPay.id}`)
  check('소개 보너스 대상 아님', reward[0]?.n === 0, reward)
  r = await call('POST', `/api/payments/${cardPay.id}/void`)
  check('추가한 결제 취소 가능', r.status === 200 && r.body.payment.status === 'voided', r)

  // ── 선불 + 부족분
  await call('POST', `/api/customers/${cid}/charge`, { amount: 500000 })
  r = await call('POST', path, { amount: 100000, memo: '크림', use_prepaid: true, other_method: 'card' })
  check('선불로 전액 결제 시 결제수단 미기록', r.status === 200 && r.body.payment.prepaid_cash_used === 100000 && r.body.payment.other_amount === 0 && r.body.payment.other_method === null, r)
  r = await call('POST', path, { amount: 600000, memo: '세트', use_prepaid: true })
  check('선불 부족 + 결제수단 없음 → 400', r.status === 400, r)
  r = await call('POST', path, { amount: 600000, memo: '세트', use_prepaid: true, other_method: 'cash' })
  check('선불 부족분 현금 결제', r.status === 200 && r.body.payment.prepaid_cash_used === 400000 && r.body.payment.other_amount === 200000 && r.body.payment.other_method === 'cash', r)
  d = await ledger()
  check('선불 잔액 0', d.balance.prepaid_cash === 0, d.balance)
  r = await call('POST', `/api/payments/${r.body.payment.id}/void`)
  d = await ledger()
  check('취소 시 선불 복원', r.status === 200 && d.balance.prepaid_cash === 400000, d.balance)

  // ── 첫체험권 결제: 내역에서 패키지 연결 확인 → 미결제로 되돌리기
  r = await call('POST', `/api/customers/${cid}/trial`, { code: 'trial4', price: 200000, other_method: 'card' })
  const pkgId = r.body?.package?.id
  const trialPayId = r.body?.package?.payment_id
  check('첫체험권 결제 등록', !!pkgId && !!trialPayId, r)
  d = await ledger()
  const row = d.payments.find(p => p.id === trialPayId)
  check('결제 내역에 첫체험권 패키지 id 포함', row?.trial_package_id === pkgId, row)
  check('일반 결제에는 패키지 id 없음', d.payments.filter(p => p.id !== trialPayId).every(p => p.trial_package_id === null), d.payments)
  r = await call('POST', `/api/payments/${trialPayId}/void`)
  check('첫체험권 결제 일반 취소는 거부(409)', r.status === 409, r)
  r = await call('POST', `/api/trial/${pkgId}/unpay`)
  d = await ledger()
  const after = d.payments.find(p => p.id === trialPayId)
  check('미결제로 되돌리면 결제 취소·패키지 연결 해제', r.status === 200 && after?.status === 'voided' && after.trial_package_id === null, [r, after])
  await call('POST', `/api/trial/${pkgId}/cancel`)
} finally {
  await cleanupTestData()
}
finish()
