# 외부 예약 신청 API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 외부 사이트 서버가 호출하는 예약 조회/생성/수정/취소 API 와 이를 받쳐주는 고객·회원·휴무일·이력 기능을 만든다.

**Architecture:** 순수 TS 모듈(`lib/booking/*`)에 KST 시간·영업규칙·가용시간 계산을 두고, `service.ts` 가 Supabase 저장소(`repo.ts`)를 조합한다. `/api/public/v1/*` Route Handler 는 API Key 검증 후 service 호출만 한다. 겹침은 Postgres EXCLUDE 제약이 최종 보증.

**Tech Stack:** Next.js 16 Route Handlers, @supabase/supabase-js, Postgres(btree_gist), vitest

**Spec:** `docs/superpowers/specs/2026-09-28-public-booking-api-design.md`

## Global Constraints

- 모든 날짜/시각 입출력은 KST 문자열 `YYYY-MM-DD` / `HH:mm`, 내부 저장은 timestamptz(ISO, +09:00 로 생성)
- 정리시간 20분, 슬롯 30분, 마지막 시작 = 종료 30분 전, 리드타임 2시간, 최대 60일, 예정 예약 5건
- 영업: 월–금 10:00–20:00, 토 10:00–17:00, 일 휴무
- 테이블 접두사 `sh_shop_`, 쓰기는 service role 클라이언트(`lib/supabase.ts`)
- 오류 응답 `{ error: { code, message } }`
- 코드 스타일: 기존처럼 세미콜론 없음, 작은따옴표, 한국어 주석

## Review Focus

- 수정 시 자기 예약 블록을 제외하지 않으면 같은 시간 유지/프로그램만 변경도 SLOT_TAKEN 이 됨 → availability 에 excludeId 테스트
- 블록 끝 == 다음 예약 시작 은 허용되어야 함(`[)` 범위) → 경계 테스트
- UTC 서버에서 KST 날짜 경계(00:00–09:00 KST) 의 "오늘" 계산 → time 테스트
- 전화번호 하이픈/공백/+82 입력 → 정규화 테스트
- 토요일 16:30 시작 120분 프로그램 허용(종료가 영업 후) → rules 테스트

---

### Task 1: DB 마이그레이션 + 상품 시드
**Files:** Create `docs/sql/2026-09-28-booking.sql`, `scripts/run-sql.mjs`
- [ ] SQL 작성(스펙 §2 전체 + 테이블 3개 + 14개 상품 시드, 샘플 상품 비활성화)
- [ ] `node scripts/run-sql.mjs docs/sql/2026-09-28-booking.sql` 실행, information_schema 로 확인
- [ ] Commit

### Task 2: 순수 모듈 + 단위 테스트
**Files:** Create `lib/booking/{time,rules,availability,phone,prepaid,errors}.ts`, `lib/booking/__tests__/*.test.ts`, `vitest.config.ts`; Modify `package.json`(vitest, `test` 스크립트)
**Produces:**
- `time.ts`: `kstNow(): {date:string,time:string}`, `kstToIso(date,time): string`, `isoToKst(iso): {date,time}`, `addDays(date,n)`, `minutesOf(time)`, `timeOf(min)`, `dayOfWeek(date): 0..6`
- `rules.ts`: `BUFFER_MIN=20, SLOT_MIN=30, LEAD_MIN=120, MAX_DAYS=60, MAX_UPCOMING=5`, `businessHours(date): {open,close,lastStart}|null`, `candidateTimes(date): string[]`, `checkStart(date,time,nowIso): void` (BookingError throw)
- `availability.ts`: `type Block={start:string(ISO),blockEnd:string(ISO)}`, `fits(date,time,durationMin,blocks): boolean`, `programsAt(date,time,programs,blocks)`, `slotsFor(date,programs,blocks,nowIso)`
- `phone.ts`: `normalizePhone(raw): string` (010xxxxxxxx, 실패 시 INVALID_INPUT), `maskName(name)`
- `prepaid.ts`: `CHARGE_TIERS`, `bonusFor(amount)`, `isMember({prepaid_cash,prepaid_bonus})`
- `errors.ts`: `class BookingError(code,status,message)`
- [ ] 실패 테스트 작성 → 실행(FAIL) → 구현 → 실행(PASS) → Commit

### Task 3: repo + service + 공개 API 라우트
**Files:** Create `lib/booking/{repo,service}.ts`, `lib/public-api.ts`, `app/api/public/v1/{programs,availability,availability/programs,customers/lookup,reservations,reservations/[id],reservations/[id]/cancel}/route.ts`; Modify `.env.local`(BOOKING_API_KEY)
- [ ] 구현, `npx tsc --noEmit`, dev 서버에서 curl 시나리오(스펙 §8) 실행, 테스트 데이터 삭제, Commit

### Task 4: 관리자 API/화면 정합
**Files:** Modify `app/api/reservations/route.ts`, `app/api/reservations/[id]/route.ts`, `app/reservations/ReservationsClient.tsx`, `app/products/*`, `app/api/products/*`, `app/customers/[id]/*`, `app/api/customers/*`; Create `app/api/closed-dates/route.ts`, `app/api/customers/[id]/charge/route.ts`
- [ ] 관리자 예약 생성/수정에 block_end_at·customer 연결·+09:00, 10분 버퍼 제거, 23P01→409
- [ ] 시술메뉴 회원가/그룹, 고객 상세 잔액·충전·이력, 휴무일 관리, 외부예약 뱃지
- [ ] `npm run build`, 브라우저 확인, Commit
