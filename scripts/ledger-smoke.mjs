// 샵 가계부 점검 — 사용법: node scripts/ledger-smoke.mjs [baseUrl]
import { adminClient, check, cleanupTestData, finish, sql } from './smoke-lib.mjs'

const BASE = process.argv[2] || 'http://localhost:4310'
const call = await adminClient(BASE)
const month = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 7)
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
const cleanupLedger = () => sql(`delete from sh_shop_ledger_entries where memo like '스모크%' or category_id in (select id from sh_shop_ledger_categories where name like '스모크%');
  delete from sh_shop_ledger_categories where name like '스모크%';`)

await cleanupTestData(); await cleanupLedger()
try {
  let r = await call('GET', `/api/ledger?month=${month}`)
  check('월 조회', r.status === 200 && r.body.summary && Array.isArray(r.body.categories), r.status)
  const before = r.body.summary
  const cats = r.body.categories
  const visible = io => cats.filter(c => c.io === io && !c.hidden && !c.name.startsWith('스모크')).map(c => c.name)
  check('항목 정리: 지출 7개·수입 2개', JSON.stringify(visible('out')) === JSON.stringify(['재료·소모품', '임대·관리비', '광고·마케팅', '수수료·세금', '가구·장비', '공사비', '기타']) && JSON.stringify(visible('in')) === JSON.stringify(['제품 판매', '기타 수입']), [visible('out'), visible('in')])
  const material = cats.find(c => c.io === 'out' && c.name === '재료·소모품')
  const income = cats.find(c => c.io === 'in' && c.name === '제품 판매')
  r = await call('GET', '/api/ledger?month=2026-13')
  check('잘못된 월 → 400', r.status === 400, r)

  // 직접 입력
  r = await call('POST', '/api/ledger/entries', { entry_date: today, io: 'out', amount: 68000, category_id: material.id, method: 'card', memo: '스모크 재료' })
  const eid = r.body?.id
  check('지출 입력', r.status === 200 && eid, r)
  r = await call('POST', '/api/ledger/entries', { entry_date: today, io: 'out', amount: 1000, category_id: income.id, method: 'card', memo: '스모크 불일치' })
  check('지출에 수입 항목 → 400', r.status === 400, r)
  r = await call('POST', '/api/ledger/entries', { entry_date: today, io: 'in', amount: 30000, category_id: income.id, method: 'cash', memo: '스모크 판매' })
  const iid = r.body?.id
  r = await call('PUT', `/api/ledger/entries/${eid}`, { entry_date: today, io: 'out', amount: 70000, category_id: material.id, method: 'cash', memo: '스모크 재료' })
  check('지출 수정', r.status === 200 && r.body.amount === 70000 && r.body.method === 'cash', r)

  r = await call('GET', `/api/ledger?month=${month}`)
  let s = r.body.summary
  check('지출·수기 매출 합계 반영', s.pnl.expense === before.pnl.expense + 70000 && s.pnl.revenueManual === before.pnl.revenueManual + 30000, [s.pnl, before.pnl])

  // 제외 표시 → 합계에서 빠짐
  r = await call('PUT', `/api/ledger/entries/${iid}`, { entry_date: today, io: 'in', amount: 30000, category_id: income.id, method: 'cash', memo: '스모크 판매', excluded: true, exclude_reason: '스모크 중복' })
  r = await call('GET', `/api/ledger?month=${month}`)
  s = r.body.summary
  const listed = s.days.flatMap(d => d.items).some(i => i.type === 'entry' && i.row.id === iid && i.row.excluded)
  check('제외 표시 → 합계 제외, 목록엔 남음', s.pnl.revenueManual === before.pnl.revenueManual && listed, s.pnl)

  // 자동 매출: 테스트 고객 선불 충전·첫체험·시술(카드)·환불
  r = await call('POST', '/api/customers', { name: '가계부테스트', phone: '010-9999-0161' })
  const cid = r.body.id
  await call('POST', `/api/customers/${cid}/charge`, { amount: 500000 })
  await call('POST', `/api/customers/${cid}/trial`, { code: 'trial2', other_method: 'card' })
  r = await call('GET', `/api/ledger?month=${month}`)
  s = r.body.summary
  const autoItems = s.days.flatMap(d => d.items).filter(i => i.type === 'auto' && i.row.label.includes('가계부테스트'))
  check('자동 매출: 충전 50만(실제) + 첫체험 9.9만(카드)', autoItems.some(i => i.row.kind === 'charge' && i.row.amount === 500000) && autoItems.some(i => i.row.kind === 'trial' && i.row.amount === 99000 && i.row.method === 'card'), autoItems.map(i => i.row))
  check('선불 현황 충전 증가', s.prepaid.charge.cash === before.prepaid.charge.cash + 500000, [s.prepaid.charge, before.prepaid.charge])
  check('선불 보유 고객 목록에 포함', r.body.balances.some(b => b.id === cid && b.cash === 500000), r.body.balances.length)
  // 고객을 삭제해도 지난 매출·선불 현황은 그대로 (선불 원장 보존)
  r = await call('POST', '/api/customers', { name: '가계부삭제테스트', phone: '010-9999-0162' })
  const delCid = r.body.id
  await call('POST', `/api/customers/${delCid}/charge`, { amount: 500000 })
  const beforeDel = (await call('GET', `/api/ledger?month=${month}`)).body.summary
  await call('DELETE', `/api/customers/${delCid}`)
  const afterDel = (await call('GET', `/api/ledger?month=${month}`)).body.summary
  check('고객 삭제 후에도 매출·선불 충전 그대로', afterDel.pnl.revenueAuto === beforeDel.pnl.revenueAuto && afterDel.prepaid.charge.cash === beforeDel.prepaid.charge.cash, [beforeDel.pnl.revenueAuto, afterDel.pnl.revenueAuto])
  await sql(`delete from sh_shop_prepaid_ledger where customer_id is null and created_at > now() - interval '1 hour' and cash_amount = 500000 and memo is null`)

  await call('POST', `/api/customers/${cid}/refund`, {})
  r = await call('GET', `/api/ledger?month=${month}`)
  s = r.body.summary
  check('환불 → 음수 매출 + 선불 환불 증가', s.days.flatMap(d => d.items).some(i => i.type === 'auto' && i.row.kind === 'refund' && i.row.amount === -500000) && s.prepaid.refund.cash === before.prepaid.refund.cash + 500000, s.prepaid.refund)

  // 항목 관리
  r = await call('POST', '/api/ledger/categories', { io: 'out', name: '스모크항목' })
  const catId = r.body?.id
  check('항목 추가', r.status === 200 && catId, r)
  r = await call('POST', '/api/ledger/categories', { io: 'out', name: '스모크항목' })
  check('같은 이름 → 409', r.status === 409, r)
  r = await call('PUT', `/api/ledger/categories/${catId}`, { name: '스모크항목2', hidden: true })
  check('이름 변경·숨김', r.status === 200 && r.body.name === '스모크항목2' && r.body.hidden === true, r)

  r = await call('DELETE', `/api/ledger/entries/${eid}`)
  check('내역 삭제', r.status === 200, r)
  r = await call('DELETE', `/api/ledger/entries/${eid}`)
  check('없는 내역 삭제 → 404', r.status === 404, r)
} finally {
  await cleanupLedger()
  await cleanupTestData()
}
finish()
