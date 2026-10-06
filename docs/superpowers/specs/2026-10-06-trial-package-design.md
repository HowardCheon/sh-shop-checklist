# 첫체험 패키지 등록·사용 관리 설계

- 작성일: 2026-10-06
- 선행: `2026-09-28-prepaid-payment-auth-design.md` (결제·선불)
- 배경: 홈페이지(sh_shop_home) 오픈 이벤트 "첫 체험 케어"를 고객관리에서 등록·사용 관리

## 1. 확정된 요구사항

| 항목 | 결정 |
|---|---|
| 패키지 | 코드 상수 고정 2종. 2회 99,000원(베이직 1 + 스페셜 1, 1개월) / 4회 219,000원(베이직 1 + 스페셜 3, 3개월) |
| 스페셜 케어 | 플라즈마 / 로즈 해독 / 상체 / 하체 중 사용 시 선택 |
| 등록 | 고객 상세에서 등록, 고객당 유효(active) 패키지 1건만. 구매 금액은 결제 내역(`sh_shop_payments`)으로 기록 — 선불 사용 가능, 부족분 카드/현금/계좌이체 |
| 사용 | 고객 상세에서 수동 차감만 (예약 완료와 연동하지 않음). 베이직 1회 / 스페셜 1회(시술 선택) |
| 사용 취소 | 사용 1건 단위로 취소, 횟수 복원 |
| 등록 취소 | 사용 이력(유효 사용)이 없을 때만. 결제도 함께 취소(선불 사용분 복원) |
| 유효기간 | 등록일(KST) + n개월, 만료일 당일까지 유효. 만료 후에는 경고 확인창 후 사용 허용(차단하지 않음) |
| 제외 | 예약 완료 연동, 일부 사용 후 환불, 관리자 화면에서 패키지 정의 |

## 2. 데이터 (마이그레이션: `docs/sql/2026-10-06-trial-packages.sql`)

```sql
create table sh_shop_trial_packages (
  id bigint generated always as identity primary key,
  customer_id bigint not null references sh_shop_customers(id) on delete cascade,
  package_code text not null,              -- trial2 | trial4
  basic_total integer not null, special_total integer not null,   -- 구매 시점 구성
  basic_used integer not null default 0, special_used integer not null default 0,
  price integer not null,
  payment_id bigint references sh_shop_payments(id) on delete set null,
  expires_on date not null,                -- 이 날짜까지 유효
  status text not null default 'active',   -- active | cancelled
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  check (basic_used between 0 and basic_total), check (special_used between 0 and special_total)
);
create unique index on sh_shop_trial_packages(customer_id) where status = 'active';

create table sh_shop_trial_uses (
  id bigint generated always as identity primary key,
  package_id bigint not null references sh_shop_trial_packages(id) on delete cascade,
  kind text not null,                      -- basic | special
  care_name text,                          -- 스페셜이면 시술명
  status text not null default 'used',     -- used | cancelled
  memo text,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);
```

구성·가격은 구매 시점 값을 저장하므로 코드 상수가 바뀌어도 기존 구매분은 유지된다.
RLS 활성화(정책 없음), 함수는 `service_role` 만 실행.

## 3. DB 함수 (한 트랜잭션, 패키지/고객 행 `FOR UPDATE`)

| 함수 | 동작 / 오류 |
|---|---|
| `sh_shop_trial_register(customer_id, code, price, basic, special, months, use_prepaid, other_method, memo)` | 고객 잠금 → 유효 패키지 있으면 `ALREADY_REGISTERED` → `sh_shop_pay` 로 결제 → 패키지 생성. 만료일 = `(now() at time zone 'Asia/Seoul')::date + months 개월` |
| `sh_shop_trial_use(package_id, kind, care_name, memo)` | 취소된 패키지면 `PACKAGE_CANCELLED`, 남은 횟수 없으면 `NO_REMAINING`. 만료는 막지 않음 |
| `sh_shop_trial_use_cancel(use_id)` | 이미 취소면 `ALREADY_CANCELLED`. 횟수 복원 |
| `sh_shop_trial_cancel(package_id)` | 유효 사용 있으면 `HAS_USES`, 이미 취소면 `ALREADY_CANCELLED`. 패키지 취소 + `sh_shop_payment_void` |

## 4. TS 모듈

- `lib/booking/trial.ts` (순수): `TRIAL_PACKAGES`, `SPECIAL_CARES`, `trialPackage(code)`(없으면 BookingError), `validateUse(kind, careName)`, `trialStatus(pkg, today)` → `{ basicLeft, specialLeft, expired, daysLeft, done }`
- `lib/trial.ts`: RPC 래퍼(`registerTrial`, `useTrial`, `cancelTrialUse`, `cancelTrial`) + 고객 이력 기록. 오류 코드는 `lib/payments.ts` 의 `RPC_ERRORS` 에 추가해 같은 `rpc` 헬퍼 사용

## 5. API (관리자 쿠키 인증)

| 메서드/경로 | 설명 |
|---|---|
| `GET /api/customers/{id}/trial` | 유효 패키지(없으면 null) + 사용 내역 |
| `POST /api/customers/{id}/trial` | `{ code, use_prepaid, other_method? }` 등록. 가격·구성은 서버 상수 사용 |
| `POST /api/trial/{packageId}/use` | `{ kind, care_name?, memo? }` |
| `POST /api/trial/uses/{useId}/cancel` | 사용 1건 취소 |
| `POST /api/trial/{packageId}/cancel` | 등록 취소(결제 취소 포함) |
| `POST /api/payments/{id}/void` (수정) | 유효 첫체험 패키지의 결제면 409 "첫체험 등록 취소로 처리하세요" |

## 6. 화면 — 고객 상세 `TrialPanel` (선불 카드 아래)

- 미등록: 패키지 버튼 2개 → 결제 입력(선불 토글 + `splitDeduction` 미리보기, 부족분 결제수단) → 등록
- 등록: 패키지명, 만료일·D-day, 베이직/스페셜 남은 횟수, [베이직 사용], [스페셜 사용] → 시술 칩 4개 + 메모 → 확정
- 만료: "기간 만료" 배지, 사용 시 `만료된 패키지입니다. 그래도 차감할까요?` 확인
- 모두 사용: "사용 완료" 배지, 사용 버튼 숨김
- 사용 내역 접기/펼치기, 건별 [취소], 취소분 취소선
- [등록 취소]: 유효 사용 없을 때만, 결제 함께 취소 확인창
- 등록·취소로 선불 잔액이 바뀌면 선불 카드도 다시 불러옴(고객 상세가 공용 갱신 키를 내려줌), 고객 이력 갱신

## 7. 테스트

- 단위(`lib/booking/__tests__/trial.test.ts`): 패키지 조회·잘못된 코드, 사용 검증(스페셜 시술명 필수·베이직은 불필요), 남은 횟수·만료·D-day·사용 완료 판정
- 통합(`scripts/trial-smoke.mjs`): 카드 등록 → 중복 등록 409 → 베이직/스페셜 사용 → 초과 409 → 동시 사용 2건 중 1건만 성공 → 사용 취소 복원 → 사용 있을 때 등록 취소 409 → 결제 내역 직접 취소 409 → 선불 등록 → 등록 취소 시 결제 취소·잔액 복원 → anon 키 RPC/테이블 차단
