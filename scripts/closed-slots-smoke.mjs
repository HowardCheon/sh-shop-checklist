// 관리자 휴무시간 점검 — 서버를 SOLAPI_* 비운 채(인증 꺼짐) 띄운 뒤 실행. 사용법: node scripts/closed-slots-smoke.mjs [baseUrl]
import { adminClient, check, cleanupTestData, env, finish, sql } from './smoke-lib.mjs'

const BASE = process.argv[2] || 'http://localhost:3210'
const call = await adminClient(BASE)
const pub = async (method, path, body) => {
  const res = await fetch(`${BASE}/api/public/v1${path}`, { method, headers: { Authorization: `Bearer ${env.BOOKING_API_KEY}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined })
  return { status: res.status, body: await res.json().catch(() => null) }
}
// 다음 주 화요일 (영업일)
const kst = new Date(Date.now() + 9 * 3600e3)
const day = new Date(kst.getTime() + (((2 - kst.getUTCDay() + 7) % 7) + 14) * 86400e3).toISOString().slice(0, 10)
const slot = (times, t) => times.find(x => x.time === t)

await cleanupTestData()
await sql(`delete from sh_shop_closed_slots where date = '${day}'`)
try {
  let r = await call('PUT', '/api/closed-slots', { date: day, times: ['14:00', '14:30'] })
  check('휴무시간 지정', r.status === 200 && r.body.times?.length === 2, r)
  r = await call('PUT', '/api/closed-slots', { date: day, times: ['14:07'] })
  check('30분 칸이 아닌 시각 → 400', r.status === 400, r)
  r = await call('GET', `/api/closed-slots?date=${day}`)
  check('휴무시간 조회', r.status === 200 && r.body.times?.join(',') === '14:00,14:30', r)

  r = await pub('GET', `/availability?date=${day}`)
  const times = r.body?.times ?? []
  check('고객 가능 시간: 휴무 칸은 마감(booked)', slot(times, '14:00')?.available === false && slot(times, '14:00')?.reason === 'booked', [slot(times, '14:00')])
  check('고객 가능 시간: 휴무 전 정리시간 겹치면 마감, 그 외 가능', slot(times, '13:30')?.available === false && slot(times, '15:00')?.available === true, [slot(times, '13:30'), slot(times, '15:00')])
  check('고객 응답 사유는 기존 값만 (휴무시간 노출 없음)', times.every(t => [null, 'booked', 'too_soon', 'too_far'].includes(t.reason)), [...new Set(times.map(t => t.reason))])

  r = await pub('POST', '/reservations', { name: '휴무테스트', phone: '010-9999-0101', program_id: 2, date: day, time: '14:00' })
  check('고객 온라인 예약 휴무 칸 → 거부', r.status === 409 || r.status === 422, r)

  r = await call('POST', '/api/reservations', { customer_name: '휴무테스트', customer_phone: '010-9999-0102', start_at: `${day}T14:00:00+09:00`, duration_min: 60 })
  check('관리자 예약 휴무 칸 → 409 closed_slot', r.status === 409 && r.body?.closed_slot?.start === '14:00', r)
  r = await call('POST', '/api/reservations', { customer_name: '휴무테스트', customer_phone: '010-9999-0102', start_at: `${day}T14:00:00+09:00`, duration_min: 60, allow_closed: true })
  const rid = r.body?.id
  check('관리자 확인 후 허용 → 201', (r.status === 201 || r.status === 200) && rid, r)
  r = await call('PUT', `/api/reservations/${rid}`, { start_at: `${day}T14:30:00+09:00`, duration_min: 60 })
  check('관리자 예약 수정도 휴무 겹치면 409', r.status === 409 && r.body?.closed_slot, r)

  r = await call('PUT', '/api/closed-slots', { date: day, times: [] })
  r = await pub('GET', `/availability?date=${day}`)
  check('휴무 해제 → 15:30 다시 가능', slot(r.body?.times ?? [], '15:30')?.available === true, slot(r.body?.times ?? [], '15:30'))
} finally {
  await sql(`delete from sh_shop_closed_slots where date = '${day}'`)
  await cleanupTestData()
}
finish()
