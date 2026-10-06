// 예약 확정·전일 안내 문자 점검 — 서버를 SMS_DRY_RUN=true 로 띄운 뒤 실행 (실제 발송 없음)
// 사용법: node scripts/sms-smoke.mjs [baseUrl]
import { adminClient, check, cleanupTestData, finish, sql } from './smoke-lib.mjs'

const BASE = process.argv[2] || 'http://localhost:3210'
const call = await adminClient(BASE)
const day = new Date(Date.now() + 9 * 3600e3 + 13 * 86400e3).toISOString().slice(0, 10)
const row = async id => (await sql(`select confirm_sms_at, confirm_sms_start_at, remind_sms_at, remind_sms_start_at, start_at from sh_shop_reservations where id = ${id}`))[0]

await cleanupTestData()
try {
  let r = await call('POST', '/api/reservations', { customer_name: '문자테스트', customer_phone: '010-9999-0091', product_id: 2, product_name: '베이직 피부관리', duration_min: 60, start_at: `${day}T17:30:00+09:00`, price: 80000 })
  const id = r.body.id

  r = await call('POST', `/api/reservations/${id}/sms`, { type: 'confirm' })
  let x = await row(id)
  check('확정 문자 발송 → 문구·기록', r.status === 200 && r.body.text.includes('문자테스트님,') && r.body.text.includes('오후5:30 예약확정') && x.confirm_sms_at && Date.parse(x.confirm_sms_start_at) === Date.parse(x.start_at), [r, x])
  check('전일 안내는 아직 없음', x.remind_sms_at === null, x)

  r = await call('POST', `/api/reservations/${id}/sms`, { type: 'remind' })
  x = await row(id)
  check('전일 안내 발송 → 문구·기록', r.status === 200 && r.body.text.includes('내일 오후5시30분에 찾아뵐게요') && x.remind_sms_at, [r, x])

  // 시간 변경 → 발송 기준 시간과 달라짐 → 다시 보내면 갱신
  r = await call('PUT', `/api/reservations/${id}`, { start_at: `${day}T18:00:00+09:00`, duration_min: 60 })
  x = await row(id)
  check('시간 변경 후 기준 시간 불일치(재발송 필요)', r.status === 200 && Date.parse(x.confirm_sms_start_at) !== Date.parse(x.start_at), [r, x])
  r = await call('POST', `/api/reservations/${id}/sms`, { type: 'confirm' })
  x = await row(id)
  check('재발송 → 새 시간 문구·기준 갱신', r.status === 200 && r.body.text.includes('오후6:00') && Date.parse(x.confirm_sms_start_at) === Date.parse(x.start_at), [r, x])

  const hist = await sql(`select count(*)::int n from sh_shop_reservation_history where reservation_id = ${id} and description like '%문자 발송%'`)
  check('예약 이력에 발송 기록', hist[0]?.n === 3, hist)

  r = await call('POST', `/api/reservations/${id}/sms`, { type: 'hello' })
  check('잘못된 종류 → 400', r.status === 400, r)

  r = await call('POST', '/api/reservations', { customer_name: '번호없음', start_at: `${day}T11:00:00+09:00`, duration_min: 60 })
  const noPhone = r.body.id
  r = await call('POST', `/api/reservations/${noPhone}/sms`, { type: 'confirm' })
  check('전화번호 없는 예약 → 400', r.status === 400, r)
  await sql(`delete from sh_shop_reservation_history where reservation_id = ${noPhone}; delete from sh_shop_reservations where id = ${noPhone}`)

  await call('PUT', `/api/reservations/${id}`, { status: 'cancelled' })
  r = await call('POST', `/api/reservations/${id}/sms`, { type: 'remind' })
  check('취소된 예약 → 409', r.status === 409, r)
} finally {
  await cleanupTestData()
}
finish()
