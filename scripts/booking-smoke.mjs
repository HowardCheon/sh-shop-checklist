// 외부 예약 API 통합 점검 — 사용법: node scripts/booking-smoke.mjs [baseUrl]
// 테스트 전화번호 010-9999-00xx 데이터를 만들고, 마지막에 정리한다.
// BOOKING_ONLINE_CHANGE=true 로 띄운 서버면 온라인 변경·취소까지, 아니면 전화 전용 모드를 점검한다.
import fs from 'node:fs'

const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2]]),
)
const CHANGE = process.env.BOOKING_ONLINE_CHANGE === 'true'
const BASE = (process.argv[2] || 'http://localhost:3210') + '/api/public/v1'
const H = { Authorization: `Bearer ${env.BOOKING_API_KEY}`, 'Content-Type': 'application/json' }

let failed = 0
async function call(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: H, body: body ? JSON.stringify(body) : undefined })
  return { status: res.status, body: await res.json() }
}
function check(label, cond, detail) {
  if (!cond) failed++
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}${cond ? '' : ' → ' + JSON.stringify(detail)}`)
}
async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  return res.json()
}
async function cleanup() {
  await sql(`delete from sh_shop_reservation_history where reservation_id in (select id from sh_shop_reservations where customer_phone like '0109999%');
             delete from sh_shop_reservations where customer_phone like '0109999%';
             delete from sh_shop_customers where phone like '0109999%';`)
}

// 다음 주 화요일/수요일 (KST)
const kstToday = new Date(Date.now() + 9 * 3600e3)
const plus = n => new Date(kstToday.getTime() + n * 86400e3).toISOString().slice(0, 10)
const dow = kstToday.getUTCDay()
const TUE = plus(((2 - dow + 7) % 7) + 7)
const WED = plus(((3 - dow + 7) % 7) + 7)

await cleanup()
try {
  // 한글 저장
  let r = await call('POST', '/reservations', { name: '홍길동', phone: '010-9999-0001', program_id: 13, date: TUE, time: '11:30', message: '첫 방문입니다' })
  check('예약 생성 201 + 한글 보존', r.status === 201 && r.body.customer_name === '홍길동' && r.body.message === '첫 방문입니다', r)
  const id1 = r.body.id

  // 고객 요청사항과 관리자 내부 메모 분리 — 내부 메모는 고객 조회에 나오지 않아야 함
  let row = await sql(`select memo, customer_message from sh_shop_reservations where id = ${id1}`)
  check('고객 메시지는 customer_message 에 저장, 내부 메모는 비어 있음', row[0]?.customer_message === '첫 방문입니다' && row[0]?.memo === null, row)
  await sql(`update sh_shop_reservations set memo = '내부: 피부 트러블 주의' where id = ${id1}`)
  r = await call('GET', `/reservations?phone=01099990001&name=${encodeURIComponent('홍길동')}`)
  const mine = r.body.reservations?.find(x => x.id === id1)
  check('고객 조회에는 내부 메모 없이 요청사항만', mine?.message === '첫 방문입니다' && !JSON.stringify(r.body).includes('피부 트러블'), r)

  if (CHANGE) {
    r = await call('GET', `/availability/programs?date=${TUE}&time=11:30`)
    const withoutExclude = r.body.programs?.length
    r = await call('GET', `/availability/programs?date=${TUE}&time=11:30&exclude=${id1}&phone=01099990001`)
    check('변경 시 본인 예약 제외하면 같은 시간 선택 가능', withoutExclude === 0 && r.body.programs?.some(p => p.id === 13), [withoutExclude, r])
    r = await call('GET', `/availability?date=${TUE}&exclude=${id1}&phone=01000000000`)
    check('다른 번호로 exclude → NOT_FOUND', r.status === 404, r)
  }

  r = await call('GET', '/customers/lookup?phone=01099990001')
  check('고객 자동 등록 + 마스킹', r.body.exists && r.body.name_masked === '홍*동' && r.body.is_member === false, r)

  // 동시 요청 — 같은 슬롯 5건 중 1건만 성공
  const results = await Promise.all([1, 2, 3, 4, 5].map(i =>
    call('POST', '/reservations', { name: `동시${i}`, phone: `010-9999-001${i}`, program_id: 2, date: WED, time: '15:00' })))
  const ok = results.filter(x => x.status === 201).length
  check('동시 요청 중 1건만 성공', ok === 1 && results.every(x => x.status === 201 || x.body.error?.code === 'SLOT_TAKEN'), results.map(x => x.status))

  if (CHANGE) {
    // 수정: 시간 변경 → 자기 블록 제외, 프로그램 변경
    r = await call('PATCH', `/reservations/${id1}`, { phone: '01099990001', time: '12:00' })
    check('시간 수정', r.status === 200 && r.body.start_time === '12:00' && r.body.end_time === '14:00', r)
    r = await call('PATCH', `/reservations/${id1}`, { phone: '01099990001', program_id: 2 })
    check('프로그램 수정(같은 시간)', r.status === 200 && r.body.program.id === 2 && r.body.price === 80000, r)
    r = await call('PATCH', `/reservations/${id1}`, { phone: '01000000000', time: '13:00' })
    check('다른 전화번호 → NOT_FOUND', r.status === 404 && r.body.error.code === 'NOT_FOUND', r)
    r = await call('PATCH', `/reservations/${id1}`, { phone: '01099990001', date: WED, time: '15:00' })
    check('수정 시 다른 예약과 겹치면 SLOT_TAKEN', r.status === 409, r)
  } else {
    r = await call('PATCH', `/reservations/${id1}`, { phone: '01099990001', time: '12:00' })
    check('전화 전용 모드: 온라인 수정 → CHANGE_BY_PHONE', r.status === 403 && r.body.error.code === 'CHANGE_BY_PHONE', r)
    r = await call('POST', `/reservations/${id1}/cancel`, { phone: '01099990001' })
    check('전화 전용 모드: 온라인 취소 → CHANGE_BY_PHONE', r.status === 403 && r.body.error.code === 'CHANGE_BY_PHONE', r)
  }

  // 예약 조회는 이름 + 휴대폰 번호
  r = await call('GET', '/reservations?phone=01099990001')
  check('이름 없이 조회 → INVALID_INPUT', r.status === 400, r)
  r = await call('GET', `/reservations?phone=01099990001&name=${encodeURIComponent('홍 길동')}`)
  check('이름+번호 일치 조회(공백 무시)', r.status === 200 && r.body.reservations.some(x => x.id === id1) && r.body.reservations.every(x => x.editable === CHANGE), r)
  r = await call('GET', `/reservations?phone=01099990001&name=${encodeURIComponent('김철수')}`)
  check('이름 불일치 → 빈 목록', r.status === 200 && r.body.reservations.length === 0, r)

  // 회원가
  await sql(`update sh_shop_customers set prepaid_cash = 500000 where phone = '01099990001'`)
  r = await call('GET', `/availability/programs?date=${TUE}&time=16:00&phone=01099990001`)
  check('회원이면 applied_price = 회원가', r.body.is_member === true && r.body.programs.find(p => p.id === 2)?.applied_price === 50000, r)
  r = await call('POST', '/reservations', { name: '홍길동', phone: '01099990001', program_id: 3, date: TUE, time: '16:00' })
  check('회원 예약은 회원가 기록', r.status === 201 && r.body.price === 70000 && r.body.price_type === 'member', r)

  // 한도 5건
  for (const t of ['17:30', '19:00']) await call('POST', '/reservations', { name: '홍길동', phone: '01099990001', program_id: 9, date: TUE, time: t })
  await call('POST', '/reservations', { name: '홍길동', phone: '01099990001', program_id: 9, date: WED, time: '10:00' })
  r = await call('POST', '/reservations', { name: '홍길동', phone: '01099990001', program_id: 9, date: WED, time: '12:00' })
  check('예정 예약 5건 초과 → LIMIT_EXCEEDED', r.status === 409 && r.body.error.code === 'LIMIT_EXCEEDED', r)

  // 휴무일
  await sql(`insert into sh_shop_closed_dates(date, reason) values ('${WED}', '테스트 휴무') on conflict do nothing`)
  r = await call('GET', `/availability?date=${WED}`)
  check('휴무일 → closed', r.body.closed === true && r.body.closed_reason === '테스트 휴무', r)
  await sql(`delete from sh_shop_closed_dates where date = '${WED}'`)

  if (CHANGE) {
    // 당일 잠금: 오늘 날짜 예약을 직접 삽입
    const today = plus(0)
    const ins = await sql(`insert into sh_shop_reservations (customer_name, customer_phone, product_name, duration_min, start_at, end_at, block_end_at, status)
      values ('홍길동', '01099990001', '테스트', 60, '${today}T23:58:00+09:00', '${today}T23:59:00+09:00', '${today}T23:59:30+09:00', 'scheduled') returning id`)
    r = await call('POST', `/reservations/${ins[0].id}/cancel`, { phone: '01099990001' })
    check('당일 취소 → SAME_DAY_LOCKED', r.status === 403 && r.body.error.code === 'SAME_DAY_LOCKED', r)

    // 취소
    r = await call('POST', `/reservations/${id1}/cancel`, { phone: '010-9999-0001', reason: '일정 변경' })
    check('취소', r.status === 200 && r.body.status === 'cancelled', r)
    r = await call('GET', `/reservations?phone=01099990001&name=${encodeURIComponent('홍길동')}`)
    check('취소 건은 목록에서 제외', !r.body.reservations.some(x => x.id === id1), r)

    const hist = await sql(`select action, actor from sh_shop_customer_history h join sh_shop_customers c on c.id = h.customer_id where c.phone = '01099990001' order by h.id`)
    check('고객 이력 기록(생성/수정/취소)', ['reservation_created', 'reservation_updated', 'reservation_cancelled'].every(a => hist.some(h => h.action === a)), hist)
  }
} finally {
  await cleanup()
}
console.log(failed ? `\n${failed}건 실패` : '\n전체 통과')
process.exit(failed ? 1 : 0)
