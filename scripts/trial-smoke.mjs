// 첫체험 패키지 점검 — 사용법: node scripts/trial-smoke.mjs [baseUrl]
import { adminClient, check, cleanupTestData, env, finish } from './smoke-lib.mjs'

const BASE = process.argv[2] || 'http://localhost:3210'
const call = await adminClient(BASE)

const anon = (path, init = {}) => fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${path}`, {
  ...init, headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
})

await cleanupTestData()
try {
  let r = await call('POST', '/api/customers', { name: '첫체험테스트', phone: '010-9999-0041' })
  const cid = r.body.id
  check('테스트 고객 생성', !!cid, r)

  r = await call('POST', `/api/customers/${cid}/trial`, { code: 'trial4', use_prepaid: false })
  check('결제수단 없이 등록 → 400', r.status === 400, r)
  r = await call('POST', `/api/customers/${cid}/trial`, { code: 'toString', other_method: 'card' })
  check('잘못된 패키지 코드 → 400', r.status === 400, r)

  r = await call('POST', `/api/customers/${cid}/trial`, { code: 'trial4', use_prepaid: false, other_method: 'card' })
  const pkg = r.body?.package
  check('4회 카드 등록: 219,000원 결제 + 베이직1/스페셜3', r.status === 200 && r.body.payment.total_amount === 219000 && r.body.payment.other_method === 'card' && pkg.basic_total === 1 && pkg.special_total === 3, r)
  r = await call('POST', `/api/customers/${cid}/trial`, { code: 'trial2', other_method: 'cash' })
  check('중복 등록 → 409', r.status === 409, r)

  r = await call('POST', `/api/payments/${pkg.payment_id}/void`)
  check('결제 내역에서 첫체험 결제 직접 취소 → 409', r.status === 409, r)

  r = await call('POST', `/api/trial/${pkg.id}/use`, { kind: 'special' })
  check('스페셜 시술 미선택 → 400', r.status === 400, r)
  r = await call('POST', `/api/trial/${pkg.id}/use`, { kind: 'basic' })
  check('베이직 사용', r.status === 200 && r.body.package.basic_used === 1, r)
  r = await call('POST', `/api/trial/${pkg.id}/use`, { kind: 'basic' })
  check('베이직 초과 → 409', r.status === 409, r)
  r = await call('POST', `/api/trial/${pkg.id}/use`, { kind: 'special', care_name: '플라즈마', memo: '첫 방문' })
  const useId = r.body?.use?.id
  check('스페셜 사용 (플라즈마)', r.status === 200 && r.body.use.care_name === '플라즈마' && r.body.package.special_used === 1, r)
  r = await call('POST', `/api/trial/${pkg.id}/use`, { kind: 'special', care_name: '상체' })
  check('스페셜 2회째', r.status === 200 && r.body.package.special_used === 2, r)

  // 남은 1회에 동시 2건 → 1건만 성공
  const both = await Promise.all([1, 2].map(() => call('POST', `/api/trial/${pkg.id}/use`, { kind: 'special', care_name: '하체' })))
  check('동시 사용 2건 중 1건만 성공', both.filter(x => x.status === 200).length === 1 && both.filter(x => x.status === 409).length === 1, both.map(x => x.status))

  r = await call('POST', `/api/trial/uses/${useId}/cancel`)
  check('사용 취소 → 스페셜 횟수 복원', r.status === 200 && r.body.package.special_used === 2 && r.body.use.status === 'cancelled', r)
  r = await call('POST', `/api/trial/uses/${useId}/cancel`)
  check('이미 취소한 사용 → 409', r.status === 409, r)

  r = await call('POST', `/api/trial/${pkg.id}/cancel`)
  check('사용 내역 있으면 등록 취소 → 409', r.status === 409, r)

  r = await call('GET', `/api/customers/${cid}/trial`)
  for (const u of r.body.uses.filter(u => u.status === 'used')) await call('POST', `/api/trial/uses/${u.id}/cancel`)
  r = await call('POST', `/api/trial/${pkg.id}/cancel`)
  check('사용 모두 취소 후 등록 취소 → 결제 취소', r.status === 200 && r.body.package.status === 'cancelled' && r.body.payment?.status === 'voided', r)

  // 선불 일부 + 카드로 재등록 → 등록 취소 시 잔액 복원
  r = await call('POST', `/api/customers/${cid}/charge`, { amount: 500000 })
  await call('POST', `/api/customers/${cid}/use`, { amount: 400000, memo: '잔액 줄이기' })
  r = await call('POST', `/api/customers/${cid}/trial`, { code: 'trial4', use_prepaid: true, other_method: 'card' })
  const pkg2 = r.body?.package
  check('재등록 허용 + 선불 10만 + 카드 119,000', r.status === 200 && r.body.payment.prepaid_cash_used === 100000 && r.body.payment.other_amount === 119000, r)
  r = await call('POST', `/api/trial/${pkg2.id}/cancel`)
  const bal = (await call('GET', `/api/customers/${cid}/ledger`)).body.balance
  check('등록 취소 → 선불 10만 복원', r.status === 200 && bal.prepaid_cash === 100000, [r, bal])

  r = await call('GET', `/api/customers/${cid}/trial`)
  check('취소 후 유효 패키지 없음', r.status === 200 && r.body.package === null, r)

  // anon 키 차단
  let a = await anon('rpc/sh_shop_trial_use', { method: 'POST', body: JSON.stringify({ p_package_id: pkg.id, p_kind: 'basic', p_care_name: null, p_memo: null }) })
  check('anon 키 RPC 실행 차단', a.status === 401 || a.status === 403 || a.status === 404, a.status)
  a = await anon('sh_shop_trial_packages?select=*')
  const rows = await a.json().catch(() => null)
  check('anon 키 패키지 조회 결과 없음', Array.isArray(rows) ? rows.length === 0 : a.status >= 400, rows)
} finally {
  await cleanupTestData()
}
finish()
