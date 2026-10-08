// 예약 확정·전일 안내 문자 점검 — 서버를 SMS_DRY_RUN=true SMS_DRY_RUN_FAIL_TO=01099990092 로 띄운 뒤 실행 (실제 발송 없음)
// 사용법: node scripts/sms-smoke.mjs [baseUrl]
import { adminClient, check, cleanupTestData, env, finish, sql } from './smoke-lib.mjs'

const BASE = process.argv[2] || 'http://localhost:3210'
const call = await adminClient(BASE)
const day = new Date(Date.now() + 9 * 3600e3 + 60 * 86400e3).toISOString().slice(0, 10) // 실제 손님 예약과 겹치지 않도록 먼 날짜
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
  check('전일 안내 발송 → 문구·기록', r.status === 200 && r.body.text.includes('내일 오후5시30분에 뵙겠습니다') && x.remind_sms_at, [r, x])

  // 시간 변경 → 발송 기준 시간과 달라짐 → 다시 보내면 갱신
  r = await call('PUT', `/api/reservations/${id}`, { start_at: `${day}T18:00:00+09:00`, duration_min: 60 })
  x = await row(id)
  check('시간 변경 후 기준 시간 불일치(재발송 필요)', r.status === 200 && Date.parse(x.confirm_sms_start_at) !== Date.parse(x.start_at), [r, x])
  r = await call('POST', `/api/reservations/${id}/sms`, { type: 'confirm' })
  x = await row(id)
  check('재발송 → 새 시간 문구·기준 갱신', r.status === 200 && r.body.text.includes('오후6:00') && Date.parse(x.confirm_sms_start_at) === Date.parse(x.start_at), [r, x])

  // 발송 기록 (성공)
  let logs = await sql(`select kind, status, phone, text, reason from sh_shop_sms_logs where reservation_id = ${id} order by created_at`)
  check('발송 기록 3건 모두 성공으로 남음', logs.filter(l => l.kind !== 'location').length === 3 && logs.every(l => l.status === 'sent') && logs[0].kind === 'confirm' && logs[1].kind === 'remind' && logs[0].text.includes('예약확정'), logs)

  // 위치 안내 (예약 시간과 무관)
  r = await call('POST', `/api/reservations/${id}/sms`, { type: 'location' })
  const loc = await sql(`select location_sms_at from sh_shop_reservations where id = ${id}`)
  const locLog = await sql(`select kind, status, text from sh_shop_sms_logs where reservation_id = ${id} and kind = 'location'`)
  check('위치 안내 발송 → 주소·지도 링크, 발송 시각·기록', r.status === 200 && r.body.text.includes('미사대로520') && r.body.text.includes('naver.me') && loc[0]?.location_sms_at && locLog.length === 1 && locLog[0].status === 'sent', [r, loc, locLog])

  // 관리 시작 시각이 지난 예약은 발송 불가
  const yesterday = new Date(Date.now() + 9 * 3600e3 - 86400e3).toISOString().slice(0, 10)
  const pastStart = `${yesterday}T06:00:00+09:00` // 영업시간 밖이라 실제 예약과 겹치지 않음
  r = await call('POST', '/api/reservations', { customer_name: '지난예약', customer_phone: '010-9999-0094', start_at: pastStart, duration_min: 30, allow_closed: true })
  const pastId = r.body?.id
  r = await call('POST', `/api/reservations/${pastId}/sms`, { type: 'confirm' })
  const pastLogs = await sql(`select count(*)::int n from sh_shop_sms_logs where reservation_id = ${pastId}`)
  check('시작 시각 지난 예약 → 409, 발송·기록 없음', r.status === 409 && pastLogs[0].n === 0, [r, pastLogs])

  // 발송 실패도 기록 (개발용 가짜 실패 번호)
  r = await call('POST', '/api/reservations', { customer_name: '실패테스트', customer_phone: '010-9999-0092', product_id: 2, product_name: '베이직 피부관리', duration_min: 60, start_at: `${day}T13:00:00+09:00`, price: 80000 })
  const failId = r.body.id
  r = await call('POST', `/api/reservations/${failId}/sms`, { type: 'confirm' })
  logs = await sql(`select status, reason from sh_shop_sms_logs where reservation_id = ${failId}`)
  check('발송 실패 → 502 + 실패 기록(사유 포함)', r.status === 502 && logs.length === 1 && logs[0].status === 'failed' && !!logs[0].reason, [r, logs])

  // 관리자 목록 API: 최신순 최대 100건
  r = await call('GET', '/api/admin/sms-logs')
  const list = r.body?.logs ?? []
  check('관리자 문자 이력: 최신순·100건 이하·실패 건 포함', r.status === 200 && list.length <= 100 && list[0]?.reservation_id === failId && list[0].status === 'failed', list.slice(0, 2))

  // 인증번호 문자는 기록하지 않음
  const before = (await sql(`select count(*)::int n from sh_shop_sms_logs`))[0].n
  await fetch(`${BASE}/api/public/v1/verifications`, { method: 'POST', headers: { Authorization: `Bearer ${env.BOOKING_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '010-9999-0093' }) })
  const after = (await sql(`select count(*)::int n from sh_shop_sms_logs`))[0].n
  check('인증번호 문자는 기록 안 됨', after === before, [before, after])

  const hist = await sql(`select count(*)::int n from sh_shop_reservation_history where reservation_id = ${id} and description like '%문자 발송%'`)
  check('예약 이력에 발송 기록 (확정·안내·확정 재발송·위치)', hist[0]?.n === 4, hist)

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
