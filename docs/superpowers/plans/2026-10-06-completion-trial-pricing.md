# 시술 완료 첫체험 차감 · 직접 충전 · 금액 수정 · 방문 이력 수정 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 결제 시트에서 첫체험 차감(예약 연결·자동 복원), 예약 리스트 첫체험 배지, 직접 금액 충전, 첫체험권·완료 방문 금액 수정(결제 기록 동기화), 고객 상세에서 방문 이력 수정을 제공한다.

**Architecture:** DB 함수 3개(`sh_shop_trial_use` 확장, `sh_shop_payment_adjust`, `sh_shop_trial_price`)와 `sh_shop_trial_uses.reservation_id`. 순수 규칙은 `lib/booking/trial.ts`·`prepaid.ts`, 서버 래퍼는 `lib/trial.ts`·`lib/payments.ts`. 예약 폼은 `app/reservations/ReservationForm.tsx` 로 분리해 고객 상세와 공용.

**Tech Stack:** Next.js 16.3 App Router, Supabase(PostgreSQL), vitest, Tailwind 4

**Spec:** `docs/superpowers/specs/2026-10-06-completion-trial-pricing-design.md`

## Global Constraints

- 금액 수정: 선불 차감액 유지, 차액은 기타 결제분에서 조정. 선불 이하로 낮추기 거부(`BELOW_PREPAID`), 기타분 > 0 인데 결제수단 없으면 `OTHER_METHOD_REQUIRED`
- 첫체험 차감 선택 시 결제 금액 기본 0원(수정 가능)
- 직접 충전: amount ≥ 1 정수, bonus ≥ 0 정수(기본 0)
- 함수 실행권한 service_role 만, 기존 코드 스타일 유지

## Review Focus

- 첫체험 차감 완료 후 결제 내역에서 결제만 취소 → 첫체험도 복원되어야 함 (Task 2 스모크)
- 완료 예약을 '예약'으로 되돌렸다 다시 완료 → 첫체험 이중 차감 없음 (Task 2 스모크)
- 선불 전액 결제 건 금액을 올릴 때 결제수단 미지정 → 400 안내 (Task 2 스모크)
- 직접 충전에 음수·소수·문자열 → 400 (Task 1 단위 + Task 2 스모크)
- 남은 횟수 0 인 고객은 배지·결제 시트 첫체험 영역 미표시 (Task 1 단위)

---

### Task 1: 순수 규칙

**Files:** Modify `lib/booking/trial.ts`, `lib/booking/prepaid.ts`; Test `lib/booking/__tests__/trial.test.ts`, `lib/booking/__tests__/phone-prepaid.test.ts`

**Produces:** `trialBadge(pkg, today): { label: string; expired: boolean } | null`, `defaultTrialChoice(productName: string | null): { kind: 'basic' } | { kind: 'special'; care: string } | null`, `validateCustomCharge(amount: unknown, bonus: unknown): { amount: number; bonus: number }` (BookingError INVALID_INPUT)

- [ ] **Step 1: 테스트 추가** (trial.test.ts)

```ts
describe('trialBadge', () => {
  it('남은 횟수 표시', () => {
    expect(trialBadge({ basic_total: 1, special_total: 3, basic_used: 0, special_used: 1, expires_on: '2026-12-01' }, '2026-10-06')).toEqual({ label: '첫체험 B1·S2', expired: false })
  })
  it('만료 표시', () => {
    expect(trialBadge({ basic_total: 1, special_total: 1, basic_used: 1, special_used: 0, expires_on: '2026-10-01' }, '2026-10-06')).toEqual({ label: '첫체험 B0·S1', expired: true })
  })
  it('남은 횟수 없으면 null', () => {
    expect(trialBadge({ basic_total: 1, special_total: 1, basic_used: 1, special_used: 1, expires_on: '2026-12-01' }, '2026-10-06')).toBeNull()
  })
})
describe('defaultTrialChoice', () => {
  it('시술명으로 추정', () => {
    expect(defaultTrialChoice('베이직 피부관리')).toEqual({ kind: 'basic' })
    expect(defaultTrialChoice('플라즈마 관리')).toEqual({ kind: 'special', care: '플라즈마' })
    expect(defaultTrialChoice('로즈 해독 케어')).toEqual({ kind: 'special', care: '로즈 해독' })
    expect(defaultTrialChoice('상체관리')).toEqual({ kind: 'special', care: '상체' })
    expect(defaultTrialChoice('하체관리')).toEqual({ kind: 'special', care: '하체' })
    expect(defaultTrialChoice('전신관리')).toBeNull()
    expect(defaultTrialChoice(null)).toBeNull()
  })
})
```
(phone-prepaid.test.ts)
```ts
describe('validateCustomCharge', () => {
  it('정수 금액·보너스', () => {
    expect(validateCustomCharge(300000, 30000)).toEqual({ amount: 300000, bonus: 30000 })
    expect(validateCustomCharge('150000', undefined)).toEqual({ amount: 150000, bonus: 0 })
  })
  it('잘못된 값 거부', () => {
    for (const [a, b] of [[0, 0], [-1, 0], [1.5, 0], ['abc', 0], [100, -1], [100, 0.5]]) expect(() => validateCustomCharge(a, b)).toThrow()
  })
})
```
- [ ] **Step 2: RED 확인** — `npx vitest run lib/booking/__tests__`
- [ ] **Step 3: 구현**

```ts
// trial.ts
export function trialBadge(pkg: Pick<TrialPackageRow, 'basic_total' | 'special_total' | 'basic_used' | 'special_used' | 'expires_on'>, today: string) {
  const st = trialStatus(pkg, today)
  if (st.done) return null
  return { label: `첫체험 B${st.basicLeft}·S${st.specialLeft}`, expired: st.expired }
}

const CARE_KEYWORDS: [string, string][] = [['플라즈마', '플라즈마'], ['로즈', '로즈 해독'], ['상체', '상체'], ['하체', '하체']]

/** 예약 시술명으로 첫체험 차감 기본 선택 추정 */
export function defaultTrialChoice(productName: string | null): { kind: 'basic' } | { kind: 'special'; care: string } | null {
  if (!productName) return null
  if (productName.includes('베이직')) return { kind: 'basic' }
  const hit = CARE_KEYWORDS.find(([k]) => productName.includes(k))
  return hit ? { kind: 'special', care: hit[1] } : null
}
```
```ts
// prepaid.ts
/** 직접 입력 충전 — 금액 1원 이상, 보너스 0 이상 정수 */
export function validateCustomCharge(amount: unknown, bonus: unknown) {
  const a = Number(amount)
  const b = bonus === undefined || bonus === null || bonus === '' ? 0 : Number(bonus)
  if (!Number.isInteger(a) || a < 1) throw new BookingError('INVALID_INPUT', '충전 금액을 1원 이상 정수로 입력하세요.')
  if (!Number.isInteger(b) || b < 0) throw new BookingError('INVALID_INPUT', '보너스는 0원 이상 정수로 입력하세요.')
  return { amount: a, bonus: b }
}
```
- [ ] **Step 4: GREEN** — `npx vitest run`
- [ ] **Step 5: 커밋** — `feat: 첫체험 배지·차감 기본 선택·직접 충전 검증 규칙`

### Task 2: DB 함수 + 서버 API (스모크 먼저)

**Files:** Create `docs/sql/2026-10-06-completion-trial.sql`, `scripts/completion-smoke.mjs`; Modify `lib/payments.ts`, `lib/trial.ts`, `app/api/reservations/[id]/complete/route.ts`, `app/api/reservations/[id]/route.ts`, `app/api/reservations/route.ts`, `app/page.tsx`, `app/api/payments/[id]/void/route.ts`, `app/api/customers/[id]/charge/route.ts`, `app/api/customers/[id]/trial/route.ts`, Create `app/api/trial/[id]/route.ts`

**Consumes:** Task 1 `validateCustomCharge`
**Produces (HTTP):**
- complete: `{ amount, use_prepaid, other_method?, memo?, trial?: { package_id, kind, care_name? } }` → 예약 + `payment` + `trial_use?`
- PUT reservation: 추가 입력 `payment_method?` (완료 예약 금액 변경 시)
- 예약 목록/상세/메인 초기 로드 각 행: `trial: { basic_left, special_left, expires_on, label, expired } | null`
- charge: `{ amount, bonus?, custom? }`
- POST trial: `price?`
- PATCH `/api/trial/{id}`: `{ price, other_method? }` → `{ package, payment }`

- [ ] **Step 1: 스모크 작성** `scripts/completion-smoke.mjs` (smoke-lib 사용, 테스트 번호 010-9999-005x). 시나리오:
  1. 고객 생성 → 첫체험 4회 카드 등록(가격 지정 200000) → 결제 total 200000 확인
  2. 예약 생성(플라즈마 관리) → complete `{ amount: 0, trial: { package_id, kind: 'special', care_name: '플라즈마' } }` → 200, payment.total 0, 첫체험 special_used 1, 사용 행 reservation_id = 예약 id
  3. PUT 예약 status scheduled → special_used 0 (복원), 다시 complete(같은 trial) → special_used 1 (이중 차감 없음)
  4. 결제 내역에서 그 결제 void → 예약 scheduled + special_used 0
  5. complete `{ amount: 30000, other_method: 'card', trial: basic }` → payment other 30000 + basic_used 1
  6. 완료 예약 PUT price 50000 `{ payment_method: 'card' }` → 결제 total 50000, other 50000
  7. 직접 충전 `{ custom: true, amount: 300000, bonus: 30000 }` → 잔액 확인; `{ custom: true, amount: -5 }` 400; `{ custom: true, amount: 1000, bonus: 1.5 }` 400
  8. 첫체험 PATCH price 180000 → 결제 total 180000 (카드분 조정); 선불로 등록한 두 번째 고객: 선불 100000 + 카드 → PATCH price 90000 → 409 BELOW_PREPAID; 선불 전액 등록 고객 PATCH price 올림(결제수단 없음) → 400, `other_method: 'cash'` → 200
  9. GET `/api/reservations?from&to` → 해당 예약 행에 trial.label
  10. finally cleanup (trial 패키지·사용·결제·예약·고객)
- [ ] **Step 2: RED 확인** (dev 서버 텔레그램·솔라피 비움)
- [ ] **Step 3: SQL**

```sql
-- 시술 완료 첫체험 차감 · 결제 금액 수정 (2026-10-06)
alter table sh_shop_trial_uses add column if not exists reservation_id bigint references sh_shop_reservations(id) on delete set null;
create index if not exists sh_shop_trial_uses_reservation_idx on sh_shop_trial_uses(reservation_id) where reservation_id is not null;

drop function if exists sh_shop_trial_use(bigint, text, text, text);
create or replace function sh_shop_trial_use(p_package_id bigint, p_kind text, p_care_name text, p_memo text, p_reservation_id bigint default null)
returns json language plpgsql set search_path = public as $$
declare v_pkg sh_shop_trial_packages; v_use sh_shop_trial_uses;
begin
  if p_kind is null or p_kind not in ('basic', 'special') then raise exception 'INVALID_TRIAL_USE'; end if;
  select * into v_pkg from sh_shop_trial_packages where id = p_package_id for update;
  if not found then raise exception 'PACKAGE_NOT_FOUND'; end if;
  if v_pkg.status <> 'active' then raise exception 'PACKAGE_CANCELLED'; end if;
  if (p_kind = 'basic' and v_pkg.basic_used >= v_pkg.basic_total) or (p_kind = 'special' and v_pkg.special_used >= v_pkg.special_total) then
    raise exception 'NO_REMAINING';
  end if;
  update sh_shop_trial_packages set basic_used = basic_used + (p_kind = 'basic')::int, special_used = special_used + (p_kind = 'special')::int
   where id = v_pkg.id returning * into v_pkg;
  insert into sh_shop_trial_uses (package_id, kind, care_name, memo, reservation_id)
  values (v_pkg.id, p_kind, case when p_kind = 'special' then p_care_name end, nullif(trim(p_memo), ''), p_reservation_id)
  returning * into v_use;
  return json_build_object('use', row_to_json(v_use), 'package', row_to_json(v_pkg));
end $$;

create or replace function sh_shop_payment_adjust(p_payment_id bigint, p_total integer, p_other_method text)
returns sh_shop_payments language plpgsql set search_path = public as $$
declare p sh_shop_payments; v_other integer; v_method text;
begin
  if p_total is null or p_total < 0 then raise exception 'INVALID_AMOUNT'; end if;
  select * into p from sh_shop_payments where id = p_payment_id for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if p.status <> 'paid' then raise exception 'ALREADY_VOIDED'; end if;
  v_other := p_total - p.prepaid_cash_used - p.prepaid_bonus_used;
  if v_other < 0 then raise exception 'BELOW_PREPAID'; end if;
  v_method := coalesce(p_other_method, p.other_method);
  if v_other > 0 and coalesce(v_method, '') not in ('card', 'cash', 'transfer') then raise exception 'OTHER_METHOD_REQUIRED'; end if;
  update sh_shop_payments set total_amount = p_total, other_amount = v_other, other_method = case when v_other > 0 then v_method end
   where id = p.id returning * into p;
  return p;
end $$;

create or replace function sh_shop_trial_price(p_package_id bigint, p_price integer, p_other_method text)
returns json language plpgsql set search_path = public as $$
declare v_pkg sh_shop_trial_packages; v_pay sh_shop_payments;
begin
  if p_price is null or p_price < 0 then raise exception 'INVALID_AMOUNT'; end if;
  select * into v_pkg from sh_shop_trial_packages where id = p_package_id for update;
  if not found then raise exception 'PACKAGE_NOT_FOUND'; end if;
  if v_pkg.status <> 'active' then raise exception 'PACKAGE_CANCELLED'; end if;
  if exists (select 1 from sh_shop_payments where id = v_pkg.payment_id and status = 'paid') then
    select * into v_pay from sh_shop_payment_adjust(v_pkg.payment_id, p_price, p_other_method);
  end if;
  update sh_shop_trial_packages set price = p_price where id = v_pkg.id returning * into v_pkg;
  return json_build_object('package', row_to_json(v_pkg), 'payment', case when v_pay.id is null then null else row_to_json(v_pay) end);
end $$;

revoke all on function sh_shop_trial_use(bigint, text, text, text, bigint) from public, anon, authenticated;
revoke all on function sh_shop_payment_adjust(bigint, integer, text) from public, anon, authenticated;
revoke all on function sh_shop_trial_price(bigint, integer, text) from public, anon, authenticated;
grant execute on function sh_shop_trial_use(bigint, text, text, text, bigint) to service_role;
grant execute on function sh_shop_payment_adjust(bigint, integer, text) to service_role;
grant execute on function sh_shop_trial_price(bigint, integer, text) to service_role;
```
- [ ] **Step 4: 서버 구현**
  - `lib/payments.ts`: `RPC_ERRORS.BELOW_PREPAID = [409, '선불로 결제된 금액보다 낮출 수 없습니다. 결제(또는 등록)를 취소한 뒤 다시 처리하세요']`; `adjustPayment(paymentId, total, otherMethod)` → rpc + 이력 `결제 금액 변경 ${old} → ${new}`
  - `lib/trial.ts`: `useTrial(packageId, kind, careName, memo, reservationId = null)`(p_reservation_id 전달); `cancelReservationTrialUses(reservationId)` — `sh_shop_trial_uses` 에서 reservation_id·status used 조회 후 각각 `cancelTrialUse`, 취소 건수 반환; `changeTrialPrice(packageId, price, otherMethod)` — rpc `sh_shop_trial_price` + 이력 `첫체험 N회 금액 변경 a → b`; `activeTrialsFor(customerIds)` → `Map<customerId, TrialPackageRow>`; `withTrial(rows)` — 각 행에 `trial` 필드(trialBadge + 남은 횟수·만료일, 없으면 null) 병합
  - complete route: `trial` 있으면 `validateUse` → 고객 유효 패키지 id 일치 확인(`package.customer_id === existing.customer_id`, 아니면 400) → 결제 후 `useTrial(..., existing.id)`; 실패 시 `voidPayment` 후 오류 반환; 상태 변경 실패 시 `cancelTrialUse` + `voidPayment`; 이력 description 에 `· 첫체험 ${label} 차감`
  - PUT route: 완료→다른 상태 전환에서 결제 취소 뒤 `cancelReservationTrialUses`(건수 changes 에 기록). 완료 유지 + `price` 변경(`price !== existing.price`)이면 paid 결제 조회 → 있으면 `adjustPayment(id, price, payment_method ?? null)`, 오류면 예약 수정 중단하고 오류 응답
  - void route: 예약 복원 블록에서 `cancelReservationTrialUses(payment.reservation_id)`
  - 목록 GET·상세 GET·`app/page.tsx`: 결과를 `withTrial` 로 감싸 반환
  - charge route: `custom` 이면 `validateCustomCharge` → `charge(id, amount, bonus, memo || '직접 충전')`
  - POST trial: `price` 있으면 정수 ≥1 검증 → `registerTrial(..., price)` (`registerTrial` 에 `price?: number` 추가, 없으면 상수)
  - PATCH `/api/trial/[id]/route.ts`: `{ price, other_method? }` 검증(정수 ≥0, 결제수단 목록) → `changeTrialPrice`
- [ ] **Step 5: GREEN** — completion-smoke 전체 통과, trial/payment/booking/verify 스모크 회귀 통과, `npx tsc --noEmit`
- [ ] **Step 6: 커밋** — `feat: 시술 완료 첫체험 차감(예약 연결·자동 복원), 결제 금액 수정, 직접 충전, 첫체험 금액 지정·수정 API`

### Task 3: 화면

**Files:** Create `app/reservations/ReservationForm.tsx`; Modify `app/reservations/ReservationsClient.tsx`, `app/reservations/PaymentSheet.tsx`, `app/customers/[id]/CustomerDetailClient.tsx`, `app/customers/[id]/page.tsx`, `app/customers/[id]/PrepaidPanel.tsx`, `app/customers/[id]/TrialPanel.tsx`

**Consumes:** Task 1 `trialBadge`/`defaultTrialChoice`, Task 2 HTTP

- [ ] **Step 1: ReservationForm 분리** — `EMPTY_FORM`, `Product`, `CustomerOption`, `prepaidTotal`, `fmtPhone`, `priceFor`, `ReservationForm` 를 새 파일로 이동(export). `saveReservation({ form, products, editId, paymentMethod? })` 헬퍼(기존 handleSave 의 payload·fetch·충돌 메시지)를 함께 export. ReservationsClient 는 import 해서 사용(동작 동일). `ReservationForm` 에 `completed?: boolean` prop — true 면 결제수단 칩(카드/현금/계좌이체, 기본 카드) 표시, `onSave(form, paymentMethod)`
- [ ] **Step 2: 예약 리스트 배지** — Reservation 타입에 `trial?: { label: string; expired: boolean } | null`, `MemberBadge` 옆에 `🎁 {label}` 배지(만료면 빨강)
- [ ] **Step 3: PaymentSheet 첫체험** — customer_id 있으면 `GET /api/customers/{id}/trial` 로 package 조회. 남은 횟수 있으면 "첫체험 사용" 토글: 켜면 `defaultTrialChoice(product_name)` 로 기본 선택, 금액을 0으로(이전 금액 기억), 끄면 복원. 베이직/스페셜 버튼 + 스페셜이면 4종 칩. 만료면 제출 시 `confirm('만료된 첫체험권입니다. 그래도 차감할까요?')`. 제출 body 에 `trial: { package_id, kind, care_name }`. 버튼 문구 `… 완료 처리 · 첫체험 {베이직|스페셜-플라즈마}`
- [ ] **Step 4: PrepaidPanel 직접 충전** — 충전 버튼 줄에 [직접] 버튼 → 금액·보너스 입력 펼침 → confirm 후 `POST charge { custom: true, amount, bonus }`
- [ ] **Step 5: TrialPanel 금액** — 등록 폼: `price` state(기본 def.price), 등록 버튼 위 `결제 금액 {fmtPrice}` 텍스트를 누르면 number input, 등록 body 에 `price`. 미리보기 split 은 이 price 기준. 등록 후: 패키지명 옆 `{fmtPrice(pkg.price)}` 를 누르면 input + 결제수단 칩(필요 시) + 저장 → `PATCH /api/trial/{id}`
- [ ] **Step 6: 고객 상세 방문 이력 수정** — `page.tsx` 에서 products(활성 service) 조회해 전달, reservations select 에 `customer_name, customer_phone, customer_id, product_id, duration_min, memo` 추가. 방문 이력·예정 예약 항목을 button 으로 → 클릭 시 `ReservationForm`(editId, initial, completed=status==='completed') 열기 → `saveReservation` 성공 시 `router.refresh()` + 닫기
- [ ] **Step 7: 확인** — tsc, build, vitest, Playwright(배지·결제 시트 첫체험 선택→완료→목록, 직접 충전, 첫체험 금액 수정, 방문 이력 수정)
- [ ] **Step 8: 커밋** — `feat: 결제 시트 첫체험 차감·예약 리스트 첫체험 배지·직접 충전·첫체험 금액 수정·고객 상세 방문 이력 수정 화면`
