/* 소개 보너스 규칙 — DB 함수 sh_shop_referral_sync 와 같은 규칙 (10%, 원 미만 버림, 첫 관리일 + 1년 미만) */

export const REFERRAL_RATE = 0.1

export const referralReward = (total: number) => Math.floor(total * REFERRAL_RATE)

/** 첫 관리일(YYYY-MM-DD) + 1년 — 없는 날(2/29)은 그 달 말일로 (Postgres interval 과 동일) */
function plusOneYear(date: string) {
  const [y, m, d] = date.split('-').map(Number)
  const last = new Date(Date.UTC(y + 1, m, 0)).getUTCDate()
  return new Date(Date.UTC(y + 1, m - 1, Math.min(d, last)))
}

/** 적용 기간 — end 는 마지막 적용일(포함) */
export function referralWindow(start: string) {
  const end = plusOneYear(start)
  end.setUTCDate(end.getUTCDate() - 1)
  return { start, end: end.toISOString().slice(0, 10) }
}

/** 이 날 관리가 적용 대상인지 — 아직 첫 관리 전이면 이번이 첫 관리 */
export function inReferralWindow(start: string | null, date: string) {
  return !start || date <= referralWindow(start).end
}
