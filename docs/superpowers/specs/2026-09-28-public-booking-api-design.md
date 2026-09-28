# 외부 예약 신청 API 설계 (1단계)

- 작성일: 2026-09-28
- 범위: 외부 사이트(서버 대 서버)가 호출하는 예약 조회/생성/수정/취소 API, 고객 자동 등록, 고객 이력, 회원(선불충전금) 판별, 휴무일 관리
- 제외(2단계): 선불충전금 차감·환불·잔액 부족 처리, SMS 인증

## 1. 확정된 요구사항

| 항목 | 결정 |
|---|---|
| 호출 방식 | 외부 사이트 **서버**에서 호출. `Authorization: Bearer <BOOKING_API_KEY>` |
| 동시 수용 | 1명. 어떤 프로그램이든 예약 블록은 절대 겹치지 않음 |
| 예약 블록 | 프로그램 소요시간 + 정리시간 20분 (`block_end_at`) |
| 영업시간 | 월–금 10:00–20:00, 토 10:00–17:00, 일 휴무 |
| 마지막 시작 | 영업 종료 30분 전 (평일 19:30, 토 16:30). 시술 종료는 영업시간을 넘어도 됨 |
| 슬롯 간격 | 30분 (10:00, 10:30, …) |
| 예약 가능 기간 | 현재 시각 + 2시간 이후 ~ 오늘 + 60일 |
| 휴무일 | 관리자가 날짜 단위로 등록 (`sh_shop_closed_dates`) |
| 예약 상태 | 외부 예약도 즉시 확정 (`scheduled`), `source='external'` |
| 예약 한도 | 전화번호당 예정(`scheduled`, 미래) 예약 최대 5건 |
| 수정/취소 | 전화번호 일치만으로 가능. **예약일(KST)이 오늘 이하면 불가** → 매장 전화 안내 |
| 예약번호 | 고객에게 노출 목적 아님. 외부 사이트는 전화번호로 목록 조회 후 내부 id 로 수정/취소 |
| 회원 | 선불충전금(실제+보너스) 잔액 > 0 이면 회원 → 회원가, 아니면 비회원가 |
| 충전 규칙 | 50만→보너스 0, 100만→보너스 10만, 200만→보너스 25만. 실제금액/보너스 분리 관리 |
| 고객 등록 | 전화번호(숫자만 정규화) 기준 upsert. 기존 고객 이름은 덮어쓰지 않음 |
| 이력 | 예약 생성/수정/취소, 충전을 고객 이력에 기록 (actor: external/admin) |

## 2. 데이터 모델 (마이그레이션: `docs/sql/2026-09-28-booking.sql`)

```sql
create extension if not exists btree_gist;

alter table sh_shop_products
  add column if not exists member_price integer,
  add column if not exists service_group text;          -- 'FACE' | 'BODY'

alter table sh_shop_customers
  add column if not exists prepaid_cash  integer not null default 0,
  add column if not exists prepaid_bonus integer not null default 0;
create unique index if not exists sh_shop_customers_phone_uq on sh_shop_customers(phone) where phone is not null;

alter table sh_shop_reservations
  add column if not exists block_end_at timestamptz,
  add column if not exists source text not null default 'admin',     -- 'admin' | 'external'
  add column if not exists price_type text;                          -- 'member' | 'regular'
update sh_shop_reservations set block_end_at = end_at + interval '20 minutes' where block_end_at is null;
alter table sh_shop_reservations alter column block_end_at set not null;
alter table sh_shop_reservations add constraint sh_shop_reservations_no_overlap
  exclude using gist (tstzrange(start_at, block_end_at, '[)') with &&) where (status <> 'cancelled');

create table sh_shop_customer_history (...);   -- customer_id, reservation_id, action, actor, description, old_value, new_value, created_at
create table sh_shop_prepaid_ledger (...);     -- customer_id, type, cash_amount, bonus_amount, cash_balance_after, bonus_balance_after, memo, created_at
create table sh_shop_closed_dates (date date primary key, reason text, created_at timestamptz default now());
```

- 기존 `price` = 비회원가, `member_price` = 회원가.
- 샘플 상품(기본 클렌징 케어)은 비활성화하고, FACE 7종·BODY 7종을 등록한다.
- 기존 관리자 API의 앞뒤 10분 버퍼 검사는 제거하고 동일한 `block_end_at` 규칙 + DB 제약으로 통일한다.

## 3. 모듈 구성

```
lib/booking/
  time.ts        KST 날짜/시각 변환 (toKstIso, kstToday, addMinutes …)  — 순수 함수
  rules.ts       영업시간, 마지막 시작, 슬롯 생성, 리드타임/기간 검사     — 순수 함수
  availability.ts 예약 블록 목록 → 시각별 가능 여부/가능 프로그램 계산    — 순수 함수
  phone.ts       전화번호 정규화/검증, verifyPhoneOwnership()             — SMS 인증 삽입 지점
  prepaid.ts     충전 보너스 규칙, isMember()                            — 순수 함수
  repo.ts        Supabase 접근 (상품/예약/고객/휴무일/이력)
  service.ts     유스케이스: getSlots, getPrograms, createReservation, updateReservation, cancelReservation
  errors.ts      BookingError(code, status, message)
lib/public-api.ts  API Key 검증 + 오류→JSON 응답 래퍼
app/api/public/v1/...  얇은 Route Handler
```

## 4. 가용 시간 알고리즘

입력: 날짜 D, 그날의 활성 예약 블록 `[start, block_end)` 목록(취소 제외, 수정 시 자기 자신 제외), 활성 프로그램 목록.

1. D 가 일요일이거나 휴무일이면 `closed=true`, 슬롯 없음.
2. 후보 시작 시각 = 10:00 부터 마지막 시작(평일 19:30/토 16:30)까지 30분 간격.
3. 후보 t 가 `now + 2h` 이전이거나 D 가 `today + 60일` 이후면 제외.
4. 후보 t 에서 프로그램 p 가능 조건: 모든 블록 b 에 대해 `[t, t + p.duration + 20) ∩ [b.start, b.block_end) = ∅`.
   (앞의 블록 안에 t 가 들어가면 불가, 뒤 블록 시작 전까지 p 블록이 끝나야 함)
5. 슬롯 목록 = 가능한 프로그램이 1개 이상인 후보 t.

예: 11:30 에 예약이 있고 10:00 이 비어 있으면 10:00 에는 블록 ≤ 90분(소요 ≤ 70분) 프로그램만, 10:30 에는 블록 ≤ 60분(소요 ≤ 40분 → 없음) → 10:30 은 슬롯에서 빠짐.

최종 충돌 보증은 DB 배타 제약(동시 요청 시 23P01 → 409 `SLOT_TAKEN`).

## 5. API (`/api/public/v1`, JSON, 날짜 `YYYY-MM-DD`, 시각 `HH:mm`, 모두 KST)

| 메서드/경로 | 설명 |
|---|---|
| `GET /programs` | 활성 프로그램 `{id, group, name, duration_min, member_price, regular_price}` |
| `GET /availability?date=` | `{date, closed, closed_reason, business_hours, slots:[{time, program_count}]}` |
| `GET /availability/programs?date=&time=&phone=?` | 해당 시각 가능 프로그램 + `end_time`, phone 주면 `applied_price` |
| `GET /customers/lookup?phone=` | `{exists, is_member, name_masked}` (잔액 비노출) |
| `POST /reservations` | `{name, phone, program_id, date, time, message?}` → 201 예약 요약 |
| `GET /reservations?phone=` | 미래 `scheduled` 예약 목록 + `editable` |
| `PATCH /reservations/{id}` | `{phone, program_id?, date?, time?, message?}` |
| `POST /reservations/{id}/cancel` | `{phone, reason?}` |

예약 요약 형식: `{id, program:{id,name,duration_min}, date, start_time, end_time, price, price_type, is_member, message, status, editable}`

## 6. 오류 처리

`{ error: { code, message } }` + HTTP 상태.

| code | status | 상황 |
|---|---|---|
| UNAUTHORIZED | 401 | API Key 없음/불일치 (`BOOKING_API_KEY` 미설정 시 항상 401) |
| INVALID_INPUT | 400 | 필수값 누락, 형식 오류, 전화번호 형식 오류 |
| CLOSED_DAY | 422 | 일요일/휴무일 |
| OUT_OF_HOURS | 422 | 30분 단위 아님, 영업시간/마지막 시작 초과 |
| TOO_SOON / TOO_FAR | 422 | 리드타임 2시간 미만 / 60일 초과 |
| PROGRAM_NOT_FOUND | 404 | 비활성/없는 프로그램 |
| SLOT_TAKEN | 409 | 해당 시각에 프로그램이 들어갈 수 없음(사전검사 또는 DB 제약) |
| LIMIT_EXCEEDED | 409 | 예정 예약 5건 초과 |
| NOT_FOUND | 404 | 예약 없음 또는 전화번호 불일치(존재 여부 비노출) |
| SAME_DAY_LOCKED | 403 | 예약 당일 이후 수정/취소 → "당일 변경은 매장으로 전화 주세요" |
| INTERNAL | 500 | 기타 |

## 7. 관리자 화면 변경

- 예약: 생성/수정 시 서버에서 `block_end_at` 계산, 충돌 시 기존처럼 409. 외부 예약 뱃지. 시간 전송 시 `+09:00` 부여(시간대 버그 수정), `customer_id` 연결.
- 시술메뉴: 회원가, FACE/BODY 입력.
- 고객 상세: 선불 잔액(실제/보너스), 충전 버튼(50/100/200만), 고객 이력 목록.
- 휴무일: 예약 화면에서 휴무일 추가/삭제.

## 8. 테스트

- 러너: vitest (순수 모듈 대상).
- `rules`/`availability`/`time`/`phone`/`prepaid` 단위 테스트: 평일/토/일, 마지막 시작, 경계(블록 끝 = 다음 시작 허용), 앞뒤 빈 시간의 프로그램 필터, 리드타임, KST 날짜 경계.
- 통합 확인: 로컬 dev 서버에 curl 로 시나리오(조회→예약→중복 예약 409→목록→수정→취소, 당일 수정 403, 키 없음 401) 실행 후 테스트 데이터 정리.

## 9. 향후(2단계)

- 선불충전금 차감(시술 완료 시), 환불 시 보너스 회수 규칙, 사용 원장 화면.
- SMS 인증: `verifyPhoneOwnership()` 이 `verification_token` 을 검증하도록 교체.
