# 첫체험 패키지 등록·사용 관리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 고객 상세에서 첫체험 패키지(2회/4회)를 결제와 함께 등록하고, 베이직/스페셜 횟수를 수동 차감·취소하며, 등록 취소 시 결제도 취소한다.

**Architecture:** 패키지/사용 테이블 2개 + 트랜잭션 DB 함수 4개(등록은 기존 `sh_shop_pay` 재사용). 순수 규칙은 `lib/booking/trial.ts`, RPC 래퍼·이력 기록은 `lib/trial.ts`, 관리자 API 라우트 4개, 고객 상세에 `TrialPanel` 추가.

**Tech Stack:** Next.js 16 App Router, Supabase(PostgreSQL, Management API 로 마이그레이션), vitest, Tailwind 4

**Spec:** `docs/superpowers/specs/2026-10-06-trial-package-design.md`

## Global Constraints

- 패키지: trial2 = 99,000원 · 베이직 1 · 스페셜 1 · 1개월 / trial4 = 219,000원 · 베이직 1 · 스페셜 3 · 3개월
- 스페셜 케어: 플라즈마 / 로즈 해독 / 상체 / 하체
- 고객당 status='active' 패키지 1건 (부분 유니크 인덱스)
- 만료일 = 등록일(KST) + n개월, 당일까지 유효. 만료 후 사용은 확인창 후 허용
- 금액 변경은 모두 DB 함수(트랜잭션 + FOR UPDATE), 함수 실행권한은 service_role 만
- 기존 코드 스타일(2칸 들여쓰기, 세미콜론 없음, 한국어 주석·메시지) 유지

## Review Focus

- 결제 내역 목록에서 첫체험 결제를 직접 "취소" → 패키지만 남는 불일치 대신 409 안내 (Task 3 스모크에 포함)
- 남은 1회에 사용 버튼을 연속 두 번 누름 → 1회만 차감 (Task 3 동시 사용 스모크)
- 선불 잔액이 패키지 가격보다 적은데 선불 사용 + 결제수단 지정 → 선불 전액 + 부족분 카드 (Task 3 스모크)
- 등록 취소 후 같은 고객 재등록 → 허용 (Task 3 스모크)
- 잘못된 code(`toString` 등 프로토타입 키) → 400 (Task 1 단위 테스트)

---

### Task 1: 순수 규칙 모듈 `lib/booking/trial.ts`

**Files:**
- Create: `lib/booking/trial.ts`
- Test: `lib/booking/__tests__/trial.test.ts`

**Interfaces:**
- Produces: `TrialCode`, `TrialKind`, `TRIAL_PACKAGES`, `SPECIAL_CARES`, `TrialPackageRow`, `TrialUseRow`, `trialPackage(code: unknown)`, `validateUse(kind: unknown, careName: unknown): { kind: TrialKind; careName: string | null }`, `trialStatus(pkg, today: string)`, `kstToday(now?: number): string`

- [ ] **Step 1: 실패하는 테스트 작성** — `lib/booking/__tests__/trial.test.ts`

```ts
import { describe, expect, it } from 'vitest'
import { kstToday, trialPackage, trialStatus, validateUse } from '../trial'

const pkg = { basic_total: 1, special_total: 3, basic_used: 0, special_used: 1, expires_on: '2026-11-06' }

describe('trialPackage', () => {
  it('코드별 구성·가격', () => {
    expect(trialPackage('trial2')).toMatchObject({ code: 'trial2', price: 99000, basic: 1, special: 1, months: 1 })
    expect(trialPackage('trial4')).toMatchObject({ code: 'trial4', price: 219000, basic: 1, special: 3, months: 3 })
  })
  it('잘못된 코드는 INVALID_INPUT', () => {
    for (const c of ['trial3', 'toString', '', null, 4]) expect(() => trialPackage(c)).toThrow(/패키지/)
  })
})

describe('validateUse', () => {
  it('베이직은 시술명 무시', () => {
    expect(validateUse('basic', '플라즈마')).toEqual({ kind: 'basic', careName: null })
  })
  it('스페셜은 4종 중 하나 필수', () => {
    expect(validateUse('special', '로즈 해독')).toEqual({ kind: 'special', careName: '로즈 해독' })
    expect(() => validateUse('special', null)).toThrow()
    expect(() => validateUse('special', '전신관리')).toThrow()
  })
  it('알 수 없는 종류', () => {
    expect(() => validateUse('premium', null)).toThrow()
  })
})

describe('trialStatus', () => {
  it('남은 횟수·D-day', () => {
    expect(trialStatus(pkg, '2026-10-06')).toEqual({ basicLeft: 1, specialLeft: 2, daysLeft: 31, expired: false, done: false })
  })
  it('만료일 당일은 유효, 다음날 만료', () => {
    expect(trialStatus(pkg, '2026-11-06')).toMatchObject({ daysLeft: 0, expired: false })
    expect(trialStatus(pkg, '2026-11-07')).toMatchObject({ daysLeft: -1, expired: true })
  })
  it('모두 사용하면 done', () => {
    expect(trialStatus({ ...pkg, basic_used: 1, special_used: 3 }, '2026-10-06').done).toBe(true)
  })
})

describe('kstToday', () => {
  it('UTC 15시 이후는 KST 다음날', () => {
    expect(kstToday(Date.parse('2026-10-06T15:30:00Z'))).toBe('2026-10-07')
    expect(kstToday(Date.parse('2026-10-06T14:59:00Z'))).toBe('2026-10-06')
  })
})
```

- [ ] **Step 2: 실패 확인** — `rtk npx vitest run lib/booking/__tests__/trial.test.ts` → 모듈 없음 FAIL

- [ ] **Step 3: 구현** — `lib/booking/trial.ts`

```ts
import { BookingError } from './errors'

export type TrialCode = 'trial2' | 'trial4'
export type TrialKind = 'basic' | 'special'

/** 첫체험 패키지 (홈페이지 오픈 이벤트 기준) */
export const TRIAL_PACKAGES: Record<TrialCode, { label: string; price: number; basic: number; special: number; months: number }> = {
  trial2: { label: '첫체험 2회', price: 99000, basic: 1, special: 1, months: 1 },
  trial4: { label: '첫체험 4회', price: 219000, basic: 1, special: 3, months: 3 },
}

export const SPECIAL_CARES = ['플라즈마', '로즈 해독', '상체', '하체'] as const

export interface TrialPackageRow {
  id: number
  customer_id: number
  package_code: string
  basic_total: number
  special_total: number
  basic_used: number
  special_used: number
  price: number
  payment_id: number | null
  expires_on: string
  status: 'active' | 'cancelled'
  created_at: string
  cancelled_at: string | null
}

export interface TrialUseRow {
  id: number
  package_id: number
  kind: TrialKind
  care_name: string | null
  status: 'used' | 'cancelled'
  memo: string | null
  created_at: string
  cancelled_at: string | null
}

export function trialPackage(code: unknown) {
  if (typeof code !== 'string' || !Object.hasOwn(TRIAL_PACKAGES, code)) {
    throw new BookingError('INVALID_INPUT', '첫체험 패키지 종류가 올바르지 않습니다.')
  }
  return { code: code as TrialCode, ...TRIAL_PACKAGES[code as TrialCode] }
}

export function validateUse(kind: unknown, careName: unknown): { kind: TrialKind; careName: string | null } {
  if (kind === 'basic') return { kind, careName: null }
  if (kind !== 'special') throw new BookingError('INVALID_INPUT', '사용 종류가 올바르지 않습니다.')
  if (typeof careName !== 'string' || !(SPECIAL_CARES as readonly string[]).includes(careName)) {
    throw new BookingError('INVALID_INPUT', '스페셜 케어 시술을 선택하세요.')
  }
  return { kind, careName }
}

/** 남은 횟수·만료 판정 — today, expires_on 은 'YYYY-MM-DD' (만료일 당일까지 유효) */
export function trialStatus(
  pkg: Pick<TrialPackageRow, 'basic_total' | 'special_total' | 'basic_used' | 'special_used' | 'expires_on'>,
  today: string,
) {
  const basicLeft = pkg.basic_total - pkg.basic_used
  const specialLeft = pkg.special_total - pkg.special_used
  const daysLeft = Math.round((Date.parse(pkg.expires_on) - Date.parse(today)) / 86400e3)
  return { basicLeft, specialLeft, daysLeft, expired: daysLeft < 0, done: basicLeft + specialLeft === 0 }
}

export const kstToday = (now = Date.now()) => new Date(now + 9 * 3600e3).toISOString().slice(0, 10)
```

- [ ] **Step 4: 통과 확인** — `rtk npx vitest run lib/booking/__tests__/trial.test.ts` → PASS
- [ ] **Step 5: 커밋** — `feat: 첫체험 패키지 규칙 모듈과 단위 테스트`

### Task 2: DB 마이그레이션 + 서버 모듈 + API

**Files:**
- Create: `docs/sql/2026-10-06-trial-packages.sql`, `lib/trial.ts`, `app/api/customers/[id]/trial/route.ts`, `app/api/trial/[id]/use/route.ts`, `app/api/trial/[id]/cancel/route.ts`, `app/api/trial/uses/[id]/cancel/route.ts`
- Modify: `lib/payments.ts` (`rpc` export, `RPC_ERRORS` 추가), `app/api/payments/[id]/void/route.ts` (첫체험 결제 거부)

**Interfaces:**
- Consumes: Task 1 의 `trialPackage`, `validateUse`, `TRIAL_PACKAGES`, 타입들
- Produces (HTTP):
  - `GET /api/customers/{id}/trial` → `{ package: TrialPackageRow | null, uses: TrialUseRow[], balance: { prepaid_cash, prepaid_bonus } }`
  - `POST /api/customers/{id}/trial` `{ code, use_prepaid, other_method? }` → `{ package, payment }`
  - `POST /api/trial/{packageId}/use` `{ kind, care_name?, memo? }` → `{ use, package }`
  - `POST /api/trial/uses/{useId}/cancel` → `{ use, package }`
  - `POST /api/trial/{packageId}/cancel` → `{ package, payment | null }`
  - 오류는 `{ error: string }` + 상태코드

- [ ] **Step 1: SQL 작성** — `docs/sql/2026-10-06-trial-packages.sql`

```sql
-- 첫체험 패키지 등록·사용 (2026-10-06)

create table if not exists sh_shop_trial_packages (
  id bigint generated always as identity primary key,
  customer_id bigint not null references sh_shop_customers(id) on delete cascade,
  package_code text not null,
  basic_total integer not null,
  special_total integer not null,
  basic_used integer not null default 0,
  special_used integer not null default 0,
  price integer not null,
  payment_id bigint references sh_shop_payments(id) on delete set null,
  expires_on date not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  check (basic_used between 0 and basic_total),
  check (special_used between 0 and special_total)
);
create unique index if not exists sh_shop_trial_packages_active_uq on sh_shop_trial_packages(customer_id) where status = 'active';
create index if not exists sh_shop_trial_packages_payment_idx on sh_shop_trial_packages(payment_id);

create table if not exists sh_shop_trial_uses (
  id bigint generated always as identity primary key,
  package_id bigint not null references sh_shop_trial_packages(id) on delete cascade,
  kind text not null check (kind in ('basic', 'special')),
  care_name text,
  status text not null default 'used',
  memo text,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);
create index if not exists sh_shop_trial_uses_package_idx on sh_shop_trial_uses(package_id);

alter table sh_shop_trial_packages enable row level security;
alter table sh_shop_trial_uses enable row level security;

-- 등록 = 결제(sh_shop_pay) + 패키지 생성
create or replace function sh_shop_trial_register(
  p_customer_id bigint, p_code text, p_price integer, p_basic integer, p_special integer,
  p_months integer, p_use_prepaid boolean, p_other_method text, p_memo text
) returns json language plpgsql set search_path = public as $$
declare
  v_pay sh_shop_payments;
  v_pkg sh_shop_trial_packages;
begin
  perform 1 from sh_shop_customers where id = p_customer_id for update;
  if not found then raise exception 'CUSTOMER_NOT_FOUND'; end if;
  if exists (select 1 from sh_shop_trial_packages where customer_id = p_customer_id and status = 'active') then
    raise exception 'ALREADY_REGISTERED';
  end if;
  select * into v_pay from sh_shop_pay(p_customer_id, null, p_price, p_use_prepaid, p_other_method, p_memo);
  insert into sh_shop_trial_packages (customer_id, package_code, basic_total, special_total, price, payment_id, expires_on)
  values (p_customer_id, p_code, p_basic, p_special, p_price, v_pay.id,
          ((now() at time zone 'Asia/Seoul')::date + make_interval(months => p_months))::date)
  returning * into v_pkg;
  return json_build_object('package', row_to_json(v_pkg), 'payment', row_to_json(v_pay));
end $$;

-- 사용 1회 차감 (만료는 막지 않음)
create or replace function sh_shop_trial_use(p_package_id bigint, p_kind text, p_care_name text, p_memo text)
returns json language plpgsql set search_path = public as $$
declare
  v_pkg sh_shop_trial_packages;
  v_use sh_shop_trial_uses;
begin
  if p_kind is null or p_kind not in ('basic', 'special') then raise exception 'INVALID_TRIAL_USE'; end if;
  select * into v_pkg from sh_shop_trial_packages where id = p_package_id for update;
  if not found then raise exception 'PACKAGE_NOT_FOUND'; end if;
  if v_pkg.status <> 'active' then raise exception 'PACKAGE_CANCELLED'; end if;
  if (p_kind = 'basic' and v_pkg.basic_used >= v_pkg.basic_total)
     or (p_kind = 'special' and v_pkg.special_used >= v_pkg.special_total) then
    raise exception 'NO_REMAINING';
  end if;
  update sh_shop_trial_packages
     set basic_used = basic_used + (p_kind = 'basic')::int, special_used = special_used + (p_kind = 'special')::int
   where id = v_pkg.id
  returning * into v_pkg;
  insert into sh_shop_trial_uses (package_id, kind, care_name, memo)
  values (v_pkg.id, p_kind, case when p_kind = 'special' then p_care_name end, nullif(trim(p_memo), ''))
  returning * into v_use;
  return json_build_object('use', row_to_json(v_use), 'package', row_to_json(v_pkg));
end $$;

-- 사용 1건 취소 (횟수 복원)
create or replace function sh_shop_trial_use_cancel(p_use_id bigint)
returns json language plpgsql set search_path = public as $$
declare
  v_pkg sh_shop_trial_packages;
  v_use sh_shop_trial_uses;
begin
  select * into v_use from sh_shop_trial_uses where id = p_use_id;
  if not found then raise exception 'USE_NOT_FOUND'; end if;
  select * into v_pkg from sh_shop_trial_packages where id = v_use.package_id for update;
  select * into v_use from sh_shop_trial_uses where id = p_use_id for update;
  if v_use.status <> 'used' then raise exception 'ALREADY_CANCELLED'; end if;
  update sh_shop_trial_uses set status = 'cancelled', cancelled_at = now() where id = v_use.id returning * into v_use;
  update sh_shop_trial_packages
     set basic_used = basic_used - (v_use.kind = 'basic')::int, special_used = special_used - (v_use.kind = 'special')::int
   where id = v_pkg.id
  returning * into v_pkg;
  return json_build_object('use', row_to_json(v_use), 'package', row_to_json(v_pkg));
end $$;

-- 등록 취소 (유효 사용 없을 때만, 결제 취소 포함)
create or replace function sh_shop_trial_cancel(p_package_id bigint)
returns json language plpgsql set search_path = public as $$
declare
  v_pkg sh_shop_trial_packages;
  v_pay sh_shop_payments;
begin
  select * into v_pkg from sh_shop_trial_packages where id = p_package_id for update;
  if not found then raise exception 'PACKAGE_NOT_FOUND'; end if;
  if v_pkg.status <> 'active' then raise exception 'ALREADY_CANCELLED'; end if;
  if exists (select 1 from sh_shop_trial_uses where package_id = v_pkg.id and status = 'used') then
    raise exception 'HAS_USES';
  end if;
  update sh_shop_trial_packages set status = 'cancelled', cancelled_at = now() where id = v_pkg.id returning * into v_pkg;
  if exists (select 1 from sh_shop_payments where id = v_pkg.payment_id and status = 'paid') then
    select * into v_pay from sh_shop_payment_void(v_pkg.payment_id);
  end if;
  return json_build_object('package', row_to_json(v_pkg), 'payment', case when v_pay.id is null then null else row_to_json(v_pay) end);
end $$;

revoke all on function sh_shop_trial_register(bigint, text, integer, integer, integer, integer, boolean, text, text) from public, anon, authenticated;
revoke all on function sh_shop_trial_use(bigint, text, text, text) from public, anon, authenticated;
revoke all on function sh_shop_trial_use_cancel(bigint) from public, anon, authenticated;
revoke all on function sh_shop_trial_cancel(bigint) from public, anon, authenticated;
grant execute on function sh_shop_trial_register(bigint, text, integer, integer, integer, integer, boolean, text, text) to service_role;
grant execute on function sh_shop_trial_use(bigint, text, text, text) to service_role;
grant execute on function sh_shop_trial_use_cancel(bigint) to service_role;
grant execute on function sh_shop_trial_cancel(bigint) to service_role;
```

- [ ] **Step 2: 적용** — `rtk node scripts/run-sql.mjs docs/sql/2026-10-06-trial-packages.sql` → `201` 또는 `200`

- [ ] **Step 3: `lib/payments.ts` 수정** — `async function rpc` → `export async function rpc`, `RPC_ERRORS` 에 추가:

```ts
  ALREADY_REGISTERED: [409, '이미 첫체험 패키지가 등록된 고객입니다'],
  NO_REMAINING: [409, '남은 횟수가 없습니다'],
  PACKAGE_NOT_FOUND: [404, '첫체험 패키지를 찾을 수 없습니다'],
  PACKAGE_CANCELLED: [409, '취소된 첫체험 패키지입니다'],
  USE_NOT_FOUND: [404, '사용 내역을 찾을 수 없습니다'],
  ALREADY_CANCELLED: [409, '이미 취소되었습니다'],
  HAS_USES: [409, '사용 내역이 있어 등록을 취소할 수 없습니다. 사용을 먼저 취소하세요'],
  INVALID_TRIAL_USE: [400, '사용 종류가 올바르지 않습니다'],
```

- [ ] **Step 4: `lib/trial.ts`**

```ts
/* 첫체험 패키지 — 등록·사용·취소는 DB 함수(트랜잭션 + 행 잠금), 고객 이력 기록 */
import { recordCustomerHistory } from '@/lib/booking/admin'
import { TRIAL_PACKAGES, type TrialCode, type TrialKind, type TrialPackageRow, type TrialUseRow } from '@/lib/booking/trial'
import { describePayment, rpc, type Payment, type PaymentMethod } from '@/lib/payments'

const pkgLabel = (p: TrialPackageRow) => TRIAL_PACKAGES[p.package_code as TrialCode]?.label ?? p.package_code
const useLabel = (u: TrialUseRow) => (u.kind === 'basic' ? '베이직' : `스페셜 - ${u.care_name}`)
const remain = (p: TrialPackageRow) => `남은 베이직 ${p.basic_total - p.basic_used} · 스페셜 ${p.special_total - p.special_used}`

export async function registerTrial(customerId: number, code: TrialCode, usePrepaid: boolean, otherMethod: PaymentMethod | null) {
  const def = TRIAL_PACKAGES[code]
  const result = await rpc<{ package: TrialPackageRow; payment: Payment }>('sh_shop_trial_register', {
    p_customer_id: customerId, p_code: code, p_price: def.price, p_basic: def.basic, p_special: def.special,
    p_months: def.months, p_use_prepaid: usePrepaid, p_other_method: otherMethod, p_memo: `${def.label} 패키지`,
  })
  await recordCustomerHistory(customerId, {
    action: 'trial_registered',
    description: `${def.label} 등록 · ${describePayment(result.payment)} · ${result.package.expires_on}까지`,
    new_value: result,
  })
  return result
}

export async function useTrial(packageId: number, kind: TrialKind, careName: string | null, memo: string | null) {
  const result = await rpc<{ use: TrialUseRow; package: TrialPackageRow }>('sh_shop_trial_use', {
    p_package_id: packageId, p_kind: kind, p_care_name: careName, p_memo: memo,
  })
  await recordCustomerHistory(result.package.customer_id, {
    action: 'trial_used',
    description: `${pkgLabel(result.package)} ${useLabel(result.use)} 사용 (${remain(result.package)})${memo ? ` · ${memo}` : ''}`,
    new_value: result.use,
  })
  return result
}

export async function cancelTrialUse(useId: number) {
  const result = await rpc<{ use: TrialUseRow; package: TrialPackageRow }>('sh_shop_trial_use_cancel', { p_use_id: useId })
  await recordCustomerHistory(result.package.customer_id, {
    action: 'trial_use_cancelled',
    description: `${pkgLabel(result.package)} ${useLabel(result.use)} 사용 취소 (${remain(result.package)})`,
    old_value: result.use,
  })
  return result
}

export async function cancelTrial(packageId: number) {
  const result = await rpc<{ package: TrialPackageRow; payment: Payment | null }>('sh_shop_trial_cancel', { p_package_id: packageId })
  await recordCustomerHistory(result.package.customer_id, {
    action: 'trial_cancelled',
    description: `${pkgLabel(result.package)} 등록 취소${result.payment ? ` — 결제 취소 ${describePayment(result.payment)}` : ''}`,
    old_value: result,
  })
  return result
}
```

- [ ] **Step 5: API 라우트** — 오류 응답: `BookingError` → `{error: e.message}, e.status`, 그 외 `paymentErrorResponse`.

`app/api/customers/[id]/trial/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { BookingError } from '@/lib/booking/errors'
import { trialPackage } from '@/lib/booking/trial'
import { paymentErrorResponse, type PaymentMethod } from '@/lib/payments'
import { registerTrial } from '@/lib/trial'

const METHODS: PaymentMethod[] = ['card', 'cash', 'transfer']

/* 유효 첫체험 패키지 + 사용 내역 + 선불 잔액(등록 결제 미리보기용) */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [customer, pkg] = await Promise.all([
    supabase.from('sh_shop_customers').select('prepaid_cash, prepaid_bonus').eq('id', id).single(),
    supabase.from('sh_shop_trial_packages').select('*').eq('customer_id', id).eq('status', 'active').maybeSingle(),
  ])
  if (customer.error || pkg.error) return NextResponse.json({ error: '조회 실패' }, { status: 500 })
  let uses: unknown[] = []
  if (pkg.data) {
    const { data, error } = await supabase.from('sh_shop_trial_uses').select('*').eq('package_id', pkg.data.id).order('created_at', { ascending: false })
    if (error) return NextResponse.json({ error: '조회 실패' }, { status: 500 })
    uses = data
  }
  return NextResponse.json({ package: pkg.data, uses, balance: customer.data })
}

/* 첫체험 등록 + 결제 — { code, use_prepaid, other_method? } (가격·구성은 서버 상수) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { code, use_prepaid, other_method } = await req.json()
  if (other_method != null && !METHODS.includes(other_method)) return NextResponse.json({ error: '결제수단 오류' }, { status: 400 })
  try {
    const def = trialPackage(code)
    return NextResponse.json(await registerTrial(Number(id), def.code, !!use_prepaid, other_method ?? null))
  } catch (e) {
    if (e instanceof BookingError) return NextResponse.json({ error: e.message }, { status: e.status })
    const { body, status } = paymentErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
```

`app/api/trial/[id]/use/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { BookingError } from '@/lib/booking/errors'
import { validateUse } from '@/lib/booking/trial'
import { paymentErrorResponse } from '@/lib/payments'
import { useTrial } from '@/lib/trial'

/* 첫체험 1회 사용 — { kind: basic|special, care_name?, memo? } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { kind, care_name, memo } = await req.json()
  try {
    const v = validateUse(kind, care_name)
    return NextResponse.json(await useTrial(Number(id), v.kind, v.careName, typeof memo === 'string' && memo.trim() ? memo.trim() : null))
  } catch (e) {
    if (e instanceof BookingError) return NextResponse.json({ error: e.message }, { status: e.status })
    const { body, status } = paymentErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
```

`app/api/trial/[id]/cancel/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { paymentErrorResponse } from '@/lib/payments'
import { cancelTrial } from '@/lib/trial'

/* 첫체험 등록 취소 — 사용 내역 없을 때만, 결제 함께 취소 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    return NextResponse.json(await cancelTrial(Number(id)))
  } catch (e) {
    const { body, status } = paymentErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
```

`app/api/trial/uses/[id]/cancel/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { paymentErrorResponse } from '@/lib/payments'
import { cancelTrialUse } from '@/lib/trial'

/* 첫체험 사용 1건 취소 — 횟수 복원 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    return NextResponse.json(await cancelTrialUse(Number(id)))
  } catch (e) {
    const { body, status } = paymentErrorResponse(e)
    return NextResponse.json(body, { status })
  }
}
```

`app/api/payments/[id]/void/route.ts` — `try {` 앞에 추가:

```ts
  const { data: trial } = await supabase.from('sh_shop_trial_packages').select('id').eq('payment_id', id).eq('status', 'active').maybeSingle()
  if (trial) return NextResponse.json({ error: '첫체험 패키지 결제입니다. 첫체험 카드에서 등록 취소로 처리하세요' }, { status: 409 })
```

- [ ] **Step 6: 타입 확인** — `rtk npx tsc --noEmit` → 오류 없음
- [ ] **Step 7: 커밋** — `feat: 첫체험 패키지 DB 함수·API (등록 결제, 사용, 취소)`

### Task 3: 통합 스모크 `scripts/trial-smoke.mjs`

**Files:**
- Create: `scripts/trial-smoke.mjs`

**Interfaces:**
- Consumes: Task 2 HTTP API, `scripts/smoke-lib.mjs` (`adminClient`, `check`, `cleanupTestData`, `env`, `finish`, `sql`)

- [ ] **Step 1: 스크립트 작성**

```js
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
```

- [ ] **Step 2: 실행** — 개발 서버 `npx next dev -p 3210` 띄운 뒤 `rtk node scripts/trial-smoke.mjs` → `전체 통과`
- [ ] **Step 3: 커밋** — `test: 첫체험 패키지 통합 점검 스크립트`

### Task 4: 고객 상세 `TrialPanel` + 선불 카드 갱신 연동

**Files:**
- Create: `app/customers/[id]/TrialPanel.tsx`
- Modify: `app/customers/[id]/CustomerDetailClient.tsx` (TrialPanel 배치, `refreshKey`), `app/customers/[id]/PrepaidPanel.tsx` (`refreshKey` prop 으로 재조회, 직접 결제 memo 표시)

**Interfaces:**
- Consumes: Task 1 `TRIAL_PACKAGES`, `SPECIAL_CARES`, `trialStatus`, `kstToday`, 타입 / Task 2 HTTP API / `splitDeduction`
- Produces: `<TrialPanel customerId={number} onChanged={() => void} />`, `<PrepaidPanel ... refreshKey={number} />`

- [ ] **Step 1: `TrialPanel.tsx`** — 아래 구현 (미등록: 패키지 버튼 → 결제 입력, 등록: 남은 횟수·D-day·사용·내역·등록 취소)
- [ ] **Step 2: CustomerDetailClient** — `const [refreshKey, setRefreshKey] = useState(0)`, `const onTrialChanged = useCallback(() => setRefreshKey(k => k + 1), [])`, PrepaidPanel 아래 `<TrialPanel customerId={customer.id} onChanged={onTrialChanged} />`, PrepaidPanel 에 `refreshKey={refreshKey}`
- [ ] **Step 3: PrepaidPanel** — props 에 `refreshKey: number`, `useEffect(() => { reload() }, [reload, refreshKey])`, 결제 목록 `{!p.reservation_id && ' (직접)'}` → `{!p.reservation_id && \` (${p.memo ?? '직접'})\`}`
- [ ] **Step 4: 확인** — `rtk npx tsc --noEmit`, `rtk npm run build`, 브라우저로 고객 상세에서 등록→사용→취소 흐름 확인
- [ ] **Step 5: 커밋** — `feat: 고객 상세에 첫체험 패키지 카드 (등록 결제·사용·취소)`

TrialPanel 구현 요점(코드는 Task 실행 시 PrepaidPanel 스타일 그대로):
- 상태: `pkg`, `uses`, `balance`, `busy`, `err`, `reg: { code, usePrepaid, method } | null`, `special: { care, memo } | null`, `showUses`
- `reload()` = `GET /api/customers/{id}/trial`; `post(key, url, body)` 성공 시 `reload()` + `onChanged()`
- 등록 결제 미리보기: `splitDeduction(price, balance.cash, balance.bonus)` (선불 토글 시), 부족분 > 0 이면 결제수단 칩
- 만료 시 사용 확인 문구: `만료된 패키지입니다. 그래도 차감할까요?`
- 등록 취소 확인 문구: `${label} 등록을 취소할까요? 결제 ${price}도 함께 취소됩니다.`
