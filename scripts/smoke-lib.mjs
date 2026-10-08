// 점검 스크립트 공용 — 환경변수, 관리자 로그인 세션, SQL, 결과 출력
import fs from 'node:fs'

export const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).map(l => l.match(/^([A-Z0-9_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2]]),
)

let failed = 0
export function check(label, cond, detail) {
  if (!cond) failed++
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${label}${cond ? '' : ' → ' + JSON.stringify(detail)}`)
}
export function finish() {
  console.log(failed ? `\n${failed}건 실패` : '\n전체 통과')
  process.exit(failed ? 1 : 0)
}

export async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${env.SUPABASE_PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  return res.json()
}

/** 관리자 PIN 로그인 후 쿠키를 붙여 호출하는 클라이언트 */
export async function adminClient(base) {
  const login = await fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pin: env.ADMIN_PIN }),
  })
  if (!login.ok) throw new Error(`관리자 로그인 실패: ${login.status}`)
  const cookie = login.headers.get('set-cookie').split(';')[0]
  return async (method, path, body) => {
    const res = await fetch(base + path, {
      method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: typeof body === 'string' ? body : body ? JSON.stringify(body) : undefined,
    })
    return { status: res.status, body: await res.json().catch(() => null) }
  }
}

export async function cleanupTestData() {
  await sql(`delete from sh_shop_sms_logs where phone like '0109999%';
             delete from sh_shop_phone_verifications where phone like '0109999%';
             delete from sh_shop_trial_packages where customer_id in (select id from sh_shop_customers where phone like '0109999%');
             delete from sh_shop_prepaid_ledger where customer_id in (select id from sh_shop_customers where phone like '0109999%');
             delete from sh_shop_payments where customer_id in (select id from sh_shop_customers where phone like '0109999%');
             delete from sh_shop_reservation_history where reservation_id in (select id from sh_shop_reservations where customer_phone like '0109999%');
             delete from sh_shop_reservations where customer_phone like '0109999%';
             delete from sh_shop_customers where phone like '0109999%';`)
}
