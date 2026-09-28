# 선불충전금 차감·환불 + 관리자 인증 설계 (2단계)

- 작성일: 2026-09-28
- 선행: `2026-09-28-public-booking-api-design.md` (1단계)
- 제외: SMS 인증(추후)

## 1. 확정된 요구사항

| 항목 | 결정 |
|---|---|
| 차감 경로 A | 관리자가 예약을 "시술 완료" 처리할 때 결제 입력. 선불 사용 시 잔액 차감, 부족분은 카드/현금/계좌이체(복합결제) |
| 차감 경로 C | 고객 상세에서 금액·메모 입력해 직접 차감(예약 없는 결제) |
| 차감 비율 | 차감 시점 잔액 비율(실제:보너스)로 분배. 보너스 몫 = floor(사용액 × 보너스 / 총잔액), 나머지는 실제금액. 사용액 = 총잔액이면 전부 소진 |
| 환불 | 남은 실제금액만 환불, 보너스 소멸, 위약금 없음. 환불 후 잔액 0 (비회원) |
| 결제 취소 | 완료된 예약을 취소/복원하면 해당 결제 자동 취소, 차감분(실제/보너스) 그대로 복원 |
| 가격 | 예약에 기록된 가격(회원가/비회원가)을 결제 기본값으로 사용, 관리자가 수정 가능 |
| 관리자 인증 | 서버 PIN 검증 + HMAC 서명 HttpOnly 쿠키(30일). proxy.ts 가 공개 API·로그인·정적파일 외 전부 보호 |

## 2. 데이터 (마이그레이션: `docs/sql/2026-09-28-payments.sql`)

```sql
create table sh_shop_payments (
  id bigint generated always as identity primary key,
  customer_id bigint references sh_shop_customers(id) on delete set null,
  reservation_id bigint references sh_shop_reservations(id) on delete set null,
  total_amount integer not null check (total_amount >= 0),
  prepaid_cash_used integer not null default 0,
  prepaid_bonus_used integer not null default 0,
  other_method text,               -- card | cash | transfer
  other_amount integer not null default 0,
  status text not null default 'paid',   -- paid | voided
  memo text,
  created_at timestamptz not null default now(),
  voided_at timestamptz
);
alter table sh_shop_prepaid_ledger add column payment_id bigint;
-- ledger.type: charge | use | use_cancel | refund, 금액은 부호 포함(차감 음수)
```

RLS 활성화(정책 없음). 함수는 `security invoker`, `anon`/`authenticated`/`public` 실행권한 회수, `service_role` 만 실행.

## 3. DB 함수 (한 트랜잭션, 고객 행 `FOR UPDATE` 잠금)

| 함수 | 입력 | 결과 |
|---|---|---|
| `sh_shop_prepaid_charge(customer_id, amount, bonus, memo)` | 금액 검증은 TS(`bonusFor`) | 고객 행 |
| `sh_shop_pay(customer_id, reservation_id, amount, use_prepaid, other_method, memo)` | 부족분 > 0 이면 other_method 필수 | 결제 행 |
| `sh_shop_payment_void(payment_id)` | 이미 취소면 오류 | 결제 행 |
| `sh_shop_prepaid_refund(customer_id, memo)` | 잔액 0 이면 오류 | `{refund_amount, bonus_forfeited}` |

오류는 `raise exception '<CODE>'` → TS 에서 코드 매핑(INVALID_AMOUNT, CUSTOMER_NOT_FOUND, OTHER_METHOD_REQUIRED, ALREADY_VOIDED, NO_BALANCE).

## 4. TS 모듈

- `lib/booking/prepaid.ts`: `splitDeduction(amount, cash, bonus) → {cash, bonus, other}` (DB 함수와 동일 공식, 결제창 미리보기용) + 단위 테스트
- `lib/payments.ts`: RPC 호출 래퍼 + 고객 이력 기록 + 예약별 결제 취소(`voidReservationPayments`)

## 5. API (관리자, 쿠키 인증)

| 메서드/경로 | 설명 |
|---|---|
| `POST /api/reservations/{id}/complete` | `{amount, use_prepaid, other_method?, memo?}` → 결제 생성 + 상태 completed |
| `PUT /api/reservations/{id}` | completed → cancelled/scheduled 전환 시 결제 자동 취소 |
| `POST /api/customers/{id}/charge` | RPC 로 교체 |
| `POST /api/customers/{id}/use` | `{amount, memo}` 직접 차감(선불만, 잔액 초과 불가) |
| `POST /api/customers/{id}/refund` | `{memo?}` 환불 |
| `GET /api/customers/{id}/ledger` | 원장 + 결제 목록 |
| `POST /api/payments/{id}/void` | 결제 개별 취소 |
| `POST /api/auth/login`, `POST /api/auth/logout` | PIN 로그인/로그아웃 |

## 6. 관리자 인증

- 환경변수: `ADMIN_PIN`(4자리), `ADMIN_SESSION_SECRET`(32바이트 이상)
- 쿠키 `sh_admin = <만료ms>.<HMAC-SHA256(secret, 만료ms) base64url>`, HttpOnly, Secure(프로덕션), SameSite=Lax, 30일
- `proxy.ts` matcher: `_next/*`, 확장자 있는 파일, `/api/public/*`, `/api/auth/*`, `/login` 제외 전부
  - 미인증 페이지 → `/login?next=<경로>` 리다이렉트, 미인증 API → 401 JSON
- 로그인 실패 5회/10분 제한은 인스턴스 메모리 기준(간이). PIN 은 timingSafeEqual 비교
- 기존 `PasswordGate`(클라이언트 PIN) → `/login` 페이지의 키패드로 이전, layout 에서 제거

## 7. 화면

- 예약 상세 "시술 완료" → 결제 시트: 금액(기본 예약가), 고객 잔액 표시, "선불 사용" 토글 시 실제/보너스 차감 미리보기, 부족분 결제수단 선택
- 고객 상세: 잔액 카드에 "차감"/"환불" 버튼, 선불 원장·결제 내역(결제 취소 버튼)

## 8. 테스트

- 단위: `splitDeduction` (비율, 내림, 전액 소진, 잔액 0, 부족분)
- 통합(`scripts/payment-smoke.mjs`): 충전→비율 차감→복합결제→예약 완료/취소 시 복원→직접 차감→환불→동시 차감 2건(잔액 초과 방지)→anon 키로 RPC/테이블 접근 차단
- 인증: 쿠키 없음 페이지 307→/login, API 401, 공개 API 영향 없음, 잘못된 PIN 401
